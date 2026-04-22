from django.contrib import admin
from .models import Customer, Address, CustomerLink, Wallet, WalletTransaction, TargetVillage


class AddressInline(admin.TabularInline):
    model = Address
    extra = 0
    fields = ('region', 'faliya', 'address_line', 'pincode', 'is_primary')

class WalletInline(admin.StackedInline):
    model = Wallet
    extra = 0
    readonly_fields = ('balance',)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'school', 'customer_group', 'created_at')
    list_filter = ('school', 'customer_group', 'is_deleted')
    search_fields = ('first_name', 'last_name', 'phone', 'email')
    readonly_fields = ('display_id', 'created_at', 'updated_at')
    inlines = [AddressInline, WalletInline]

    def full_name(self, obj):
        return obj.full_name
    full_name.short_description = 'Name'


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('customer', 'region', 'pincode', 'is_primary')
    list_filter = ('is_primary',)
    search_fields = ('region__name', 'pincode', 'customer__first_name')


@admin.register(CustomerLink)
class CustomerLinkAdmin(admin.ModelAdmin):
    list_display = ('customer_a', 'customer_b', 'link_type')
    list_filter = ('link_type',)


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('customer', 'balance')
    search_fields = ('customer__first_name', 'customer__last_name')


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ('wallet', 'transaction_type', 'amount', 'reason', 'created_at')
    list_filter = ('transaction_type',)
    readonly_fields = ('wallet', 'amount', 'transaction_type', 'reason', 'created_by', 'created_at')


@admin.register(TargetVillage)
class TargetVillageAdmin(admin.ModelAdmin):
    list_display = ('name', 'target_season', 'created_by', 'created_at')
    list_filter = ('target_season',)
    search_fields = ('name',)

