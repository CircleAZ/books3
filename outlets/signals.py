from django.db.models.signals import post_delete
from django.dispatch import receiver
from finance.models import BankTransaction, CashWalletTransaction
from outlets.models import OutletPayment

@receiver(post_delete, sender=BankTransaction)
def cleanup_orphaned_outlet_payment_bank(sender, instance, **kwargs):
    OutletPayment.objects.filter(bank_transaction=instance).delete()

@receiver(post_delete, sender=CashWalletTransaction)
def cleanup_orphaned_outlet_payment_wallet(sender, instance, **kwargs):
    OutletPayment.objects.filter(wallet_transaction=instance).delete()
