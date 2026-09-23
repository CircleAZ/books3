"""
Unit Tests for Stock History Tokenized Search Filter and Autocomplete Suggestions API.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from inventory.models import Product, Category, StockHistory

User = get_user_model()


class StockHistoryTokenizedSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_admin = User.objects.create_user(
            username='admin_adjuster',
            email='admin_adjuster@example.com',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.user_clerk = User.objects.create_user(
            username='clerk_john',
            email='clerk_john@example.com',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user_admin)

        self.category = Category.objects.create(name='Stationery')
        self.prod_a4 = Product.objects.create(
            name='Classmate A4 Notebook',
            cost_price=Decimal('50.00'),
            selling_price=Decimal('80.00'),
            category=self.category,
            stock_quantity=100
        )
        self.prod_gel = Product.objects.create(
            name='Gel Pen Blue',
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
            category=self.category,
            stock_quantity=200
        )

        # Record 1: Increase (+100), product A4, reason audit_correction, user admin, cost 50.00
        self.hist1 = StockHistory.objects.create(
            product=self.prod_a4,
            quantity_change=100,
            quantity_after=200,
            cost_at_time=Decimal('50.00'),
            reason='audit_correction',
            notes='Adjustment (increase): Annual physical audit found excess',
            created_by=self.user_admin
        )

        # Record 2: Decrease (-15), product A4, reason damage, user clerk, cost 50.00
        self.hist2 = StockHistory.objects.create(
            product=self.prod_a4,
            quantity_change=-15,
            quantity_after=185,
            cost_at_time=Decimal('50.00'),
            reason='damage',
            notes='Adjustment (decrease): Rain water damage in storage room',
            created_by=self.user_clerk
        )

        # Record 3: Decrease (-5), product Gel Pen, reason shrinkage, user clerk, cost 10.00
        self.hist3 = StockHistory.objects.create(
            product=self.prod_gel,
            quantity_change=-5,
            quantity_after=195,
            cost_at_time=Decimal('10.00'),
            reason='shrinkage',
            notes='Adjustment (decrease): Display rack shrinkage',
            created_by=self.user_clerk
        )

        # Record 4: Set (+30 net change), product Gel Pen, reason adjustment, user admin, cost 150.00
        self.hist4 = StockHistory.objects.create(
            product=self.prod_gel,
            quantity_change=30,
            quantity_after=225,
            cost_at_time=Decimal('150.00'),
            reason='adjustment',
            notes='Set Stock: Reset to match supplier inventory recount',
            created_by=self.user_admin
        )

    def test_prefix_product(self):
        """Test product: token."""
        res_a4 = self.client.get('/api/inventory/stock-history/?search=product:"A4"')
        self.assertEqual(res_a4.status_code, status.HTTP_200_OK)
        results = res_a4.data.get('results', res_a4.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertIn(str(self.hist1.id), ids)
        self.assertIn(str(self.hist2.id), ids)

        res_gel = self.client.get('/api/inventory/stock-history/?search=product:Gel')
        results_gel = res_gel.data.get('results', res_gel.data)
        self.assertEqual(len(results_gel), 2)

    def test_prefix_type(self):
        """Test type: token (increase, decrease, set)."""
        res_inc = self.client.get('/api/inventory/stock-history/?search=type:increase')
        self.assertEqual(res_inc.status_code, status.HTTP_200_OK)
        results_inc = res_inc.data.get('results', res_inc.data)
        # hist1 (+100) and hist4 (+30)
        self.assertEqual(len(results_inc), 2)

        res_dec = self.client.get('/api/inventory/stock-history/?search=type:decrease')
        results_dec = res_dec.data.get('results', res_dec.data)
        # hist2 (-15) and hist3 (-5)
        self.assertEqual(len(results_dec), 2)

        res_set = self.client.get('/api/inventory/stock-history/?search=type:set')
        results_set = res_set.data.get('results', res_set.data)
        self.assertEqual(len(results_set), 1)
        self.assertEqual(results_set[0]['id'], str(self.hist4.id))

    def test_prefix_reason(self):
        """Test reason: token (damage, shrinkage, audit_correction)."""
        res_dam = self.client.get('/api/inventory/stock-history/?search=reason:damage')
        self.assertEqual(res_dam.status_code, status.HTTP_200_OK)
        results_dam = res_dam.data.get('results', res_dam.data)
        self.assertEqual(len(results_dam), 1)
        self.assertEqual(results_dam[0]['id'], str(self.hist2.id))

        res_audit = self.client.get('/api/inventory/stock-history/?search=reason:audit_correction')
        results_audit = res_audit.data.get('results', res_audit.data)
        self.assertEqual(len(results_audit), 1)
        self.assertEqual(results_audit[0]['id'], str(self.hist1.id))

    def test_prefix_user(self):
        """Test user: token matching username."""
        res_clerk = self.client.get('/api/inventory/stock-history/?search=user:clerk')
        self.assertEqual(res_clerk.status_code, status.HTTP_200_OK)
        results = res_clerk.data.get('results', res_clerk.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertIn(str(self.hist2.id), ids)
        self.assertIn(str(self.hist3.id), ids)

    def test_prefix_qty(self):
        """Test qty:>50, qty:<0, qty:=-5."""
        res_gt = self.client.get('/api/inventory/stock-history/?search=qty:>50')
        self.assertEqual(res_gt.status_code, status.HTTP_200_OK)
        results_gt = res_gt.data.get('results', res_gt.data)
        self.assertEqual(len(results_gt), 1)
        self.assertEqual(results_gt[0]['id'], str(self.hist1.id))

        res_neg = self.client.get('/api/inventory/stock-history/?search=qty:<0')
        results_neg = res_neg.data.get('results', res_neg.data)
        self.assertEqual(len(results_neg), 2)
        ids = {r['id'] for r in results_neg}
        self.assertIn(str(self.hist2.id), ids)
        self.assertIn(str(self.hist3.id), ids)

        res_exact = self.client.get('/api/inventory/stock-history/?search=qty:=-5')
        results_exact = res_exact.data.get('results', res_exact.data)
        self.assertEqual(len(results_exact), 1)
        self.assertEqual(results_exact[0]['id'], str(self.hist3.id))

    def test_prefix_cost(self):
        """Test cost:>100, cost:<=50."""
        res_cost = self.client.get('/api/inventory/stock-history/?search=cost:>100')
        self.assertEqual(res_cost.status_code, status.HTTP_200_OK)
        results_cost = res_cost.data.get('results', res_cost.data)
        self.assertEqual(len(results_cost), 1)
        self.assertEqual(results_cost[0]['id'], str(self.hist4.id))

    def test_negation(self):
        """Test negation syntax -type:increase."""
        res = self.client.get('/api/inventory/stock-history/?search=-type:increase')
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertIn(str(self.hist2.id), ids)
        self.assertIn(str(self.hist3.id), ids)

    def test_free_text(self):
        """Test free text matches notes, product name, or reason."""
        res_water = self.client.get('/api/inventory/stock-history/?search=Rain')
        results = res_water.data.get('results', res_water.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.hist2.id))

    def test_compound_query(self):
        """Test multi-token compound query."""
        res = self.client.get('/api/inventory/stock-history/?search=product:A4 reason:damage user:clerk')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.hist2.id))

    def test_search_suggestions_endpoint(self):
        """Test cheatsheet and autocomplete suggestions on StockHistoryViewSet."""
        # 1. Cheatsheet schema
        res_schema = self.client.get('/api/inventory/stock-history/search-suggestions/')
        self.assertEqual(res_schema.status_code, status.HTTP_200_OK)
        self.assertIn('prefixes', res_schema.data)
        prefix_keys = [p['prefix'] for p in res_schema.data['prefixes']]
        self.assertIn('product', prefix_keys)
        self.assertIn('reason', prefix_keys)
        self.assertIn('type', prefix_keys)
        self.assertIn('qty', prefix_keys)

        # 2. Reason suggestions with live counts
        res_reason = self.client.get('/api/inventory/stock-history/search-suggestions/?prefix=reason&q=dam')
        self.assertEqual(res_reason.status_code, status.HTTP_200_OK)
        suggs_reason = res_reason.data.get('suggestions', [])
        self.assertTrue(any('damage' in s['value'].lower() for s in suggs_reason))

        # 3. Type suggestions
        res_type = self.client.get('/api/inventory/stock-history/search-suggestions/?prefix=type')
        self.assertEqual(res_type.status_code, status.HTTP_200_OK)
        suggs_type = res_type.data.get('suggestions', [])
        inc_sugg = next((s for s in suggs_type if s['value'] == 'increase'), None)
        self.assertIsNotNone(inc_sugg)
        self.assertEqual(inc_sugg['count'], 2)

        # 4. Product suggestions
        res_prod = self.client.get('/api/inventory/stock-history/search-suggestions/?prefix=product&q=Class')
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        suggs_prod = res_prod.data.get('suggestions', [])
        self.assertTrue(any('Classmate' in s['label'] for s in suggs_prod))

        # 5. User suggestions (with DB query filter)
        res_user = self.client.get('/api/inventory/stock-history/search-suggestions/?prefix=user&q=clerk')
        self.assertEqual(res_user.status_code, status.HTTP_200_OK)
        suggs_user = res_user.data.get('suggestions', [])
        self.assertTrue(any('clerk_john' in s['value'] for s in suggs_user))

    def test_user_free_text_and_date_queries(self):
        """Test username free-text match and date operator comparison."""
        # 1. Free text username match
        res_user_ft = self.client.get('/api/inventory/stock-history/?search=clerk_john')
        self.assertEqual(res_user_ft.status_code, status.HTTP_200_OK)
        results = res_user_ft.data.get('results', res_user_ft.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertIn(str(self.hist2.id), ids)
        self.assertIn(str(self.hist3.id), ids)

        # 2. Date comparison: date:today and date:>2020-01-01
        res_today = self.client.get('/api/inventory/stock-history/?search=date:today')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        results_today = res_today.data.get('results', res_today.data)
        self.assertEqual(len(results_today), 4)

        res_gt = self.client.get('/api/inventory/stock-history/?search=date:>2020-01-01')
        self.assertEqual(res_gt.status_code, status.HTTP_200_OK)
        results_gt = res_gt.data.get('results', res_gt.data)
        self.assertEqual(len(results_gt), 4)
