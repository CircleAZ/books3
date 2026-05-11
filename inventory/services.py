from django.db import transaction, OperationalError
from .models import Product, StockAdjustment, StockHistory
from orders.constants import VALID_SALE_STATUSES
import time

class StockService:
    MAX_RETRIES = 10
    RETRY_DELAY = 0.2  # seconds

    @staticmethod
    def adjust_stock(product_id, adjustment_type, quantity, reason, notes, user=None, unit_cost=None, target_ledger='both'):
        """
        Centrally manage stock adjustments to prevent race conditions.
        target_ledger: 'available' (stock_quantity), 'physical' (physical_stock), or 'both'
        """
        for attempt in range(StockService.MAX_RETRIES):
            try:
                return StockService._do_adjust_stock(
                    product_id, adjustment_type, quantity, reason, notes, user, unit_cost, target_ledger
                )
            except OperationalError as e:
                if 'database is locked' in str(e) and attempt < StockService.MAX_RETRIES - 1:
                    time.sleep(StockService.RETRY_DELAY * (attempt + 1))
                    continue
                raise
        raise OperationalError("Failed to acquire database lock after retries")

    @staticmethod
    @transaction.atomic
    def _do_adjust_stock(product_id, adjustment_type, quantity, reason, notes, user, unit_cost=None, target_ledger='both'):
        """
        Perform atomic stock adjustment using optimistic locking.
        """
        if reason == 'audit_correction' and adjustment_type == 'increase' and unit_cost is None:
            from django.core.exceptions import ValidationError
            raise ValidationError("Audit corrections that increase stock MUST specify a unit_cost to establish a baseline cost basis.")

        # Initial non-locked fetch to check for Pack translation
        initial_product = Product.objects.get(pk=product_id)
        is_translation = False
        if initial_product.is_pack and initial_product.base_product_id:
            if adjustment_type == 'set':
                raise ValueError("Cannot perform absolute 'set' operations on a Pack product. Adjust the Base product directly.")
            is_translation = True
            product_id = initial_product.base_product_id
            quantity = quantity * initial_product.pack_size
            if unit_cost is not None:
                unit_cost = unit_cost / initial_product.pack_size
            notes = f"[Pack Auto-Translate: {initial_product.name}] " + notes

        # Lock the row immediately
        product = Product.objects.select_for_update().get(pk=product_id)
        
        # Initialize new values
        new_cost_price = product.cost_price
        
        if adjustment_type == 'set':
             from orders.models import OrderItem
             
             # 1. Calculate Owed Quantity
             active_items = OrderItem.objects.filter(
                 product_id=product_id,
                 order__order_status__in=VALID_SALE_STATUSES,
                 order__cancellation_status__in=['na', 'pending']
             ).prefetch_related('delivery_items')
             
             owed_quantity = sum(item.remaining_quantity for item in active_items)

             # 2. Synchronize Ledgers
             if target_ledger in ('both', 'physical'):
                 # Input is Physical Count
                 new_physical = quantity
                 new_quantity = quantity - owed_quantity
             elif target_ledger == 'available':
                 # Input is Available Count
                 new_quantity = quantity
                 new_physical = quantity + owed_quantity
             
             change = new_quantity - product.stock_quantity
        else:
             change = quantity if adjustment_type == 'increase' else -quantity
             new_quantity = product.stock_quantity + change
             new_physical = product.physical_stock + change
             
             if adjustment_type == 'increase' and unit_cost is not None and quantity > 0 and target_ledger in ('available', 'both'):
                current_total_value = product.stock_quantity * product.cost_price
                new_stock_value = quantity * unit_cost
                
                # Logic:
                # If stock < 0:
                #   If new_stock <= 0: Cost stays same (fill hole, still negative)
                #   If new_stock > 0:  Cost becomes unit_cost (fresh start for positive part)
                # If stock >= 0:
                #   Standard AVCO
                
                if product.stock_quantity < 0:
                    if new_quantity > 0:
                        new_cost_price = unit_cost
                    else:
                        # Remains current cost
                        pass
                else:
                    # Standard AVCO
                    total_qty = product.stock_quantity + quantity
                    total_value = current_total_value + new_stock_value
                    if total_qty > 0:
                        new_cost_price = total_value / total_qty

        if target_ledger in ('available', 'both'):
            product.stock_quantity = new_quantity
            product.cost_price = new_cost_price
        if target_ledger in ('physical', 'both'):
            if adjustment_type == 'set':
                 # If setting stock to an absolute number, physical stock becomes the absolute number + owed items
                 # Wait, 'set' is usually for physical audits. If they count 10 on the shelf, physical=10, 
                 # available = physical - owed. But for now, let's keep set identical if 'both'.
                 product.physical_stock = new_physical
            else:
                 product.physical_stock = new_physical
                 
        product.save()
        product.sync_pack_stock()
        
        # Removed F() update since we are saving the full object now with lock
        
        # Create Adjustment Record
        StockAdjustment.objects.create(
            product=product,
            adjustment_type=adjustment_type,
            quantity=quantity,
            unit_cost=unit_cost, # Add this
            reason=reason,
            notes=notes,
            created_by=user
        )

        # Create History Record
        StockHistory.objects.create(
            product=product,
            quantity_change=change,
            quantity_after=product.stock_quantity,
            cost_at_time=product.cost_price,
            reason=reason,
            notes=f"Adjustment ({adjustment_type}): {notes}",
            created_by=user
        )
        
        return product.stock_quantity

    @staticmethod
    @transaction.atomic
    def set_stock(product_id, new_total, reason, notes, user=None, unit_cost=None):
        """
        Set the exact stock level. 
        Calculates the difference atomically inside the lock.
        """
        if reason == 'audit_correction' and unit_cost is None:
            from django.core.exceptions import ValidationError
            # Check if it's an increase later, but we can't without DB lock. 
            # So we pass it to _do_adjust_stock or handle it manually.
            pass
            
        initial_product = Product.objects.get(pk=product_id)
        if initial_product.is_pack:
            raise ValueError("Cannot perform absolute 'set' operations on a Pack product. Adjust the Base product directly.")

        product = Product.objects.select_for_update().get(pk=product_id)
        
        current_qty = product.stock_quantity
        change = new_total - current_qty
        
        if change == 0:
            return current_qty

        if reason == 'audit_correction' and change > 0 and unit_cost is None:
            from django.core.exceptions import ValidationError
            raise ValidationError("Audit corrections that increase stock MUST specify a unit_cost to establish a baseline cost basis.")

        product.stock_quantity = new_total
        product.save()
        product.sync_pack_stock()

        StockHistory.objects.create(
            product=product,
            quantity_change=change,
            quantity_after=product.stock_quantity,
            cost_at_time=product.cost_price,
            reason=reason,
            notes=f"Set Stock: {notes}",
            created_by=user
        )
        
        return product.stock_quantity
