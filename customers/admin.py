from django.contrib import admin
from .models import Customer, Student, Address, CustomerLink, Wallet, WalletTransaction, TargetVillage, PotentialCustomer


class AddressInline(admin.TabularInline):
    model = Address
    extra = 0
    fields = ('region', 'faliya', 'address_line', 'pincode', 'is_primary', 'home_photo')

class WalletInline(admin.StackedInline):
    model = Wallet
    extra = 0
    readonly_fields = ('balance',)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'customer_group', 'created_at')
    list_filter = ('customer_group', 'is_deleted')
    search_fields = ('first_name', 'last_name', 'phone', 'email')
    readonly_fields = ('display_id', 'created_at', 'updated_at')
    inlines = [AddressInline, WalletInline]

    def full_name(self, obj):
        return obj.full_name
    full_name.short_description = 'Name'


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('name', 'customer', 'school', 'class_obj', 'created_at')
    list_filter = ('school', 'class_obj', 'is_deleted')
    search_fields = ('name', 'customer__first_name', 'customer__last_name')
    raw_id_fields = ('customer',)


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


@admin.register(PotentialCustomer)
class PotentialCustomerAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'is_dissolved', 'created_by', 'created_at', 'dissolved_into')
    list_filter = ('is_dissolved', 'created_at')
    search_fields = ('notes',)
    readonly_fields = ('created_at', 'modified_at', 'dissolved_at')
    raw_id_fields = ('dissolved_into', 'created_by', 'modified_by', 'dissolved_by')

