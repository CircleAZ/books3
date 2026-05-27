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

    def test_payment_edit_correction_under_deficit(self):
        """Test that editing a payment downwards corrects status and ledger, allowing overdraft for typos."""
        from finance.models import CashWallet
        from orders.models import Payment
        from rest_framework.test import APIClient
        
        self.user.is_superuser = True
        self.user.save()
        
        # Setup a cash wallet with some initial balance
        wallet = CashWallet.objects.create(name="POS Till", balance=Decimal("100.00"))
        
        # Create confirmed order of ₹660.00
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            delivery_status='pending',
            created_by=self.user
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=6,
            unit_price=Decimal('110.00')
        )
        order.calculate_totals()
        self.assertEqual(order.total, Decimal('660.00'))
        
        # Record payment of ₹660.00 via views/serializer
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        # Call API to create payment
        payment_data = {
            'order': str(order.id),
            'amount': '660.00',
            'method': 'cash',
            'destination_wallet': str(wallet.id)
        }
        res = client.post('/api/orders/payments/', payment_data, format='json')
        self.assertEqual(res.status_code, 201)
        
        # Verify order status is Paid and wallet balance increased to ₹760
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, Decimal('760.00'))
        
        # Simulate that cash wallet digital balance gets depleted to ₹0 (e.g. spent on salary/expense)
        wallet.balance = Decimal('0.00')
        wallet.save()
        
        # Fetch payment ID
        payment = order.payments.first()
        
        # Now correct the payment from ₹660 to ₹560 (reduction of ₹100)
        # This represents the user correcting a typo
        edit_payload = {
            'payment_id': str(payment.id),
            'amount': '560.00'
        }
        res = client.post(f'/api/orders/orders/{order.id}/edit_payment/', edit_payload, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        
        # Assertions
        order.refresh_from_db()
        # 1. Order payment status must transition to partial
        self.assertEqual(order.payment_status, 'partial')
        # 2. Wallet balance must successfully overdraft by ₹100 to balance the typo correction
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, Decimal('-100.00'))

    def test_payment_deletion_ledger_and_status_sync(self):
        """Test that deleting a payment record reverses the ledger deposit and resets order status."""
        from finance.models import CashWallet
        from orders.models import Payment
        from rest_framework.test import APIClient
        
        self.user.is_superuser = True
        self.user.save()
        
        wallet = CashWallet.objects.create(name="Main Safe", balance=Decimal("200.00"))
        
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            created_by=self.user
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=2,
            unit_price=Decimal('100.00')
        )
        order.calculate_totals()
        
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        # Create ₹200 payment
        payment_data = {
            'order': str(order.id),
            'amount': '200.00',
            'method': 'cash',
            'destination_wallet': str(wallet.id)
        }
        res = client.post('/api/orders/payments/', payment_data, format='json')
        self.assertEqual(res.status_code, 201)
        
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, Decimal('400.00'))
        
        # Delete payment
        payment = order.payments.first()
        res = client.delete(f'/api/orders/payments/{payment.id}/')
        self.assertEqual(res.status_code, 204)
        
        # Assertions
        order.refresh_from_db()
        # 1. Status goes back to pending
        self.assertEqual(order.payment_status, 'pending')
        # 2. Ledger deposit is reversed (balance goes back to ₹200)
        wallet.refresh_from_db()
        self.assertEqual(wallet.balance, Decimal('200.00'))

    def test_item_update_triggers_status_recalculation(self):
        """Test that changing item quantities automatically triggers payment status recalculation."""
        from finance.models import CashWallet
        from rest_framework.test import APIClient
        
        self.user.is_superuser = True
        self.user.save()
        
        wallet = CashWallet.objects.create(name="POS Register", balance=Decimal("100.00"))
        
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            created_by=self.user
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=1,
            unit_price=Decimal('100.00')
        )
        order.calculate_totals()
        
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        # Pay ₹100.00 (Paid status)
        payment_data = {
            'order': str(order.id),
            'amount': '100.00',
            'method': 'cash',
            'destination_wallet': str(wallet.id)
        }
        res = client.post('/api/orders/payments/', payment_data, format='json')
        self.assertEqual(res.status_code, 201)
        
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')
        
        # Now update order items via API to double the quantity (making total ₹200.00)
        update_payload = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 2,
                    'unit_price': '100.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        
        res = client.put(f'/api/orders/orders/{order.id}/', update_payload, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        
        # Assertions
        order.refresh_from_db()
        # 1. Total updated to ₹200.00
        self.assertEqual(order.total, Decimal('200.00'))
        # 2. Payment status automatically updated to partial (since only ₹100 is paid)
        self.assertEqual(order.payment_status, 'partial')

    def test_item_removal_updates_totals_with_prefetch_cache(self):
        """Test that completely removing an item from an order via PUT API correctly updates subtotal/total despite prefetch cache (V-02)."""
        from finance.models import CashWallet
        from rest_framework.test import APIClient
        
        self.user.is_superuser = True
        self.user.save()
        
        wallet = CashWallet.objects.create(name="POS Till", balance=Decimal("500.00"))
        
        # Create confirmed order with two items (product_a = ₹100, product_b = ₹150). Total ₹250.00
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            created_by=self.user
        )
        # Item 1: product_a x 1 (₹100)
        item_a = OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=1,
            unit_price=Decimal('100.00')
        )
        # Item 2: product_b x 1 (₹150). We need to create product_b first.
        from inventory.models import Product
        product_b = Product.objects.create(
            name="Test Book B",
            selling_price=Decimal('150.00'),
            cost_price=Decimal('100.00'),
            stock_quantity=10,
            display_id=2000
        )
        item_b = OrderItem.objects.create(
            order=order,
            product=product_b,
            quantity=1,
            unit_price=Decimal('150.00')
        )
        
        order.calculate_totals()
        self.assertEqual(order.total, Decimal('250.00'))
        
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        # Pay ₹250.00 (Fully Paid)
        payment_data = {
            'order': str(order.id),
            'amount': '250.00',
            'method': 'cash',
            'destination_wallet': str(wallet.id)
        }
        res = client.post('/api/orders/payments/', payment_data, format='json')
        self.assertEqual(res.status_code, 201)
        
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')
        
        # Now update order items via API, completely removing item_b (Product B) and keeping only item_a (Product A)
        update_payload = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 1,
                    'unit_price': '100.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        
        # This PUT request runs OrderViewSet.update which prefetches 'items' and passes it to OrderCreateSerializer.update.
        # It must correctly recalculate the totals to ₹100.00 (since product_b was removed).
        res = client.put(f'/api/orders/orders/{order.id}/', update_payload, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        
        # Assertions
        order.refresh_from_db()
        # 1. Subtotal and total must be updated to ₹100.00 (reflects removal of Product B)
        self.assertEqual(order.subtotal, Decimal('100.00'))
        self.assertEqual(order.total, Decimal('100.00'))
        # 2. Payment status becomes overpaid (paid ₹250 for ₹100 order)
        self.assertEqual(order.payment_status, 'overpaid')

    def test_item_removal_updates_delivery_status_and_overall_status(self):
        """Test that removing undelivered items from a partially delivered order transitions it to delivered and Order Complete (V-03)."""
        from finance.models import CashWallet
        from orders.models import Delivery, DeliveryItem
        from rest_framework.test import APIClient
        
        self.user.is_superuser = True
        self.user.save()
        
        wallet = CashWallet.objects.create(name="POS Till", balance=Decimal("500.00"))
        
        # 1. Create order with two items (product_a x1, product_b x1)
        order = Order.objects.create(
            customer=self.customer,
            order_status='confirmed',
            created_by=self.user
        )
        item_a = OrderItem.objects.create(
            order=order,
            product=self.product_a,
            quantity=1,
            unit_price=Decimal('100.00')
        )
        from inventory.models import Product
        product_b = Product.objects.create(
            name="Test Book B",
            selling_price=Decimal('150.00'),
            cost_price=Decimal('100.00'),
            stock_quantity=10,
            display_id=2000
        )
        item_b = OrderItem.objects.create(
            order=order,
            product=product_b,
            quantity=1,
            unit_price=Decimal('150.00')
        )
        order.calculate_totals()
        
        # 2. Pay 100.00 (Partial Payment initially)
        client = APIClient()
        client.force_authenticate(user=self.user)
        payment_data = {
            'order': str(order.id),
            'amount': '100.00',
            'method': 'cash',
            'destination_wallet': str(wallet.id)
        }
        res = client.post('/api/orders/payments/', payment_data, format='json')
        self.assertEqual(res.status_code, 201)
        
        # 3. Create a partial delivery (delivering only product_a)
        delivery = Delivery.objects.create(
            order=order,
            delivered_by=self.user
        )
        DeliveryItem.objects.create(
            delivery=delivery,
            order_item=item_a,
            quantity=1
        )
        # Trigger save hook to sync delivery status
        delivery.save()
        
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'partial')
        self.assertEqual(order.delivery_status, 'partial')
        self.assertEqual(order.overall_status, 'Partially Delivered')
        
        # 4. Now, PUT an update completely removing product_b from the order
        update_payload = {
            'customer': str(self.customer.id),
            'order_status': 'confirmed',
            'items': [
                {
                    'product': str(self.product_a.id),
                    'quantity': 1,
                    'unit_price': '100.00',
                    'discount_type': '',
                    'discount_value': '0.00'
                }
            ]
        }
        res = client.put(f'/api/orders/orders/{order.id}/', update_payload, format='json')
        self.assertEqual(res.status_code, 200)
        
        # 5. Assertions
        order.refresh_from_db()
        # Subtotal/total are updated
        self.assertEqual(order.total, Decimal('100.00'))
        # Delivery status must transition to 'delivered' since only product_a remains and it is 100% delivered
        self.assertEqual(order.delivery_status, 'delivered')
        # Overall status must instantly transition to 'Order Complete'
        self.assertEqual(order.overall_status, 'Order Complete')


