"""
Unit Tests for Return Tokenized Search Filter and Autocomplete Suggestions API.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from orders.models import Order, OrderItem, Return, ReturnItem, ReturnReason
from inventory.models import Product, Category
from customers.models import Customer

User = get_user_model()


class ReturnTokenizedSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='return_search_tester',
            email='return_search_tester@example.com',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(name='Stationery')
        self.prod_pen = Product.objects.create(
            name='Pilot Gel Pen Black',
            cost_price=Decimal('20.00'),
            selling_price=Decimal('40.00'),
            category=self.category,
            stock_quantity=100
        )
        self.prod_book = Product.objects.create(
            name='Classmate Spiral Register',
            cost_price=Decimal('60.00'),
            selling_price=Decimal('100.00'),
            category=self.category,
            stock_quantity=50
        )

        self.cust_priya = Customer.objects.create(
            first_name='Priya',
            last_name='Sharma',
            phone='9811122233',
            email='priya@example.com'
        )
        self.cust_raj = Customer.objects.create(
            first_name='Raj',
            last_name='Verma',
            phone='9844455566',
            email='raj@example.com'
        )

        self.reason_defective = ReturnReason.objects.create(name='Defective Product')
        self.reason_wrong = ReturnReason.objects.create(name='Wrong Item Received')

        # Order 1 (Priya)
        self.order1 = Order.objects.create(
            customer=self.cust_priya,
            order_status='completed',
            payment_status='paid',
            created_by=self.user
        )
        self.oi_pen1 = OrderItem.objects.create(order=self.order1, product=self.prod_pen, quantity=5, unit_price=Decimal('40.00'))
        self.oi_book1 = OrderItem.objects.create(order=self.order1, product=self.prod_book, quantity=2, unit_price=Decimal('100.00'))
        self.order1.calculate_totals()

        # Order 2 (Raj)
        self.order2 = Order.objects.create(
            customer=self.cust_raj,
            order_status='completed',
            payment_status='paid',
            created_by=self.user
        )
        self.oi_book2 = OrderItem.objects.create(order=self.order2, product=self.prod_book, quantity=3, unit_price=Decimal('100.00'))
        self.order2.calculate_totals()

        # Order 3 (Guest Order)
        self.order3 = Order.objects.create(
            guest_name='Guest Vikram',
            guest_phone='9988776655',
            order_status='completed',
            payment_status='paid',
            created_by=self.user
        )
        self.oi_pen3 = OrderItem.objects.create(order=self.order3, product=self.prod_pen, quantity=2, unit_price=Decimal('40.00'))
        self.order3.calculate_totals()

        # Return 1: on Order 1 (Priya), initiated, returned Pilot Pen (2 items to verify deduplication)
        self.ret1 = Return.objects.create(
            order=self.order1,
            status='initiated',
            notes='Priya returning defective pens',
            created_by=self.user
        )
        ReturnItem.objects.create(
            return_request=self.ret1,
            order_item=self.oi_pen1,
            quantity=2,
            reason=self.reason_defective
        )
        ReturnItem.objects.create(
            return_request=self.ret1,
            order_item=self.oi_pen1,
            quantity=1,
            reason=self.reason_defective
        )

        # Return 2: on Order 2 (Raj), items_received, returned Book
        self.ret2 = Return.objects.create(
            order=self.order2,
            status='items_received',
            notes='Raj returning spiral register',
            created_by=self.user
        )
        ReturnItem.objects.create(
            return_request=self.ret2,
            order_item=self.oi_book2,
            quantity=1,
            reason=self.reason_wrong
        )

        # Return 3: on Order 3 (Guest Vikram), completed, returned Pen
        self.ret3 = Return.objects.create(
            order=self.order3,
            status='completed',
            notes='Vikram guest return done',
            created_by=self.user
        )
        ReturnItem.objects.create(
            return_request=self.ret3,
            order_item=self.oi_pen3,
            quantity=2,
            reason=self.reason_defective
        )

    def test_prefix_id_and_hash(self):
        """Test id: and id:# lookups on Return display_id."""
        res = self.client.get(f'/api/orders/returns/?search=id:{self.ret1.display_id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.ret1.id))

        res_hash = self.client.get(f'/api/orders/returns/?search=id:#{self.ret2.display_id}')
        self.assertEqual(res_hash.status_code, status.HTTP_200_OK)
        results_hash = res_hash.data.get('results', res_hash.data)
        self.assertEqual(len(results_hash), 1)
        self.assertEqual(results_hash[0]['id'], str(self.ret2.id))

    def test_prefix_order(self):
        """Test order: and order:# matching parent order display_id."""
        res = self.client.get(f'/api/orders/returns/?search=order:{self.order1.display_id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.ret1.id))

        res_hash = self.client.get(f'/api/orders/returns/?search=order:#{self.order2.display_id}')
        self.assertEqual(res_hash.status_code, status.HTTP_200_OK)
        results_hash = res_hash.data.get('results', res_hash.data)
        self.assertEqual(len(results_hash), 1)
        self.assertEqual(results_hash[0]['id'], str(self.ret2.id))

    def test_prefix_status(self):
        """Test status: token."""
        res_init = self.client.get('/api/orders/returns/?search=status:initiated')
        results_init = res_init.data.get('results', res_init.data)
        self.assertEqual(len(results_init), 1)
        self.assertEqual(results_init[0]['id'], str(self.ret1.id))

        res_recv = self.client.get('/api/orders/returns/?search=status:items_received')
        results_recv = res_recv.data.get('results', res_recv.data)
        self.assertEqual(len(results_recv), 1)
        self.assertEqual(results_recv[0]['id'], str(self.ret2.id))

        res_comp = self.client.get('/api/orders/returns/?search=status:completed')
        results_comp = res_comp.data.get('results', res_comp.data)
        self.assertEqual(len(results_comp), 1)
        self.assertEqual(results_comp[0]['id'], str(self.ret3.id))

    def test_prefix_customer(self):
        """Test customer: token matching customer name or guest name."""
        res_priya = self.client.get('/api/orders/returns/?search=customer:Priya')
        results_priya = res_priya.data.get('results', res_priya.data)
        self.assertEqual(len(results_priya), 1)
        self.assertEqual(results_priya[0]['id'], str(self.ret1.id))

        res_guest = self.client.get('/api/orders/returns/?search=customer:Vikram')
        results_guest = res_guest.data.get('results', res_guest.data)
        self.assertEqual(len(results_guest), 1)
        self.assertEqual(results_guest[0]['id'], str(self.ret3.id))

    def test_product_exists_subquery_isolation(self):
        """
        Verify product: token isolates query via Exists() on ReturnItem.order_item.product.name
        and eliminates duplicates even when return has multiple items for the same product.
        """
        res = self.client.get('/api/orders/returns/?search=product:"Pilot"')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        # ret1 and ret3 returned Pilot Pen
        self.assertEqual(len(results), 2)
        ret_ids = [r['id'] for r in results]
        # ret1 has 2 items of Pilot Pen, must appear EXACTLY ONCE
        self.assertEqual(ret_ids.count(str(self.ret1.id)), 1)
        self.assertEqual(ret_ids.count(str(self.ret3.id)), 1)

    def test_negation(self):
        """Test negation syntax -status:completed."""
        res = self.client.get('/api/orders/returns/?search=-status:completed')
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertNotIn(str(self.ret3.id), ids)

    def test_free_text(self):
        """Test free text matches notes, customer name, and return/order display IDs."""
        res_note = self.client.get('/api/orders/returns/?search=spiral')
        results_note = res_note.data.get('results', res_note.data)
        self.assertEqual(len(results_note), 1)
        self.assertEqual(results_note[0]['id'], str(self.ret2.id))

        res_cust = self.client.get('/api/orders/returns/?search=Priya')
        results_cust = res_cust.data.get('results', res_cust.data)
        self.assertEqual(len(results_cust), 1)
        self.assertEqual(results_cust[0]['id'], str(self.ret1.id))

    def test_search_suggestions_endpoint(self):
        """Test cheatsheet and autocomplete suggestions on ReturnViewSet."""
        # 1. Cheatsheet schema
        res_schema = self.client.get('/api/orders/returns/search-suggestions/')
        self.assertEqual(res_schema.status_code, status.HTTP_200_OK)
        self.assertIn('prefixes', res_schema.data)
        prefix_keys = [p['prefix'] for p in res_schema.data['prefixes']]
        self.assertIn('order', prefix_keys)
        self.assertIn('status', prefix_keys)
        self.assertIn('product', prefix_keys)

        # 2. Status suggestions with live counts
        res_status = self.client.get('/api/orders/returns/search-suggestions/?prefix=status')
        self.assertEqual(res_status.status_code, status.HTTP_200_OK)
        suggs = res_status.data.get('suggestions', [])
        init_sugg = next((s for s in suggs if s['value'] == 'initiated'), None)
        self.assertIsNotNone(init_sugg)
        self.assertEqual(init_sugg['count'], 1)

        # 3. Product suggestions
        res_prod = self.client.get('/api/orders/returns/search-suggestions/?prefix=product&q=Pilot')
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        suggs_prod = res_prod.data.get('suggestions', [])
        self.assertTrue(any('Pilot' in s['label'] for s in suggs_prod))

        # 4. Customer suggestions
        res_cust = self.client.get('/api/orders/returns/search-suggestions/?prefix=customer&q=Priya')
        self.assertEqual(res_cust.status_code, status.HTTP_200_OK)
        suggs_cust = res_cust.data.get('suggestions', [])
        self.assertTrue(any('Priya' in s['value'] for s in suggs_cust))

        # 5. Order suggestions
        res_ord = self.client.get(f'/api/orders/returns/search-suggestions/?prefix=order&q={self.order1.display_id}')
        self.assertEqual(res_ord.status_code, status.HTTP_200_OK)
        suggs_ord = res_ord.data.get('suggestions', [])
        self.assertTrue(any(str(self.order1.display_id) in s['value'] for s in suggs_ord))

    def test_business_prefixes_and_date_queries(self):
        """Test RET- prefix, ORD- prefix, and date comparisons on returns."""
        # 1. RET- prefix on id:
        res_ret = self.client.get(f'/api/orders/returns/?search=id:RET-{self.ret1.display_id}')
        self.assertEqual(res_ret.status_code, status.HTTP_200_OK)
        results = res_ret.data.get('results', res_ret.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.ret1.id))

        # 2. ORD- prefix on order:
        res_ord = self.client.get(f'/api/orders/returns/?search=order:ORD-{self.order1.display_id}')
        self.assertEqual(res_ord.status_code, status.HTTP_200_OK)
        results_ord = res_ord.data.get('results', res_ord.data)
        self.assertEqual(len(results_ord), 1)
        self.assertEqual(results_ord[0]['id'], str(self.ret1.id))

        # 2b. #ORD- prefix on order:
        res_hash_ord = self.client.get(f'/api/orders/returns/?search=order:#ORD-{self.order1.display_id}')
        self.assertEqual(res_hash_ord.status_code, status.HTTP_200_OK)
        results_hash_ord = res_hash_ord.data.get('results', res_hash_ord.data)
        self.assertEqual(len(results_hash_ord), 1)
        self.assertEqual(results_hash_ord[0]['id'], str(self.ret1.id))

        # 3. Date comparison: date:today and date:>2020-01-01
        res_today = self.client.get('/api/orders/returns/?search=date:today')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        results_today = res_today.data.get('results', res_today.data)
        self.assertEqual(len(results_today), 3)

        res_gt = self.client.get('/api/orders/returns/?search=date:>2020-01-01')
        self.assertEqual(res_gt.status_code, status.HTTP_200_OK)
        results_gt = res_gt.data.get('results', res_gt.data)
        self.assertEqual(len(results_gt), 3)
