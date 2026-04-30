from django.contrib import admin
from .models import Outlet, OutletStock, OutletStockTransfer, OutletStockTransferItem, OutletStockReturn, OutletStockReturnItem

@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ('display_id', 'name', 'commission_percentage', 'is_active', 'outstanding_balance')
    search_fields = ('name', 'contact_person', 'phone')
    list_filter = ('is_active',)

@admin.register(OutletStock)
class OutletStockAdmin(admin.ModelAdmin):
    list_display = ('outlet', 'product', 'quantity')
    search_fields = ('outlet__name', 'product__name')
    list_filter = ('outlet',)

class OutletStockTransferItemInline(admin.TabularInline):
    model = OutletStockTransferItem
    extra = 1

@admin.register(OutletStockTransfer)
class OutletStockTransferAdmin(admin.ModelAdmin):
    list_display = ('display_id', 'outlet', 'date', 'status', 'created_by')
    list_filter = ('status', 'outlet', 'date')
    search_fields = ('outlet__name', 'reference_number')
    inlines = [OutletStockTransferItemInline]
    
    actions = ['dispatch_transfers']
    
    def dispatch_transfers(self, request, queryset):
        for transfer in queryset.filter(status='draft'):
            try:
                transfer.dispatch(user=request.user)
            except Exception as e:
                self.message_user(request, f"Error dispatching {transfer}: {str(e)}", level='ERROR')
        self.message_user(request, "Selected draft transfers were dispatched successfully.")
    dispatch_transfers.short_description = "Dispatch selected draft transfers"

class OutletStockReturnItemInline(admin.TabularInline):
    model = OutletStockReturnItem
    extra = 1

@admin.register(OutletStockReturn)
class OutletStockReturnAdmin(admin.ModelAdmin):
    list_display = ('display_id', 'outlet', 'date', 'status', 'reason', 'created_by')
    list_filter = ('status', 'reason', 'outlet', 'date')
    search_fields = ('outlet__name',)
    inlines = [OutletStockReturnItemInline]
    
    actions = ['receive_returns']
    
    def receive_returns(self, request, queryset):
        for return_rec in queryset.filter(status='draft'):
            try:
                return_rec.receive(user=request.user)
            except Exception as e:
                self.message_user(request, f"Error receiving {return_rec}: {str(e)}", level='ERROR')
        self.message_user(request, "Selected draft returns were received successfully.")
    receive_returns.short_description = "Receive selected draft returns"
