"""
Customer models for CRM functionality.
"""
from django.db import models
from django.conf import settings
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin


class Customer(DisplayIDMixin, SoftDeleteModel):
    """
    Customer entity representing individuals or organizations.
    """
    # Name fields
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    
    # Contact
    phone = models.CharField(max_length=20, db_index=True)  # Required
    email = models.EmailField(blank=True, null=True)
    
    # School/Education (Optional)
    school = models.ForeignKey(
        'settings_app.School', on_delete=models.SET_NULL, 
        null=True, blank=True, related_name='customers'
    )
    class_obj = models.ForeignKey(
        'settings_app.Class', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='customers'
    )
    division = models.ForeignKey(
        'settings_app.Division', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='customers'
    )
    subdivision = models.ForeignKey(
        'settings_app.Subdivision', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='customers'
    )
    
    # Grouping
    customer_group = models.ForeignKey(
        'settings_app.CustomerGroup', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='customers'
    )
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_customers'
    )
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.full_name
    
    @property
    def full_name(self):
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        if self.last_name:
            parts.append(self.last_name)
        return ' '.join(parts)
    
    @property
    def wallet_balance(self):
        """Get customer's wallet balance."""
        wallet = getattr(self, 'wallet', None)
        return wallet.balance if wallet else 0


class Address(UUIDPrimaryKeyModel):
    """
    Customer address with location data for delivery/mapping.
    """
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='addresses')
    
    # Location hierarchy (specific to Gujarat/India context)
    village = models.CharField(max_length=200, blank=True)
    faliya = models.CharField(max_length=200, blank=True, 
        help_text="Sub-locality within a village")
    
    # Full address
    address_line = models.TextField(blank=True, help_text="Full street address")
    landmark = models.CharField(max_length=200, blank=True, 
        help_text="Nearby landmark for easy finding")
    
    # Location Tags (for delivery routing)
    location_tags = models.ManyToManyField(
        'settings_app.LocationTag', blank=True, related_name='addresses'
    )
    
    # Map coordinates
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    
    # Flags
    is_primary = models.BooleanField(default=False)
    
    class Meta:
        verbose_name_plural = "Addresses"
    
    def __str__(self):
        parts = []
        if self.village:
            parts.append(self.village)
        if self.faliya:
            parts.append(self.faliya)
        if self.pincode:
            parts.append(self.pincode)
        return ', '.join(parts) if parts else f"Address {self.pk}"


class CustomerLink(UUIDPrimaryKeyModel):
    """
    Bidirectional relationship between customers.
    When A links to B with type "Parent", B should show A as "Child" (reverse_name).
    """
    customer_a = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name='links_as_a'
    )
    customer_b = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name='links_as_b'
    )
    link_type = models.ForeignKey(
        'settings_app.LinkType', on_delete=models.CASCADE, related_name='customer_links'
    )
    
    class Meta:
        unique_together = ['customer_a', 'customer_b', 'link_type']
    
    def __str__(self):
        return f"{self.customer_a} -> {self.customer_b} ({self.link_type})"
    
    @classmethod
    def get_links_for_customer(cls, customer):
        """
        Get all links for a customer (both directions).
        Returns list of dicts with 'linked_customer', 'relationship', 'link_id'.
        """
        links = []
        
        # Links where this customer is A
        for link in cls.objects.filter(customer_a=customer).select_related('customer_b', 'link_type'):
            links.append({
                'linked_customer': link.customer_b,
                'relationship': link.link_type.name,
                'link_id': link.id
            })
        
        # Links where this customer is B (use reverse name)
        for link in cls.objects.filter(customer_b=customer).select_related('customer_a', 'link_type'):
            relationship = link.link_type.reverse_name or link.link_type.name
            links.append({
                'linked_customer': link.customer_a,
                'relationship': relationship,
                'link_id': link.id
            })
        
        return links


class Wallet(UUIDPrimaryKeyModel):
    """
    Store credit/wallet for a customer.
    Balance is updated by overpayments, returns, and usage at checkout.
    """
    customer = models.OneToOneField(Customer, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    def __str__(self):
        return f"Wallet: {self.customer.full_name} (₹{self.balance})"
    
    def credit(self, amount, reason, user=None):
        """Add credit to wallet."""
        self.balance += amount
        self.save()
        WalletTransaction.objects.create(
            wallet=self,
            amount=amount,
            transaction_type='credit',
            reason=reason,
            created_by=user
        )
    
    def debit(self, amount, reason, user=None):
        """Deduct from wallet. Returns True if successful."""
        if self.balance >= amount:
            self.balance -= amount
            self.save()
            WalletTransaction.objects.create(
                wallet=self,
                amount=amount,
                transaction_type='debit',
                reason=reason,
                created_by=user
            )
            return True
        return False


class WalletTransaction(UUIDPrimaryKeyModel):
    """
    Transaction history for wallet credits/debits.
    """
    TRANSACTION_TYPES = [
        ('credit', 'Credit'),
        ('debit', 'Debit'),
    ]
    
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    reason = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, 
        null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.transaction_type}: ₹{self.amount} - {self.reason}"


class TargetVillage(UUIDPrimaryKeyModel):
    """Manager-placed pin marking a village targeted for expansion."""
    name = models.CharField(max_length=200)
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    target_season = models.CharField(max_length=20)  # e.g., "2026" → Dec 2026–Nov 2027
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='target_villages'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['name', 'target_season']

    def __str__(self):
        return f"{self.name} (Target: Dec {self.target_season})"

