from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal
import time

from account.models import User
from customers.models import Customer
from inventory.models import Category, Product
from orders.models import Order, OrderItem, Delivery, DeliveryItem
from core.azql import AZQLLexer, AZQLParser, AZQLCompiler, VisualCompiler


class AZQLCompilerTestCase(TestCase):
    
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username='query_manager',
            email='manager@example.com',
            password='testpassword'
        )
        
        # Create category and product
        self.category = Category.objects.create(name="Stationery")
        self.product = Product.objects.create(
            name="A4 Paper",
            category=self.category,
            selling_price=Decimal('50.00'),
            cost_price=Decimal('30.00'),
            physical_stock=100,
            stock_quantity=100
        )
        
        # Create customer
        self.customer = Customer.objects.create(
            first_name="Alpesh",
            last_name="Patel",
            phone="9988776655"
        )
        
        # Create order
        self.order = Order.objects.create(
            customer=self.customer,
            subtotal=Decimal('250.00'),
            discount_amount=Decimal('0.00'),
            total=Decimal('250.00'),
            order_status='draft'
        )
        
        # Create order item
        self.order_item = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=5,
            confirmed_quantity=5,
            unit_price=Decimal('50.00'),
            cost_price=Decimal('30.00'),
            line_total=Decimal('250.00')
        )
        
        # Capture Time travel state 1 (Status: draft)
        time.sleep(0.01)
        self.t1 = timezone.now()
        time.sleep(0.01)
        
        # Move order to confirmed status
        self.order.order_status = 'confirmed'
        self.order.save()
        
        # Capture Time travel state 2 (Status: confirmed)
        time.sleep(0.01)
        self.t2 = timezone.now()
        time.sleep(0.01)
        
        # Move order to completed status
        Order.objects.filter(id=self.order.id).update(order_status='completed')
        self.order.refresh_from_db()
        
        # Setup partial delivery to test aggregates
        self.delivery = Delivery.objects.create(
            order=self.order,
            notes='delivered'
        )
        self.delivery_item = DeliveryItem.objects.create(
            delivery=self.delivery,
            order_item=self.order_item,
            quantity=3
        )
        
    def test_lexer_tokenization(self):
        """Verify the lexer breaks down AZQL clauses correctly."""
        text = "SELECT name FROM Product WHERE stock_quantity > 10 AND category__name = 'Stationery'"
        lexer = AZQLLexer()
        tokens = lexer.tokenize(text)
        
        # Verify matching token categories are generated
        token_types = [t[0] for t in tokens]
        self.assertIn('FIELD', token_types)
        self.assertIn('OPERATOR', token_types)
        self.assertIn('NUMBER', token_types)
        self.assertIn('STRING', token_types)

    def test_basic_compiler_queries(self):
        """Verify basic select and filter queries compile to correct querysets."""
        query = "SELECT name, physical_stock FROM Product WHERE selling_price >= 40"
        qs, columns = AZQLCompiler.compile(query)
        
        self.assertEqual(columns, ['name', 'physical_stock'])
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['name'], "A4 Paper")
        self.assertEqual(qs[0]['physical_stock'], 100)

    def test_whitelist_validation(self):
        """Verify that attempting to query un-whitelisted attributes throws ValidationErrors."""
        # Field not whitelisted on Product
        query = "SELECT name, secret_margin FROM Product WHERE selling_price > 0"
        with self.assertRaises(ValidationError):
            AZQLCompiler.compile(query)
            
        # Entity not whitelisted
        query = "SELECT username FROM User WHERE is_superuser = TRUE"
        with self.assertRaises(ValidationError):
            AZQLCompiler.compile(query)

    def test_macro_resolution(self):
        """Verify that macros like @Today and @Me are evaluated correctly."""
        query = "SELECT display_id FROM Order WHERE created_at >= @Today - 1"
        qs, _ = AZQLCompiler.compile(query)
        self.assertEqual(qs.count(), 1)

    def test_time_travel_asof(self):
        """Verify that ASOF queries fetch historical snapshots accurately."""
        # As of t1, order was in 'draft' status
        query_t1 = f"SELECT order_status FROM Order WHERE display_id = {self.order.display_id} ASOF '{self.t1.isoformat()}'"
        qs_t1, _ = AZQLCompiler.compile(query_t1)
        self.assertEqual(qs_t1.count(), 1)
        self.assertEqual(qs_t1[0]['order_status'], 'draft')
        
        # As of t2, order was in 'confirmed' status
        query_t2 = f"SELECT order_status FROM Order WHERE display_id = {self.order.display_id} ASOF '{self.t2.isoformat()}'"
        qs_t2, _ = AZQLCompiler.compile(query_t2)
        self.assertEqual(qs_t2.count(), 1)
        self.assertEqual(qs_t2[0]['order_status'], 'confirmed')
        
        # Current status is 'completed'
        query_now = f"SELECT order_status FROM Order WHERE display_id = {self.order.display_id}"
        qs_now, _ = AZQLCompiler.compile(query_now)
        self.assertEqual(qs_now[0]['order_status'], 'completed')

    def test_was_ever_history_search(self):
        """Verify WAS EVER queries locate records that held values historically."""
        # Order was confirmed in history, should match
        query_match = "SELECT display_id FROM Order WHERE order_status WAS EVER 'confirmed'"
        qs, _ = AZQLCompiler.compile(query_match)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['display_id'], self.order.display_id)
        
        # Order was never cancelled in history, should NOT match
        query_no_match = "SELECT display_id FROM Order WHERE order_status WAS EVER 'cancelled'"
        qs_empty, _ = AZQLCompiler.compile(query_no_match)
        self.assertEqual(qs_empty.count(), 0)

    def test_rich_conditional_aggregates(self):
        """Verify SUM_OWED and SUM_DELIVERED subqueries compile correctly."""
        # Out of 5 ordered, 3 were delivered -> owed = 2
        query = (
            "SELECT name, "
            "SUM_OWED(order_items WHERE order__order_status = 'completed') AS owed_qty, "
            "SUM_DELIVERED(order_items__delivery_items WHERE order_item__order__order_status = 'completed') AS delivered_qty "
            "FROM Product WHERE name = 'A4 Paper'"
        )
        qs, columns = AZQLCompiler.compile(query)
        
        self.assertIn('owed_qty', columns)
        self.assertIn('delivered_qty', columns)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['owed_qty'], 2)
        self.assertEqual(qs[0]['delivered_qty'], 3)

    def test_visual_query_compiler(self):
        """Verify the visual query builder AST parses correctly."""
        ast = {
            "combinator": "and",
            "rules": [
                {"field": "name", "operator": "=", "value": "A4 Paper"},
                {"field": "physical_stock", "operator": ">=", "value": 50}
            ]
        }
        qs, cols = VisualCompiler.compile("product", ast, ["name", "selling_price"])
        self.assertEqual(cols, ["name", "selling_price"])
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['name'], "A4 Paper")


    def test_dynamic_relation_traversal(self):
        """Verify dynamic traversal of whitelisted relation paths works and unauthorized relations fail."""
        # Valid traversal 1: OrderItem -> Order -> Customer -> First Name
        query = "SELECT order__customer__first_name, product__name FROM OrderItem"
        qs, columns = AZQLCompiler.compile(query)
        self.assertEqual(columns, ['order__customer__first_name', 'product__name'])
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['order__customer__first_name'], "Alpesh")
        self.assertEqual(qs[0]['product__name'], "A4 Paper")

        # Valid traversal 2: Product -> Category -> Name
        query = "SELECT product__category__name FROM OrderItem"
        qs, columns = AZQLCompiler.compile(query)
        self.assertEqual(columns, ['product__category__name'])
        self.assertEqual(qs[0]['product__category__name'], "Stationery")

        # 3-4 Table Traversal 1: OrderItem -> Order -> Customer -> LegacyDebt
        from customers.models import LegacyDebt, Wallet
        LegacyDebt.objects.create(customer=self.customer, principal_amount=Decimal('1000.00'), recovered_amount=Decimal('200.00'))
        query = "SELECT order__customer__legacy_debt__principal_amount FROM OrderItem"
        qs, columns = AZQLCompiler.compile(query)
        self.assertEqual(columns, ['order__customer__legacy_debt__principal_amount'])
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['order__customer__legacy_debt__principal_amount'], Decimal('1000.00'))

        # 3-4 Table Traversal 2: Payment -> Order -> Customer -> Wallet
        from orders.models import Payment
        # Make sure wallet exists
        wallet, _ = Wallet.objects.get_or_create(customer=self.customer, defaults={'balance': Decimal('150.00')})
        payment = Payment.objects.create(order=self.order, amount=Decimal('250.00'), method='cash')
        query = "SELECT amount, order__customer__wallet__balance FROM Payment"
        qs, columns = AZQLCompiler.compile(query)
        self.assertEqual(columns, ['amount', 'order__customer__wallet__balance'])
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs[0]['order__customer__wallet__balance'], Decimal('150.00'))

        # Invalid lookup step: OrderItem -> non-relation text field -> non-existent step
        query = "SELECT quantity__non_relation__field FROM OrderItem"
        with self.assertRaises(ValidationError):
            AZQLCompiler.compile(query)

        # Unauthorized related model (User is not whitelisted in SCHEMA_WHITELIST for normal joins)
        # Order -> User (created_by is not whitelisted for Order joins)
        query = "SELECT customer__first_name, order__created_by__username FROM OrderItem"
        with self.assertRaises(ValidationError):
            AZQLCompiler.compile(query)


