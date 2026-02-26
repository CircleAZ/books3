"""Receipt models for public receipt view."""
import uuid
from django.db import models


class Receipt(models.Model):
    """Receipt for public web view."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    public_uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False,
                                    help_text="UUID for public access URL")
    order = models.OneToOneField('orders.Order', on_delete=models.CASCADE, related_name='receipt')
    pdf_file = models.FileField(upload_to='receipts/', null=True, blank=True)
    is_sent = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    download_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Receipt for {self.order}"
    
    @property
    def public_url(self):
        """Get public URL path."""
        return f"/r/{self.public_uuid}"
    
    def get_masked_customer_name(self):
        """Mask customer name for privacy."""
        if not self.order.customer:
            return "Guest"
        name = self.order.customer.name
        if len(name) <= 3:
            return name[0] + "***"
        return name[:3] + "***"
    
    def get_masked_phone(self):
        """Mask phone number for privacy."""
        if not self.order.customer:
            return "N/A"
        phone = self.order.customer.phone or ""
        if len(phone) < 6:
            return phone
        return phone[:2] + "****" + phone[-2:]


class ReceiptVerification(models.Model):
    """Phone verification for PDF download."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(Receipt, on_delete=models.CASCADE, related_name='verifications')
    phone_last4 = models.CharField(max_length=4)
    verified = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
