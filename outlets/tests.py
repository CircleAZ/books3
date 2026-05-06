from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from decimal import Decimal

from inventory.models import Product, Category
from finance.models import BankAccount
from outlets.models import (
    Outlet, OutletStock, OutletStockTransfer, OutletDailySale,
    OutletDailySaleItem, OutletPayment, OutletProductCommission
)

User = get_user_model()


class CommissionSystemTests(APITestCase):
    """Brutal test suite for the Two-Tier Per-Product Commission System."""

    def setUp(self):
        self.user = User.objects.create_superuser('admin_test', 'admin@example.com', 'pass123')
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(name='Test Category')

        # Product A: 20% global default commission
        self.product_a = Product.objects.create(
            name='Product A', category=self.category,
            cost_price=Decimal('50.00'), selling_price=Decimal('100.00'),
            stock_quantity=500, physical_stock=500,
            default_commission_value=Decimal('20.00')
        )
        # Product B: 5% global default commission
        self.product_b = Product.objects.create(
            name='Product B', category=self.category,
            cost_price=Decimal('80.00'), selling_price=Decimal('200.00'),
            stock_quantity=500, physical_stock=500,
            default_commission_value=Decimal('5.00')
        )
        # Product C: 0% commission (no commission)
        self.product_c = Product.objects.create(
            name='Product C', category=self.category,
            cost_price=Decimal('10.00'), selling_price=Decimal('50.00'),
            stock_quantity=500, physical_stock=500,
            default_commission_value=Decimal('0.00')
        )

        self.bank_account = BankAccount.objects.create(
            name='Test Bank', account_type='current', current_balance=Decimal('0.00')
        )

        self.outlet_a = Outlet.objects.create(name='Shop Alpha', is_active=True)
        self.outlet_b = Outlet.objects.create(name='Shop Beta', is_active=True)

        # Seed outlet stock
        for outlet in [self.outlet_a, self.outlet_b]:
            for product in [self.product_a, self.product_b, self.product_c]:
                OutletStock.objects.create(outlet=outlet, product=product, quantity=100)

    # ── 1. MODEL LAYER TESTS ──────────────────────────────────────────

    def test_outlet_no_commission_field(self):
        """Legacy commission_value field must be completely gone from Outlet."""
        self.assertFalse(hasattr(Outlet, 'commission_value') and
                         isinstance(Outlet.commission_value, property) is False)

    def test_product_default_commission_value_exists(self):
        self.assertEqual(self.product_a.default_commission_value, Decimal('20.00'))
        self.assertEqual(self.product_c.default_commission_value, Decimal('0.00'))

    def test_outlet_product_commission_unique_constraint(self):
        """Duplicate (outlet, product) pair must be rejected."""
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('15.00')
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            OutletProductCommission.objects.create(
                outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('25.00')
            )

    # ── 2. COMMISSION RESOLUTION HIERARCHY ─────────────────────────────

    def test_resolve_falls_back_to_global_default(self):
        """No override → must use Product.default_commission_value."""
        rate = OutletDailySaleItem.resolve_commission_rate(self.outlet_a, self.product_a)
        self.assertEqual(rate, Decimal('20.00'))

    def test_resolve_uses_outlet_override(self):
        """Override exists → must use OutletProductCommission rate."""
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('15.00')
        )
        rate = OutletDailySaleItem.resolve_commission_rate(self.outlet_a, self.product_a)
        self.assertEqual(rate, Decimal('15.00'))

    def test_resolve_override_is_outlet_specific(self):
        """Override on Shop Alpha must NOT affect Shop Beta."""
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('15.00')
        )
        rate_a = OutletDailySaleItem.resolve_commission_rate(self.outlet_a, self.product_a)
        rate_b = OutletDailySaleItem.resolve_commission_rate(self.outlet_b, self.product_a)
        self.assertEqual(rate_a, Decimal('15.00'))
        self.assertEqual(rate_b, Decimal('20.00'))  # Global default

    def test_resolve_zero_commission(self):
        """Product C has 0% default. No override. Rate must be 0."""
        rate = OutletDailySaleItem.resolve_commission_rate(self.outlet_a, self.product_c)
        self.assertEqual(rate, Decimal('0.00'))

    # ── 3. SALE FINANCIAL CALCULATIONS ─────────────────────────────────

    def _create_sale_direct(self, outlet, items_spec):
        """Helper: create sale + items at model layer. items_spec = [(product, qty), ...]"""
        sale = OutletDailySale.objects.create(outlet=outlet, recorded_by=self.user)
        for product, qty in items_spec:
            OutletDailySaleItem.objects.create(sale=sale, product=product, quantity=qty)
        sale.refresh_from_db()
        return sale

    def test_single_product_sale_global_default(self):
        """10 x Product A @ ₹100, 20% commission → Gross=1000, Comm=200, Net=800."""
        sale = self._create_sale_direct(self.outlet_a, [(self.product_a, 10)])
        self.assertEqual(sale.gross_total, Decimal('1000.00'))
        self.assertEqual(sale.commission_amount, Decimal('200.00'))
        self.assertEqual(sale.net_total, Decimal('800.00'))

    def test_multi_product_sale_different_rates(self):
        """Mixed sale: Product A (20%) + Product B (5%) + Product C (0%)."""
        sale = self._create_sale_direct(self.outlet_a, [
            (self.product_a, 5),   # 5*100=500, comm=100
            (self.product_b, 3),   # 3*200=600, comm=30
            (self.product_c, 10),  # 10*50=500, comm=0
        ])
        self.assertEqual(sale.gross_total, Decimal('1600.00'))
        self.assertEqual(sale.commission_amount, Decimal('130.00'))
        self.assertEqual(sale.net_total, Decimal('1470.00'))

    def test_sale_with_outlet_override(self):
        """Shop Alpha overrides Product A to 15%. Product B stays at global 5%."""
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('15.00')
        )
        sale = self._create_sale_direct(self.outlet_a, [
            (self.product_a, 10),  # 10*100=1000, comm=150 (15%)
            (self.product_b, 5),   # 5*200=1000, comm=50 (5%)
        ])
        self.assertEqual(sale.gross_total, Decimal('2000.00'))
        self.assertEqual(sale.commission_amount, Decimal('200.00'))
        self.assertEqual(sale.net_total, Decimal('1800.00'))

    def test_commission_frozen_at_sale_time(self):
        """Commission must be frozen. Changing the override AFTER sale must NOT affect old records."""
        sale = self._create_sale_direct(self.outlet_a, [(self.product_a, 10)])
        original_commission = sale.commission_amount  # 200.00 (20%)

        # Now create an override changing to 50%
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('50.00')
        )
        sale.refresh_from_db()
        self.assertEqual(sale.commission_amount, original_commission)  # Must NOT change

    def test_zero_commission_sale(self):
        """Product C has 0%. Commission amount must be exactly 0."""
        sale = self._create_sale_direct(self.outlet_a, [(self.product_c, 20)])
        self.assertEqual(sale.gross_total, Decimal('1000.00'))
        self.assertEqual(sale.commission_amount, Decimal('0.00'))
        self.assertEqual(sale.net_total, Decimal('1000.00'))

    def test_line_item_commission_fields_frozen(self):
        """Individual line items must carry the frozen commission_value and commission_amount."""
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_b, commission_value=Decimal('12.50')
        )
        sale = self._create_sale_direct(self.outlet_a, [(self.product_b, 4)])
        item = sale.items.first()
        self.assertEqual(item.commission_value, Decimal('12.50'))
        # 4 * 200 = 800, 12.5% of 800 = 100
        self.assertEqual(item.commission_amount, Decimal('100.00'))
        self.assertEqual(item.unit_price, Decimal('200.00'))

    # ── 4. OUTLET STOCK DEDUCTION ──────────────────────────────────────

    def test_stock_deducted_on_sale(self):
        """Selling 10 units must deduct exactly 10 from OutletStock."""
        self._create_sale_direct(self.outlet_a, [(self.product_a, 10)])
        os = OutletStock.objects.get(outlet=self.outlet_a, product=self.product_a)
        self.assertEqual(os.quantity, 90)

    def test_overselling_raises_error(self):
        """Selling more than available stock must raise ValueError."""
        with self.assertRaises(ValueError):
            self._create_sale_direct(self.outlet_a, [(self.product_a, 999)])

    def test_selling_nonexistent_stock_raises_error(self):
        """Selling a product with no OutletStock record must raise ValueError."""
        new_product = Product.objects.create(
            name='Ghost Product', category=self.category,
            cost_price=Decimal('10.00'), selling_price=Decimal('20.00'),
            stock_quantity=100, physical_stock=100,
            default_commission_value=Decimal('10.00')
        )
        with self.assertRaises(ValueError):
            self._create_sale_direct(self.outlet_a, [(new_product, 1)])

    # ── 5. OUTLET FINANCIAL PROPERTIES ─────────────────────────────────

    def test_outstanding_balance_calculation(self):
        """Balance = Net Sales - Payments."""
        self._create_sale_direct(self.outlet_a, [(self.product_a, 10)])  # Net=800
        OutletPayment.objects.create(
            outlet=self.outlet_a, amount=Decimal('300.00'),
            payment_method='cash', recorded_by=self.user
        )
        self.outlet_a.refresh_from_db()
        self.assertEqual(self.outlet_a.outstanding_balance, Decimal('500.00'))

    # ── 6. API LAYER TESTS ─────────────────────────────────────────────

    def test_api_outlet_create_no_commission_field(self):
        """Creating an outlet via API must work without commission_value."""
        resp = self.client.post('/api/outlets/outlets/', {'name': 'New Shop', 'is_active': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('commission_value', resp.data)

    def test_api_commission_crud(self):
        """Full CRUD cycle for OutletProductCommission via API."""
        # CREATE
        resp = self.client.post('/api/outlets/commissions/', {
            'outlet': str(self.outlet_a.id), 'product': str(self.product_a.id),
            'commission_value': '18.00'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        comm_id = resp.data['id']

        # READ
        resp = self.client.get(f'/api/outlets/commissions/{comm_id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['commission_value'], '18.00')
        self.assertEqual(resp.data['product_name'], 'Product A')
        self.assertEqual(resp.data['default_commission_value'], '20.00')

        # UPDATE
        resp = self.client.patch(f'/api/outlets/commissions/{comm_id}/', {
            'commission_value': '22.00'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # DELETE
        resp = self.client.delete(f'/api/outlets/commissions/{comm_id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_api_commission_bulk_upsert(self):
        """Bulk upsert must create and update commission overrides atomically."""
        payload = [
            {'outlet': str(self.outlet_a.id), 'product': str(self.product_a.id), 'commission_value': '11.00'},
            {'outlet': str(self.outlet_a.id), 'product': str(self.product_b.id), 'commission_value': '7.50'},
        ]
        resp = self.client.post('/api/outlets/commissions/bulk_upsert/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)
        self.assertTrue(resp.data[0]['created'])

        # Update existing
        payload[0]['commission_value'] = '13.00'
        resp = self.client.post('/api/outlets/commissions/bulk_upsert/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data[0]['created'])  # Updated, not created
        self.assertEqual(resp.data[0]['commission_value'], '13.00')

    def test_api_commission_filter_by_outlet(self):
        """Filtering commissions by outlet must return only that outlet's overrides."""
        OutletProductCommission.objects.create(
            outlet=self.outlet_a, product=self.product_a, commission_value=Decimal('15.00')
        )
        OutletProductCommission.objects.create(
            outlet=self.outlet_b, product=self.product_a, commission_value=Decimal('25.00')
        )
        resp = self.client.get(f'/api/outlets/commissions/?outlet={self.outlet_a.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['commission_value'], '15.00')

    def test_api_sale_returns_commission_fields(self):
        """Sale items in API response must include frozen commission data."""
        sale = self._create_sale_direct(self.outlet_a, [(self.product_a, 5)])
        resp = self.client.get(f'/api/outlets/sales/{sale.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item = resp.data['items'][0]
        self.assertIn('commission_value', item)
        self.assertIn('commission_amount', item)
        self.assertEqual(item['commission_value'], '20.00')

    def test_api_product_includes_default_commission_value(self):
        """Product list API must return default_commission_value field."""
        resp = self.client.get('/api/inventory/products/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        products = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        product_data = next(p for p in products if p['id'] == str(self.product_a.id))
        self.assertIn('default_commission_value', product_data)
        self.assertEqual(product_data['default_commission_value'], '20.00')

    # ── 7. TRANSFER + SALE INTEGRATION ─────────────────────────────────

    def test_transfer_dispatch_then_sell(self):
        """Full lifecycle: Transfer stock to outlet → Sell with commission → Verify balances."""
        # Create a fresh outlet with no stock
        outlet_c = Outlet.objects.create(name='Shop Gamma', is_active=True)

        # Transfer via API
        resp = self.client.post('/api/outlets/transfers/', {
            'outlet': str(outlet_c.id), 'status': 'draft',
            'items': [{'product': str(self.product_a.id), 'quantity': 30}]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        tid = resp.data['id']

        resp = self.client.post(f'/api/outlets/transfers/{tid}/dispatch_transfer/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Now sell 10 units
        sale = OutletDailySale.objects.create(outlet=outlet_c, recorded_by=self.user)
        OutletDailySaleItem.objects.create(sale=sale, product=self.product_a, quantity=10)
        sale.refresh_from_db()

        self.assertEqual(sale.gross_total, Decimal('1000.00'))
        self.assertEqual(sale.commission_amount, Decimal('200.00'))

        os = OutletStock.objects.get(outlet=outlet_c, product=self.product_a)
        self.assertEqual(os.quantity, 20)

    # ── 8. SOFT DELETE VOID PROTOCOL ───────────────────────────────────

    def test_soft_delete_restores_stock_and_recalculates(self):
        """Voiding a sale item must restore outlet stock and recalculate parent totals."""
        sale = self._create_sale_direct(self.outlet_a, [
            (self.product_a, 10),  # comm=200
            (self.product_b, 5),   # comm=50
        ])
        self.assertEqual(sale.commission_amount, Decimal('250.00'))

        # Void first item
        item = sale.items.filter(product=self.product_a).first()
        item.soft_delete()

        sale.refresh_from_db()
        # Only Product B remains: 5*200=1000, comm=50
        self.assertEqual(sale.gross_total, Decimal('1000.00'))
        self.assertEqual(sale.commission_amount, Decimal('50.00'))
        self.assertEqual(sale.net_total, Decimal('950.00'))

        # Stock restored
        os = OutletStock.objects.get(outlet=self.outlet_a, product=self.product_a)
        self.assertEqual(os.quantity, 100)  # Restored to original
