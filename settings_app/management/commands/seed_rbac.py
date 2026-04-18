"""
Seed default Roles and Permissions for AZ Books RBAC system.
Usage: python manage.py seed_rbac
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from settings_app.models import Role, Permission, RolePermission, UserRole
from django.contrib.auth import get_user_model

User = get_user_model()

# All system permissions grouped by category
DEFAULT_PERMISSIONS = {
    'inventory': [
        ('inventory.view_products', 'View Products'),
        ('inventory.manage_products', 'Add/Edit/Delete Products'),
        ('inventory.manage_stock', 'Adjust Stock Levels'),
        ('inventory.manage_categories', 'Manage Categories'),
        ('inventory.manage_vendors', 'Manage Vendors'),
        ('inventory.export', 'Export Inventory Data'),
    ],
    'customers': [
        ('customers.view_customers', 'View Customers'),
        ('customers.manage_customers', 'Add/Edit/Delete Customers'),
        ('customers.view_addresses', 'View Customer Addresses'),
        ('customers.manage_addresses', 'Manage Customer Addresses'),
        ('customers.manage_wallets', 'Manage Customer Wallets'),
        ('customers.manage_schools', 'Manage Schools & Structure'),
        ('customers.view_map', 'View Customer Map'),
        ('customers.manage_targets', 'Manage Target Villages'),
        ('customers.export', 'Export Customer Data'),
    ],
    'orders': [
        ('orders.view_orders', 'View Orders'),
        ('orders.create_orders', 'Create Orders'),
        ('orders.edit_orders', 'Edit Orders'),
        ('orders.cancel_orders', 'Cancel Orders'),
        ('orders.manage_returns', 'Process Returns'),
        ('orders.manage_payments', 'Manage Payments'),
        ('orders.export', 'Export Order Data'),
    ],
    'finance': [
        ('finance.view_dashboard', 'View Finance Dashboard'),
        ('finance.view_reports', 'View Financial Reports'),
        ('finance.manage_expenses', 'Add/Edit Expenses'),
        ('finance.approve_expenses', 'Approve Expenses'),
        ('finance.manage_income', 'Manage Other Income'),
        ('finance.manage_salaries', 'Manage Salaries & Payroll'),
        ('finance.manage_banking', 'Manage Bank Accounts & Transactions'),
        ('finance.manage_loans', 'Manage Lenders & Loans'),
        ('finance.manage_budgets', 'Manage Category Budgets'),
        ('finance.manage_recurring', 'Manage Recurring Expenses'),
        ('finance.manage_trips', 'Manage Expense Trips'),
        ('finance.export', 'Export Financial Data'),
    ],
    'reports': [
        ('reports.view_sales', 'View Sales Reports'),
        ('reports.view_inventory', 'View Inventory Reports'),
        ('reports.view_customers', 'View Customer Reports'),
        ('reports.view_finance', 'View Financial Reports'),
        ('reports.export', 'Export Reports'),
    ],
    'settings': [
        ('settings.manage_store', 'Manage Store Settings'),
        ('settings.manage_users', 'Manage Users'),
        ('settings.manage_roles', 'Manage Roles & Permissions'),
        ('settings.manage_taxes', 'Manage Tax Settings'),
        ('settings.manage_payments', 'Manage Payment Methods'),
        ('settings.manage_notifications', 'Manage Notification Preferences'),
        ('settings.manage_receipts', 'Manage Receipt Settings'),
        ('settings.manage_integrations', 'Manage Integrations'),
        ('settings.view_audit_logs', 'View Audit Logs'),
    ],
}

# Default roles and which permissions they get
DEFAULT_ROLES = {
    'Admin': {
        'description': 'Full system access. Can manage all settings, users, and data.',
        'is_system': True,
        'is_default': False,
        'permissions': 'ALL',  # Gets every permission
    },
    'Manager': {
        'description': 'Can manage inventory, customers, orders, and view reports. Cannot manage system settings or users.',
        'is_system': True,
        'is_default': False,
        'permissions': [
            # Inventory - full
            'inventory.view_products', 'inventory.manage_products',
            'inventory.manage_stock', 'inventory.manage_categories',
            'inventory.manage_vendors', 'inventory.export',
            # Customers - full
            'customers.view_customers', 'customers.manage_customers',
            'customers.view_addresses', 'customers.manage_addresses',
            'customers.manage_wallets', 'customers.manage_schools',
            'customers.view_map', 'customers.manage_targets', 'customers.export',
            # Orders - full
            'orders.view_orders', 'orders.create_orders', 'orders.edit_orders',
            'orders.cancel_orders', 'orders.manage_returns',
            'orders.manage_payments', 'orders.export',
            # Finance - view + manage expenses
            'finance.view_dashboard', 'finance.view_reports',
            'finance.manage_expenses', 'finance.approve_expenses',
            'finance.manage_income', 'finance.manage_banking', 'finance.export',
            # Reports - all
            'reports.view_sales', 'reports.view_inventory',
            'reports.view_customers', 'reports.view_finance',
            'reports.export',
        ],
    },
    'Staff': {
        'description': 'Basic access for sales staff. Can create orders, view products and customers.',
        'is_system': True,
        'is_default': True,  # New users get this role by default
        'permissions': [
            'inventory.view_products', 'inventory.manage_products',
            'customers.view_customers', 'customers.manage_customers',
            'customers.view_addresses', 'customers.manage_addresses',
            'customers.view_map',
            'orders.view_orders', 'orders.create_orders',
            'orders.manage_payments',
            'finance.view_dashboard',
            'reports.view_sales',
        ],
    },
    'Accountant': {
        'description': 'Full access to finance and reporting. Can manage expenses, salaries, banking, and view all reports.',
        'is_system': True,
        'is_default': False,
        'permissions': [
            'inventory.view_products',
            'customers.view_customers',
            'orders.view_orders',
            # Finance - full
            'finance.view_dashboard', 'finance.view_reports',
            'finance.manage_expenses', 'finance.approve_expenses',
            'finance.manage_income', 'finance.manage_salaries',
            'finance.manage_banking', 'finance.manage_loans',
            'finance.manage_budgets', 'finance.manage_recurring',
            'finance.manage_trips', 'finance.export',
            # Reports - all
            'reports.view_sales', 'reports.view_inventory',
            'reports.view_customers', 'reports.view_finance',
            'reports.export',
        ],
    },
}


class Command(BaseCommand):
    help = 'Seed default roles and permissions for the RBAC system'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset', action='store_true',
            help='Delete all existing roles/permissions before seeding'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['reset']:
            self.stdout.write('Clearing existing RBAC data...')
            RolePermission.objects.all().delete()
            UserRole.objects.all().delete()
            Role.objects.all().delete()
            Permission.objects.all().delete()

        # 1. Create permissions
        self.stdout.write('\n📋 Seeding Permissions...')
        all_perms = {}
        for category, perms in DEFAULT_PERMISSIONS.items():
            for codename, name in perms:
                perm, created = Permission.objects.get_or_create(
                    codename=codename,
                    defaults={'name': name, 'category': category}
                )
                all_perms[codename] = perm
                status = '✅ Created' if created else '⏭️  Exists'
                self.stdout.write(f'  {status}: {codename} ({name})')

        self.stdout.write(f'\n  Total: {len(all_perms)} permissions\n')

        # 2. Create roles and assign permissions
        self.stdout.write('👤 Seeding Roles...')
        for role_name, config in DEFAULT_ROLES.items():
            role, created = Role.objects.get_or_create(
                name=role_name,
                defaults={
                    'description': config['description'],
                    'is_system': config['is_system'],
                    'is_default': config['is_default'],
                }
            )
            status = '✅ Created' if created else '⏭️  Exists'
            self.stdout.write(f'  {status}: {role_name}')

            # Assign permissions
            if config['permissions'] == 'ALL':
                perm_list = list(all_perms.values())
            else:
                perm_list = [all_perms[code] for code in config['permissions'] if code in all_perms]

            assigned = 0
            for perm in perm_list:
                _, was_created = RolePermission.objects.get_or_create(
                    role=role, permission=perm
                )
                if was_created:
                    assigned += 1

            self.stdout.write(f'    → {assigned} new permissions assigned ({len(perm_list)} total)')

        # 3. Assign Admin role to superusers
        self.stdout.write('\n🔑 Assigning Admin role to superusers...')
        admin_role = Role.objects.get(name='Admin')
        for superuser in User.objects.filter(is_superuser=True):
            _, created = UserRole.objects.get_or_create(
                user=superuser, role=admin_role
            )
            status = '✅ Assigned' if created else '⏭️  Already assigned'
            self.stdout.write(f'  {status}: {superuser.username} → Admin')

        self.stdout.write('\n🛡️  Assigning default role to orphaned users...')
        default_role = Role.objects.filter(is_default=True).first()
        if default_role:
            orphaned_users = User.objects.exclude(
                user_roles__isnull=False
            ).filter(is_active=True, is_superuser=False)
            for orphan in orphaned_users:
                _, created = UserRole.objects.get_or_create(
                    user=orphan, role=default_role
                )
                status = '✅ Assigned' if created else '⏭️  Already assigned'
                self.stdout.write(f'  {status}: {orphan.username} → {default_role.name}')
        else:
            self.stdout.write(self.style.WARNING('  ⚠️  No default role found. Skipping.'))

        self.stdout.write(self.style.SUCCESS('\n✅ RBAC seeding complete!'))
        self.stdout.write(f'   {Permission.objects.count()} permissions')
        self.stdout.write(f'   {Role.objects.count()} roles')
        self.stdout.write(f'   {RolePermission.objects.count()} role-permission mappings')
        self.stdout.write(f'   {UserRole.objects.count()} user-role assignments')
