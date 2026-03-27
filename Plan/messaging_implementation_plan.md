# 🏗️ Messaging System Implementation Plan

*Authored by: DBA, Scalpel, Prism, Ironclad, Chaos Architect, Store Manager*
*Based on: [14 Commandments](file:///z:/books2/Plan/tribunal_receipt_review.md) from Receipt Tribunal*

---

## Pre-Implementation Audit

### 🟡 Scalpel — Current State of Code

| File | What Exists | What's Wrong | What We Need |
|:--|:--|:--|:--|
| `orders/receipt_models.py` | Separate `Receipt` model + `ReceiptVerification` | Receipt is separated from Order. Tribunal says: **merge into Order** | Add `receipt_uuid` to `Order`, delete `Receipt` model |
| `orders/receipt_views.py` | `PublicReceiptView` + `ReceiptPDFView` | Queries via `Receipt.public_uuid`. Server-side PDF. | Query via `Order.receipt_uuid`. Client-side PDF. |
| `orders/receipt_utils.py` | 183-line ReportLab PDF generator | Server-side PDF = 200MB RAM spike on Render | **DELETE entirely** — replaced by `html2pdf.js` |
| `orders/receipt_serializers.py` | `PublicReceiptSerializer` via Receipt model | Goes through Receipt→Order indirect path | Rewrite to serialize `Order` directly + payments |
| `messaging/models.py` | `Gateway` + `MessageTemplate` + `MessageQueue` | Gateway = Android SIM = **illegal without DLT** | Keep template system. Replace Gateway with WhatsApp Cloud API. |
| `messaging/tasks.py` | Celery-stubbed dispatch tasks | Celery not in production stack. Dead code. | Replace with direct `send_whatsapp_message()` utility |
| `customers/models.py` | `Customer` with basic fields | Missing `contact_preference`, `preferred_language` | Add both fields |
| `orders/models.py` | `Order` model, `Payment` model | Missing `receipt_uuid`, `delivered_at`, `last_reminder_sent` | Add all three fields |

### 🟠 DBA — Migration Dependency Graph

```
Phase 1 (Models) → Phase 2 (Receipt Views) → Phase 3 (WhatsApp) → Phase 4 (R2 + Cron)

Migration order matters:
  1. Add fields to Customer (no dependencies)
  2. Add fields to Order (no dependencies) 
  3. Migrate receipt data from Receipt → Order.receipt_uuid
  4. Delete Receipt + ReceiptVerification models
  5. Update views/serializers (depends on step 2-4)
  6. Build WhatsApp integration (depends on step 1)
  7. Build R2 snapshot pipeline (depends on step 5)
  8. Build overdue reminder cron (depends on step 1, 2)
```

---

## Phase 1 — Model Surgery 🔪

*Owner: DBA + Scalpel*
*Estimated effort: 2-3 hours*

### 🟠 DBA's Plan

---

#### [MODIFY] [models.py](file:///z:/books2/customers/models.py)

Add two fields to `Customer`:

```python
# After line 47 (notes field)
CONTACT_PREF_CHOICES = [
    ('whatsapp', 'WhatsApp'),
    ('sms', 'SMS'),
    ('none', 'None'),
]
LANGUAGE_CHOICES = [
    ('gu', 'Gujarati'),
    ('hi', 'Hindi'),
    ('en', 'English'),
]

contact_preference = models.CharField(
    max_length=10, choices=CONTACT_PREF_CHOICES, default='whatsapp',
    help_text="Preferred messaging channel"
)
preferred_language = models.CharField(
    max_length=5, choices=LANGUAGE_CHOICES, default='gu',
    help_text="Preferred language for receipts and messages"
)
show_balance_in_messages = models.BooleanField(
    default=True,
    help_text="If False, balance amounts are hidden in WhatsApp/SMS messages"
)
```

> **Chaos Architect note**: Default `contact_preference` to `'whatsapp'` not `'sms'` — SMS is deferred to Phase 2 (DLT required). Default `preferred_language` to `'gu'` (Gujarati) per tribunal mandate.

---

#### [MODIFY] [models.py](file:///z:/books2/orders/models.py)

Add three fields to `Order`:

```python
# After line 136 (notes field)
import uuid as uuid_lib

receipt_uuid = models.UUIDField(
    default=uuid_lib.uuid4, unique=True, editable=False,
    help_text="Public UUID for receipt access URL"
)
delivered_at = models.DateTimeField(
    null=True, blank=True,
    help_text="When the order was physically delivered"
)
last_reminder_sent = models.DateTimeField(
    null=True, blank=True,
    help_text="Last time an overdue reminder was sent for this order"
)
```

Update `Order.save()` to auto-set `delivered_at`:

```python
def save(self, *args, **kwargs):
    # Auto-set delivered_at when delivery_status changes to 'delivered'
    if self.delivery_status == 'delivered' and not self.delivered_at:
        self.delivered_at = timezone.now()
    # ... existing logic ...
```

---

#### [NEW] Data migration: Copy Receipt → Order

```python
# orders/migrations/XXXX_migrate_receipt_data.py
def forward(apps, schema_editor):
    """Copy receipt_uuid from Receipt.public_uuid to Order.receipt_uuid."""
    Receipt = apps.get_model('orders', 'Receipt')
    Order = apps.get_model('orders', 'Order')
    for receipt in Receipt.objects.select_related('order').all():
        Order.objects.filter(pk=receipt.order_id).update(
            receipt_uuid=receipt.public_uuid
        )
```

> **Ironclad**: Run data migration BEFORE deleting Receipt model. Verify row counts match.

---

#### [DELETE] [receipt_models.py](file:///z:/books2/orders/receipt_models.py)

After data migration, delete the file entirely. Remove `Receipt` and `ReceiptVerification` models.

Update `orders/admin.py` to remove any Receipt admin registrations.

---

### Phase 1 Verification (Ironclad)

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py shell -c "
from orders.models import Order
count = Order.objects.exclude(receipt_uuid__isnull=True).count()
print(f'Orders with receipt_uuid: {count}')
"
```

---

## Phase 2 — Living Receipt 🧾

*Owner: Prism + Scalpel*
*Estimated effort: 4-5 hours*

---

#### [MODIFY] [receipt_serializers.py](file:///z:/books2/orders/receipt_serializers.py)

Rewrite to serialize `Order` directly (not through Receipt):

```python
"""Living receipt serializer — reads from Order directly."""
from rest_framework import serializers
from orders.models import Order, Payment


class PaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source='get_method_display')
    date = serializers.DateTimeField(source='created_at', format='%d/%m/%Y')

    class Meta:
        model = Payment
        fields = ['date', 'method_display', 'amount']