from rest_framework.test import APITestCase
from settings_app.models import Role, Permission, RolePermission, UserRole
from reports.models import SavedQuery

class AZQLAPIViewSetTestCase(APITestCase):
    
    def setUp(self):
        # Setup roles and permissions
        self.manager_role = Role.objects.create(name="Manager", description="Manager")
        self.staff_role = Role.objects.create(name="Staff", description="Staff")
        
        self.perm, _ = Permission.objects.get_or_create(
            codename="reports.manage_queries",
            defaults={"name": "Access Visual Query Builder & AZQL Editor", "category": "reports"}
        )
        
        # Link permission to Manager
        RolePermission.objects.create(role=self.manager_role, permission=self.perm)
        
        # Create users
        self.manager_user = User.objects.create_user(
            username='manager_api_test',
            email='manager_api_test@example.com',
            password='testpassword'
        )
        UserRole.objects.create(user=self.manager_user, role=self.manager_role)
        
        self.staff_user = User.objects.create_user(
            username='staff_api_test',
            email='staff_api_test@example.com',
            password='testpassword'
        )
        UserRole.objects.create(user=self.staff_user, role=self.staff_role)

        # Create category and product for queries
        self.category = Category.objects.create(name="Stationery")
        self.product = Product.objects.create(
            name="A4 Paper",
            category=self.category,
            selling_price=Decimal('50.00'),
            cost_price=Decimal('30.00'),
            physical_stock=100,
            stock_quantity=100
        )
        
    def test_schema_endpoint_access(self):
        # Manager should access schema
        self.client.force_authenticate(user=self.manager_user)
        response = self.client.get('/api/reports/queries/schema/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('entities', response.data)
        self.assertIn('order', response.data['entities'])
        self.assertIn('operators', response.data)
        
        # Staff should be forbidden
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/reports/queries/schema/')
        self.assertEqual(response.status_code, 403)
        
    def test_run_azql_query(self):
        self.client.force_authenticate(user=self.manager_user)
        payload = {
            "query_type": "azql",
            "azql_text": "SELECT name, selling_price FROM Product WHERE physical_stock > 50"
        }
        response = self.client.post('/api/reports/queries/run/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)
        self.assertIn('columns', response.data)
        self.assertEqual(response.data['columns'], ['name', 'selling_price'])
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], 'A4 Paper')
        
    def test_run_visual_query(self):
        self.client.force_authenticate(user=self.manager_user)
        payload = {
            "query_type": "visual",
            "entity": "product",
            "rules": {
                "combinator": "and",
                "rules": [
                    {"field": "name", "operator": "=", "value": "A4 Paper"}
                ]
            },
            "columns": ["name", "cost_price"]
        }
        response = self.client.post('/api/reports/queries/run/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)
        self.assertEqual(response.data['columns'], ['name', 'cost_price'])
        self.assertEqual(len(response.data['results']), 1)
        
    def test_saved_query_crud_and_ownership(self):
        # Create saved query by manager
        self.client.force_authenticate(user=self.manager_user)
        payload = {
            "name": "My Prod Query",
            "entity": "product",
            "query_type": "azql",
            "azql_text": "SELECT name FROM Product",
            "columns": ["name"],
            "is_shared": False
        }
        response = self.client.post('/api/reports/queries/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        query_id = response.data['id']
        
        # Another manager with reports.manage_queries should see it if shared or not?
        # Since it's is_shared=False and created_by is manager_user, another manager should NOT see it or edit it
        other_manager = User.objects.create_user(
            username='other_manager',
            email='other_mgr@example.com',
            password='testpassword'
        )
        UserRole.objects.create(user=other_manager, role=self.manager_role)
        
        self.client.force_authenticate(user=other_manager)
        response = self.client.get(f'/api/reports/queries/{query_id}/')
        self.assertEqual(response.status_code, 404) # Not found because filtered out in get_queryset
        
        # Try to patch it
        response = self.client.patch(f'/api/reports/queries/{query_id}/', {"name": "Hacked Name"}, format='json')
        self.assertEqual(response.status_code, 404)
        
        # Creator manager can edit
        self.client.force_authenticate(user=self.manager_user)
        response = self.client.patch(f'/api/reports/queries/{query_id}/', {"name": "New Name"}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], "New Name")

    def test_query_state_history_retention_and_api(self):
        """Verify QueryStateHistory API endpoints and the safe-point retention pruning logic."""
        from reports.models import QueryStateHistory
        
        # 1. Access tests
        # Staff user should be forbidden (403)
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/reports/queries-history/')
        self.assertEqual(response.status_code, 403)
        
        # Manager user should be allowed (200)
        self.client.force_authenticate(user=self.manager_user)
        response = self.client.get('/api/reports/queries-history/')
        self.assertEqual(response.status_code, 200)
        
        # 2. Pruning & Retention rules logic
        # Create some safe points (is_safe=True)
        # We will create 6 safe points, with distinct timestamps by sleeping a tiny bit or relying on loop
        safe_points = []
        for i in range(6):
            sp = QueryStateHistory.objects.create(
                user=self.manager_user,
                name=f"Safe {i}",
                entity="product",
                query_type="visual",
                is_safe=True
            )
            safe_points.append(sp)
            time.sleep(0.002) # Ensure ordering is chronological
            
        # Create 14 unsafe points (is_safe=False)
        unsafe_points = []
        for i in range(14):
            usp = QueryStateHistory.objects.create(
                user=self.manager_user,
                name=f"Unsafe {i}",
                entity="product",
                query_type="visual",
                is_safe=False
            )
            unsafe_points.append(usp)
            time.sleep(0.002)
            
        # Total created = 20. But after pruning, total records in DB for this user must be capped at 15.
        manager_history = QueryStateHistory.objects.filter(user=self.manager_user)
        self.assertEqual(manager_history.count(), 15)
        
        # Verify that the last 5 safe points (newest) are PROTECTED and not deleted
        # The newest 5 safe points are Safe 1, Safe 2, Safe 3, Safe 4, Safe 5
        # The oldest safe point (Safe 0) is eligible for deletion. Let's assert Safe 1-5 exist in DB.
        for i in range(1, 6):
            self.assertTrue(QueryStateHistory.objects.filter(id=safe_points[i].id).exists())
            
        # Verify that other users cannot see manager's history
        other_manager = User.objects.create_user(
            username='history_other_manager',
            email='history_other_mgr@example.com',
            password='testpassword'
        )
        UserRole.objects.create(user=other_manager, role=self.manager_role)
        self.client.force_authenticate(user=other_manager)
        response = self.client.get('/api/reports/queries-history/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results'] if 'results' in response.data else response.data), 0)

    def test_dynamic_schema_endpoint(self):
        """Verify that the schema metadata endpoint returns dynamic relation traversals."""
        self.client.force_authenticate(user=self.manager_user)
        response = self.client.get('/api/reports/queries/schema/')
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertIn('entities', data)
        self.assertIn('order', data['entities'])
        
        # Verify customer relation fields are included in order entity schema
        fields = data['entities']['order']['fields']
        field_names = [f['name'] for f in fields]
        
        self.assertIn('customer__first_name', field_names)
        self.assertIn('customer__last_name', field_names)
        self.assertIn('customer__wallet__balance', field_names)
        
        # Find customer__first_name and check label
        fn_field = next(f for f in fields if f['name'] == 'customer__first_name')
        self.assertEqual(fn_field['label'], "Customer : First Name")

    def test_reverse_relation_query_deduplication(self):
        """Verify that reverse relation queries compile successfully and distinct() prevents duplication."""
        self.client.force_authenticate(user=self.manager_user)
        
        # Create a customer
        customer = Customer.objects.create(
            first_name="Alpesh",
            last_name="Patel",
            phone="9988776655"
        )
        
        # Create 2 separate orders for this customer containing the same product
        for i in range(2):
            order = Order.objects.create(
                customer=customer,
                subtotal=Decimal('50.00'),
                total=Decimal('50.00'),
                order_status='draft'
            )
            OrderItem.objects.create(
                order=order,
                product=self.product,
                quantity=1,
                unit_price=Decimal('50.00'),
                line_total=Decimal('50.00')
            )
            
        # Run query: Customers that ordered "A4 Paper"
        payload = {
            "query_type": "azql",
            "azql_text": "SELECT first_name FROM Customer WHERE orders__items__product__name = 'A4 Paper'"
        }
        response = self.client.post('/api/reports/queries/run/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        
        # Assert that we get exactly 1 result due to distinct() deduplication, instead of 2 results
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['first_name'], 'Alpesh')

    def test_schema_endpoint_includes_reverse_relations(self):
        """Verify that the schema metadata endpoint includes reverse one-to-many relationships at depth 3."""
        self.client.force_authenticate(user=self.manager_user)
        response = self.client.get('/api/reports/queries/schema/')
        self.assertEqual(response.status_code, 200)
        
        # Verify that customer entity fields list includes deep reverse relation
        customer_fields = response.data['entities']['customer']['fields']
        field_names = [f['name'] for f in customer_fields]
        self.assertIn('orders__items__product__name', field_names)

    def test_reverse_relation_sibling_and_conditions(self):
        """Verify that multiple logical AND conditions on a reverse relation are compiled into independent Exists subqueries."""
        self.client.force_authenticate(user=self.manager_user)
        
        # Create second product
        pencil = Product.objects.create(
            name="Pencil",
            category=self.category,
            selling_price=Decimal('10.00'),
            cost_price=Decimal('5.00'),
            physical_stock=200,
            stock_quantity=200
        )
        
        # Customer 1 (Alpesh): Ordered BOTH A4 Paper and Pencil
        alpesh = Customer.objects.create(first_name="Alpesh", last_name="Patel", phone="9988776655")
        
        order_1 = Order.objects.create(customer=alpesh, total=Decimal('50.00'), order_status='draft')
        OrderItem.objects.create(order=order_1, product=self.product, quantity=1, unit_price=Decimal('50.00'), line_total=Decimal('50.00')) # A4 Paper
        
        order_2 = Order.objects.create(customer=alpesh, total=Decimal('10.00'), order_status='draft')
        OrderItem.objects.create(order=order_2, product=pencil, quantity=1, unit_price=Decimal('10.00'), line_total=Decimal('10.00')) # Pencil
        
        # Customer 2 (Bhavesh): Ordered ONLY A4 Paper
        bhavesh = Customer.objects.create(first_name="Bhavesh", last_name="Shah", phone="8877665544")
        order_3 = Order.objects.create(customer=bhavesh, total=Decimal('50.00'), order_status='draft')
        OrderItem.objects.create(order=order_3, product=self.product, quantity=1, unit_price=Decimal('50.00'), line_total=Decimal('50.00')) # A4 Paper
        
        # Run query: Customers that ordered BOTH "A4 Paper" AND "Pencil"
        payload = {
            "query_type": "azql",
            "azql_text": "SELECT first_name FROM Customer WHERE orders__items__product__name = 'A4 Paper' AND orders__items__product__name = 'Pencil'"
        }
        response = self.client.post('/api/reports/queries/run/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        
        # Verify result contains exactly 1 customer (Alpesh) and NOT Bhavesh
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['first_name'], 'Alpesh')




