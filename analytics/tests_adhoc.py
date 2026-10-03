"""
Automated Unit and Integration Tests for Ad-Hoc Relational Discovery & Query Workbench.
Verifies natural language query parsing, structured token execution, multi-hop joins across
Customer -> Address -> Order -> OrderItem -> DeliveryItem, and decoupled strict line-item reconciliation.
"""

from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from customers.models import Customer, Address, GeographicRegion
from inventory.models import Product, Category
from orders.models import Order, OrderItem, Delivery, DeliveryItem
from analytics.models import SavedAnalysis, DiscoverySegment
from analytics.adhoc_engine import parse_natural_language_query, execute_adhoc_query

User = get_user_model()


class AdHocNLPParserTestCase(TestCase):
    """
    Tests natural language query parsing into relational tokens.
    """

    def test_user_exact_driving_query(self):
        query = (
            "get all customers from village krushnapur who has ordered apsara pencil at price 55 "
            "and and that pencil is not delivered (something else might be delivered) "
            "but leave out those with some of the pencils are delivered."
        )
        tokens = parse_natural_language_query(query)
        self.assertEqual(tokens['entity'], 'customer')
        self.assertEqual(tokens['village'], 'Krushnapur')
        self.assertEqual(tokens['product'], 'Apsara Pencil')
        self.assertEqual(tokens['price'], 55.0)
        self.assertEqual(tokens['fulfillment'], 'undelivered_strict')

    def test_compact_natural_query(self):
        query = "customers in Krushnapur who ordered Apsara Pencil @ 55 with 0 delivered (exclude partial)"
        tokens = parse_natural_language_query(query)
        self.assertEqual(tokens['village'], 'Krushnapur')
        self.assertEqual(tokens['product'], 'Apsara Pencil')
        self.assertEqual(tokens['price'], 55.0)
        self.assertEqual(tokens['fulfillment'], 'undelivered_strict')

    def test_alternate_village_and_product(self):
        query = "customers in Mahuva who bought Natraj Eraser at 10 not delivered"
        tokens = parse_natural_language_query(query)
        self.assertEqual(tokens['village'], 'Mahuva')
        self.assertEqual(tokens['product'], 'Natraj Eraser')
        self.assertEqual(tokens['price'], 10.0)
        self.assertEqual(tokens['fulfillment'], 'undelivered_strict')

    def test_empty_query_fallback(self):
        tokens = parse_natural_language_query("")
        self.assertEqual(tokens['entity'], 'customer')
        self.assertIsNone(tokens['village'])
        self.assertIsNone(tokens['product'])
        self.assertIsNone(tokens['price'])
        self.assertEqual(tokens['fulfillment'], 'undelivered_strict')

    def test_product_with_digits_and_kits(self):
        query = "customers in Dharampur who ordered Std 10 Math Kit at price 150 undelivered"
        tokens = parse_natural_language_query(query)
        self.assertEqual(tokens['village'], 'Dharampur')
        self.assertEqual(tokens['product'], 'Std 10 Math Kit')
        self.assertEqual(tokens['price'], 150.0)
        self.assertEqual(tokens['fulfillment'], 'undelivered_strict')

        query2 = "customers in Vansda who ordered Classmate A4 Book at price 65 with 0 delivered"
        tokens2 = parse_natural_language_query(query2)
        self.assertEqual(tokens2['village'], 'Vansda')
        self.assertEqual(tokens2['product'], 'Classmate A4 Book')
        self.assertEqual(tokens2['price'], 65.0)

    def test_order_with_quantity_prefix(self):
        query = "customers who ordered 5 apsara pencils at price 55 not delivered"
        tokens = parse_natural_language_query(query)
        self.assertEqual(tokens['product'], 'Apsara Pencils')
        self.assertEqual(tokens['price'], 55.0)
        self.assertEqual(tokens['fulfillment'], 'undelivered_strict')

    def test_multi_word_village(self):
        query = "village Mota Bazar customers ordered Camlin Notebook at 40"
        tokens = parse_natural_language_query(query)
        self.assertEqual(tokens['village'], 'Mota Bazar')
        self.assertEqual(tokens['product'], 'Camlin Notebook')
        self.assertEqual(tokens['price'], 40.0)


