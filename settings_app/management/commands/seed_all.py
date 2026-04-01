"""
Seed ALL default data for AZ Books.
Covers every empty table — nothing optional, nothing skipped.
Usage: python manage.py seed_all
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.db import transaction
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed all default data for a fully functional AZ Books instance'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset', action='store_true',
            help='Delete seed-able data before re-seeding (destructive!)'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('\n🔧 AZ Books — Full Database Seed\n'))

        # ──────────────────────────────────────────────
        # 1. RBAC (Roles & Permissions) — delegate
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('━━━ 1/10  RBAC ━━━'))
        call_command('seed_rbac', **({"reset": True} if options['reset'] else {}))

        # ──────────────────────────────────────────────
        # 2. Tax Settings
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 2/10  Tax Settings ━━━'))
        self._seed_tax_settings()

        # ──────────────────────────────────────────────
        # 3. Payment Methods
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 3/10  Payment Methods ━━━'))
        self._seed_payment_methods()

        # ──────────────────────────────────────────────
        # 4. Inventory (Categories, Vendors, Tags)
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 4/10  Inventory ━━━'))
        self._seed_categories()
        self._seed_vendors()
        self._seed_tags()

        # ──────────────────────────────────────────────
        # 5. Customer Groups, Link Types, Location Tags
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 5/10  Customer Config ━━━'))
        self._seed_customer_groups()
        self._seed_link_types()
        self._seed_location_tags()

        # ──────────────────────────────────────────────
        # 6. Return Reasons
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 6/10  Return Reasons ━━━'))
        self._seed_return_reasons()

        # ──────────────────────────────────────────────
        # 7. Receipt Settings + Notification Preferences
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 7/10  Receipt & Notifications ━━━'))
        self._seed_receipt_settings()
        self._seed_notification_preferences()

        # ──────────────────────────────────────────────
        # 8. Integration Settings
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 8/10  Integrations ━━━'))
        self._seed_integration_settings()

        # ──────────────────────────────────────────────
        # 9. Employee Salaries
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 9/10  Employee Salaries ━━━'))
        self._seed_employee_salaries()

        # ──────────────────────────────────────────────
        # 10. Message Templates
        # ──────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\n━━━ 10/10  Messaging ━━━'))
        self._seed_message_templates()

        # ──────────────────────────────────────────────
        # Summary
        # ──────────────────────────────────────────────
        self._print_summary()

    # ══════════════════════════════════════════════════
    # Seed methods
    # ══════════════════════════════════════════════════

    def _seed_tax_settings(self):
        from settings_app.models import TaxSettings
        taxes = [
            {'name': 'GST 5%',  'percentage': Decimal('5.00'),  'is_active': True, 'is_default': False},
            {'name': 'GST 12%', 'percentage': Decimal('12.00'), 'is_active': True, 'is_default': False},
            {'name': 'GST 18%', 'percentage': Decimal('18.00'), 'is_active': True, 'is_default': True},
            {'name': 'GST 28%', 'percentage': Decimal('28.00'), 'is_active': True, 'is_default': False},
            {'name': 'Tax Exempt', 'percentage': Decimal('0.00'), 'is_active': True, 'is_default': False},
        ]
        for t in taxes:
            obj, created = TaxSettings.objects.get_or_create(name=t['name'], defaults=t)
            self._log(obj.name, created)

    def _seed_payment_methods(self):
        from settings_app.models import PaymentMethod
        methods = [
            {'name': 'Cash',          'method_type': 'cash', 'is_enabled': True, 'display_order': 1},
            {'name': 'UPI',           'method_type': 'upi',  'is_enabled': True, 'display_order': 2},
            {'name': 'Debit/Credit Card', 'method_type': 'card', 'is_enabled': True, 'display_order': 3},
            {'name': 'Bank Transfer', 'method_type': 'bank', 'is_enabled': True, 'display_order': 4},
        ]
        for m in methods:
            obj, created = PaymentMethod.objects.get_or_create(name=m['name'], defaults=m)
            self._log(obj.name, created)

    def _seed_categories(self):
        from inventory.models import Category
        from settings_app.models import TaxSettings
        default_tax = TaxSettings.objects.filter(is_default=True).first()
        categories = [
            {'name': 'Textbooks',           'description': 'School and college textbooks'},
            {'name': 'Notebooks & Copies',  'description': 'Ruled, unruled, drawing, and lab notebooks'},
            {'name': 'Stationery',          'description': 'Pens, pencils, erasers, rulers, and office supplies'},
            {'name': 'Art & Craft',         'description': 'Drawing materials, paints, craft kits'},
            {'name': 'Reference Books',     'description': 'Dictionaries, encyclopedias, competitive exam books'},
            {'name': 'Religious Books',     'description': 'Spiritual and religious literature'},
            {'name': 'Literature & Novels', 'description': 'Fiction, non-fiction, and classic literature'},
            {'name': 'Children\'s Books',   'description': 'Story books, activity books, early learning'},
            {'name': 'Bags & Accessories',  'description': 'School bags, tiffin boxes, water bottles'},
            {'name': 'Exam Supplies',       'description': 'Geometry boxes, calculators, graph paper, supplements'},
        ]
        for c in categories:
            obj, created = Category.all_objects.get_or_create(
                name=c['name'],
                defaults={**c, 'tax_rate': default_tax}
            )
            self._restore_if_deleted(obj)
            self._log(obj.name, created)

    def _seed_vendors(self):
        from inventory.models import Vendor
        vendors = [
            {
                'name': 'Navneet Education Ltd',
                'description': 'Leading Indian publisher for school books and stationery',
                'contact_name': 'Sales Team',
                'contact_phone': '+91 22 6626 5000',
                'address': 'Mumbai, Maharashtra',
            },
            {
                'name': 'Classmate (ITC)',
                'description': 'Notebooks, pens, and school stationery',
                'contact_name': 'Distribution Desk',
                'contact_phone': '+91 80 4679 5000',
                'address': 'Bangalore, Karnataka',
            },
            {
                'name': 'S Chand Publishing',
                'description': 'Textbooks and reference books for all levels',
                'contact_name': 'Order Desk',
                'contact_phone': '+91 11 2367 2080',
                'address': 'New Delhi',
            },
            {
                'name': 'Local Wholesale Market',
                'description': 'Bulk stationery and miscellaneous supplies',
                'contact_name': 'Market Agent',
                'contact_phone': '',
                'address': '',
            },
            {
                'name': 'Doms Industries',
                'description': 'Pencils, crayons, art supplies',
                'contact_name': 'Sales Dept',
                'contact_phone': '+91 22 2406 5000',
                'address': 'Mumbai, Maharashtra',
            },
        ]
        for v in vendors:
            obj, created = Vendor.all_objects.get_or_create(name=v['name'], defaults=v)
            self._restore_if_deleted(obj)
            self._log(obj.name, created)

    def _seed_tags(self):
        from inventory.models import Tag
        tags = [
            'Bestseller', 'New Arrival', 'Discounted', 'Back to School',
            'Exam Season', 'Bulk Available', 'Limited Edition', 'Eco-Friendly',
            'Premium', 'Budget',
        ]
        for tag_name in tags:
            obj, created = Tag.objects.get_or_create(name=tag_name)
            self._log(obj.name, created)

    def _seed_customer_groups(self):
        from settings_app.models import CustomerGroup
        groups = [
            {'name': 'Retail',       'description': 'Walk-in retail customers',            'discount_percent': Decimal('0.00')},
            {'name': 'Wholesale',    'description': 'Bulk purchase customers',              'discount_percent': Decimal('10.00')},
            {'name': 'School',       'description': 'School-affiliated students & parents', 'discount_percent': Decimal('5.00')},
            {'name': 'Faculty',      'description': 'Teachers and school staff',            'discount_percent': Decimal('8.00')},
            {'name': 'VIP',          'description': 'High-value repeat customers',          'discount_percent': Decimal('12.00')},
            {'name': 'Staff Family', 'description': 'Employee family & friends',            'discount_percent': Decimal('15.00')},
        ]
        for g in groups:
            obj, created = CustomerGroup.objects.get_or_create(name=g['name'], defaults=g)
            self._log(obj.name, created)

    def _seed_link_types(self):
        from settings_app.models import LinkType
        links = [
            {'name': 'Parent',  'reverse_name': 'Child'},
            {'name': 'Sibling', 'reverse_name': 'Sibling'},
            {'name': 'Spouse',  'reverse_name': 'Spouse'},
            {'name': 'Guardian','reverse_name': 'Ward'},
            {'name': 'Referrer','reverse_name': 'Referred By'},
        ]
        for lt in links:
            obj, created = LinkType.objects.get_or_create(name=lt['name'], defaults=lt)
            self._log(obj.name, created)

    def _seed_location_tags(self):
        from settings_app.models import LocationTag
        tags = [
            {'name': 'City Center',  'color': '#6366f1'},
            {'name': 'Highway Road', 'color': '#f59e0b'},
            {'name': 'Village',      'color': '#10b981'},
            {'name': 'School Area',  'color': '#3b82f6'},
            {'name': 'Market Area',  'color': '#ef4444'},
            {'name': 'Residential',  'color': '#8b5cf6'},
        ]
        for lt in tags:
            obj, created = LocationTag.objects.get_or_create(name=lt['name'], defaults=lt)
            self._log(obj.name, created)

    def _seed_return_reasons(self):
        from orders.models import ReturnReason
        reasons = [
            {'name': 'Damaged Product',    'description': 'Product received in damaged or defective condition'},
            {'name': 'Wrong Item',         'description': 'Customer received a different product than ordered'},
            {'name': 'Duplicate Order',    'description': 'Customer ordered the same item twice by mistake'},
            {'name': 'Changed Mind',       'description': 'Customer no longer needs the product'},
            {'name': 'Quality Issue',      'description': 'Product quality does not meet expectations'},
            {'name': 'Wrong Quantity',     'description': 'Received more or fewer items than ordered'},
            {'name': 'Not as Described',   'description': 'Product does not match description or images'},
            {'name': 'Expired / Old Edition', 'description': 'Received an outdated or expired edition'},
        ]
        for r in reasons:
            obj, created = ReturnReason.all_objects.get_or_create(name=r['name'], defaults=r)
            self._restore_if_deleted(obj)
            self._log(obj.name, created)

    def _seed_receipt_settings(self):
        from settings_app.models import ReceiptSettings
        obj = ReceiptSettings.get_instance()
        if not obj.header_text or obj.header_text == 'Thank you for your purchase!':
            obj.header_text = 'Thank you for shopping at AZ Books!'
            obj.footer_text = 'Exchange within 7 days with receipt. Visit again!'
            obj.show_logo = True
            obj.show_address = True
            obj.show_gst = True
            obj.show_phone = True
            obj.save()
            self._log('Receipt Settings', True)
        else:
            self._log('Receipt Settings', False)

    def _seed_notification_preferences(self):
        from settings_app.models import NotificationPreference
        prefs = [
            {'notification_type': 'low_stock',        'is_enabled': True, 'recipients': ''},
            {'notification_type': 'new_order',         'is_enabled': True, 'recipients': ''},
            {'notification_type': 'daily_summary',     'is_enabled': False, 'recipients': ''},
            {'notification_type': 'payment_received',  'is_enabled': True, 'recipients': ''},
            {'notification_type': 'return_request',    'is_enabled': True, 'recipients': ''},
        ]
        for p in prefs:
            obj, created = NotificationPreference.objects.get_or_create(
                notification_type=p['notification_type'], defaults=p
            )
            self._log(obj.get_notification_type_display(), created)

    def _seed_integration_settings(self):
        from settings_app.models import IntegrationSettings
        integrations = [
            {'service_type': 'email',    'is_enabled': False, 'api_key': '', 'config': {'host': '', 'port': 587, 'use_tls': True}},
            {'service_type': 'sms',      'is_enabled': False, 'api_key': '', 'config': {'provider': '', 'sender_id': ''}},
            {'service_type': 'whatsapp', 'is_enabled': False, 'api_key': '', 'config': {'endpoint': ''}},
            {'service_type': 'maps',     'is_enabled': False, 'api_key': '', 'config': {'provider': 'google'}},
        ]
        for i in integrations:
            obj, created = IntegrationSettings.objects.get_or_create(
                service_type=i['service_type'], defaults=i
            )
            self._log(obj.get_service_type_display(), created)

    def _seed_employee_salaries(self):
        from finance.models import EmployeeSalary
        users = User.objects.all()
        for user in users:
            if hasattr(user, 'salary_config'):
                self._log(f'{user.username} salary', False)
                continue
            EmployeeSalary.objects.create(
                employee=user,
                base_amount=Decimal('15000.00'),
                frequency='monthly',
                payment_day=1,
                is_active=True,
            )
            self._log(f'{user.username} salary', True)

    def _seed_message_templates(self):
        from messaging.models import MessageTemplate
        templates = [
            {
                'name': 'Order Confirmation',
                'type': 'order_confirm',
                'language': 'en',
                'content': '{Hi|Hello} {{customer_name}}! Your order #{{order_id}} for ₹{{total}} has been confirmed. {Thank you|Thanks} for shopping at AZ Books!',
                'is_active': True,
            },
            {
                'name': 'Payment Received',
                'type': 'payment_received',
                'language': 'en',
                'content': '{Hi|Hello} {{customer_name}}, we received your payment of ₹{{amount}} for order #{{order_id}}. {Thank you!|Thanks!}',
                'is_active': True,
            },
            {
                'name': 'Order Ready',
                'type': 'order_ready',
                'language': 'en',
                'content': '{Hi|Hello} {{customer_name}}, your order #{{order_id}} is {ready for pickup|ready to collect}! Please visit AZ Books at your convenience.',
                'is_active': True,
            },
            {
                'name': 'Delivery Reminder',
                'type': 'delivery_reminder',
                'language': 'en',
                'content': '{Hi|Hello} {{customer_name}}, reminder: your order #{{order_id}} is ready and awaiting pickup. Please collect it at your earliest.',
                'is_active': True,
            },
            {
                'name': 'Low Balance Alert',
                'type': 'low_balance',
                'language': 'en',
                'content': 'Dear {{customer_name}}, your AZ Books wallet balance is low (₹{{balance}}). Top up for faster checkout!',
                'is_active': True,
            },
            {
                'name': 'Order Confirmation (Hindi)',
                'type': 'order_confirm',
                'language': 'hi',
                'content': 'नमस्ते {{customer_name}}! आपका ऑर्डर #{{order_id}} ₹{{total}} का कंफर्म हो गया है। AZ Books में खरीदारी के लिए धन्यवाद!',
                'is_active': True,
            },
            {
                'name': 'Order Confirmation (Gujarati)',
                'type': 'order_confirm',
                'language': 'gu',
                'content': 'નમસ્તે {{customer_name}}! તમારો ઓર્ડર #{{order_id}} ₹{{total}} નો કન્ફર્મ થયો છે. AZ Books માં ખરીદી કરવા બદલ આભાર!',
                'is_active': True,
            },
        ]
        for t in templates:
            obj, created = MessageTemplate.objects.get_or_create(
                name=t['name'], type=t['type'], language=t['language'],
                defaults=t
            )
            self._log(f'{obj.name} ({obj.get_language_display()})', created)

    # ══════════════════════════════════════════════════
    # Helpers
    # ══════════════════════════════════════════════════

    def _restore_if_deleted(self, obj):
        """Restore a soft-deleted seed record so it becomes visible again."""
        if getattr(obj, 'is_deleted', False):
            obj.is_deleted = False
            obj.deleted_at = None
            obj.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])
            self.stdout.write(f'  ♻️  Restored (was soft-deleted): {obj}')

    def _log(self, name, created):
        icon = '✅' if created else '⏭️ '
        status = 'Created' if created else 'Exists'
        self.stdout.write(f'  {icon} {status}: {name}')

    def _print_summary(self):
        from settings_app.models import (
            TaxSettings, PaymentMethod, CustomerGroup, LinkType,
            LocationTag, Role, Permission, NotificationPreference,
            IntegrationSettings, ReceiptSettings
        )
        from inventory.models import Category, Vendor, Tag
        from orders.models import ReturnReason
        from finance.models import EmployeeSalary
        from messaging.models import MessageTemplate

        self.stdout.write(self.style.SUCCESS('\n' + '═' * 50))
        self.stdout.write(self.style.SUCCESS('  ✅ FULL SEED COMPLETE'))
        self.stdout.write(self.style.SUCCESS('═' * 50))
        data = [
            ('Roles',                   Role.objects.count()),
            ('Permissions',             Permission.objects.count()),
            ('Tax Rates',               TaxSettings.objects.count()),
            ('Payment Methods',         PaymentMethod.objects.count()),
            ('Categories',              Category.objects.count()),
            ('Vendors',                 Vendor.objects.count()),
            ('Tags',                    Tag.objects.count()),
            ('Customer Groups',         CustomerGroup.objects.count()),
            ('Link Types',              LinkType.objects.count()),
            ('Location Tags',           LocationTag.objects.count()),
            ('Return Reasons',          ReturnReason.objects.count()),
            ('Receipt Settings',        1 if ReceiptSettings.objects.exists() else 0),
            ('Notification Prefs',      NotificationPreference.objects.count()),
            ('Integration Settings',    IntegrationSettings.objects.count()),
            ('Employee Salaries',       EmployeeSalary.objects.count()),
            ('Message Templates',       MessageTemplate.objects.count()),
        ]
        for label, count in data:
            self.stdout.write(f'   {label:.<30} {count}')
        self.stdout.write('')
