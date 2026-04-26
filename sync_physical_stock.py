import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from inventory.models import Product
from django.db.models import F
from inventory.services import StockService

def sync_physical_stock():
    products = Product.objects.all()
    count = 0
    print("Starting synchronization of physical_stock for legacy products...")
    
    for product in products:
        owed = StockService.get_owed_quantity(product.id)
        
        # New Physical Stock = Available Stock + Owed
        new_physical = product.stock_quantity + owed
        
        if product.physical_stock != new_physical:
            product.physical_stock = new_physical
            product.save(update_fields=['physical_stock'])
            print(f"Product #{product.display_id} synced: Available={product.stock_quantity}, Owed={owed} -> Physical={new_physical}")
            count += 1
            
    print(f"Synchronization complete. {count} products updated.")

if __name__ == '__main__':
    sync_physical_stock()
