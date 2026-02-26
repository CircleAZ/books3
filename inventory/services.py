from django.db import transaction, OperationalError
from .models import Product, StockAdjustment, StockHistory
import time

class StockService:
    MAX_RETRIES = 10
    RETRY_DELAY = 0.2  # seconds

    @staticmethod
    def adjust_stock(product_id, adjustment_type, quantity, reason, notes, user=None, unit_cost=None):
        """
        Centrally manage stock adjustments to prevent race conditions.
        Includes retry logic for SQLite database locking.
        """
        for attempt in range(StockService.MAX_RETRIES):
            try:
                return StockService._do_adjust_stock(
                    product_id, adjustment_type, quantity, reason, notes, user, unit_cost
                )
            except OperationalError as e:
                if 'database is locked' in str(e) and attempt < StockService.MAX_RETRIES - 1:
                    time.sleep(StockService.RETRY_DELAY * (attempt + 1))
                    continue
                raise
        raise OperationalError("Failed to acquire database lock after retries")

    @staticmethod
    @transaction.atomic
    def _do_adjust_stock(product_id, adjustment_type, quantity, reason, notes, user, unit_cost=None):
        """
        Perform atomic stock adjustment using optimistic locking.
        """
        # Lock the row immediately
        product = Product.objects.select_for_update().get(pk=product_id)
        
        # Initialize new values
        new_cost_price = product.cost_price
        
        if adjustment_type == 'set':
             current_qty = product.stock_quantity
             change = quantity - current_qty
             new_quantity = quantity
        else:
             change = quantity if adjustment_type == 'increase' else -quantity
             new_quantity = product.stock_quantity + change
             
             if adjustment_type == 'increase' and unit_cost is not None and quantity > 0:
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

        product.stock_quantity = new_quantity
        product.cost_price = new_cost_price
        product.save()
        
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
    def set_stock(product_id, new_total, reason, notes, user=None):
        """
        Set the exact stock level. 
        Calculates the difference atomically inside the lock.
        """
        product = Product.objects.select_for_update().get(pk=product_id)
        
        current_qty = product.stock_quantity
        change = new_total - current_qty
        
        if change == 0:
            return current_qty

        product.stock_quantity = new_total
        product.save()

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
