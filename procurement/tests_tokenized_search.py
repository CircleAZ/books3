"""
Unit Tests for Procurement Purchase Order Tokenized Search Filter and Autocomplete Suggestions API.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from procurement.models import PurchaseOrder, PurchaseOrderItem
from inventory.models import Product, Category, Vendor

User = get_user_model()


class PurchaseOrderTokenizedSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='procurement_search_tester',
            email='procurement_search_tester@example.com',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(name='Stationery')
        self.vendor_navneet = Vendor.objects.create(name='Navneet Publications')
        self.vendor_vikas = Vendor.objects.create(name='Vikas Stationery')

        self.prod_notebook = Product.objects.create(
            name='Classmate Notebook A4',
            cost_price=Decimal('50.00'),
            selling_price=Decimal('70.00'),
            category=self.category,
            stock_quantity=100
        )
        self.prod_pen = Product.objects.create(
            name='Reynolds Ball Pen',
            cost_price=Decimal('5.00'),
            selling_price=Decimal('10.00'),
            category=self.category,
            stock_quantity=200
        )

        # PO 1: Navneet, ordered, pending, total: 15000, paid: 0
        self.po1 = PurchaseOrder.objects.create(
            vendor=self.vendor_navneet,
            status=PurchaseOrder.Status.ORDERED,
            payment_status=PurchaseOrder.PaymentStatus.PENDING,
            subtotal=Decimal('15000.00'),
            total_amount=Decimal('15000.00'),
            amount_paid=Decimal('0.00'),
            notes='First bulk order for Classmate notebooks',
            created_by=self.user
        )
        # 2 items of the same product to test Exists() deduplication
        PurchaseOrderItem.objects.create(
            purchase_order=self.po1,
            product=self.prod_notebook,
            purchased_packs=10,
            vendor_pack_size=10,
            unit_cost_price=Decimal('50.00'),
        )
        PurchaseOrderItem.objects.create(
            purchase_order=self.po1,
            product=self.prod_notebook,
            purchased_packs=20,
            vendor_pack_size=10,
            unit_cost_price=Decimal('50.00'),
        )

        # PO 2: Navneet, received, paid, total: 5000, paid: 5000
        self.po2 = PurchaseOrder.objects.create(
            vendor=self.vendor_navneet,
            status=PurchaseOrder.Status.RECEIVED,
            payment_status=PurchaseOrder.PaymentStatus.PAID,
            subtotal=Decimal('5000.00'),
            total_amount=Decimal('5000.00'),
            amount_paid=Decimal('5000.00'),
            notes='Urgent restocking',
            created_by=self.user
        )
        PurchaseOrderItem.objects.create(
            purchase_order=self.po2,
            product=self.prod_pen,
            purchased_packs=50,
            vendor_pack_size=10,
            unit_cost_price=Decimal('5.00'),
        )

        # PO 3: Vikas, cancelled, pending, total: 25000, paid: 0
        self.po3 = PurchaseOrder.objects.create(
            vendor=self.vendor_vikas,
            status=PurchaseOrder.Status.CANCELLED,
            payment_status=PurchaseOrder.PaymentStatus.PENDING,
            subtotal=Decimal('25000.00'),
            total_amount=Decimal('25000.00'),
            amount_paid=Decimal('0.00'),
            notes='Vikas trial run',
            created_by=self.user
        )
        PurchaseOrderItem.objects.create(
            purchase_order=self.po3,
            product=self.prod_notebook,
            purchased_packs=20,
            vendor_pack_size=10,
            unit_cost_price=Decimal('50.00'),
        )
        PurchaseOrderItem.objects.create(
            purchase_order=self.po3,
            product=self.prod_pen,
            purchased_packs=100,
            vendor_pack_size=10,
            unit_cost_price=Decimal('5.00'),
        )

    def test_prefix_id_and_hash(self):
        """Test exact display_id and #display_id lookups."""
        res1 = self.client.get(f'/api/procurement/purchase-orders/?search=id:{self.po1.display_id}')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        results = res1.data.get('results', res1.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.po1.id))

        res_hash = self.client.get(f'/api/procurement/purchase-orders/?search=id:#{self.po2.display_id}')
        self.assertEqual(res_hash.status_code, status.HTTP_200_OK)
        results_hash = res_hash.data.get('results', res_hash.data)
        self.assertEqual(len(results_hash), 1)
        self.assertEqual(results_hash[0]['id'], str(self.po2.id))

    def test_prefix_vendor(self):
        """Test vendor name search."""
        res = self.client.get('/api/procurement/purchase-orders/?search=vendor:Navneet')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertIn(str(self.po1.id), ids)
        self.assertIn(str(self.po2.id), ids)

        res_vikas = self.client.get('/api/procurement/purchase-orders/?search=vendor:Vikas')
        results_vikas = res_vikas.data.get('results', res_vikas.data)
        self.assertEqual(len(results_vikas), 1)
        self.assertEqual(results_vikas[0]['id'], str(self.po3.id))

    def test_prefix_status(self):
        """Test status token."""
        res_ord = self.client.get('/api/procurement/purchase-orders/?search=status:ordered')
        results_ord = res_ord.data.get('results', res_ord.data)
        self.assertEqual(len(results_ord), 1)
        self.assertEqual(results_ord[0]['id'], str(self.po1.id))

        res_rec = self.client.get('/api/procurement/purchase-orders/?search=status:received')
        results_rec = res_rec.data.get('results', res_rec.data)
        self.assertEqual(len(results_rec), 1)
        self.assertEqual(results_rec[0]['id'], str(self.po2.id))

    def test_prefix_payment(self):
        """Test payment token."""
        res_paid = self.client.get('/api/procurement/purchase-orders/?search=payment:paid')
        results_paid = res_paid.data.get('results', res_paid.data)
        self.assertEqual(len(results_paid), 1)
        self.assertEqual(results_paid[0]['id'], str(self.po2.id))

        res_pend = self.client.get('/api/procurement/purchase-orders/?search=payment:pending')
        results_pend = res_pend.data.get('results', res_pend.data)
        self.assertEqual(len(results_pend), 2)

    def test_product_exists_subquery_isolation(self):
        """
        Verify product: token isolates query via Exists() without Cartesian duplicate rows,
        even when multiple matching items exist within the same PO.
        """
        res = self.client.get('/api/procurement/purchase-orders/?search=product:"Classmate"')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        # PO 1 and PO 3 have Classmate Notebook
        self.assertEqual(len(results), 2)
        po_ids = [r['id'] for r in results]
        # PO 1 must appear EXACTLY ONCE despite having 2 matching items
        self.assertEqual(po_ids.count(str(self.po1.id)), 1)
        self.assertEqual(po_ids.count(str(self.po3.id)), 1)

    def test_numeric_total_and_paid(self):
        """Test total:>10000, total:<=5000, paid:>0, paid:=0."""
        res_gt = self.client.get('/api/procurement/purchase-orders/?search=total:>10000')
        results_gt = res_gt.data.get('results', res_gt.data)
        self.assertEqual(len(results_gt), 2)
        ids = {r['id'] for r in results_gt}
        self.assertIn(str(self.po1.id), ids)
        self.assertIn(str(self.po3.id), ids)

        res_lte = self.client.get('/api/procurement/purchase-orders/?search=total:<=5000')
        results_lte = res_lte.data.get('results', res_lte.data)
        self.assertEqual(len(results_lte), 1)
        self.assertEqual(results_lte[0]['id'], str(self.po2.id))

        res_paid_gt = self.client.get('/api/procurement/purchase-orders/?search=paid:>0')
        results_paid_gt = res_paid_gt.data.get('results', res_paid_gt.data)
        self.assertEqual(len(results_paid_gt), 1)
        self.assertEqual(results_paid_gt[0]['id'], str(self.po2.id))

    def test_negation(self):
        """Test negation syntax -status:cancelled."""
        res = self.client.get('/api/procurement/purchase-orders/?search=-status:cancelled')
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)
        ids = {r['id'] for r in results}
        self.assertNotIn(str(self.po3.id), ids)

    def test_free_text_search(self):
        """Test free text matches notes and display_id."""
        res_note = self.client.get('/api/procurement/purchase-orders/?search=restocking')
        results_note = res_note.data.get('results', res_note.data)
        self.assertEqual(len(results_note), 1)
        self.assertEqual(results_note[0]['id'], str(self.po2.id))

        res_num = self.client.get(f'/api/procurement/purchase-orders/?search={self.po1.display_id}')
        results_num = res_num.data.get('results', res_num.data)
        self.assertEqual(len(results_num), 1)
        self.assertEqual(results_num[0]['id'], str(self.po1.id))

    def test_compound_query(self):
        """Test multi-token combination."""
        res = self.client.get('/api/procurement/purchase-orders/?search=vendor:Navneet status:ordered total:>10000')
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.po1.id))

    def test_search_suggestions_endpoint(self):
        """Test cheatsheet and autocomplete suggestions on PurchaseOrderViewSet."""
        # 1. Cheatsheet schema
        res_schema = self.client.get('/api/procurement/purchase-orders/search-suggestions/')
        self.assertEqual(res_schema.status_code, status.HTTP_200_OK)
        self.assertIn('prefixes', res_schema.data)
        prefix_keys = [p['prefix'] for p in res_schema.data['prefixes']]
        self.assertIn('vendor', prefix_keys)
        self.assertIn('status', prefix_keys)
        self.assertIn('product', prefix_keys)

        # 2. Vendor suggestions
        res_vendor = self.client.get('/api/procurement/purchase-orders/search-suggestions/?prefix=vendor&q=Nav')
        self.assertEqual(res_vendor.status_code, status.HTTP_200_OK)
        suggs = res_vendor.data.get('suggestions', [])
        self.assertTrue(any('Navneet' in s['label'] for s in suggs))

        # 3. Status suggestions
        res_status = self.client.get('/api/procurement/purchase-orders/search-suggestions/?prefix=status')
        self.assertEqual(res_status.status_code, status.HTTP_200_OK)
        suggs_status = res_status.data.get('suggestions', [])
        ordered_sugg = next((s for s in suggs_status if s['value'] == 'ordered'), None)
        self.assertIsNotNone(ordered_sugg)
        self.assertEqual(ordered_sugg['count'], 1)

        # 4. Product suggestions
        res_prod = self.client.get('/api/procurement/purchase-orders/search-suggestions/?prefix=product&q=Class')
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        suggs_prod = res_prod.data.get('suggestions', [])
        self.assertTrue(any('Classmate' in s['label'] for s in suggs_prod))

    def test_overdue_and_date_operator_queries(self):
        """Test due:<today and ISO date operator comparisons without regex truncation."""
        from datetime import timedelta
        from django.utils import timezone
        today = timezone.localdate()
        self.po1.expected_delivery_date = today - timedelta(days=3)
        self.po1.save()
        self.po2.expected_delivery_date = today + timedelta(days=5)
        self.po2.save()

        # Test overdue due:<today
        res_overdue = self.client.get('/api/procurement/purchase-orders/?search=due:<today')
        self.assertEqual(res_overdue.status_code, status.HTTP_200_OK)
        results = res_overdue.data.get('results', res_overdue.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.po1.id))

        # Test compound overdue with negation: due:<today -status:received
        res_comp = self.client.get('/api/procurement/purchase-orders/?search=due:<today -status:received')
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        results_comp = res_comp.data.get('results', res_comp.data)
        self.assertEqual(len(results_comp), 1)
        self.assertEqual(results_comp[0]['id'], str(self.po1.id))

        # Test ISO date operator query: due:>2000-01-01
        res_iso = self.client.get('/api/procurement/purchase-orders/?search=due:>2000-01-01')
        self.assertEqual(res_iso.status_code, status.HTTP_200_OK)
        results_iso = res_iso.data.get('results', res_iso.data)
        self.assertEqual(len(results_iso), 2)

    def test_business_id_prefixes(self):
        """Test PO- and PO# prefixed display_id lookups."""
        res = self.client.get(f'/api/procurement/purchase-orders/?search=id:PO-{self.po1.display_id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.po1.id))

        res_free = self.client.get(f'/api/procurement/purchase-orders/?search=PO-{self.po2.display_id}')
        self.assertEqual(res_free.status_code, status.HTTP_200_OK)
        results_free = res_free.data.get('results', res_free.data)
        self.assertEqual(len(results_free), 1)
        self.assertEqual(results_free[0]['id'], str(self.po2.id))

