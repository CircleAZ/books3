"""
One-time migration: Option C Base-Unit Atomization.

Handles:
1. Pencil Apsara Platinum (pack) -> Apsara pencil 1 નંગ (base, exists)
2. Saino Misti (pack) -> Saino Misti 1 નંગ (base, CREATE)
3. XO (pack) -> XO 1 નંગ (base, CREATE)
4. Cover (pack) -> Cover single piece (base, exists)
"""
import sys
import io
from django.core.management.base import BaseCommand
from django.db import transaction
from inventory.models import Product, ProductImage, StockHistory, StockAdjustment
from decimal import Decimal


MIGRATION_MAP = [
    {
        'pack_name': 'Pencil Apsara Platinum',
        'base_name': 'Apsara pencil 1 નંગ',
        'create_base': False,
        'pack_size': 10,
        'base_selling_price': Decimal('5.00'),
        'pack_selling_price': Decimal('50.00'),
    },
    {
        'pack_name': 'Saino Misti',
        'base_name': 'Saino Misti 1 નંગ',
        'create_base': True,
        'pack_size': 20,
        'base_selling_price': Decimal('4.00'),
        'pack_selling_price': Decimal('70.00'),
    },
    {
        'pack_name': 'XO',
        'base_name': 'XO 1 નંગ',
        'create_base': True,
        'pack_size': 10,
        'base_selling_price': Decimal('10.00'),
        'pack_selling_price': Decimal('90.00'),
    },
    {
        'pack_name': 'Cover',
        'base_name': 'Cover single piece',
        'create_base': False,
        'pack_size': 10,
        'base_selling_price': Decimal('10.00'),
        'pack_selling_price': Decimal('100.00'),
    },
]


class Command(BaseCommand):
    help = 'One-time Option C migration: link 4 pack/base product pairs and consolidate stock.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would happen without making changes.',
        )

    def handle(self, *args, **options):
        # Fix Windows console encoding for Gujarati characters
        if hasattr(self.stdout, '_out') and hasattr(self.stdout._out, 'buffer'):
            self.stdout._out = io.TextIOWrapper(self.stdout._out.buffer, encoding='utf-8', errors='replace')

        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('=== DRY RUN MODE ===\n'))

        with transaction.atomic():
            for entry in MIGRATION_MAP:
                self.stdout.write(f"\n{'='*60}")
                self.stdout.write(f"Processing: {entry['pack_name']} -> {entry['base_name']}")
                self.stdout.write(f"{'='*60}")

                # 1. Find the pack product
                try:
                    pack = Product.objects.get(name=entry['pack_name'], is_deleted=False)
                except Product.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"  PACK NOT FOUND: {entry['pack_name']}"))
                    continue

                self.stdout.write(f"  Pack found: {pack.name} | stock={pack.stock_quantity} | physical={pack.physical_stock} | price={pack.selling_price}")

                # 2. Find or create the base product
                if entry['create_base']:
                    self.stdout.write(f"  Creating base product: {entry['base_name']}")
                    if not dry_run:
                        base = Product.objects.create(
                            name=entry['base_name'],
                            description=pack.description,
                            category=pack.category,
                            vendor=pack.vendor,
                            is_additional=False,
                            cost_price=entry['base_selling_price'],  # Initial cost = selling price
                            selling_price=entry['base_selling_price'],
                            stock_quantity=0,
                            physical_stock=0,
                            low_stock_threshold=pack.low_stock_threshold * entry['pack_size'],
                            default_commission=pack.default_commission,
                        )
                        # Copy tags
                        base.tags.set(pack.tags.all())

                        # Copy images
                        pack_images = ProductImage.objects.filter(product=pack)
                        for img in pack_images:
                            ProductImage.objects.create(
                                product=base,
                                image=img.image,
                                thumbnail=img.thumbnail,
                                is_primary=img.is_primary,
                            )
                            self.stdout.write(f"    Copied image: {img.image.name}")
                    else:
                        base = None
                        self.stdout.write(f"    [DRY RUN] Would create with category={pack.category}, vendor={pack.vendor}, price={entry['base_selling_price']}")
                else:
                    try:
                        base = Product.objects.get(name=entry['base_name'], is_deleted=False)
                    except Product.DoesNotExist:
                        self.stdout.write(self.style.ERROR(f"  BASE NOT FOUND: {entry['base_name']}"))
                        continue
                    self.stdout.write(f"  Base found: {base.name} | stock={base.stock_quantity} | physical={base.physical_stock} | price={base.selling_price}")

                # 3. Update base product selling_price
                if base and not dry_run:
                    if base.selling_price != entry['base_selling_price']:
                        old_price = base.selling_price
                        base.selling_price = entry['base_selling_price']
                        base.save(update_fields=['selling_price'])
                        self.stdout.write(f"  Updated base price: {old_price} -> {entry['base_selling_price']}")

                # 4. Stock consolidation: convert pack stock into base units
                pack_stock = pack.stock_quantity
                pack_physical = pack.physical_stock
                converted_stock = pack_stock * entry['pack_size']
                converted_physical = pack_physical * entry['pack_size']

                self.stdout.write(f"  Stock conversion: {pack_stock} packs * {entry['pack_size']} = {converted_stock} base units")

                if base and not dry_run:
                    old_base_stock = base.stock_quantity
                    old_base_physical = base.physical_stock
                    base.stock_quantity += converted_stock
                    base.physical_stock += converted_physical
                    base.save(update_fields=['stock_quantity', 'physical_stock'])

                    self.stdout.write(f"  Base stock: {old_base_stock} + {converted_stock} = {base.stock_quantity}")
                    self.stdout.write(f"  Base physical: {old_base_physical} + {converted_physical} = {base.physical_stock}")

                    # Audit trail
                    StockAdjustment.objects.create(
                        product=base,
                        adjustment_type='increase' if converted_stock >= 0 else 'decrease',
                        quantity=abs(converted_stock),
                        reason='adjustment',
                        notes=f"Option C Migration: Consolidated {pack_stock} packs ({pack.name}) into base units",
                    )
                    StockHistory.objects.create(
                        product=base,
                        quantity_change=converted_stock,
                        quantity_after=base.stock_quantity,
                        cost_at_time=base.cost_price,
                        reason='adjustment',
                        notes=f"Option C Migration: Consolidated {pack_stock} packs ({pack.name}) into base units",
                    )
                else:
                    if base:
                        self.stdout.write(f"    [DRY RUN] Base would become: stock={base.stock_quantity + converted_stock}, physical={base.physical_stock + converted_physical}")

                # 5. Flag the pack product
                self.stdout.write(f"  Flagging pack: is_pack=True, base_product={entry['base_name']}, pack_size={entry['pack_size']}")
                if not dry_run:
                    pack.is_pack = True
                    pack.base_product = base
                    pack.pack_size = entry['pack_size']
                    pack.selling_price = entry['pack_selling_price']
                    pack.save()

                    # 6. Sync pack stock from the new base total
                    base.sync_pack_stock()
                    pack.refresh_from_db()
                    self.stdout.write(f"  After sync: pack stock={pack.stock_quantity}, pack physical={pack.physical_stock}")

                self.stdout.write(self.style.SUCCESS(f"  DONE: {entry['pack_name']} -> {entry['base_name']}"))

            if dry_run:
                self.stdout.write(self.style.WARNING('\n=== DRY RUN COMPLETE — No changes made. Run without --dry-run to execute. ==='))
                # Force rollback in dry run
                transaction.set_rollback(True)
            else:
                self.stdout.write(self.style.SUCCESS('\n=== MIGRATION COMPLETE ==='))
