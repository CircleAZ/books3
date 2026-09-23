"""
Unit Tests for Order Tokenized Search Filter and Autocomplete Suggestions API.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from orders.models import Order, OrderItem, Payment
from inventory.models import Product, Category
from customers.models import Customer

User = get_user_model()


class OrderTokenizedSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='order_search_tester',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(name='Textbooks')
        self.prod_math = Product.objects.create(
            name='Mathematics 10th',
            cost_price=Decimal('150.00'),
            selling_price=Decimal('250.00'),
            category=self.category,
            stock_quantity=50
        )
        self.prod_science = Product.objects.create(
            name='Science 10th',
            cost_price=Decimal('200.00'),
            selling_price=Decimal('350.00'),
            category=self.category,
            stock_quantity=40
        )

        self.cust_aarav = Customer.objects.create(
            first_name='Aarav',
            last_name='Patel',
            phone='9876543210',
            email='aarav.patel@example.com'
        )
        self.cust_suresh = Customer.objects.create(
            first_name='Suresh',
            last_name='Shah',
            phone='9822233344',
            email='suresh.shah@example.com'
        )

        # Order 1: Aarav Patel, Confirmed, Paid, Total: 500
        self.order1 = Order.objects.create(
            customer=self.cust_aarav,
            order_status='confirmed',
            payment_status='paid',
            delivery_status='delivered',
            subtotal=Decimal('500.00'),
            total=Decimal('500.00'),
            created_by=self.user
        )
        OrderItem.objects.create(
            order=self.order1,
            product=self.prod_math,
            quantity=2,
            unit_price=Decimal('250.00')
        )
        Payment.objects.create(
            order=self.order1,
            amount=Decimal('500.00'),
            method='cash',
            created_by=self.user
        )

        # Order 2: Suresh Shah, Draft, Pending, Total: 350
        self.order2 = Order.objects.create(
            customer=self.cust_suresh,
            order_status='draft',
            payment_status='pending',
            delivery_status='pending',
            subtotal=Decimal('350.00'),
            total=Decimal('350.00'),
            created_by=self.user
        )
        OrderItem.objects.create(
            order=self.order2,
            product=self.prod_science,
            quantity=1,
            unit_price=Decimal('350.00')
        )

        # Order 3: Guest Checkout, Cancelled, Total: 250
        self.order3 = Order.objects.create(
            is_guest=True,
            guest_name='Priya Desai',
            guest_phone='9811122233',
            order_status='cancelled',
            payment_status='refunded',
            delivery_status='pending',
            subtotal=Decimal('250.00'),
            total=Decimal('250.00'),
            created_by=self.user
        )
        OrderItem.objects.create(
            order=self.order3,
            product=self.prod_math,
            quantity=1,
            unit_price=Decimal('250.00')
        )

        # Explicitly set desired status values via update() to prevent in-memory recalculation overwrites
        Order.objects.filter(pk=self.order1.pk).update(
            order_status='confirmed',
            payment_status='paid',
            delivery_status='delivered'
        )
        Order.objects.filter(pk=self.order2.pk).update(
            order_status='draft',
            payment_status='pending',
            delivery_status='pending'
        )
        Order.objects.filter(pk=self.order3.pk).update(
            order_status='cancelled',
            payment_status='refunded',
            delivery_status='pending'
        )
        self.order1.refresh_from_db()
        self.order2.refresh_from_db()
        self.order3.refresh_from_db()

    def test_free_text_matches_customer_name(self):
        """Typing 'Patel' matches order for Aarav Patel."""
        response = self.client.get('/api/orders/orders/?search=Patel')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order1.id))

    def test_free_text_matches_guest_name(self):
        """Typing 'Priya' matches guest order."""
        response = self.client.get('/api/orders/orders/?search=Priya')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order3.id))

    def test_display_id_token_with_and_without_hash(self):
        """id: matches display_id with and without #."""
        res1 = self.client.get(f'/api/orders/orders/?search=id:{self.order1.display_id}')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['count'], 1)
        self.assertEqual(res1.data['results'][0]['id'], str(self.order1.id))

        res2 = self.client.get(f'/api/orders/orders/?search=id:#{self.order1.display_id}')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['count'], 1)
        self.assertEqual(res2.data['results'][0]['id'], str(self.order1.id))

    def test_status_token(self):
        """status: matches order_status."""
        response = self.client.get('/api/orders/orders/?search=status:confirmed')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order1.id))

    def test_payment_token(self):
        """payment: matches payment_status."""
        response = self.client.get('/api/orders/orders/?search=payment:pending')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order2.id))

    def test_delivery_token(self):
        """delivery: matches delivery_status."""
        response = self.client.get('/api/orders/orders/?search=delivery:delivered')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order1.id))

    def test_customer_token(self):
        """customer: matches registered and guest customer names."""
        res1 = self.client.get('/api/orders/orders/?search=customer:Aarav')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['count'], 1)
        self.assertEqual(res1.data['results'][0]['id'], str(self.order1.id))

        res2 = self.client.get('/api/orders/orders/?search=customer:"Priya Desai"')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['count'], 1)
        self.assertEqual(res2.data['results'][0]['id'], str(self.order3.id))

    def test_phone_token(self):
        """phone: matches customer phone and guest phone."""
        response = self.client.get('/api/orders/orders/?search=phone:9876543210')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order1.id))

    def test_product_subquery_isolation(self):
        """product: uses Exists() subquery to find orders containing a specific product."""
        res_math = self.client.get('/api/orders/orders/?search=product:"Mathematics 10th"')
        self.assertEqual(res_math.status_code, status.HTTP_200_OK)
        ids_math = [r['id'] for r in res_math.data['results']]
        self.assertIn(str(self.order1.id), ids_math)
        self.assertIn(str(self.order3.id), ids_math)
        self.assertNotIn(str(self.order2.id), ids_math)

        res_sci = self.client.get('/api/orders/orders/?search=product:Science')
        self.assertEqual(res_sci.status_code, status.HTTP_200_OK)
        self.assertEqual(res_sci.data['count'], 1)
        self.assertEqual(res_sci.data['results'][0]['id'], str(self.order2.id))

    def test_numeric_total_comparison(self):
        """total:>400 finds orders with total greater than 400."""
        response = self.client.get('/api/orders/orders/?search=total:>400')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.order1.id))

    def test_balance_filter(self):
        """balance:>0 finds unpaid/partially paid orders."""
        res_due = self.client.get('/api/orders/orders/?search=balance:>0')
        self.assertEqual(res_due.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res_due.data['results']]
        self.assertIn(str(self.order2.id), ids)
        self.assertNotIn(str(self.order1.id), ids)

        res_paid = self.client.get('/api/orders/orders/?search=balance:=0')
        self.assertEqual(res_paid.status_code, status.HTTP_200_OK)
        ids_paid = [r['id'] for r in res_paid.data['results']]
        self.assertIn(str(self.order1.id), ids_paid)
        self.assertNotIn(str(self.order2.id), ids_paid)

    def test_balance_capitalized(self):
        """Balance:>0 should not crash and should find unpaid orders."""
        res = self.client.get('/api/orders/orders/?search=Balance:>0')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res.data['results']]
        self.assertIn(str(self.order2.id), ids)

    def test_numeric_with_space(self):
        """total:> 400 should parse as total > 400 and match order1."""
        res = self.client.get('/api/orders/orders/?search=total:> 400')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.order1.id))

    def test_multi_token_combination(self):
        """Test multi-token combination with product, negation, numeric, and date."""
        res = self.client.get('/api/orders/orders/?search=product:"Mathematics 10th" -status:cancelled total:>300 date:today')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.order1.id))

    def test_invalid_numeric_value_does_not_crash(self):
        """Invalid numeric value like balance:>abc or total:>xyz should not crash."""
        res1 = self.client.get('/api/orders/orders/?search=balance:>abc')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        res2 = self.client.get('/api/orders/orders/?search=total:>xyz')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

    def test_negative_numeric_comparison(self):
        """total:<0 or balance:<0 should be supported without regex failure."""
        res = self.client.get('/api/orders/orders/?search=total:<0')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 0)





    def test_date_token(self):
        """date:today matches orders created today."""
        response = self.client.get('/api/orders/orders/?search=date:today')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 3)

    def test_negation_token(self):
        """-status:cancelled excludes cancelled orders."""
        response = self.client.get('/api/orders/orders/?search=-status:cancelled')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in response.data['results']]
        self.assertIn(str(self.order1.id), ids)
        self.assertIn(str(self.order2.id), ids)
        self.assertNotIn(str(self.order3.id), ids)

    def test_dangling_unmatched_quote_auto_balanced(self):
        """Unclosed quotes product:"Mathematics do not crash and match correctly."""
        response = self.client.get('/api/orders/orders/?search=product:"Mathematics')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)

    def test_suggestions_cheatsheet(self):
        """Calling search-suggestions without prefix returns cheatsheet schema."""
        response = self.client.get('/api/orders/orders/search-suggestions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('prefixes', response.data)
        prefix_keys = [p['prefix'] for p in response.data['prefixes']]
        self.assertIn('id', prefix_keys)
        self.assertIn('status', prefix_keys)
        self.assertIn('payment', prefix_keys)
        self.assertIn('product', prefix_keys)
        self.assertIn('total', prefix_keys)
        self.assertIn('balance', prefix_keys)

    def test_suggestions_prefix_values(self):
        """Calling search-suggestions with prefix returns distinct values with counts."""
        res_stat = self.client.get('/api/orders/orders/search-suggestions/?prefix=status')
        self.assertEqual(res_stat.status_code, status.HTTP_200_OK)
        self.assertEqual(res_stat.data['prefix'], 'status')
        status_vals = [s['value'] for s in res_stat.data['suggestions']]
        self.assertIn('confirmed', status_vals)
        self.assertIn('draft', status_vals)

        res_prod = self.client.get('/api/orders/orders/search-suggestions/?prefix=product&q=Math')
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        prod_vals = [s['value'] for s in res_prod.data['suggestions']]
        self.assertIn('Mathematics 10th', prod_vals)
