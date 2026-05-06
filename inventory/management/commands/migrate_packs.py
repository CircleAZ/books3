import csv
from django.core.management.base import BaseCommand
from django.db import transaction
from inventory.models import Product, StockHistory, StockAdjustment

class Command(BaseCommand):
    help = 'Migrates Pack products into Option C architecture via a CSV mapping.'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Path to the CSV file containing the mapping')

    def handle(self, *args, **options):
        csv_file = options['csv_file']

        # Expected CSV columns:
        # pack_product | base_product | pack_size | new_selling_price
        
        try:
            with open(csv_file, mode='r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                
                with transaction.atomic():
                    for row in reader:
                        pack_identifier = row.get('pack_product')
                        base_identifier = row.get('base_product')
                        pack_size_str = row.get('pack_size', '0')
                        
                        if not pack_size_str:
                            pack_size_str = '0'
                        pack_size = int(pack_size_str)
                            
                        new_price = row.get('new_selling_price', '').strip()

                        if not pack_identifier or not base_identifier or pack_size <= 0:
                            self.stdout.write(self.style.WARNING(f"Skipping invalid row: {row}"))
                            continue

                        # Find products (try by ID first, fallback to exact Name)
                        try:
                            pack_product = Product.objects.get(pk=pack_identifier)
                        except (ValueError, Product.DoesNotExist):
                            try:
                                pack_product = Product.objects.get(name=pack_identifier)
                            except Product.DoesNotExist:
                                self.stdout.write(self.style.ERROR(f"Pack product not found: {pack_identifier}"))
                                continue

                        try:
                            base_product = Product.objects.get(pk=base_identifier)
                        except (ValueError, Product.DoesNotExist):
                            try:
                                base_product = Product.objects.get(name=base_identifier)
                            except Product.DoesNotExist:
                                self.stdout.write(self.style.ERROR(f"Base product not found: {base_identifier}"))
                                continue

                        self.stdout.write(f"Migrating: {pack_product.name} -> Base: {base_product.name} (Size: {pack_size})")

                        # 1. Flag the pack product
                        pack_product.is_pack = True
                        pack_product.base_product = base_product
                        pack_product.pack_size = pack_size
                        
                        if new_price:
                            pack_product.selling_price = new_price

                        # 2. Convert existing pack stock into base stock
                        current_pack_qty = pack_product.stock_quantity
                        converted_base_qty = current_pack_qty * pack_size
                        
                        if converted_base_qty > 0:
                            self.stdout.write(f"  - Converting {current_pack_qty} packs into {converted_base_qty} base units")
                            
                            # Add to Base Product
                            base_product.stock_quantity += converted_base_qty
                            base_product.physical_stock += (pack_product.physical_stock * pack_size)
                            base_product.save(update_fields=['stock_quantity', 'physical_stock'])
                            
                            StockAdjustment.objects.create(
                                product=base_product,
                                adjustment_type='increase',
                                quantity=converted_base_qty,
                                reason='adjustment',
                                notes=f"Option C Migration: Absorbed {current_pack_qty} packs from {pack_product.name}"
                            )
                            
                            StockHistory.objects.create(
                                product=base_product,
                                quantity_change=converted_base_qty,
                                quantity_after=base_product.stock_quantity,
                                cost_at_time=base_product.cost_price,
                                reason='adjustment',
                                notes=f"Option C Migration: Absorbed {current_pack_qty} packs from {pack_product.name}",
                            )

                        # 3. Save the pack product.
                        pack_product.save()

                        # 4. Explicitly sync the pack's display stock to mirror the new combined base stock
                        base_product.sync_pack_stock()

                        self.stdout.write(self.style.SUCCESS(f"Successfully migrated {pack_product.name}"))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Migration failed: {e}"))
            raise
