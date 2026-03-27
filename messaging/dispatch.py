"""Message dispatch — cascading delivery per customer preference.

Implements the tribunal's cascading delivery hierarchy:
  1. WhatsApp (primary — free, legal, rich formatting)
  2. SMS (deferred — DLT registration required)
  3. Salesman screen (always works — no messaging)
"""
import logging
from django.conf import settings
from .whatsapp import send_whatsapp_message

logger = logging.getLogger(__name__)


def _normalize_phone(phone):
    """Normalize phone to 91XXXXXXXXXX format for WhatsApp API."""
    if not phone:
        return None
    phone = phone.strip().lstrip('+')
    if phone.startswith('91') and len(phone) == 12:
        return phone
    if len(phone) == 10 and phone.isdigit():
        return f"91{phone}"
    return phone


def dispatch_receipt(order):
    """
    Send receipt notification via customer's preferred channel.
    
    Called after order creation/completion.
    Returns: str status ('whatsapp_sent', 'whatsapp_failed', 'sms_deferred', 
                          'salesman_only', 'skipped')
    """
    customer = order.customer
    if not customer:
        # Guest order — no messaging
        logger.info(f"Order {order.display_id}: Guest order, skipping receipt dispatch.")
        return 'skipped'
    
    if not customer.phone:
        logger.info(f"Order {order.display_id}: No customer phone. Skipping.")
        return 'skipped'
    
    pref = customer.contact_preference
    lang = customer.preferred_language or 'gu'
    receipt_base = getattr(settings, 'RECEIPT_BASE_URL', 'http://localhost:5173')
    receipt_url = f"{receipt_base}/r/{order.receipt_uuid}"
    
    if pref == 'whatsapp':
        phone = _normalize_phone(customer.phone)
        result = send_whatsapp_message(
            to_phone=phone,
            template_name="order_receipt",
            language_code=lang,
            components=[{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(order.display_id)},
                    {"type": "text", "text": str(order.total)},
                    {"type": "text", "text": receipt_url},
                ]
            }]
        )
        status = 'whatsapp_sent' if result else 'whatsapp_failed'
        logger.info(f"Order {order.display_id}: Receipt dispatch → {status}")
        return status
    
    elif pref == 'sms':
        # SMS deferred until DLT registration (TRAI TCCCPR 2018)
        logger.info(f"Order {order.display_id}: SMS pref but DLT not registered. Salesman screen only.")
        return 'sms_deferred'
    
    else:  # 'none'
        logger.info(f"Order {order.display_id}: contact_preference='none'. Salesman screen only.")
        return 'salesman_only'


def dispatch_payment_update(order, payment=None):
    """
    Notify customer about a payment recorded or overdue reminder.
    
    Args:
        order: Order instance
        payment: Payment instance (None for overdue reminders)
    Returns: str status
    """
    customer = order.customer
    if not customer or not customer.phone:
        return 'skipped'
    
    # Privacy check: customer may opt out of balance in messages
    if not customer.show_balance_in_messages:
        logger.info(f"Order {order.display_id}: Customer opted out of balance in messages.")
        return 'privacy_skip'
    
    pref = customer.contact_preference
    lang = customer.preferred_language or 'gu'
    
    if pref == 'whatsapp':
        phone = _normalize_phone(customer.phone)
        
        if payment:
            # Payment recorded notification
            template_name = "payment_update"
            components = [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(order.display_id)},
                    {"type": "text", "text": str(payment.amount)},
                    {"type": "text", "text": payment.get_method_display()},
                    {"type": "text", "text": str(order.balance_due)},
                ]
            }]
        else:
            # Overdue reminder
            template_name = "overdue_reminder"
            receipt_base = getattr(settings, 'RECEIPT_BASE_URL', 'http://localhost:5173')
            receipt_url = f"{receipt_base}/r/{order.receipt_uuid}"
            components = [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(order.display_id)},
                    {"type": "text", "text": str(order.balance_due)},
                    {"type": "text", "text": receipt_url},
                ]
            }]
        
        result = send_whatsapp_message(
            to_phone=phone,
            template_name=template_name,
            language_code=lang,
            components=components
        )
        return 'whatsapp_sent' if result else 'whatsapp_failed'
    
    return 'no_channel'