class AdHocEngineExecutionTestCase(TestCase):
    """
    Tests multi-hop query execution and line-item delivery reconciliation.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='operator_test',
            password='testpassword123',
            email='operator@circleaz.in'
        )

        # 1. Geographic Regions
        self.region_krushnapur = GeographicRegion.objects.create(name='Krushnapur')
        self.region_navsari = GeographicRegion.objects.create(name='Navsari')

        # 2. Category & Products
        self.category = Category.objects.create(name='Stationery')
        self.prod_pencil = Product.objects.create(
            name='Apsara Pencil',
            category=self.category,
            cost_price=Decimal('40.0000'),
            selling_price=Decimal('55.0000'),
            stock_quantity=100
        )
        self.prod_notebook = Product.objects.create(
            name='Classmate Notebook',
            category=self.category,
            cost_price=Decimal('30.0000'),
            selling_price=Decimal('45.0000'),
            stock_quantity=50
        )
        self.prod_eraser = Product.objects.create(
            name='Natraj Eraser',
            category=self.category,
            cost_price=Decimal('5.0000'),
            selling_price=Decimal('10.0000'),
            stock_quantity=200
        )

        # 3. Customers
        # Cust 1: Krushnapur, ordered 3 pencils @ 55, 0 delivered -> MATCH
        self.cust1 = Customer.objects.create(first_name='Kishore', last_name='Patel', phone='9898011111')
        Address.objects.create(customer=self.cust1, region=self.region_krushnapur, is_primary=True)

        # Cust 2: Krushnapur, ordered 2 pencils @ 55, 0 delivered -> MATCH
        self.cust2 = Customer.objects.create(first_name='Meena', last_name='Shah', phone='9898022222')
        Address.objects.create(customer=self.cust2, region=self.region_krushnapur, is_primary=True)

        # Cust 3: Krushnapur, ordered 4 pencils @ 55, 2 DELIVERED -> EXCLUDE (partial delivery)
        self.cust3 = Customer.objects.create(first_name='Haresh', last_name='Desai', phone='9898033333')
        Address.objects.create(customer=self.cust3, region=self.region_krushnapur, is_primary=True)

        # Cust 4: Navsari (wrong village), ordered 5 pencils @ 55, 0 delivered -> EXCLUDE
        self.cust4 = Customer.objects.create(first_name='Anil', last_name='Mehta', phone='9898044444')
        Address.objects.create(customer=self.cust4, region=self.region_navsari, is_primary=True)

        # Cust 5: Krushnapur, ordered 2 pencils @ 60 (wrong price), 0 delivered -> EXCLUDE
        self.cust5 = Customer.objects.create(first_name='Bhavik', last_name='Joshi', phone='9898055555')
        Address.objects.create(customer=self.cust5, region=self.region_krushnapur, is_primary=True)

        # Cust 6: Krushnapur, ordered eraser (wrong product), 0 delivered -> EXCLUDE
        self.cust6 = Customer.objects.create(first_name='Chetan', last_name='Parmar', phone='9898066666')
        Address.objects.create(customer=self.cust6, region=self.region_krushnapur, is_primary=True)

        # Cust 7: Krushnapur, multi-item order: pencil (0 delivered) + notebook (delivered!) -> MATCH (decoupled)
        self.cust7 = Customer.objects.create(first_name='Deepak', last_name='Varma', phone='9898077777')
        Address.objects.create(customer=self.cust7, region=self.region_krushnapur, is_primary=True)

        # 4. Orders & OrderItems
        # Order 1 (Cust 1)
        self.order1 = Order.objects.create(customer=self.cust1, order_status='confirmed', created_by=self.user)
        self.item1 = OrderItem.objects.create(
            order=self.order1, product=self.prod_pencil, quantity=3, unit_price=Decimal('55.0000')
        )

        # Order 2 (Cust 2)
        self.order2 = Order.objects.create(customer=self.cust2, order_status='confirmed', created_by=self.user)
        self.item2 = OrderItem.objects.create(
            order=self.order2, product=self.prod_pencil, quantity=2, unit_price=Decimal('55.0000')
        )

        # Order 3 (Cust 3) - partial delivery of pencils
        self.order3 = Order.objects.create(customer=self.cust3, order_status='confirmed', created_by=self.user)
        self.item3 = OrderItem.objects.create(
            order=self.order3, product=self.prod_pencil, quantity=4, unit_price=Decimal('55.0000')
        )
        deliv3 = Delivery.objects.create(order=self.order3)
        DeliveryItem.objects.create(delivery=deliv3, order_item=self.item3, quantity=2)

        # Order 4 (Cust 4) - Navsari
        self.order4 = Order.objects.create(customer=self.cust4, order_status='confirmed', created_by=self.user)
        self.item4 = OrderItem.objects.create(
            order=self.order4, product=self.prod_pencil, quantity=5, unit_price=Decimal('55.0000')
        )

        # Order 5 (Cust 5) - Price 60
        self.order5 = Order.objects.create(customer=self.cust5, order_status='confirmed', created_by=self.user)
        self.item5 = OrderItem.objects.create(
            order=self.order5, product=self.prod_pencil, quantity=2, unit_price=Decimal('60.0000')
        )

        # Order 6 (Cust 6) - Eraser
        self.order6 = Order.objects.create(customer=self.cust6, order_status='confirmed', created_by=self.user)
        self.item6 = OrderItem.objects.create(
            order=self.order6, product=self.prod_eraser, quantity=10, unit_price=Decimal('10.0000')
        )

        # Order 7 (Cust 7) - Pencil 0 delivered, Notebook 2 delivered
        self.order7 = Order.objects.create(customer=self.cust7, order_status='confirmed', created_by=self.user)
        self.item7a = OrderItem.objects.create(
            order=self.order7, product=self.prod_pencil, quantity=4, unit_price=Decimal('55.0000')
        )
        self.item7b = OrderItem.objects.create(
            order=self.order7, product=self.prod_notebook, quantity=2, unit_price=Decimal('45.0000')
        )
        deliv7 = Delivery.objects.create(order=self.order7)
        DeliveryItem.objects.create(delivery=deliv7, order_item=self.item7b, quantity=2)

    def test_execute_adhoc_query_with_user_driving_prompt(self):
        query_text = (
            "get all customers from village krushnapur who has ordered apsara pencil at price 55 "
            "and and that pencil is not delivered (something else might be delivered) "
            "but leave out those with some of the pencils are delivered."
        )
        result = execute_adhoc_query({'query': query_text})

        self.assertEqual(result['engine'], 'adhoc')
        summary = result['summary']

        # Distinct matching customers: Cust 1, Cust 2, Cust 7
        self.assertEqual(summary['matching_customers_count'], 3)

        # Starved units: Cust 1 (3) + Cust 2 (2) + Cust 7 (4) = 9 units
        self.assertEqual(summary['starved_units_total'], 9)

        # Unfulfilled value: 9 * 55 = 495.0
        self.assertEqual(summary['unfulfilled_value'], 495.0)

        # Verify items returned
        items = result['items']
        self.assertEqual(len(items), 3)

        matched_customer_names = {it['customer_name'] for it in items}
        self.assertIn('Kishore Patel', matched_customer_names)
        self.assertIn('Meena Shah', matched_customer_names)
        self.assertIn('Deepak Varma', matched_customer_names)

        # Strict checks that excluded customers are NOT present
        self.assertNotIn('Haresh Desai', matched_customer_names)  # Exclude partial delivery!
        self.assertNotIn('Anil Mehta', matched_customer_names)    # Wrong village!
        self.assertNotIn('Bhavik Joshi', matched_customer_names)  # Wrong price!
        self.assertNotIn('Chetan Parmar', matched_customer_names) # Wrong product!

        # Check line-item properties
        for it in items:
            self.assertEqual(it['delivered_qty'], 0)
            self.assertEqual(it['product_name'], 'Apsara Pencil')
            self.assertEqual(it['unit_price'], 55.0)
            self.assertEqual(it['shortfall_qty'], it['ordered_qty'])
            self.assertEqual(it['village'], 'Krushnapur')

    def test_execute_with_structured_tokens(self):
        params = {
            'entity': 'customer',
            'village': 'Krushnapur',
            'product': 'Apsara Pencil',
            'price': 55.0,
            'fulfillment': 'undelivered_strict',
        }
        result = execute_adhoc_query(params)
        self.assertEqual(result['summary']['matching_customers_count'], 3)
        self.assertEqual(result['summary']['starved_units_total'], 9)

    def test_partial_fulfillment_filter_returns_only_partials(self):
        params = {
            'village': 'Krushnapur',
            'product': 'Apsara Pencil',
            'price': 55.0,
            'fulfillment': 'partial',
        }
        result = execute_adhoc_query(params)
        items = result['items']
        # Only Cust 3 had a partial delivery of Apsara Pencil
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['customer_name'], 'Haresh Desai')
        self.assertEqual(items[0]['delivered_qty'], 2)
        self.assertEqual(items[0]['shortfall_qty'], 2)

    def test_multi_address_no_cartesian_product_multiplication(self):
        """
        Critical regression test: Customers with multiple addresses must NOT
        cause Cartesian multiplication in delivered_qty sum annotation.
        """
        cust_multi = Customer.objects.create(first_name='Varun', last_name='Patel', phone='9898099999')
        Address.objects.create(customer=cust_multi, region=self.region_krushnapur, address_line='Home', is_primary=True)
        Address.objects.create(customer=cust_multi, region=self.region_krushnapur, address_line='Office')
        Address.objects.create(customer=cust_multi, region=self.region_krushnapur, address_line='Farm')

        ord_multi = Order.objects.create(customer=cust_multi, order_status='confirmed', created_by=self.user)
        oi_multi = OrderItem.objects.create(
            order=ord_multi, product=self.prod_pencil, quantity=5, unit_price=Decimal('55.0000')
        )
        deliv = Delivery.objects.create(order=ord_multi)
        DeliveryItem.objects.create(delivery=deliv, order_item=oi_multi, quantity=1)

        result = execute_adhoc_query({
            'village': 'Krushnapur',
            'product': 'Apsara Pencil',
            'price': 55.0,
            'fulfillment': 'partial',
        })

        varun_items = [it for it in result['items'] if it['customer_name'] == 'Varun Patel']
        self.assertEqual(len(varun_items), 1)
        # Even with 3 addresses, delivered_qty must strictly be 1, NOT 3!
        self.assertEqual(varun_items[0]['delivered_qty'], 1)
        self.assertEqual(varun_items[0]['shortfall_qty'], 4)

    def test_mode_natural_overrides_stale_tokens(self):
        """
        When mode='natural', query text must drive the parameters rather than
        stale relational tokens from other engine selections.
        """
        result = execute_adhoc_query({
            'mode': 'natural',
            'query': 'customers in Navsari who ordered Apsara Pencil at price 55',
            'village': 'Krushnapur',  # Stale token from earlier run
            'product': 'Apsara Pencil',
            'price': 55.0,
        })
        # Must resolve to Navsari from query, NOT Krushnapur
        self.assertEqual(result['tokens']['village'], 'Navsari')
        for it in result['items']:
            self.assertEqual(it['village'], 'Navsari')

    def test_summary_aliases(self):
        """
        Verifies both singular and plural aliases exist on summary dictionary.
        """
        result = execute_adhoc_query({
            'village': 'Krushnapur',
            'product': 'Apsara Pencil',
            'price': 55.0,
            'fulfillment': 'undelivered_strict',
        })
        summary = result['summary']
        self.assertIn('matching_customer_count', summary)
        self.assertIn('matching_customers_count', summary)
        self.assertEqual(summary['matching_customer_count'], summary['matching_customers_count'])
        self.assertIn('starved_unit_total', summary)
        self.assertIn('starved_units_total', summary)
        self.assertEqual(summary['starved_unit_total'], summary['starved_units_total'])


class AdHocAPIEndpointsTestCase(APITestCase):
    """
    Tests REST API endpoints for Ad-Hoc queries.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='analyst_api',
            password='testpassword123',
            email='analyst_api@circleaz.in'
        )
        self.client.force_authenticate(user=self.user)

        self.region = GeographicRegion.objects.create(name='Krushnapur')
        self.cat = Category.objects.create(name='Pencils')
        self.prod = Product.objects.create(
            name='Apsara Pencil',
            category=self.cat,
            cost_price=Decimal('40.00'),
            selling_price=Decimal('55.00')
        )
        self.cust = Customer.objects.create(first_name='Ramesh', last_name='Patel', phone='9876543210')
        Address.objects.create(customer=self.cust, region=self.region, is_primary=True)

        self.order = Order.objects.create(customer=self.cust, order_status='confirmed', created_by=self.user)
        self.item = OrderItem.objects.create(
            order=self.order, product=self.prod, quantity=5, unit_price=Decimal('55.0000')
        )

    def test_adhoc_query_post_endpoint(self):
        url = '/api/analytics/adhoc-query/'
        payload = {
            'query': "customers from village krushnapur ordered apsara pencil at price 55 not delivered"
        }
        response = self.client.post(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['engine'], 'adhoc')
        self.assertEqual(data['summary']['matching_customers_count'], 1)
        self.assertEqual(data['summary']['starved_units_total'], 5)
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['customer_name'], 'Ramesh Patel')
        self.assertEqual(data['items'][0]['unit_price'], 55.0)

    def test_compute_view_delegates_to_adhoc(self):
        url = '/api/analytics/compute/adhoc/'
        payload = {
            'parameters': {
                'village': 'Krushnapur',
                'product': 'Apsara Pencil',
                'price': 55.0,
                'fulfillment': 'undelivered_strict'
            }
        }
        response = self.client.post(url, data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['engine'], 'adhoc')
        self.assertEqual(data['summary']['matching_customers_count'], 1)

    def test_saved_analysis_with_adhoc_engine(self):
        saved = SavedAnalysis.objects.create(
            name='Krushnapur Starved Pencils Analysis',
            engine_type=SavedAnalysis.ENGINE_ADHOC,
            parameters={'village': 'Krushnapur', 'product': 'Apsara Pencil', 'price': 55},
            cached_insights={'matching_customers_count': 1, 'starved_units_total': 5},
            created_by=self.user
        )
        self.assertEqual(saved.engine_type, 'adhoc')
        self.assertIn('Ad-Hoc Relational Discovery', saved.get_engine_type_display())

    def test_fork_cohort_from_adhoc_discovery(self):
        segment = DiscoverySegment.objects.create(
            name='Krushnapur Starved Customers Cohort',
            target_entity=DiscoverySegment.TARGET_CUSTOMER,
            entity_ids=[str(self.cust.id)],
            cohort_metrics={'starved_units': 5, 'unfulfilled_value': 275.0},
            source_engine='adhoc',
            created_by=self.user
        )
        self.assertEqual(segment.source_engine, 'adhoc')
        self.assertEqual(segment.target_entity, 'customer')
        self.assertEqual(len(segment.entity_ids), 1)
