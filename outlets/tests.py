from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.urls import reverse
from decimal import Decimal

from inventory.models import Product, Category
from finance.models import BankAccount, BankTransaction
from outlets.models import Outlet, OutletStock, OutletStockTransfer, OutletDailySale, OutletPayment

User = get_user_model()

class OutletAPITests(APITestCase):
    def setUp(self):
        # 1. Setup Admin User (Finance & Outlets Permissions)
        self.user = User.objects.create_superuser('admin_test', 'admin@example.com', 'pass123')
        self.client.force_authenticate(user=self.user)

        # 2. Setup Base Inventory
        self.category = Category.objects.create(name='Test Category')
        self.product = Product.objects.create(
            name='Test Book',
            category=self.category,
            cost_price=Decimal('100.00'),
            selling_price=Decimal('200.00'),
            stock_quantity=100,
            physical_stock=100
        )

        # 3. Setup Finance
        self.bank_account = BankAccount.objects.create(
            name='Test Bank',
            account_type='current',
            current_balance=Decimal('0.00')
        )

        # 4. Setup Base Outlet
        self.outlet = Outlet.objects.create(
            name='Beta Wholesale',
            commission_percentage=Decimal('10.00'),
            is_active=True
        )

    def test_outlet_list_and_details(self):
        """Verify the Dashboard API endpoints"""
        response = self.client.get('/api/outlets/outlets/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should return list
        self.assertTrue(len(response.data) > 0)

        response = self.client.get(f'/api/outlets/outlets/{self.outlet.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Beta Wholesale')
        self.assertEqual(response.data['outstanding_balance'], '0.00')

    def test_stock_transfer_lifecycle(self):
        """Verify drafting and dispatching a transfer via API"""
        payload = {
            'outlet': self.outlet.id,
            'status': 'draft',
            'items': [
                {'product': self.product.id, 'quantity': 50}
            ]
        }
        
        # 1. Create Draft
        response = self.client.post('/api/outlets/transfers/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transfer_id = response.data['id']
        
        # 2. Dispatch Transfer
        dispatch_url = f'/api/outlets/transfers/{transfer_id}/dispatch_transfer/'
        dispatch_res = self.client.post(dispatch_url)
        self.assertEqual(dispatch_res.status_code, status.HTTP_200_OK)
        
        # 3. Verify Stock Ledgers
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 50)
        
        outlet_stock = OutletStock.objects.get(outlet=self.outlet, product=self.product)
        self.assertEqual(outlet_stock.quantity, 50)

    def test_daily_sale_and_commission(self):
        """Verify daily sale creation and commission calculation via API"""
        # Manually inject stock for sale test
        OutletStock.objects.create(outlet=self.outlet, product=self.product, quantity=50)
        
        payload = {
            'outlet': self.outlet.id,
            'date': '2026-04-30',
            'items': [
                {'product': self.product.id, 'quantity': 10}
            ]
        }
        
        response = self.client.post('/api/outlets/sales/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        sale_id = response.data['id']
        sale = OutletDailySale.objects.get(id=sale_id)
        
        # Commission is 10%. Gross = 10 * 200 = 2000. Commission = 200. Net = 1800.
        self.assertEqual(sale.gross_total, Decimal('2000.00'))
        self.assertEqual(sale.commission_amount, Decimal('200.00'))
        self.assertEqual(sale.net_total, Decimal('1800.00'))
        
        # Check outlet properties
        self.outlet.refresh_from_db()
        self.assertEqual(self.outlet.total_gross_sales, Decimal('2000.00'))
        self.assertEqual(self.outlet.outstanding_balance, Decimal('1800.00'))

    def test_payment_and_finance_integration(self):
        """Verify outlet payments correctly inject into the core finance ledger via API"""
        payload = {
            'outlet': self.outlet.id,
            'date': '2026-04-30',
            'amount': '1000.00',
            'payment_method': 'bank',
            'destination_bank': self.bank_account.id,
            'reference_id': 'TXN123'
        }
        
        response = self.client.post('/api/outlets/payments/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment_id = response.data['id']
        payment = OutletPayment.objects.get(id=payment_id)
        
        # Verify Bank Transaction was created and linked
        self.assertIsNotNone(payment.bank_transaction)
        self.assertEqual(payment.bank_transaction.amount, Decimal('1000.00'))
        self.assertEqual(payment.bank_transaction.reference, 'TXN123')
        
        # Verify Bank Account Balance
        self.bank_account.refresh_from_db()
        self.assertEqual(self.bank_account.current_balance, Decimal('1000.00'))
        
        # Verify Outlet Outstanding Balance (Assuming 0 net sales initially, balance becomes -1000)
        self.outlet.refresh_from_db()
        self.assertEqual(self.outlet.total_paid, Decimal('1000.00'))
        self.assertEqual(self.outlet.outstanding_balance, Decimal('-1000.00'))

    def test_over_selling_prevention(self):
        """Verify that an outlet cannot sell more stock than it physically has."""
        OutletStock.objects.create(outlet=self.outlet, product=self.product, quantity=5)
        
        payload = {
            'outlet': self.outlet.id,
            'date': '2026-04-30',
            'items': [
                {'product': self.product.id, 'quantity': 10} # Trying to sell 10, only has 5
            ]
        }
        
        # With DRF serializers, custom save() exceptions might return 500 or 400 depending on handling.
        # But our models.py raises ValueError during save(). DRF does not catch ValueError natively unless handled in serializer.
        # Let's ensure the request fails.
        with self.assertRaises(ValueError):
            self.client.post('/api/outlets/sales/', payload, format='json')