class LivingReceiptSerializer(serializers.ModelSerializer):
    """Public receipt with items + payment history + balance."""
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    payments = PaymentSerializer(many=True, read_only=True)
    paid = serializers.DecimalField(
        source='amount_paid', max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(
        source='balance_due', max_digits=12, decimal_places=2)

    class Meta:
        model = Order
        fields = [
            'receipt_uuid', 'display_id', 'created_at',
            'customer_name', 'customer_phone',
            'items', 'subtotal', 'discount_amount', 'total',
            'payments', 'paid', 'balance', 'payment_status',
        ]

    def get_customer_name(self, obj):
        if not obj.customer:
            return obj.guest_name or "Guest"
        name = obj.customer.full_name
        return name[:3] + "***" if len(name) > 3 else name[0] + "***"

    def get_customer_phone(self, obj):
        phone = obj.customer.phone if obj.customer else obj.guest_phone
        if not phone or len(phone) < 6:
            return phone or "N/A"
        return phone[:2] + "****" + phone[-2:]

    def get_items(self, obj):
        return [
            {
                'name': item.product.name if item.product else 'Unknown',
                'quantity': item.quantity,
                'price': str(item.unit_price),
                'total': str(item.line_total),
            }
            for item in obj.items.select_related('product').all()
        ]


class BalanceSerializer(serializers.ModelSerializer):
    """Tiny serializer — just current balance for UPI Pay Now."""
    balance = serializers.DecimalField(
        source='balance_due', max_digits=12, decimal_places=2)

    class Meta:
        model = Order
        fields = ['balance', 'payment_status']
```

---

#### [MODIFY] [receipt_views.py](file:///z:/books2/orders/receipt_views.py)

Replace both views:

```python
"""Public receipt views — no auth required."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from orders.models import Order
from .receipt_serializers import LivingReceiptSerializer, BalanceSerializer


class PublicReceiptView(APIView):
    """Living receipt — items + payments + balance."""
    permission_classes = [AllowAny]

    def get(self, request, receipt_uuid):
        order = get_object_or_404(
            Order.objects
            .select_related('customer')
            .prefetch_related('items__product', 'payments'),
            receipt_uuid=receipt_uuid
        )
        serializer = LivingReceiptSerializer(order)
        
        # Add store info
        from settings_app.models import StoreSettings
        store = StoreSettings.get_instance()        
        data = serializer.data
        data['store'] = {
            'name': store.name,
            'phone': store.phone,
            'currency_symbol': store.currency_symbol,
        }
        return Response(data)


class ReceiptBalanceView(APIView):
    """Live balance endpoint for UPI Pay Now (NEVER cached)."""
    permission_classes = [AllowAny]

    def get(self, request, receipt_uuid):
        order = get_object_or_404(Order, receipt_uuid=receipt_uuid)
        serializer = BalanceSerializer(order)
        return Response(serializer.data)
```

> **Scalpel**: The old `ReceiptPDFView` with phone-last-4 verification is DELETED. Client-side `html2pdf.js` replaces it. PDF is generated in the browser — zero server involvement.

---

#### [DELETE] [receipt_utils.py](file:///z:/books2/orders/receipt_utils.py)

Delete the entire 183-line ReportLab PDF generator. No server-side PDF generation.

> **Store Manager**: "Wait, does this mean ReportLab can be removed from `requirements.txt`?" **Scalpel**: "Yes. `pip uninstall reportlab` and remove from requirements.txt. Saves ~15MB in the Docker image."

---

#### [MODIFY] [urls.py](file:///z:/books2/orders/urls.py)

Update receipt URL patterns:

```python
# Replace old receipt URLs with:
path('receipts/<uuid:receipt_uuid>/', PublicReceiptView.as_view(), name='public-receipt'),
path('receipts/<uuid:receipt_uuid>/balance/', ReceiptBalanceView.as_view(), name='receipt-balance'),
```

---

## Phase 3 — WhatsApp Integration 📱

*Owner: Chaos Architect + Prism*
*Estimated effort: 3-4 hours*

---

#### [NEW] [whatsapp.py](file:///z:/books2/messaging/whatsapp.py)

```python
"""WhatsApp Cloud API integration."""
import requests
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

WHATSAPP_API_URL = "https://graph.facebook.com/v21.0/{phone_id}/messages"


def send_whatsapp_message(to_phone, template_name, language_code, components=None):
    """
    Send a WhatsApp template message via Cloud API.
    
    Args:
        to_phone: Customer phone with country code (e.g., "919876543210")
        template_name: Pre-approved template name
        language_code: "gu", "hi", or "en"
        components: Template variable substitutions
    Returns:
        dict with message_id on success, None on failure
    """
    phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
    token = settings.WHATSAPP_ACCESS_TOKEN
    
    if not phone_id or not token:
        logger.warning("WhatsApp not configured. Skipping message.")
        return None
    
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        }
    }
    if components:
        payload["template"]["components"] = components
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    try:
        resp = requests.post(
            WHATSAPP_API_URL.format(phone_id=phone_id),
            json=payload, headers=headers, timeout=10
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"WhatsApp sent to {to_phone}: {result}")
        return result
    except Exception as e:
        logger.error(f"WhatsApp send failed to {to_phone}: {e}")
        return None


def send_whatsapp_text(to_phone, text):
    """Send a plain text WhatsApp message (within 24hr service window)."""
    phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
    token = settings.WHATSAPP_ACCESS_TOKEN
    
    if not phone_id or not token:
        return None
    
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": text}
    }
    
    try:
        resp = requests.post(
            WHATSAPP_API_URL.format(phone_id=phone_id),
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"WhatsApp text send failed: {e}")
        return None
```

> **Chaos Architect**: `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` MUST be in environment variables. **NEVER** in code, database, or version control. Add to `.env.example`.

---

#### [NEW] [dispatch.py](file:///z:/books2/messaging/dispatch.py)

Cascading delivery logic:

```python
"""Message dispatch — cascading delivery per customer preference."""
import logging
from django.conf import settings
from .whatsapp import send_whatsapp_message, send_whatsapp_text

logger = logging.getLogger(__name__)

RECEIPT_BASE_URL = getattr(settings, 'RECEIPT_BASE_URL', 'https://azbooks.com')


def dispatch_receipt(order):
    """Send receipt notification via customer's preferred channel."""
    customer = order.customer
    if not customer or not customer.phone:
        logger.info(f"Order {order.display_id}: No customer phone. Skipping.")
        return 'skipped'
    
    pref = customer.contact_preference
    lang = customer.preferred_language or 'gu'
    receipt_url = f"{RECEIPT_BASE_URL}/r/{order.receipt_uuid}"
    
    if pref == 'whatsapp':
        result = send_whatsapp_message(
            to_phone=f"91{customer.phone.lstrip('+').lstrip('91')}",
            template_name="order_receipt",
            language_code=lang,
            components=[{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": order.display_id},
                    {"type": "text", "text": str(order.total)},
                    {"type": "text", "text": receipt_url},
                ]
            }]
        )
        return 'whatsapp_sent' if result else 'whatsapp_failed'
    
    elif pref == 'sms':
        # SMS deferred until DLT registration
        logger.info(f"Order {order.display_id}: SMS pref but DLT not registered. Flagging.")
        return 'sms_deferred'
    
    else:  # 'none'
        logger.info(f"Order {order.display_id}: No messaging pref. Salesman screen only.")
        return 'salesman_only'


