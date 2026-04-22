"""
Bulk-import products from the hardcoded data table.
Usage: python manage.py bulk_import_products
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal
from inventory.models import Product, Category, Vendor

PRODUCTS = [
    # (name, category, qty, cost_price, selling_price, vendor)
    ("A4 176", "A4", 2016, "36", "50", "Kamlesh"),
    ("A4 240", "A4", 544, "50", "70", "Kamlesh"),
    ("A4 392", "A4", 320, "100", "120", "Kamlesh"),
    ("A4 120", "A4", 384, "27.5", "40", "Kamlesh"),
    ("B5 176", "B5", 1310, "25", "40", "Kamlesh"),
    ("B5 176 [Box]", "B5", 49, "25", "40", "Kamlesh"),
    ("B5 172 [4 line]", "B5", 93, "25", "40", "Kamlesh"),
    ("B5 80", "B5", 120, "14", "25", "Kamlesh"),
    ("Rough B5 166", "B5", 648, "15", "25", "Kamlesh"),
    ("200 S", "Small", 432, "17", "25", "Kamlesh"),
    ("200 S [box]", "Small", 240, "17", "25", "Kamlesh"),
    ("200 S [4 line]", "Small", 108, "17", "25", "Kamlesh"),
    ("100 S [56]", "Small", 192, "8", "15", "Kamlesh"),
    ("Pencil Apsara Platinum", "Stationary", 186, "40", "60", "Gangaram"),
    ("Eraser Apsara", "Stationary", 38, "42", "60", "Gangaram"),
    ("Sharpner", "Stationary", 25, "75", "100", "Gangaram"),
    ("Graph", "Publication", 105, "17", "20", "Ajit"),
    ("Drawing Book", "Art", 111, "20", "30", "Kamlesh"),
    ("Chipkoo Cover", "Support", 50, "60", "80", "Gangaram"),
    ("Transparent Board", "Support", 38, "65", "100", "Gangaram"),
    ("Wood Board", "Support", 140, "30", "100", "Gangaram"),
    ("Pouch (9056)", "Stationary", 96, "70", "100", "Gangaram"),
    ("Steel Scale", "Stationary", 70, "20", "30", "Gangaram"),
    ("15 Plastic Scale", "Stationary", 60, "3", "5", "Gangaram"),
    ("30 Plastic Scale", "Stationary", 40, "7", "10", "Gangaram"),
    ("P. Crayon", "Art", 30, "50", "60", "Ajit"),
    ("Wax Crayon", "Art", 40, "16", "30", "Gangaram"),
    ("Water Colour", "Art", 25, "24", "30", "Gangaram"),
    ("Pencil Colour", "Art", 30, "22", "30", "Gangaram"),
    ("Calculator", "Support", 14, "200", "250", "Kalpvruksh"),
    ("Ganja", "Stationary", 16, "12", "15", "Ajit"),
    ("Raja Slate Small", "Support", 11, "55", "70", "Ajit"),
    ("XO", "Stationary", 130, "68", "90", "Gangaram"),
    ("3 Rs Saino Misti", "Stationary", 130, "54.5", "70", "Gangaram"),
    ("Bottle", "Gift", 5, "260", "0", "Gangaram"),  # selling_price=0 intentional
]


class Command(BaseCommand):
    help = "Bulk import products with categories and vendors (get_or_create)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would be created without actually saving.'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        created_count = 0
        skipped_count = 0

        for name, cat_name, qty, cost, sell, vendor_name in PRODUCTS:
            # Get or create Category
            category, _ = Category.objects.get_or_create(
                name__iexact=cat_name, defaults={'name': cat_name}
            )

            # Get or create Vendor
            vendor, _ = Vendor.objects.get_or_create(
                name__iexact=vendor_name, defaults={'name': vendor_name}
            )

            # Check if product already exists (by name, case-insensitive)
            existing = Product.objects.filter(name__iexact=name).first()
            if existing:
                skipped_count += 1
                self.stdout.write(self.style.WARNING(f"  SKIP: '{name}' already exists (ID: {existing.display_id})"))
                continue

            selling_price = Decimal(sell) if sell else Decimal("0")

            if dry_run:
                self.stdout.write(f"  [DRY] Would create: {name} | {cat_name} | qty={qty} | cost={cost} | sell={selling_price} | vendor={vendor_name}")
            else:
                product = Product.objects.create(
                    name=name,
                    category=category,
                    vendor=vendor,
                    cost_price=Decimal(cost),
                    selling_price=selling_price,
                    stock_quantity=qty,
                )
                self.stdout.write(self.style.SUCCESS(f"  OK Created: {name} (#{product.display_id}) | {cat_name} | qty={qty} | cost={cost} -> sell={selling_price}"))

            created_count += 1

        self.stdout.write("")
        if dry_run:
            self.stdout.write(self.style.NOTICE(f"DRY RUN complete. Would create {created_count}, skip {skipped_count}."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Done! Created {created_count} products, skipped {skipped_count}."))
