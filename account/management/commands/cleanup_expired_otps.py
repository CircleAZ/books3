from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from account.models import EmailOTP
from django.db.models import Q

class Command(BaseCommand):
    help = 'Cleans up used and expired EmailOTPs older than 7 days, and expired unused OTPs.'

    def handle(self, *args, **options):
        # Time threshold for keeping used OPT records (7 days)
        used_threshold = timezone.now() - timedelta(days=7)
        
        # 1. Delete OTPs that have been used AND are older than 7 days
        # 2. Delete OTPs that were never used but have expired
        # (Using timezone.now() instead of expires_at for unused is fine since expires_at is short)
        
        otps_to_delete = EmailOTP.objects.filter(
            Q(is_used=True, created_at__lt=used_threshold) |
            Q(is_used=False, expires_at__lt=timezone.now())
        )
        
        count, _ = otps_to_delete.delete()
        
        if count > 0:
            self.stdout.write(self.style.SUCCESS(f'Successfully deleted {count} old/expired OTP(s).'))
        else:
            self.stdout.write(self.style.SUCCESS('No old/expired OTPs found for cleanup.'))