def dispatch_payment_update(order, payment):
    """Notify customer about a payment recorded."""
    customer = order.customer
    if not customer or not customer.phone:
        return 'skipped'
    if not customer.show_balance_in_messages:
        return 'privacy_skip'
    
    pref = customer.contact_preference
    lang = customer.preferred_language or 'gu'
    
    if pref == 'whatsapp':
        result = send_whatsapp_message(
            to_phone=f"91{customer.phone.lstrip('+').lstrip('91')}",
            template_name="payment_update",
            language_code=lang,
            components=[{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": order.display_id},
                    {"type": "text", "text": str(payment.amount)},
                    {"type": "text", "text": payment.get_method_display()},
                    {"type": "text", "text": str(order.balance_due)},
                ]
            }]
        )
        return 'whatsapp_sent' if result else 'whatsapp_failed'
    
    return 'no_channel'
```

---

#### [MODIFY] [settings.py](file:///z:/books2/azbooks/settings.py)

Add WhatsApp config:

```python
# WhatsApp Cloud API (env vars ONLY — never commit tokens)
WHATSAPP_PHONE_NUMBER_ID = os.getenv('WHATSAPP_PHONE_NUMBER_ID', '')
WHATSAPP_ACCESS_TOKEN = os.getenv('WHATSAPP_ACCESS_TOKEN', '')
RECEIPT_BASE_URL = os.getenv('RECEIPT_BASE_URL', 'http://localhost:5173')
```

---

## Phase 4 — R2 Snapshots + Overdue Cron ⏰

*Owner: DBA + Ironclad*
*Estimated effort: 3-4 hours*

---

#### [NEW] [r2.py](file:///z:/books2/messaging/r2.py)

R2 receipt snapshot utility:

```python
"""Cloudflare R2 receipt snapshot management."""
import json
import logging
import boto3
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_r2_client():
    """Get boto3 S3 client configured for Cloudflare R2."""
    return boto3.client('s3',
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name='auto'
    )


