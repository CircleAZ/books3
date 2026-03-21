from django.contrib import admin
from .models import (
    School, Class, Division, Subdivision,
    ClassTemplate, DivisionTemplate, SubdivisionTemplate,
    CustomerGroup, LinkType, LocationTag,
    StoreSettings, Role, Permission, RolePermission, UserRole,
    TaxSettings, PaymentMethod, NotificationPreference,
    ReceiptSettings, UPIAccount, IntegrationSettings, RoleAuditLog
)


# ---- School Structure ----

class ClassInline(admin.TabularInline):
    model = Class
    extra = 0

class DivisionInline(admin.TabularInline):
    model = Division
    extra = 0

@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')
    search_fields = ('name',)
    inlines = [ClassInline]

@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'order')
    list_filter = ('school',)
    inlines = [DivisionInline]

@admin.register(Division)
class DivisionAdmin(admin.ModelAdmin):
    list_display = ('name', 'class_obj')
    list_filter = ('class_obj__school',)

@admin.register(Subdivision)
class SubdivisionAdmin(admin.ModelAdmin):
    list_display = ('name', 'division')


# ---- Template Catalogs ----

@admin.register(ClassTemplate)
class ClassTemplateAdmin(admin.ModelAdmin):
    list_display = ('name',)

@admin.register(DivisionTemplate)
class DivisionTemplateAdmin(admin.ModelAdmin):
    list_display = ('name',)
    filter_horizontal = ('applicable_classes',)

@admin.register(SubdivisionTemplate)
class SubdivisionTemplateAdmin(admin.ModelAdmin):
    list_display = ('name',)
    filter_horizontal = ('applicable_divisions',)


# ---- Customer Grouping ----

@admin.register(CustomerGroup)
class CustomerGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'discount_percent')

@admin.register(LinkType)
class LinkTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'reverse_name')

@admin.register(LocationTag)
class LocationTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'color')


# ---- Store Settings (Singleton) ----

@admin.register(StoreSettings)
class StoreSettingsAdmin(admin.ModelAdmin):
    list_display = ('name', 'currency_symbol', 'maintenance_mode')

    def has_add_permission(self, request):
        # Singleton — only one instance allowed
        return not StoreSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


# ---- RBAC ----

class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 1

class UserRoleInline(admin.TabularInline):
    model = UserRole
    extra = 1

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_default', 'is_system')
    list_filter = ('is_default', 'is_system')
    inlines = [RolePermissionInline, UserRoleInline]

@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('codename', 'name', 'category')
    list_filter = ('category',)
    search_fields = ('codename', 'name')

@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'permission')
    list_filter = ('role',)

@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_filter = ('role',)

@admin.register(RoleAuditLog)
class RoleAuditLogAdmin(admin.ModelAdmin):
    list_display = ('role_name', 'action', 'executed_by', 'timestamp')
    list_filter = ('action',)
    readonly_fields = ('role_name', 'action', 'executed_by', 'target_user', 'permission_code', 'metadata', 'timestamp')


# ---- Financial / Tax / Payment ----

@admin.register(TaxSettings)
class TaxSettingsAdmin(admin.ModelAdmin):
    list_display = ('name', 'percentage', 'is_active', 'is_default')
    list_filter = ('is_active',)

@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ('name', 'method_type', 'is_enabled')

@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ('notification_type', 'is_enabled')
    list_filter = ('is_enabled',)


# ---- Receipt / UPI / Integrations ----

@admin.register(ReceiptSettings)
class ReceiptSettingsAdmin(admin.ModelAdmin):
    list_display = ('header_text',)

    def has_add_permission(self, request):
        return not ReceiptSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(UPIAccount)
class UPIAccountAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'upi_id', 'is_active')

@admin.register(IntegrationSettings)
class IntegrationSettingsAdmin(admin.ModelAdmin):
    list_display = ('service_type', 'is_enabled')
