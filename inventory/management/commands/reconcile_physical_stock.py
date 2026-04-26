from django.core.management.base import BaseCommand
from inventory.models import Product
from inventory.services import StockService

class Command(BaseCommand):
    help = 'Reconcile physical stock for all products by calculating owed items.'

    def handle(self, *args, **options):
        products = Product.objects.all()
        count = 0
        self.stdout.write(self.style.WARNING("Starting synchronization of physical_stock for legacy products..."))
        
        from orders.models import OrderItem
        
        for product in products:
            active_items = OrderItem.objects.filter(
                product_id=product.id,
                order__order_status__in=['confirmed', 'completed'],
                order__cancellation_status__in=['na', 'pending']
            ).prefetch_related('delivery_items')
            owed = sum(item.remaining_quantity for item in active_items)
            
            # New Physical Stock = Available Stock + Owed
            new_physical = product.stock_quantity + owed
            
            if product.physical_stock != new_physical:
                product.physical_stock = new_physical
                product.save(update_fields=['physical_stock'])
                self.stdout.write(self.style.SUCCESS(f"Product #{product.display_id} synced: Available={product.stock_quantity}, Owed={owed} -> Physical={new_physical}"))
                count += 1
                
        self.stdout.write(self.style.SUCCESS(f"Synchronization complete. {count} products updated."))
