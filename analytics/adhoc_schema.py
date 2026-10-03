"""
Universal Ad-Hoc Relational Schema Registry.
Provides a strict whitelist of queryable entities, relational fields,
operators, and output column projectors across the sovereign ERP.
Zero hardcoding, zero SQL injection vectors, 100% type-safe compilation.
"""

from decimal import Decimal
from django.db.models import Q, F, Sum, Subquery, OuterRef, IntegerField
from django.db.models.functions import Coalesce


OPERATOR_LOOKUPS = {
    'equals': '',
    'not_equals': '!',
    'contains': '__icontains',
    'not_contains': '!__icontains',
    'gt': '__gt',
    'gte': '__gte',
    'lt': '__lt',
    'lte': '__lte',
    'is_null': '__isnull_true',
    'not_null': '__isnull_false',
}


ENTITY_REGISTRY = {
    'order_items': {
        'id': 'order_items',
        'label': 'Order Items & Fulfillment (Decoupled)',
        'description': 'Line-item level purchases with strict subquery delivery reconciliation.',
        'model_path': 'orders.models.OrderItem',
        'icon': '📦',
        'fields': {
            'product_name': {
                'label': 'Product Name',
                'type': 'string',
                'lookup': 'product__name',
                'placeholder': 'e.g. Apsara Pencil',
            },
            'unit_price': {
                'label': 'Unit Price (₹)',
                'type': 'decimal',
                'lookup': 'unit_price',
                'placeholder': 'e.g. 55',
            },
            'quantity': {
                'label': 'Ordered Quantity',
                'type': 'integer',
                'lookup': 'quantity',
                'placeholder': 'e.g. 10',
            },
            'village': {
                'label': 'Customer Village',
                'type': 'string',
                'lookup': 'custom_village',  # resolved across customer addresses
                'placeholder': 'e.g. Krushnapur',
            },
            'customer_name': {
                'label': 'Customer Name',
                'type': 'string',
                'lookup': 'order__customer__name',
                'placeholder': 'e.g. Ramesh',
            },
            'customer_phone': {
                'label': 'Customer Phone',
                'type': 'string',
                'lookup': 'order__customer__phone',
                'placeholder': 'e.g. 98250',
            },
            'order_display_id': {
                'label': 'Order # ID',
                'type': 'integer',
                'lookup': 'order__display_id',
                'placeholder': 'e.g. 101',
            },
            'order_status': {
                'label': 'Order Status',
                'type': 'choice',
                'lookup': 'order__order_status',
                'choices': ['draft', 'confirmed', 'processing', 'completed', 'cancelled'],
            },
            'line_fulfillment': {
                'label': 'Line-Item Fulfillment',
                'type': 'choice',
                'lookup': 'custom_fulfillment',
                'choices': [
                    ('undelivered_strict', 'Undelivered (0% Delivered) | Exclude Partial'),
                    ('partial', 'Partial Delivery Only'),
                    ('delivered', '100% Fully Delivered'),
                    ('any_undelivered', 'Any Undelivered (< 100%)'),
                ],
            },
        },
        'columns': [
            {'key': 'customer_name', 'label': 'Customer', 'type': 'string'},
            {'key': 'village', 'label': 'Village', 'type': 'string'},
            {'key': 'order_display_id', 'label': 'Order #', 'type': 'badge'},
            {'key': 'product_name', 'label': 'Product', 'type': 'string'},
            {'key': 'unit_price', 'label': 'Unit Price', 'type': 'currency'},
            {'key': 'quantity', 'label': 'Ordered Qty', 'type': 'number'},
            {'key': 'delivered_qty', 'label': 'Delivered Qty', 'type': 'number'},
            {'key': 'shortfall_qty', 'label': 'Shortfall (Starved)', 'type': 'number'},
            {'key': 'order_status', 'label': 'Order Status', 'type': 'status'},
        ]
    },
    'customers': {
        'id': 'customers',
        'label': 'Customers & Schools',
        'description': 'Customer accounts, khata debt, credit limits, and geographic territories.',
        'model_path': 'customers.models.Customer',
        'icon': '👥',
        'fields': {
            'name': {
                'label': 'Customer Name',
                'type': 'string',
                'lookup': 'name',
                'placeholder': 'e.g. Patel Brothers',
            },
            'phone': {
                'label': 'Phone Number',
                'type': 'string',
                'lookup': 'phone',
                'placeholder': 'e.g. 9825',
            },
            'village': {
                'label': 'Village / Territory',
                'type': 'string',
                'lookup': 'custom_customer_village',
                'placeholder': 'e.g. Dharampur',
            },
            'outstanding_balance': {
                'label': 'Outstanding Balance (₹)',
                'type': 'decimal',
                'lookup': 'outstanding_balance',
                'placeholder': 'e.g. 1000',
            },
            'credit_limit': {
                'label': 'Credit Limit (₹)',
                'type': 'decimal',
                'lookup': 'credit_limit',
                'placeholder': 'e.g. 5000',
            },
            'status': {
                'label': 'Account Status',
                'type': 'choice',
                'lookup': 'status',
                'choices': ['active', 'inactive', 'blocked'],
            },
            'is_delinquent': {
                'label': 'Is Delinquent (Khata Breach)',
                'type': 'boolean',
                'lookup': 'is_delinquent',
                'choices': [('true', 'Yes (Delinquent)'), ('false', 'No (In Good Standing)')],
            },
        },
        'columns': [
            {'key': 'name', 'label': 'Customer Name', 'type': 'string'},
            {'key': 'phone', 'label': 'Phone', 'type': 'string'},
            {'key': 'village', 'label': 'Village', 'type': 'string'},
            {'key': 'outstanding_balance', 'label': 'Outstanding Balance', 'type': 'currency'},
            {'key': 'credit_limit', 'label': 'Credit Limit', 'type': 'currency'},
            {'key': 'status', 'label': 'Status', 'type': 'status'},
            {'key': 'created_at', 'label': 'Joined Date', 'type': 'date'},
        ]
    },
    'orders': {
        'id': 'orders',
        'label': 'Orders & POS Purchases',
        'description': 'Customer purchase orders, payment statuses, and invoice values.',
        'model_path': 'orders.models.Order',
        'icon': '📋',
        'fields': {
            'display_id': {
                'label': 'Order # Display ID',
                'type': 'integer',
                'lookup': 'display_id',
                'placeholder': 'e.g. 105',
            },
            'customer_name': {
                'label': 'Customer Name',
                'type': 'string',
                'lookup': 'customer__name',
                'placeholder': 'e.g. School A',
            },
            'village': {
                'label': 'Customer Village',
                'type': 'string',
                'lookup': 'custom_order_village',
                'placeholder': 'e.g. Krushnapur',
            },
            'order_type': {
                'label': 'Order Type',
                'type': 'choice',
                'lookup': 'order_type',
                'choices': ['retail', 'wholesale', 'school', 'consignment'],
            },
            'order_status': {
                'label': 'Order Status',
                'type': 'choice',
                'lookup': 'order_status',
                'choices': ['draft', 'confirmed', 'processing', 'completed', 'cancelled'],
            },
            'payment_status': {
                'label': 'Payment Status',
                'type': 'choice',
                'lookup': 'payment_status',
                'choices': ['pending', 'partial', 'paid'],
            },
            'delivery_status': {
                'label': 'Delivery Status',
                'type': 'choice',
                'lookup': 'delivery_status',
                'choices': ['pending', 'partial', 'delivered'],
            },
            'total_amount': {
                'label': 'Total Amount (₹)',
                'type': 'decimal',
                'lookup': 'total_amount',
                'placeholder': 'e.g. 5000',
            },
            'balance_amount': {
                'label': 'Balance Due (₹)',
                'type': 'decimal',
                'lookup': 'balance_amount',
                'placeholder': 'e.g. 1000',
            },
        },
        'columns': [
            {'key': 'display_id', 'label': 'Order #', 'type': 'badge'},
            {'key': 'customer_name', 'label': 'Customer', 'type': 'string'},
            {'key': 'village', 'label': 'Village', 'type': 'string'},
            {'key': 'order_type', 'label': 'Type', 'type': 'badge'},
            {'key': 'order_status', 'label': 'Order Status', 'type': 'status'},
            {'key': 'payment_status', 'label': 'Payment', 'type': 'status'},
            {'key': 'delivery_status', 'label': 'Delivery', 'type': 'status'},
            {'key': 'total_amount', 'label': 'Total Amount', 'type': 'currency'},
            {'key': 'balance_amount', 'label': 'Balance Due', 'type': 'currency'},
            {'key': 'created_at', 'label': 'Order Date', 'type': 'date'},
        ]
    },
    'products': {
        'id': 'products',
        'label': 'Products & Inventory Catalog',
        'description': 'Product inventory counts, cost prices, selling margins, and SKU thresholds.',
        'model_path': 'inventory.models.Product',
        'icon': '🏷️',
        'fields': {
            'name': {
                'label': 'Product Name',
                'type': 'string',
                'lookup': 'name',
                'placeholder': 'e.g. A4 Notebook',
            },
            'sku': {
                'label': 'SKU Code',
                'type': 'string',
                'lookup': 'sku',
                'placeholder': 'e.g. BK-A4',
            },
            'barcode': {
                'label': 'Barcode',
                'type': 'string',
                'lookup': 'barcode',
                'placeholder': 'e.g. 8901234',
            },
            'category': {
                'label': 'Category Name',
                'type': 'string',
                'lookup': 'category__name',
                'placeholder': 'e.g. Stationery',
            },
            'selling_price': {
                'label': 'Selling Price (₹)',
                'type': 'decimal',
                'lookup': 'selling_price',
                'placeholder': 'e.g. 120',
            },
            'cost_price': {
                'label': 'Cost Price (₹)',
                'type': 'decimal',
                'lookup': 'cost_price',
                'placeholder': 'e.g. 95',
            },
            'physical_stock': {
                'label': 'Physical Stock',
                'type': 'integer',
                'lookup': 'physical_stock',
                'placeholder': 'e.g. 50',
            },
            'available_stock': {
                'label': 'Available Stock',
                'type': 'integer',
                'lookup': 'available_stock',
                'placeholder': 'e.g. 20',
            },
        },
        'columns': [
            {'key': 'name', 'label': 'Product Name', 'type': 'string'},
            {'key': 'sku', 'label': 'SKU', 'type': 'badge'},
            {'key': 'category', 'label': 'Category', 'type': 'string'},
            {'key': 'selling_price', 'label': 'Selling Price', 'type': 'currency'},
            {'key': 'cost_price', 'label': 'Cost Price', 'type': 'currency'},
            {'key': 'physical_stock', 'label': 'Physical Stock', 'type': 'number'},
            {'key': 'available_stock', 'label': 'Available Stock', 'type': 'number'},
        ]
    },
    'procurement': {
        'id': 'procurement',
        'label': 'Purchase Orders & Suppliers',
        'description': 'Vendor procurement orders, line quantities, and status verification.',
        'model_path': 'procurement.models.PurchaseOrder',
        'icon': '🏭',
        'fields': {
            'display_id': {
                'label': 'PO # Number',
                'type': 'integer',
                'lookup': 'display_id',
                'placeholder': 'e.g. 24',
            },
            'vendor_name': {
                'label': 'Vendor Name',
                'type': 'string',
                'lookup': 'vendor__name',
                'placeholder': 'e.g. Navneet Supplies',
            },
            'status': {
                'label': 'PO Status',
                'type': 'choice',
                'lookup': 'status',
                'choices': ['draft', 'submitted', 'partially_received', 'received', 'cancelled'],
            },
            'total_amount': {
                'label': 'Total PO Amount (₹)',
                'type': 'decimal',
                'lookup': 'total_amount',
                'placeholder': 'e.g. 25000',
            },
            'product_name': {
                'label': 'Included Product',
                'type': 'string',
                'lookup': 'items__product__name',
                'placeholder': 'e.g. Pencil',
            },
        },
        'columns': [
            {'key': 'display_id', 'label': 'PO #', 'type': 'badge'},
            {'key': 'vendor_name', 'label': 'Vendor', 'type': 'string'},
            {'key': 'status', 'label': 'Status', 'type': 'status'},
            {'key': 'total_amount', 'label': 'Total Amount', 'type': 'currency'},
            {'key': 'created_at', 'label': 'PO Date', 'type': 'date'},
        ]
    },
    'finance': {
        'id': 'finance',
        'label': 'Bank Transactions & Ledgers',
        'description': 'Bank accounts, cash deposits, withdrawals, and ledger reconciliation.',
        'model_path': 'finance.models.BankTransaction',
        'icon': '💰',
        'fields': {
            'reference': {
                'label': 'Reference / UTR',
                'type': 'string',
                'lookup': 'reference',
                'placeholder': 'e.g. NEFT123',
            },
            'transaction_type': {
                'label': 'Transaction Type',
                'type': 'choice',
                'lookup': 'transaction_type',
                'choices': ['deposit', 'withdrawal'],
            },
            'amount': {
                'label': 'Amount (₹)',
                'type': 'decimal',
                'lookup': 'amount',
                'placeholder': 'e.g. 10000',
            },
            'bank_account': {
                'label': 'Bank Account Name',
                'type': 'string',
                'lookup': 'bank_account__account_name',
                'placeholder': 'e.g. Axis Bank',
            },
            'category': {
                'label': 'Category',
                'type': 'string',
                'lookup': 'category__name',
                'placeholder': 'e.g. Sales Collection',
            },
        },
        'columns': [
            {'key': 'reference', 'label': 'Reference', 'type': 'string'},
            {'key': 'transaction_type', 'label': 'Type', 'type': 'badge'},
            {'key': 'amount', 'label': 'Amount', 'type': 'currency'},
            {'key': 'bank_account', 'label': 'Account', 'type': 'string'},
            {'key': 'date', 'label': 'Date', 'type': 'date'},
        ]
    },
    'expenses': {
        'id': 'expenses',
        'label': 'Store & Employee Expenses',
        'description': 'Operating expenses, utility bills, employee allowances, and approvals.',
        'model_path': 'finance.models.Expense',
        'icon': '🧾',
        'fields': {
            'title': {
                'label': 'Expense Title',
                'type': 'string',
                'lookup': 'title',
                'placeholder': 'e.g. Office Stationery',
            },
            'category': {
                'label': 'Category Name',
                'type': 'string',
                'lookup': 'category__name',
                'placeholder': 'e.g. Rent & Utilities',
            },
            'amount': {
                'label': 'Amount (₹)',
                'type': 'decimal',
                'lookup': 'amount',
                'placeholder': 'e.g. 2500',
            },
            'status': {
                'label': 'Approval Status',
                'type': 'choice',
                'lookup': 'status',
                'choices': ['pending', 'approved', 'rejected'],
            },
        },
        'columns': [
            {'key': 'title', 'label': 'Title', 'type': 'string'},
            {'key': 'category', 'label': 'Category', 'type': 'string'},
            {'key': 'amount', 'label': 'Amount', 'type': 'currency'},
            {'key': 'status', 'label': 'Status', 'type': 'status'},
            {'key': 'date', 'label': 'Expense Date', 'type': 'date'},
        ]
    },
    'outlets': {
        'id': 'outlets',
        'label': 'Village Outlets & Consignment Partners',
        'description': 'Partner shops, consignment outlets, and territory commissions.',
        'model_path': 'outlets.models.Outlet',
        'icon': '🏪',
        'fields': {
            'name': {
                'label': 'Outlet Store Name',
                'type': 'string',
                'lookup': 'name',
                'placeholder': 'e.g. Ganesh Store',
            },
            'owner_name': {
                'label': 'Owner / Contact Person',
                'type': 'string',
                'lookup': 'owner_name',
                'placeholder': 'e.g. Suresh',
            },
            'village': {
                'label': 'Village / Location',
                'type': 'string',
                'lookup': 'village',
                'placeholder': 'e.g. Dharampur',
            },
            'phone': {
                'label': 'Phone Number',
                'type': 'string',
                'lookup': 'phone',
                'placeholder': 'e.g. 9825',
            },
            'status': {
                'label': 'Outlet Status',
                'type': 'choice',
                'lookup': 'status',
                'choices': ['active', 'inactive', 'suspended'],
            },
        },
        'columns': [
            {'key': 'name', 'label': 'Outlet Name', 'type': 'string'},
            {'key': 'owner_name', 'label': 'Owner', 'type': 'string'},
            {'key': 'village', 'label': 'Village', 'type': 'string'},
            {'key': 'phone', 'label': 'Phone', 'type': 'string'},
            {'key': 'status', 'label': 'Status', 'type': 'status'},
        ]
    },
}
