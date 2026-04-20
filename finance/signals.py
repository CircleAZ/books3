"""
Finance app signals.
Auto-provisions a personal CashWallet when a new User is created.
"""
import logging
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def auto_provision_cash_wallet(sender, instance, created, **kwargs):
    """Auto-create a personal CashWallet when a new User is created."""
    if not created:
        return

    from finance.models import CashWallet

    wallet, was_created = CashWallet.objects.get_or_create(
        owner=instance,
        defaults={
            'name': f"{instance.username}'s Wallet",
            'is_system': False,
            'balance': 0.00,
        }
    )
    if was_created:
        logger.info(f"Auto-provisioned CashWallet '{wallet.name}' for user '{instance.username}'")
