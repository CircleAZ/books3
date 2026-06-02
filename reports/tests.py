from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status
from django.utils import timezone
from datetime import timedelta, date
from decimal import Decimal
from django.db import connection

from customers.models import Customer
from orders.models import Order, OrderItem, Return as OrderReturn, ReturnItem, ReturnReason
from inventory.models import Category, Product
from account.models import User
from reports.views import CustomerReportViewSet, FinanceReportViewSet

class ReportsOptimizationTestCase(TestCase):
    def setUp(self):
        # 1. Hard purge the test database using cascading raw SQL execution to guarantee a 100% clean state
        with connection.cursor() as cursor:
            if connection.vendor == 'sqlite':
                cursor.execute("DELETE FROM orders_returnitem;")
                cursor.execute("DELETE FROM orders_refund;")
                cursor.execute("DELETE FROM orders_payment;")
                cursor.execute("DELETE FROM orders_orderitem;")
                cursor.execute("DELETE FROM orders_order;")
                cursor.execute("DELETE FROM customers_customer;")
                cursor.execute("DELETE FROM inventory_product;")
                cursor.execute("DELETE FROM inventory_category;")
            else:
                cursor.execute("TRUNCATE TABLE orders_returnitem CASCADE;")
                cursor.execute("TRUNCATE TABLE orders_refund CASCADE;")
                cursor.execute("TRUNCATE TABLE orders_payment CASCADE;")
                cursor.execute("TRUNCATE TABLE orders_orderitem CASCADE;")
                cursor.execute("TRUNCATE TABLE orders_order CASCADE;")
                cursor.execute("TRUNCATE TABLE customers_customer CASCADE;")
                cursor.execute("TRUNCATE TABLE inventory_product CASCADE;")
                cursor.execute("TRUNCATE TABLE inventory_category CASCADE;")

        # Create a superuser
        self.user, _ = User.objects.get_or_create(
            username='admin_reports_test',
            defaults={
                'email': 'admin_reports_test@example.com',
                'is_superuser': True,
                'is_staff': True
            }
        )
        self.user.set_password('testpassword')
        self.user.save()

        self.factory = APIRequestFactory()
        
        # Create products and category
        self.category = Category.objects.create(name="ReportsTestCategory")
        self.product = Product.objects.create(
            name="TestProductA",
            category=self.category,
            selling_price=Decimal('1000.00'),
            cost_price=Decimal('400.00')
        )
        
        # Create customers
        # Customer A: Champions segment (3 orders, monetary=6000, last order today)
        self.customer_a = Customer.objects.create(
            first_name="Customer",
            last_name="A",
            phone="1234567890"
        )
        
        # Create orders for Customer A
        for i in range(3):
            order = Order.objects.create(
                customer=self.customer_a,
                subtotal=Decimal('2000.00'),
                discount_amount=Decimal('0.00'),
                total=Decimal('2000.00'),
                order_status='completed'
            )
            OrderItem.objects.create(
                order=order,
                product=self.product,
                quantity=2,
                unit_price=Decimal('1000.00'),
                cost_price=Decimal('400.00'),
                line_total=Decimal('2000.00')
            )

        # Customer B: At Risk segment (1 order, monetary=1000, last order 100 days ago)
        self.customer_b = Customer.objects.create(
            first_name="Customer",
            last_name="B",
            phone="0987654321"
        )
        past_date = timezone.now() - timedelta(days=100)
        order_b = Order.objects.create(
            customer=self.customer_b,
            subtotal=Decimal('1000.00'),
            discount_amount=Decimal('0.00'),
            total=Decimal('1000.00'),
            order_status='completed'
        )
        # Fix created_at auto_now_add bypass using database update
        Order.objects.filter(id=order_b.id).update(created_at=past_date)
        
        OrderItem.objects.create(
            order=order_b,
            product=self.product,
            quantity=1,
            unit_price=Decimal('1000.00'),
            cost_price=Decimal('400.00'),
            line_total=Decimal('1000.00')
        )

        # Set up a Return for Customer A's last order
        last_order = Order.objects.filter(customer=self.customer_a).last()
        self.return_reason = ReturnReason.objects.create(name="Defective")
        
        # Create completed return
        self.order_return = OrderReturn.objects.create(
            order=last_order,
            status='completed'
        )
        self.return_item = ReturnItem.objects.create(
            return_request=self.order_return,
            order_item=last_order.items.first(),
            quantity=1,
            reason=self.return_reason,
            stock_action='return_to_stock'
        )
        
    def test_rfm_endpoint(self):
        """Verify the optimized RFM endpoint returns mathematically correct segment partitions."""
        request = self.factory.get('/api/reports/customers/rfm/')
        force_authenticate(request, user=self.user)
        
        view = CustomerReportViewSet.as_view({'get': 'rfm'})
        response = view(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        print("\n--- DIAGNOSTIC RESPONSE ---")
        print(f"response.data: {response.data}")
        
        # Transform response to a segment mapping dictionary
        segments = {item['segment']: item['count'] for item in response.data}
        print(f"segments dictionary: {segments}")
        
        # Customer A: recency = 0 days, frequency = 3, monetary = 6000 -> Champions
        self.assertEqual(segments['Champions'], 1)
        # Customer B: recency = 100 days, frequency = 1, monetary = 1000 -> At Risk
        self.assertEqual(segments['At Risk'], 1)
        
        print("\nUnit Test: test_rfm_endpoint PASSED.")
        print(f"Segment counts verified: {segments}")

    def test_pnl_endpoint(self):
        """Verify the optimized P&L endpoint calculates Net Sales and COGS exactly."""
        today = date.today()
        start_date = today - timedelta(days=5)
        end_date = today + timedelta(days=5)
        
        request = self.factory.get(
            '/api/reports/finance/pnl/',
            {'start_date': str(start_date), 'end_date': str(end_date)}
        )
        force_authenticate(request, user=self.user)
        
        view = FinanceReportViewSet.as_view({'get': 'pnl'})
        response = view(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Assert math correctness
        revenue = response.data['revenue']
        cogs = response.data['cogs']
        
        # Gross sales in this range: Customer A (2000*3 = 6000)
        # Note: Customer B's order was 100 days ago, out of date range.
        self.assertEqual(Decimal(str(revenue['gross_sales'])), Decimal('6000.00'))
        
        # Completed return: base_refund = (2000/2) * 1 = 1000.
        self.assertEqual(Decimal(str(revenue['returns'])), Decimal('1000.00'))
        self.assertEqual(Decimal(str(revenue['net_sales'])), Decimal('5000.00'))
        
        # Gross COGS: 2 * 3 = 6 items * 400.00 = 2400.00
        self.assertEqual(Decimal(str(cogs['gross'])), Decimal('2400.00'))
        
        # Returned COGS: 1 item * 400.00 = 400.00
        self.assertEqual(Decimal(str(cogs['returns'])), Decimal('400.00'))
        self.assertEqual(Decimal(str(cogs['net'])), Decimal('2000.00'))
        
        print("\nUnit Test: test_pnl_endpoint PASSED.")
        print(f"P&L optimized values verified: Revenue Net Sales={revenue['net_sales']}, COGS Net={cogs['net']}")
