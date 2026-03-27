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
        template_name: Pre-approved template name on Meta dashboard
        language_code: "gu", "hi", or "en"
        components: Template variable substitutions
    Returns:
        dict with message_id on success, None on failure
    """
    phone_id = getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '')
    token = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
    
    if not phone_id or not token:
        logger.warning("WhatsApp not configured (missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN). Skipping.")
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
        logger.info(f"WhatsApp sent to {to_phone}: {result.get('messages', [{}])[0].get('id', 'unknown')}")
        return result
    except requests.exceptions.Timeout:
        logger.error(f"WhatsApp send timed out for {to_phone}")
        return None
    except requests.exceptions.HTTPError as e:
        logger.error(f"WhatsApp API error for {to_phone}: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"WhatsApp send failed for {to_phone}: {e}")
        return None


def send_whatsapp_text(to_phone, text):
    """
    Send a plain text WhatsApp message (within 24hr service window).
    
    Use for: payment updates within 24hrs of customer interaction.
    Outside 24hr window, use template messages instead.
    """
    phone_id = getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '')
    token = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
    
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
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"WhatsApp text send failed for {to_phone}: {e}")
        return None
