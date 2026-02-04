from django.contrib import admin
from .models import Category, Vendor, Tag, Product, ProductImage, StockHistory

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'display_id', 'is_deleted', 'created_at')
    search_fields = ('name', 'description')
    list_filter = ('is_deleted',)

@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ('name', 'contact_email', 'contact_phone', 'is_deleted')
    search_fields = ('name', 'contact_email')
    list_filter = ('is_deleted',)

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'display_id', 'category', 'vendor', 'stock_quantity', 'selling_price', 'is_deleted')
    search_fields = ('name', 'description', 'display_id')
    list_filter = ('category', 'vendor', 'is_deleted', 'is_additional')
    inlines = [ProductImageInline]

@admin.register(StockHistory)
class StockHistoryAdmin(admin.ModelAdmin):
    list_display = ('product', 'quantity_change', 'quantity_after', 'reason', 'created_at', 'created_by')
    list_filter = ('reason', 'created_at')
    search_fields = ('product__name', 'notes')
    readonly_fields = ('created_at',)