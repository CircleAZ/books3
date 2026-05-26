from django.test import TestCase
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from orders.models import Order, OrderItem, Delivery, DeliveryItem
from customers.models import Customer
from inventory.models import Product
from orders.serializers import OrderCreateSerializer

class OrderEditTestCase(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='testuser', email='test@example.com', password='password')
        self.customer = Customer.objects.create(first_name='John', phone='1234567890', created_by=self.user)
        self.product_a = Product.objects.create(
            name='Product A',
            cost_price=Decimal('50.00'),
            selling_price=Decimal('100.00'),
            stock_quantity=50
        )
        self.product_b = Product.objects.create(
            name='Product B',
            cost_price=Decimal('30.00'),
            selling_price=Decimal('60.00'),
            stock_quantity=100
        )

    def test_edit_pending_order_success(self):
        # Create a pending order
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            delivery_status='pending',
            created_by=self.user
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=10,
            unit_price=Decimal('100.00'),
            discount_type='fixed',
            discount_value=Decimal('5.00')
        )
        order.calculate_totals()

        # Update order: modify quantity of product A, add product B
        data = {
            'customer': str(self.customer.id),
            'discount_type': 'percent',
            'discount_value': '10.00',
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 15,
                    'unit_price': '100.00',
                    'discount_type': 'fixed',
                    'discount_value': '5.00'
                },
                {
                    'product': str(self.product_b.id),
                    'quantity': 5,
                    'unit_price': '60.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        
        serializer = OrderCreateSerializer(instance=order, data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_order = serializer.save()

        # Assert totals recalculations and items modifications
        self.assertEqual(updated_order.items.count(), 2)
        item_a = updated_order.items.get(product=self.product_a)
        self.assertEqual(item_a.quantity, 15)
        item_b = updated_order.items.get(product=self.product_b)
        self.assertEqual(item_b.quantity, 5)

    def test_edit_partially_delivered_order_success(self):
        # Create an order
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            delivery_status='pending',
            created_by=self.user
        )
        item_a = OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=10,
            unit_price=Decimal('100.00'),
            confirmed_quantity=10
        )
        order.calculate_totals()

        # Create a delivery for item A (4 units)
        delivery = Delivery.objects.create(order=order, delivered_by=self.user)
        DeliveryItem.objects.create(delivery=delivery, order_item=item_a, quantity=4)
        order.update_delivery_status()
        self.assertEqual(order.delivery_status, 'partial')

        # Edit order: increase quantity of product A to 12, add new product B
        data = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 12, # increased from 10
                    'unit_price': '100.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                },
                {
                    'product': str(self.product_b.id),
                    'quantity': 5, # new item
                    'unit_price': '60.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }

        serializer = OrderCreateSerializer(instance=order, data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_order = serializer.save()

        # Assertions
        self.assertEqual(updated_order.items.count(), 2)
        updated_item_a = updated_order.items.get(product=self.product_a)
        self.assertEqual(updated_item_a.quantity, 12)
        self.assertEqual(updated_item_a.confirmed_quantity, 12)
        self.assertEqual(updated_item_a.delivered_quantity, 4)

    def test_edit_partially_delivered_order_failures(self):
        # Create an order
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            delivery_status='pending',
            created_by=self.user
        )
        item_a = OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=10,
            unit_price=Decimal('100.00'),
            confirmed_quantity=10
        )
        order.calculate_totals()

        # Deliver 4 units
        delivery = Delivery.objects.create(order=order, delivered_by=self.user)
        DeliveryItem.objects.create(delivery=delivery, order_item=item_a, quantity=4)
        order.update_delivery_status()

        # Fail Case 1: Decreasing quantity below delivered quantity (3 < 4)
        data_less_qty = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 3, # less than 4 delivered
                    'unit_price': '100.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        serializer = OrderCreateSerializer(instance=order, data=data_less_qty)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(DRFValidationError) as ctx:
            serializer.save()
        self.assertIn("cannot be less than delivered quantity", str(ctx.exception))

        # Fail Case 2: Changing price of delivered product
        data_diff_price = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 10,
                    'unit_price': '110.00', # changed from 100
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        serializer = OrderCreateSerializer(instance=order, data=data_diff_price)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(DRFValidationError) as ctx:
            serializer.save()
        self.assertIn("cannot be modified because it has already been partially delivered", str(ctx.exception))

        # Fail Case 3: Removing delivered product entirely from payload
        data_removed = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_b.id),
                    'quantity': 5,
                    'unit_price': '60.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        serializer = OrderCreateSerializer(instance=order, data=data_removed)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(DRFValidationError) as ctx:
            serializer.save()
        self.assertIn("Cannot remove product", str(ctx.exception))