def update_receipt_snapshot(order):
    """
    Bake receipt data to R2 as a static JSON file.
    Called on: order creation, payment recorded, status change.
    """
    if not getattr(settings, 'R2_ENDPOINT_URL', None):
        return  # R2 not configured (local dev)
    
    try:
        data = {
            "display_id": order.display_id,
            "receipt_uuid": str(order.receipt_uuid),
            "created_at": order.created_at.isoformat(),
            "customer_name": _mask_name(order),
            "customer_phone": _mask_phone(order),
            "items": [
                {
                    "name": i.product.name if i.product else "Unknown",
                    "qty": i.quantity,
                    "price": str(i.unit_price),
                    "total": str(i.line_total),
                }
                for i in order.items.select_related('product').all()
            ],
            "subtotal": str(order.subtotal),
            "discount": str(order.discount_amount),
            "total": str(order.total),
            "payments": [
                {
                    "date": p.created_at.strftime("%d/%m/%Y"),
                    "method": p.get_method_display(),
                    "amount": str(p.amount),
                }
                for p in order.payments.all()
            ],
            "paid": str(order.amount_paid),
            "balance": str(order.balance_due),
            "payment_status": order.payment_status,
            "updated_at": timezone.now().isoformat(),
        }
        
        client = get_r2_client()
        client.put_object(
            Bucket=settings.R2_RECEIPTS_BUCKET,
            Key=f"receipts/{order.receipt_uuid}.json",
            Body=json.dumps(data),
            ContentType="application/json",
        )
        logger.info(f"R2 snapshot updated: {order.receipt_uuid}")
    except Exception as e:
        logger.error(f"R2 snapshot failed for {order.receipt_uuid}: {e}")
        # Non-critical — SWR cache will fall back to Render


