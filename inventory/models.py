from django.db import models, transaction
from django.conf import settings
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin
from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile
import os


class Category(DisplayIDMixin, SoftDeleteModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    tax_rate = models.ForeignKey(
        'settings_app.TaxSettings', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='categories',
        help_text="Tax rate applicable to products in this category"
    )

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class Vendor(SoftDeleteModel):
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    contact_name = models.CharField(max_length=100, blank=True)
    contact_email = models.EmailField(blank=True, null=True)
    contact_phone = models.CharField(max_length=50, blank=True, null=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.name


class StockAdjustment(UUIDPrimaryKeyModel):
    ADJUSTMENT_TYPES = [
        ('increase', 'Increase'),
        ('decrease', 'Decrease'),
        ('set', 'Set Total'),
    ]

    product = models.ForeignKey('Product', on_delete=models.CASCADE, related_name='adjustments')
    adjustment_type = models.CharField(max_length=10, choices=ADJUSTMENT_TYPES)
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Cost per unit for this adjustment (used for AVCO)")
    reason = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_adjustment_type_display()} {self.quantity} for {self.product.name}"

    # save() method removed. Logic moved to StockService.



class Tag(UUIDPrimaryKeyModel):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name


class Product(DisplayIDMixin, SoftDeleteModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, related_name='products')
    tags = models.ManyToManyField(Tag, blank=True, related_name='products')

    is_additional = models.BooleanField(default=False)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.IntegerField(default=0)
    physical_stock = models.IntegerField(default=0, help_text="Actual stock sitting in the warehouse. Deducted only upon delivery.")
    low_stock_threshold = models.PositiveIntegerField(default=10)

    def __str__(self):
        return self.name


class ProductImage(UUIDPrimaryKeyModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/')
    thumbnail = models.ImageField(upload_to='products/thumbnails/', blank=True, null=True)
    is_primary = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # The frontend now pre-compresses and converts images to WebP format.
        # We simply save the optimized image directly to storage (S3/R2).
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Explicitly delete the physical files from R2/S3 storage when the database row is deleted
        if self.image:
            self.image.delete(save=False)
        if self.thumbnail:
            self.thumbnail.delete(save=False)
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"Image for {self.product.name}"


class StockHistory(UUIDPrimaryKeyModel):
    REASON_CHOICES = [
        ('purchase', 'Purchase'),
        ('sale', 'Sale'),
        ('adjustment', 'Adjustment'),
        ('return', 'Return'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_history')
    quantity_change = models.IntegerField()
    quantity_after = models.IntegerField()
    cost_at_time = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Stock History"

    def __str__(self):
        return f"{self.product.name} - {self.quantity_change} ({self.reason})"