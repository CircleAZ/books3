"""Celery tasks for message dispatching."""
import requests
import logging
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)

# Note: These tasks are designed for Celery but can run synchronously for testing
# In production, configure Celery with Redis/RabbitMQ broker


def dispatch_message(message_id):
    """
    Send a single message via an available gateway.
    
    Args:
        message_id: UUID of the MessageQueue entry
        
    Returns:
        Boolean indicating success
    """
    from .models import MessageQueue, Gateway
    
    try:
        with transaction.atomic():
            message = MessageQueue.objects.select_for_update().get(id=message_id)
    except MessageQueue.DoesNotExist:
        logger.error(f"Message {message_id} not found")
        return False
    
    if message.status not in ['pending', 'processing']:
        logger.info(f"Message {message_id} already processed: {message.status}")
        return False
    
    # Mark as processing
    message.status = 'processing'
    message.save(update_fields=['status'])
    
    # Get available gateway (prefer assigned, then by priority)
    gateway = message.gateway
    if not gateway or not gateway.is_active or not gateway.is_online:
        # Find best available gateway
        gateway = Gateway.objects.filter(
            is_active=True
        ).order_by('-priority').first()
    
    if not gateway:
        message.mark_failed("No available gateway")
        return False
    
    # Attempt to send
    try:
        response = requests.post(
            gateway.api_url,
            json={
                'phone': message.phone,
                'message': message.content,
                'type': message.message_type
            },
            headers={'Authorization': f'Bearer {gateway.api_key}'},
            timeout=30
        )
        
        if response.status_code == 200:
            message.mark_sent(gateway)
            logger.info(f"Message {message_id} sent via {gateway.name}")
            return True
        else:
            message.mark_failed(f"Gateway returned {response.status_code}: {response.text[:200]}", gateway)
            return False
            
    except requests.exceptions.Timeout:
        message.mark_failed("Gateway timeout", gateway)
        return False
    except requests.exceptions.RequestException as e:
        message.mark_failed(f"Request error: {str(e)}", gateway)
        return False


def process_queue(batch_size=50):
    """
    Process pending messages in batch.
    
    Args:
        batch_size: Number of messages to process
        
    Returns:
        Tuple of (sent_count, failed_count)
    """
    from .models import MessageQueue
    
    pending = MessageQueue.get_pending(limit=batch_size)
    sent = 0
    failed = 0
    
    for message in pending:
        if dispatch_message(message.id):
            sent += 1
            # Simple rate limiting: 1 message per second to prevent gateway overload
            import time
            time.sleep(1)
        else:
            failed += 1
    
    logger.info(f"Queue processed: {sent} sent, {failed} failed")
    return sent, failed


def check_gateway_heartbeat():
    """
    Check health of all gateways by sending heartbeat ping.
    
    Returns:
        Dict of gateway_id: is_online
    """
    from .models import Gateway
    
    results = {}
    gateways = Gateway.objects.filter(is_active=True)
    
    for gateway in gateways:
        try:
            # Attempt heartbeat endpoint
            response = requests.get(
                f"{gateway.api_url.rstrip('/')}/heartbeat",
                headers={'Authorization': f'Bearer {gateway.api_key}'},
                timeout=10
            )
            
            if response.status_code == 200:
                gateway.last_heartbeat = timezone.now()
                gateway.save(update_fields=['last_heartbeat'])
                results[str(gateway.id)] = True
                logger.info(f"Gateway {gateway.name} is online")
            else:
                results[str(gateway.id)] = False
                logger.warning(f"Gateway {gateway.name} returned {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            results[str(gateway.id)] = False
            logger.error(f"Gateway {gateway.name} unreachable: {e}")
    
    return results


def send_templated_message(phone, template_type, language='en', variables=None):
    """
    Queue a message using a template.
    
    Args:
        phone: Recipient phone number
        template_type: Template type code
        language: Language code
        variables: Dict of template variables
        
    Returns:
        MessageQueue instance or None
    """
    from .models import MessageTemplate, MessageQueue
    
    try:
        template = MessageTemplate.objects.get(
            type=template_type,
            language=language,
            is_active=True
        )
    except MessageTemplate.DoesNotExist:
        logger.error(f"Template not found: {template_type}/{language}")
        return None
    
    content = template.expand_spintax(variables or {})
    
    message = MessageQueue.objects.create(
        phone=phone,
        content=content,
        template=template
    )
    
    return message


# Celery task decorators (uncomment when Celery is configured)
# from celery import shared_task
# 
# @shared_task
# def dispatch_message_task(message_id):
#     return dispatch_message(message_id)
# 
# @shared_task
# def process_queue_task(batch_size=50):
#     return process_queue(batch_size)
# 
# @shared_task
# def check_heartbeat_task():
#     return check_gateway_heartbeat()