def _mask_name(order):
    if order.is_guest:
        name = order.guest_name or "Guest"
    elif order.customer:
        name = order.customer.full_name
    else:
        return "Guest"
    return name[:3] + "***" if len(name) > 3 else name[0] + "***"


def _mask_phone(order):
    phone = order.customer.phone if order.customer else order.guest_phone
    if not phone or len(phone) < 6:
        return phone or "N/A"
    return phone[:2] + "****" + phone[-2:]
```

---

#### [NEW] [send_overdue_reminders.py](file:///z:/books2/orders/management/commands/send_overdue_reminders.py)

Daily cron management command:

```python
"""Daily overdue payment reminder command (9 AM IST cron)."""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from orders.models import Order
from messaging.dispatch import dispatch_payment_update


class Command(BaseCommand):
    help = "Send gentle reminders for orders overdue >15 days post-delivery"

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=15)
        week_ago = timezone.now() - timedelta(days=7)

        overdue = Order.objects.filter(
            payment_status__in=['pending', 'partial'],
            delivered_at__isnull=False,
            delivered_at__lt=cutoff,
        ).filter(
            # Max 1 reminder per week
            models.Q(last_reminder_sent__isnull=True) |
            models.Q(last_reminder_sent__lt=week_ago)
        ).select_related('customer')

        sent = 0
        for order in overdue:
            if not order.customer or not order.customer.phone:
                continue
            # Use existing dispatch — it checks contact_preference
            result = dispatch_payment_update(order, payment=None)
            if 'sent' in result:
                order.last_reminder_sent = timezone.now()
                order.save(update_fields=['last_reminder_sent'])
                sent += 1

        self.stdout.write(f"Sent {sent} overdue reminders.")
