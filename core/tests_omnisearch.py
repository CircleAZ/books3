"""
Unit and Integration Tests for Global OmniSearch (Ctrl+K) Endpoint.
Covers:
  - Query sanitization (clamping, wildcards stripping)
  - Short-circuit on empty / 1-character queries (with single-digit display ID exception)
  - Display ID lookups (#101, ORD-101, PO-101, PRD-101, CUST-101, 101)
  - Phone number prefix matching for Orders and Customers
  - Text search across Customers, Products, Orders, Purchase Orders, Finance
  - Domain isolation for domain-prefixed queries
  - Standardized result shape verification
  - Fault tolerance under isolated domain query errors
  - Execution speed performance benchmark
"""

import time
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from orders.models import Order
from customers.models import Customer
from inventory.models import Product, Category, Vendor
from procurement.models import PurchaseOrder
from finance.models import BankAccount, BankTransaction

User = get_user_model()


class OmniSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='omnisearch_tester',
            email='omnisearch_tester@example.com',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        # 1. Product setup
        self.category = Category.objects.create(name='Stationery')
        self.vendor = Vendor.objects.create(name='Navneet Stationery Hub')
        self.product = Product.objects.create(
            name='Classmate Notebook 200 Pages',
            description='Spiral bound ruled notebook',
            cost_price=Decimal('50.00'),
            selling_price=Decimal('85.00'),
            category=self.category,
            vendor=self.vendor,
            stock_quantity=100,
            low_stock_threshold=15,
            display_id=501
        )

        # 2. Customer setup
        self.customer = Customer.objects.create(
            first_name='Ramesh',
            middle_name='Kumar',
            last_name='Patel',
            phone='9825012345',
            email='ramesh.patel@example.com',
            display_id=601
        )

        # 3. Order setup
        self.order = Order.objects.create(
            customer=self.customer,
            total=Decimal('425.00'),
            order_status='confirmed',
            payment_status='paid',
            delivery_status='pending',
            display_id=701
        )

        # 4. Purchase Order setup
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            total_amount=Decimal('5000.00'),
            status='received',
            display_id=801
        )

        # 5. Finance setup
        self.bank_account = BankAccount.objects.create(
            name='HDFC Operations',
            account_number='50200012345678',
            ifsc_code='HDFC0000240'
        )
        from django.utils import timezone
        self.transaction = BankTransaction.objects.create(
            account=self.bank_account,
            date=timezone.localdate(),
            transaction_type='deposit',
            amount=Decimal('425.00'),
            reference='UPI/9825012345/REF001',
            description='Customer payment for Order #701'
        )

    def test_query_sanitization_wildcards_and_clamping(self):
        """Wildcards % and _ must be stripped, and length clamped to 40 characters without error."""
        long_query = "Notebook" + "%" * 10 + "_" * 10 + "x" * 50
        response = self.client.get(f'/api/core/omnisearch/?q={long_query}', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should execute successfully without database error
        self.assertIn('products', response.data)

    def test_short_circuit_empty_and_single_char_text(self):
        """Empty query or single-character non-numeric query returns empty payload immediately."""
        # Empty
        res_empty = self.client.get('/api/core/omnisearch/?q=', HTTP_HOST='localhost')
        self.assertEqual(res_empty.status_code, status.HTTP_200_OK)
        for key in ('orders', 'customers', 'products', 'purchase_orders', 'finance'):
            self.assertEqual(res_empty.data[key], [])

        # Single char text
        res_char = self.client.get('/api/core/omnisearch/?q=x', HTTP_HOST='localhost')
        self.assertEqual(res_char.status_code, status.HTTP_200_OK)
        for key in ('orders', 'customers', 'products', 'purchase_orders', 'finance'):
            self.assertEqual(res_char.data[key], [])

    def test_single_digit_numeric_lookup_not_short_circuited(self):
        """Single digit display ID (e.g. '5' or '#5') should NOT short-circuit."""
        self.product.display_id = 5
        self.product.save(update_fields=['display_id'])

        res = self.client.get('/api/core/omnisearch/?q=5', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        matched_prod = [p for p in res.data['products'] if p['title'] == self.product.name]
        self.assertTrue(len(matched_prod) > 0)

        res_hash = self.client.get('/api/core/omnisearch/?q=%235', HTTP_HOST='localhost')
        self.assertEqual(res_hash.status_code, status.HTTP_200_OK)
        matched_hash = [p for p in res_hash.data['products'] if p['title'] == self.product.name]
        self.assertTrue(len(matched_hash) > 0)

    def test_display_id_lookups_and_prefixes(self):
        """Display ID lookups should work for bare numbers, #, and domain prefixes."""
        # Bare number
        res_order = self.client.get('/api/core/omnisearch/?q=701', HTTP_HOST='localhost')
        self.assertEqual(res_order.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_order.data['orders']), 1)
        self.assertEqual(res_order.data['orders'][0]['title'], 'Order #701')

        # Hash prefix #701
        res_hash_order = self.client.get('/api/core/omnisearch/?q=%23701', HTTP_HOST='localhost')
        self.assertEqual(res_hash_order.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_hash_order.data['orders']), 1)
        self.assertEqual(res_hash_order.data['orders'][0]['title'], 'Order #701')

        # ORD-701 prefix
        res_ord = self.client.get('/api/core/omnisearch/?q=ORD-701', HTTP_HOST='localhost')
        self.assertEqual(res_ord.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_ord.data['orders']), 1)
        self.assertEqual(res_ord.data['orders'][0]['title'], 'Order #701')
        # Domain isolation: other categories must be empty
        self.assertEqual(res_ord.data['customers'], [])
        self.assertEqual(res_ord.data['products'], [])
        self.assertEqual(res_ord.data['purchase_orders'], [])

        # PO-801 prefix
        res_po = self.client.get('/api/core/omnisearch/?q=PO-801', HTTP_HOST='localhost')
        self.assertEqual(res_po.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_po.data['purchase_orders']), 1)
        self.assertEqual(res_po.data['purchase_orders'][0]['title'], 'PO #801')
        self.assertEqual(res_po.data['orders'], [])

        # PRD-501 prefix
        res_prd = self.client.get('/api/core/omnisearch/?q=PRD-501', HTTP_HOST='localhost')
        self.assertEqual(res_prd.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_prd.data['products']), 1)
        self.assertEqual(res_prd.data['products'][0]['title'], 'Classmate Notebook 200 Pages')
        self.assertEqual(res_prd.data['orders'], [])

        # CUST-601 prefix
        res_cust = self.client.get('/api/core/omnisearch/?q=CUST-601', HTTP_HOST='localhost')
        self.assertEqual(res_cust.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_cust.data['customers']), 1)
        self.assertEqual(res_cust.data['customers'][0]['title'], 'Ramesh Kumar Patel')
        self.assertEqual(res_cust.data['orders'], [])

    def test_phone_number_lookup(self):
        """Searching a 10-digit phone number locates both customer and order."""
        res = self.client.get('/api/core/omnisearch/?q=9825012345', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        matched_cust = [c for c in res.data['customers'] if '9825012345' in c['subtitle']]
        self.assertTrue(len(matched_cust) > 0)

        matched_order = [o for o in res.data['orders'] if '9825012345' in o['subtitle']]
        self.assertTrue(len(matched_order) > 0)

    def test_text_search_across_domains(self):
        """Free-text search locates relevant entities across all domains."""
        # Customer name
        res_c = self.client.get('/api/core/omnisearch/?q=Ramesh', HTTP_HOST='localhost')
        self.assertTrue(any(c['title'] == 'Ramesh Kumar Patel' for c in res_c.data['customers']))

        # Product name
        res_p = self.client.get('/api/core/omnisearch/?q=Notebook', HTTP_HOST='localhost')
        self.assertTrue(any('Notebook' in p['title'] for p in res_p.data['products']))

        # Purchase order vendor name
        res_po = self.client.get('/api/core/omnisearch/?q=Navneet', HTTP_HOST='localhost')
        self.assertTrue(any('Navneet' in po['subtitle'] for po in res_po.data['purchase_orders']))

        # Finance transaction reference / description
        res_f = self.client.get('/api/core/omnisearch/?q=REF001', HTTP_HOST='localhost')
        self.assertTrue(any('REF001' in t['title'] for t in res_f.data['finance']))

    def test_standardized_result_shape(self):
        """Every result across all domains must contain the standard contract keys."""
        required_keys = {'id', 'title', 'subtitle', 'badge', 'badgeColor', 'url', 'category'}

        res = self.client.get('/api/core/omnisearch/?q=Patel', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        for category, items in res.data.items():
            for item in items:
                self.assertTrue(required_keys.issubset(item.keys()), f"Missing keys in {item}")
                self.assertEqual(item['category'], category)
                self.assertTrue(item['url'].startswith('/'))

    def test_soft_deleted_records_excluded(self):
        """Soft-deleted records must never appear in search results."""
        self.customer.is_deleted = True
        self.customer.save(update_fields=['is_deleted'])

        res = self.client.get('/api/core/omnisearch/?q=Ramesh', HTTP_HOST='localhost')
        matched_cust = [c for c in res.data['customers'] if c['id'] == f"customer-{self.customer.id}"]
        self.assertEqual(len(matched_cust), 0)

    def test_sub_80ms_performance_benchmark(self):
        """Search execution time on SQLite / Postgres test DB should be under 80ms."""
        # Warmup
        self.client.get('/api/core/omnisearch/?q=Notebook', HTTP_HOST='localhost')

        t0 = time.perf_counter()
        response = self.client.get('/api/core/omnisearch/?q=Notebook', HTTP_HOST='localhost')
        t1 = time.perf_counter()
        elapsed_ms = (t1 - t0) * 1000

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verify sub-80ms target (generous 120ms ceiling for slow CI machines)
        self.assertLess(elapsed_ms, 120.0, f"OmniSearch took {elapsed_ms:.2f}ms which exceeded threshold")

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated requests must be rejected with 401 Unauthorized."""
        unauthed_client = APIClient()
        response = unauthed_client.get('/api/core/omnisearch/?q=Notebook', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_fault_tolerance_isolated_domain_failure(self):
        """Failure in one domain query must not crash the whole search."""
        from unittest.mock import patch
        with patch('inventory.models.Product.objects.filter', side_effect=RuntimeError("Simulated DB connection failure")):
            response = self.client.get('/api/core/omnisearch/?q=Ramesh', HTTP_HOST='localhost')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            # Products will be empty due to error handling
            self.assertEqual(response.data['products'], [])
            # Customers should still resolve cleanly
            self.assertTrue(len(response.data['customers']) > 0)

    def test_hash_prefixed_domain_isolation(self):
        """Hash-prefixed domain queries like #ORD-701, #PO-801, #PRD-501 must strictly isolate domains."""
        # #ORD-701 must only search Orders
        res_ord = self.client.get('/api/core/omnisearch/?q=%23ORD-701', HTTP_HOST='localhost')
        self.assertEqual(res_ord.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_ord.data['orders']), 1)
        self.assertEqual(res_ord.data['customers'], [])
        self.assertEqual(res_ord.data['products'], [])
        self.assertEqual(res_ord.data['purchase_orders'], [])
        self.assertEqual(res_ord.data['finance'], [])

        # #PO-801 must only search Purchase Orders
        res_po = self.client.get('/api/core/omnisearch/?q=%23PO-801', HTTP_HOST='localhost')
        self.assertEqual(res_po.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_po.data['purchase_orders']), 1)
        self.assertEqual(res_po.data['orders'], [])
        self.assertEqual(res_po.data['finance'], [])

        # #PRD-501 must only search Products
        res_prd = self.client.get('/api/core/omnisearch/?q=%23PRD-501', HTTP_HOST='localhost')
        self.assertEqual(res_prd.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_prd.data['products']), 1)
        self.assertEqual(res_prd.data['orders'], [])

        # #CUST-601 must only search Customers
        res_cust = self.client.get('/api/core/omnisearch/?q=%23CUST-601', HTTP_HOST='localhost')
        self.assertEqual(res_cust.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_cust.data['customers']), 1)
        self.assertEqual(res_cust.data['orders'], [])

    def test_unicode_digit_query_does_not_crash(self):
        """Unicode superscript digit query '%C2%B9' (¹), where str.isdigit() is True but int() fails, must return HTTP 200 without 500 error."""
        response = self.client.get('/api/core/omnisearch/?q=%C2%B9', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['orders'], [])
        self.assertEqual(response.data['products'], [])

    def test_multi_word_customer_and_order_search(self):
        """Multi-word customer searches like 'Ramesh Kumar' or 'Ramesh Patel' or 'Ramesh Kumar Patel' must find customer and their orders."""
        # 1. First + middle name
        res_km = self.client.get('/api/core/omnisearch/?q=Ramesh+Kumar', HTTP_HOST='localhost')
        self.assertEqual(res_km.status_code, status.HTTP_200_OK)
        self.assertTrue(any(c['title'] == 'Ramesh Kumar Patel' for c in res_km.data['customers']))
        self.assertTrue(any(o['id'] == f"order-{self.order.id}" for o in res_km.data['orders']))

        # 2. First + last name
        res_kp = self.client.get('/api/core/omnisearch/?q=Ramesh+Patel', HTTP_HOST='localhost')
        self.assertEqual(res_kp.status_code, status.HTTP_200_OK)
        self.assertTrue(any(c['title'] == 'Ramesh Kumar Patel' for c in res_kp.data['customers']))
        self.assertTrue(any(o['id'] == f"order-{self.order.id}" for o in res_kp.data['orders']))

        # 3. Full name (3 words)
        res_full = self.client.get('/api/core/omnisearch/?q=Ramesh+Kumar+Patel', HTTP_HOST='localhost')
        self.assertEqual(res_full.status_code, status.HTTP_200_OK)
        self.assertTrue(any(c['title'] == 'Ramesh Kumar Patel' for c in res_full.data['customers']))
        self.assertTrue(any(o['id'] == f"order-{self.order.id}" for o in res_full.data['orders']))

    def test_multi_word_product_search(self):
        """Searching non-adjacent words in product name like 'Classmate 200' must find 'Classmate Notebook 200 Pages'."""
        response = self.client.get('/api/core/omnisearch/?q=Classmate+200', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(p['title'] == 'Classmate Notebook 200 Pages' for p in response.data['products']))


