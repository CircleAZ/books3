"""Cloudflare R2 receipt snapshot management.

Bakes receipt data as static JSON files to R2 on every order/payment event.
CF Worker can serve receipts directly from R2 without hitting Render/Nile.

Per tribunal: R2 snapshot is an OPTIMIZATION, not the source of truth.
If R2 upload fails, SWR cache expires and Worker falls back to Render → DB.
"""
import json
import logging
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)



def get_r2_client():
    """Get boto3 S3 client configured for Cloudflare R2."""
    import boto3
    return boto3.client('s3',
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name='auto'
    )


def update_receipt_snapshot(order):
    """
    Bake receipt data to R2 as a static JSON file.
    
    Called on: order creation, payment recorded, delivery status change.
    ~2KB per receipt. Worker reads via env.RECEIPTS_BUCKET.get().
    
    Non-critical: if this fails, the SWR cache falls back to Render.
    """
    endpoint = getattr(settings, 'R2_ENDPOINT_URL', '')
    if not endpoint:
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
                for p in order.payments.order_by('created_at').all()
            ],
            "paid": str(order.amount_paid),
            "balance": str(order.balance_due),
            "payment_status": order.payment_status,
            "updated_at": timezone.now().isoformat(),
        }
        
        client = get_r2_client()
        bucket = getattr(settings, 'R2_RECEIPTS_BUCKET', 'azbooks-receipts')
        client.put_object(
            Bucket=bucket,
            Key=f"receipts/{order.receipt_uuid}.json",
            Body=json.dumps(data, ensure_ascii=False),
            ContentType="application/json",
        )
        logger.info(f"R2 snapshot updated: receipts/{order.receipt_uuid}.json")
        
    except Exception as e:
        logger.error(f"R2 snapshot failed for {order.receipt_uuid}: {e}")
        # Non-critical — SWR cache will fall back to Render


def _mask_name(order):
    """Mask customer name for R2 snapshot."""
    if order.is_guest:
        name = order.guest_name or "Guest"
    elif order.customer:
        name = order.customer.full_name
    else:
        return "Guest"
    return name[:3] + "***" if len(name) > 3 else name[0] + "***"


def _mask_phone(order):
    """Mask phone number for R2 snapshot."""
    phone = order.customer.phone if order.customer else order.guest_phone
    if not phone or len(phone) < 6:
        return phone or "N/A"
    return phone[:2] + "****" + phone[-2:]