```

> **Ironclad**: This is triggered by GitHub Actions cron at `30 3 * * *` (9 AM IST = 3:30 AM UTC). The `dispatch_payment_update` function already handles the cascading logic and privacy checks.

---

## Integration Points — Where to Hook In

### 🟡 Scalpel — Signal/Hook Locations

| Event | Where to Hook | What to Call |
|:--|:--|:--|
| Order created | `OrderViewSet.perform_create()` | `dispatch_receipt(order)` + `update_receipt_snapshot(order)` |
| Payment recorded | `Payment.save()` (after `update_payment_status`) | `dispatch_payment_update(order, payment)` + `update_receipt_snapshot(order)` |
| Delivery status → delivered | `Order.save()` (after `delivered_at` set) | `update_receipt_snapshot(order)` |
| Daily 9 AM IST | GitHub Actions cron | `python manage.py send_overdue_reminders` |

---

## Files Changed Summary

| Phase | Action | File | Owner |
|:--|:--|:--|:--|
| 1 | MODIFY | `customers/models.py` — add 3 fields | DBA |
| 1 | MODIFY | `orders/models.py` — add 3 fields + `delivered_at` auto-set | DBA |
| 1 | NEW | Data migration: Receipt → Order.receipt_uuid | DBA |
| 1 | DELETE | `orders/receipt_models.py` | Scalpel |
| 2 | MODIFY | `orders/receipt_serializers.py` — complete rewrite | Prism |
| 2 | MODIFY | `orders/receipt_views.py` — complete rewrite | Prism |
| 2 | DELETE | `orders/receipt_utils.py` (ReportLab) | Scalpel |
| 2 | MODIFY | `orders/urls.py` — update receipt endpoints | Scalpel |
| 2 | MODIFY | `requirements.txt` — remove `reportlab` | Scalpel |
| 3 | NEW | `messaging/whatsapp.py` — Cloud API client | Chaos Architect |
| 3 | NEW | `messaging/dispatch.py` — cascading delivery | Prism |
| 3 | MODIFY | `azbooks/settings.py` — WhatsApp + R2 env vars | Chaos Architect |
| 4 | NEW | `messaging/r2.py` — R2 snapshot utility | DBA |
| 4 | NEW | `orders/management/commands/send_overdue_reminders.py` | Ironclad |
| 4 | NEW | `.github/workflows/overdue-reminders.yml` | Ironclad |

---

## What NOT to Build Yet

| Feature | Why Deferred | When |
|:--|:--|:--|
| SMS delivery (Tier 2) | DLT registration required (₹5,900 + legal compliance) | After DLT registration |
| UPI webhook auto-payment | Needs payment gateway account (Razorpay/Setu) | Phase 2 — investigate free tiers |
| Gujarati receipt frontend | Need i18n keys + Noto Sans Gujarati font | Can be added to React receipt page incrementally |
| Thermal printer | ₹12,000 for 4 printers — too expensive | Not planned |
| CF Worker SWR proxy | Infrastructure — not application code | Deploy separately after backend is ready |
| CF Worker R2 receipt serving | Infrastructure — depends on R2 data existing | Deploy after Phase 4 produces snapshots |

---

## Verification Checklist (Ironclad)

- [ ] `Customer` model has `contact_preference`, `preferred_language`, `show_balance_in_messages`
- [ ] `Order` model has `receipt_uuid`, `delivered_at`, `last_reminder_sent`
- [ ] All existing Receipt data migrated to Order.receipt_uuid
- [ ] `Receipt` and `ReceiptVerification` models deleted
- [ ] `reportlab` removed from requirements.txt
- [ ] `/api/orders/receipts/{uuid}/` returns living receipt JSON from Order
- [ ] `/api/orders/receipts/{uuid}/balance/` returns live balance only
- [ ] `send_whatsapp_message()` handles missing env vars gracefully (logs warning, no crash)
- [ ] `dispatch_receipt()` respects `contact_preference` and `show_balance_in_messages`
- [ ] `update_receipt_snapshot()` handles missing R2 config (local dev fallback)
- [ ] `send_overdue_reminders` management command runs without error
- [ ] No SMS sending anywhere in codebase (DLT not registered)
