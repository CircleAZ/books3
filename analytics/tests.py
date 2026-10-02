import uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase
from .models import AnalysisFolder, SavedAnalysis, DiscoverySegment, PipelineTransferLog

User = get_user_model()


class AnalysisFolderModelTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='test_analyst',
            password='testpassword123',
            email='analyst@circleaz.in'
        )

    def test_folder_hierarchy_and_nesting(self):
        root = AnalysisFolder.objects.create(name='Q3 Research', created_by=self.user)
        child = AnalysisFolder.objects.create(name='Village Deep Dives', parent=root, created_by=self.user)
        grandchild = AnalysisFolder.objects.create(name='Krushnapur Cohorts', parent=child, created_by=self.user)

        self.assertEqual(root.children.count(), 1)
        self.assertEqual(child.children.count(), 1)
        self.assertEqual(child.parent, root)
        self.assertEqual(grandchild.parent, child)

    def test_self_parent_rejection(self):
        folder = AnalysisFolder.objects.create(name='Loop Test', created_by=self.user)
        folder.parent = folder
        with self.assertRaises(ValidationError):
            folder.clean()

    def test_indirect_circular_reference_rejection(self):
        root = AnalysisFolder.objects.create(name='A', created_by=self.user)
        child = AnalysisFolder.objects.create(name='B', parent=root, created_by=self.user)
        root.parent = child
        with self.assertRaises(ValidationError):
            root.clean()

    def test_soft_delete_isolation(self):
        folder = AnalysisFolder.objects.create(name='Doomed Workspace', created_by=self.user)
        folder_id = folder.id

        self.assertTrue(AnalysisFolder.objects.filter(id=folder_id).exists())
        folder.soft_delete()

        self.assertFalse(AnalysisFolder.objects.filter(id=folder_id).exists())
        self.assertTrue(AnalysisFolder.all_objects.filter(id=folder_id).exists())
        self.assertTrue(AnalysisFolder.all_objects.get(id=folder_id).is_deleted)


class AnalyticsModelsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='test_analyst2',
            password='testpassword123',
            email='analyst2@circleaz.in'
        )
        self.folder = AnalysisFolder.objects.create(name='Seasonal Forecaster', created_by=self.user)

    def test_saved_analysis_lifecycle(self):
        analysis = SavedAnalysis.objects.create(
            folder=self.folder,
            name='Diwali 2026 Demand Spike',
            engine_type=SavedAnalysis.ENGINE_DEMAND,
            parameters={'lead_time_days': 14, 'confidence': 0.95},
            cached_insights={'predicted_cartons': 450, 'risk_score': 0.12},
            created_by=self.user
        )

        self.assertEqual(str(analysis), 'Diwali 2026 Demand Spike (Seasonal Demand & Replenishment Forecasting)')
        self.assertEqual(analysis.folder, self.folder)

        analysis.soft_delete()
        self.assertFalse(SavedAnalysis.objects.filter(id=analysis.id).exists())
        self.assertTrue(SavedAnalysis.all_objects.filter(id=analysis.id).exists())

    def test_discovery_segment_lifecycle(self):
        customer_id_1 = str(uuid.uuid4())
        customer_id_2 = str(uuid.uuid4())
        segment = DiscoverySegment.objects.create(
            name='High Debt Krushnapur Customers',
            target_entity=DiscoverySegment.TARGET_CUSTOMER,
            entity_ids=[customer_id_1, customer_id_2],
            cohort_metrics={'total_balance_due': 45000, 'customer_count': 2},
            source_engine='village',
            created_by=self.user
        )

        self.assertIn('2 entities', str(segment))
        self.assertEqual(len(segment.entity_ids), 2)

    def test_pipeline_transfer_log_lifecycle(self):
        segment = DiscoverySegment.objects.create(
            name='Restock SKU Cohort',
            target_entity=DiscoverySegment.TARGET_PRODUCT,
            entity_ids=[str(uuid.uuid4())],
            created_by=self.user
        )
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={'vendor_id': str(uuid.uuid4()), 'suggested_cartons': 50},
            source_segment=segment,
            created_by=self.user
        )

        self.assertEqual(log.status, PipelineTransferLog.STATUS_PENDING)
        self.assertEqual(log.source_segment, segment)


class AnalyticsAPITestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='api_analyst',
            password='testpassword123',
            email='api_analyst@circleaz.in'
        )
        self.client.force_authenticate(user=self.user)

    def test_create_and_fetch_folder_tree(self):
        root = AnalysisFolder.objects.create(name='Root Alpha', created_by=self.user)
        child = AnalysisFolder.objects.create(name='Child Beta', parent=root, created_by=self.user)

        response = self.client.get('/api/analytics/folders/tree/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Root Alpha')
        self.assertEqual(len(response.data[0]['children']), 1)
        self.assertEqual(response.data[0]['children'][0]['name'], 'Child Beta')

    def test_folder_api_soft_delete(self):
        folder = AnalysisFolder.objects.create(name='Temp Workspace', created_by=self.user)
        response = self.client.delete(f'/api/analytics/folders/{folder.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.assertFalse(AnalysisFolder.objects.filter(id=folder.id).exists())
        self.assertTrue(AnalysisFolder.all_objects.filter(id=folder.id).exists())

    def test_discovery_segment_api_validation(self):
        # Invalid: entity_ids not a list
        bad_payload = {
            'name': 'Corrupt Segment',
            'target_entity': 'customer',
            'entity_ids': 'not-a-list',
        }
        res_bad = self.client.post('/api/analytics/segments/', bad_payload, format='json')
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid payload
        good_payload = {
            'name': 'Valid Segment',
            'target_entity': 'customer',
            'entity_ids': [str(uuid.uuid4())],
            'cohort_metrics': {'avg_order': 1200},
        }
        res_good = self.client.post('/api/analytics/segments/', good_payload, format='json')
        self.assertEqual(res_good.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_good.data['entity_count'], 1)
        self.assertEqual(res_good.data['created_by'], self.user.id)

    def test_recommendations_endpoint_with_history(self):
        from customers.models import Customer
        from inventory.models import Product
        from orders.models import Order, OrderItem

        cust = Customer.objects.create(first_name='Ramesh', last_name='Patel', phone='9876543210')
        prod = Product.objects.create(name='A4 Notebook 200pg', cost_price=40, selling_price=60, stock_quantity=100)
        order = Order.objects.create(customer=cust, order_status='completed', total=120)
        OrderItem.objects.create(order=order, product=prod, quantity=2, unit_price=60)

        response = self.client.get(f'/api/analytics/recommendations/?customer_id={cust.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
        self.assertEqual(response.data[0]['name'], 'A4 Notebook 200pg')
        self.assertTrue(response.data[0]['is_recommended'])
        self.assertIn('Frequently Ordered', response.data[0]['recommendation_reason'])

    def test_recommendations_endpoint_fallback_and_invalid_uuid(self):
        # Invalid UUID should not crash
        response = self.client.get('/api/analytics/recommendations/?customer_id=not-a-uuid')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

        # Empty customer_id should return store recommendations
        response2 = self.client.get('/api/analytics/recommendations/')
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response2.data, list)


class PipelineTransferAPITestCase(APITestCase):
    def setUp(self):
        from inventory.models import Vendor, Product

        self.user = User.objects.create_user(
            username='procurement_analyst',
            password='testpassword123',
            email='proc_analyst@circleaz.in'
        )
        self.client.force_authenticate(user=self.user)

        self.vendor_navneet = Vendor.objects.create(name='Navneet Publications')
        self.vendor_chetana = Vendor.objects.create(name='Chetana Book Depot')

        # Product 1: Pack size 12
        self.prod_math = Product.objects.create(
            name='Navneet Maths Std 10',
            vendor=self.vendor_navneet,
            cost_price=50.00,
            selling_price=75.00,
            pack_size=12,
            is_pack=True,
            stock_quantity=5
        )

        # Product 2: Pack size 24
        self.prod_science = Product.objects.create(
            name='Navneet Science Std 10',
            vendor=self.vendor_navneet,
            cost_price=60.00,
            selling_price=90.00,
            pack_size=24,
            is_pack=True,
            stock_quantity=2
        )

        # Product 3: Chetana Vendor
        self.prod_chetana = Product.objects.create(
            name='Chetana Drawing Book A4',
            vendor=self.vendor_chetana,
            cost_price=25.00,
            selling_price=40.00,
            pack_size=10,
            is_pack=True,
            stock_quantity=0
        )

    def test_dispatch_po_master_carton_quantization(self):
        """
        Verifies ceiling quantization:
        - Demand 25 units @ pack_size 12 -> 3 packs (36 units)
        - Demand 10 units @ pack_size 24 with MOQ 2 -> 2 packs (48 units)
        """
        payload = {
            'vendor_id': str(self.vendor_navneet.id),
            'items': [
                {
                    'product_id': str(self.prod_math.id),
                    'suggested_quantity': 25,
                    'vendor_case_pack': 12,
                    'moq': 1,
                    'unit_cost_price': '50.00',
                },
                {
                    'product_id': str(self.prod_science.id),
                    'suggested_quantity': 10,
                    'vendor_case_pack': 24,
                    'moq': 2,
                    'unit_cost_price': '60.00',
                }
            ],
            'notes': 'Diwali Replenishment Batch'
        }

        response = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_vendor_selection'])
        self.assertIn('transfer_id', response.data)

        snapshot = response.data['payload_snapshot']
        self.assertTrue(snapshot['quantization_applied'])
        self.assertEqual(snapshot['total_packs'], 5)  # 3 + 2
        self.assertEqual(snapshot['total_units'], 84)  # 36 + 48

        # 36 * 50 = 1800; 48 * 60 = 2880; total = 4680
        self.assertEqual(snapshot['estimated_subtotal'], '4680.00')

        items = snapshot['items']
        self.assertEqual(items[0]['purchased_packs'], 3)
        self.assertEqual(items[0]['ordered_quantity'], 36)
        self.assertEqual(items[1]['purchased_packs'], 2)
        self.assertEqual(items[1]['ordered_quantity'], 48)

    def test_dispatch_po_multi_vendor_partitioning(self):
        """
        When items belong to multiple vendors and vendor_id is omitted,
        the endpoint must return a vendor selection manifest.
        """
        payload = {
            'items': [
                {'product_id': str(self.prod_math.id), 'suggested_quantity': 12},
                {'product_id': str(self.prod_chetana.id), 'suggested_quantity': 10},
            ]
        }

        response = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['requires_vendor_selection'])
        self.assertEqual(len(response.data['vendor_batches']), 2)

        # Now specify vendor_id explicitly -> single PO created cleanly
        payload['vendor_id'] = str(self.vendor_chetana.id)
        response2 = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(response2.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response2.data['requires_vendor_selection'])
        self.assertEqual(response2.data['vendor_name'], 'Chetana Book Depot')
        self.assertEqual(len(response2.data['payload_snapshot']['items']), 1)

    def test_confirm_transfer_lifecycle(self):
        """
        Verifies transition from pending to transferred with PO metadata.
        """
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={'vendor_name': 'Navneet Publications', 'total_packs': 10},
            status=PipelineTransferLog.STATUS_PENDING,
            created_by=self.user
        )

        dummy_po_id = uuid.uuid4()
        confirm_payload = {
            'purchase_order_id': str(dummy_po_id),
            'po_display_id': '1088',
        }

        url = f'/api/analytics/pipeline-transfers/{log.id}/confirm-transfer/'
        res = self.client.post(url, confirm_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], PipelineTransferLog.STATUS_TRANSFERRED)

        log.refresh_from_db()
        self.assertEqual(log.status, PipelineTransferLog.STATUS_TRANSFERRED)
        self.assertEqual(log.payload_snapshot['purchase_order_id'], str(dummy_po_id))
        self.assertEqual(log.payload_snapshot['po_display_id'], '1088')
        self.assertIn('transferred_at', log.payload_snapshot)

        # Idempotent second call
        res_repeat = self.client.post(url, confirm_payload, format='json')
        self.assertEqual(res_repeat.status_code, status.HTTP_200_OK)

    def test_reject_transfer_lifecycle(self):
        """
        Verifies transition from pending to rejected with reason.
        """
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={'vendor_name': 'Navneet Publications'},
            status=PipelineTransferLog.STATUS_PENDING,
            created_by=self.user
        )

        url = f'/api/analytics/pipeline-transfers/{log.id}/reject-transfer/'
        res = self.client.post(url, {'reason': 'Supplier currently out of paper stock'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], PipelineTransferLog.STATUS_REJECTED)

        log.refresh_from_db()
        self.assertEqual(log.status, PipelineTransferLog.STATUS_REJECTED)
        self.assertIn('Supplier currently out of paper stock', log.notes)
        self.assertEqual(log.payload_snapshot['rejection_reason'], 'Supplier currently out of paper stock')

    def test_po_preload_endpoint(self):
        """
        Verifies the po-preload GET endpoint supplies exact payload for CreatePO.
        """
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={
                'vendor_id': str(self.vendor_navneet.id),
                'vendor_name': 'Navneet Publications',
                'total_packs': 3,
                'total_units': 36,
                'estimated_subtotal': '1800.00',
                'items': [
                    {
                        'product_id': str(self.prod_math.id),
                        'product_name': self.prod_math.name,
                        'is_pack': True,
                        'pack_size': 12,
                        'vendor_pack_size': 12,
                        'purchased_packs': 3,
                        'unit_cost_price': '50.00',
                    }
                ]
            },
            status=PipelineTransferLog.STATUS_PENDING,
            notes='Auto Restock',
            created_by=self.user
        )

        res = self.client.get(f'/api/analytics/pipeline-transfers/{log.id}/po-preload/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['vendor_id'], str(self.vendor_navneet.id))
        self.assertEqual(res.data['total_packs'], 3)
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(res.data['items'][0]['purchased_packs'], 3)

    def test_dispatch_po_from_discovery_segment(self):
        """
        Verifies dispatching PO directly referencing a DiscoverySegment.
        """
        segment = DiscoverySegment.objects.create(
            name='Grade 10 Textbook Shortage',
            target_entity=DiscoverySegment.TARGET_PRODUCT,
            entity_ids=[str(self.prod_math.id), str(self.prod_science.id)],
            source_engine='demand_forecaster',
            created_by=self.user
        )

        payload = {
            'source_segment_id': str(segment.id),
            'vendor_id': str(self.vendor_navneet.id),
        }

        res = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data['requires_vendor_selection'])
        self.assertEqual(res.data['payload_snapshot']['source_segment_id'], str(segment.id))
        self.assertEqual(len(res.data['payload_snapshot']['items']), 2)

    def test_khata_gate_check_healthy_customer(self):
        """
        Customer with recent unpaid order (5 days old) within limit:
        Must return CLEARED with is_cleared=True and 0 violations.
        """
        from customers.models import Customer
        from orders.models import Order
        from datetime import timedelta
        from django.utils import timezone

        cust = Customer.objects.create(first_name='Ramesh', last_name='Patel', phone='9876500001')
        order = Order.objects.create(
            customer=cust,
            order_status='confirmed',
            total=Decimal('5000.00'),
            subtotal=Decimal('5000.00'),
            created_by=self.user
        )
        Order.objects.filter(id=order.id).update(created_at=timezone.now() - timedelta(days=5))

        payload = {'customer_id': str(cust.id)}
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_evaluated'], 1)
        self.assertEqual(res.data['cleared_count'], 1)
        self.assertEqual(res.data['blocked_count'], 0)

        eval_data = res.data['evaluations'][0]
        self.assertEqual(eval_data['status'], 'CLEARED')
        self.assertTrue(eval_data['is_cleared'])
        self.assertEqual(eval_data['max_dso_days'], 5)
        self.assertEqual(eval_data['total_debt'], '5000.00')
        self.assertEqual(eval_data['aging_breakdown']['current_0_30'], '5000.00')
        self.assertEqual(len(eval_data['violations']), 0)

    def test_khata_gate_check_warning_dso(self):
        """
        Customer with order 35 days old:
        Must return WARNING status, is_cleared=True, with warning recommendation.
        """
        from customers.models import Customer
        from orders.models import Order
        from datetime import timedelta
        from django.utils import timezone

        cust = Customer.objects.create(first_name='Suresh', last_name='Shah', phone='9876500002')
        order = Order.objects.create(
            customer=cust,
            order_status='confirmed',
            total=Decimal('12000.00'),
            subtotal=Decimal('12000.00'),
            created_by=self.user
        )
        Order.objects.filter(id=order.id).update(created_at=timezone.now() - timedelta(days=35))

        payload = {'customer_id': str(cust.id)}
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['warning_count'], 1)

        eval_data = res.data['evaluations'][0]
        self.assertEqual(eval_data['status'], 'WARNING')
        self.assertTrue(eval_data['is_cleared'])
        self.assertEqual(eval_data['max_dso_days'], 35)
        self.assertEqual(eval_data['aging_breakdown']['watchlist_31_45'], '12000.00')

    def test_khata_gate_check_delinquent_dso_blocked(self):
        """
        Customer with order 50 days old (> 45-day default threshold):
        Must return BLOCKED status, is_cleared=False, with DSO violation.
        """
        from customers.models import Customer
        from orders.models import Order
        from datetime import timedelta
        from django.utils import timezone

        cust = Customer.objects.create(first_name='Mahesh', last_name='Joshi', phone='9876500003')
        order = Order.objects.create(
            customer=cust,
            order_status='confirmed',
            total=Decimal('8500.00'),
            subtotal=Decimal('8500.00'),
            created_by=self.user
        )
        Order.objects.filter(id=order.id).update(created_at=timezone.now() - timedelta(days=50))

        payload = {'customer_id': str(cust.id)}
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['blocked_count'], 1)
        self.assertEqual(res.data['total_blocked_exposure'], '8500.00')

        eval_data = res.data['evaluations'][0]
        self.assertEqual(eval_data['status'], 'BLOCKED')
        self.assertFalse(eval_data['is_cleared'])
        self.assertEqual(eval_data['max_dso_days'], 50)
        self.assertEqual(eval_data['aging_breakdown']['delinquent_46_60'], '8500.00')
        self.assertTrue(any('DSO breached' in v for v in eval_data['violations']))

    def test_khata_gate_check_credit_limit_breach_blocked(self):
        """
        Customer with recent debt exceeding credit limit (₹65,000 > ₹50,000):
        Must return BLOCKED status, is_cleared=False, with credit limit violation.
        """
        from customers.models import Customer
        from orders.models import Order
        from datetime import timedelta
        from django.utils import timezone

        cust = Customer.objects.create(first_name='Dinesh', last_name='Mehta', phone='9876500004')
        order = Order.objects.create(
            customer=cust,
            order_status='confirmed',
            total=Decimal('65000.00'),
            subtotal=Decimal('65000.00'),
            created_by=self.user
        )
        Order.objects.filter(id=order.id).update(created_at=timezone.now() - timedelta(days=10))

        payload = {'customer_id': str(cust.id)}
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['blocked_count'], 1)

        eval_data = res.data['evaluations'][0]
        self.assertEqual(eval_data['status'], 'BLOCKED')
        self.assertFalse(eval_data['is_cleared'])
        self.assertEqual(eval_data['credit_utilization_pct'], 130.0)
        self.assertTrue(any('Credit limit breached' in v for v in eval_data['violations']))

    def test_khata_gate_check_legacy_debt_blocked(self):
        """
        Customer with LegacyDebt:
        Must assign 90-day DSO baseline, populate critical_61_plus bucket, and BLOCK.
        """
        from customers.models import Customer, LegacyDebt

        cust = Customer.objects.create(first_name='Pravin', last_name='Vora', phone='9876500005')
        LegacyDebt.objects.create(
            customer=cust,
            principal_amount=Decimal('25000.00'),
            recovered_amount=Decimal('5000.00')
        )

        payload = {'customer_id': str(cust.id)}
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['blocked_count'], 1)

        eval_data = res.data['evaluations'][0]
        self.assertEqual(eval_data['status'], 'BLOCKED')
        self.assertFalse(eval_data['is_cleared'])
        self.assertEqual(eval_data['total_debt'], '20000.00')
        self.assertEqual(eval_data['max_dso_days'], 90)
        self.assertEqual(eval_data['aging_breakdown']['critical_61_plus'], '20000.00')

    def test_khata_gate_check_batch_entities(self):
        """
        Batch check with multiple customer entity IDs:
        Returns individual evaluations and aggregated summary metrics.
        """
        from customers.models import Customer
        from orders.models import Order
        from datetime import timedelta
        from django.utils import timezone

        c1 = Customer.objects.create(first_name='Alpha', phone='9876500010')
        c2 = Customer.objects.create(first_name='Beta', phone='9876500020')

        o1 = Order.objects.create(customer=c1, order_status='confirmed', total=Decimal('4000.00'), subtotal=Decimal('4000.00'), created_by=self.user)
        Order.objects.filter(id=o1.id).update(created_at=timezone.now() - timedelta(days=5))

        o2 = Order.objects.create(customer=c2, order_status='confirmed', total=Decimal('70000.00'), subtotal=Decimal('70000.00'), created_by=self.user)
        Order.objects.filter(id=o2.id).update(created_at=timezone.now() - timedelta(days=5))

        payload = {'entity_ids': [str(c1.id), str(c2.id)]}
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_evaluated'], 2)
        self.assertEqual(res.data['cleared_count'], 1)
        self.assertEqual(res.data['blocked_count'], 1)
        self.assertEqual(res.data['total_blocked_exposure'], '70000.00')

    def test_khata_gate_check_missing_ids_bad_request(self):
        """
        Request with no customer_id or entity_ids must return HTTP 400.
        """
        res = self.client.post('/api/analytics/pipeline-transfers/khata-gate-check/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_dispatch_po_andon_cleared(self):
        """
        When proposed PO line items match prior baseline within variance thresholds,
        Andon cord evaluates to CLEARED with is_andon_tripped=False.
        """
        from procurement.models import PurchaseOrder, PurchaseOrderItem

        po = PurchaseOrder.objects.create(vendor=self.vendor_navneet, status='completed')
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.prod_math,
            purchased_packs=1,
            vendor_pack_size=12,
            unit_cost_price=Decimal('50.00')
        )

        payload = {
            'vendor_id': str(self.vendor_navneet.id),
            'items': [
                {
                    'product_id': str(self.prod_math.id),
                    'suggested_quantity': 12,
                    'vendor_case_pack': 12,
                    'moq': 1,
                    'unit_cost_price': '50.00',
                }
            ]
        }

        res = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        snapshot = res.data['payload_snapshot']
        self.assertEqual(snapshot['andon_status'], 'CLEARED')
        self.assertFalse(snapshot['is_andon_tripped'])
        self.assertEqual(len(snapshot['andon_trip_reasons']), 0)
        self.assertEqual(len(snapshot['andon_offending_items']), 0)

    def test_dispatch_po_andon_tripped_on_volume_spike(self):
        """
        When proposed quantity exceeds baseline by > 30% with >= 5 units delta,
        Andon cord evaluates to TRIPPED with is_andon_tripped=True.
        """
        from procurement.models import PurchaseOrder, PurchaseOrderItem

        po = PurchaseOrder.objects.create(vendor=self.vendor_navneet, status='completed')
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.prod_math,
            purchased_packs=1,
            vendor_pack_size=12,
            unit_cost_price=Decimal('50.00')
        )

        payload = {
            'vendor_id': str(self.vendor_navneet.id),
            'items': [
                {
                    'product_id': str(self.prod_math.id),
                    'suggested_quantity': 60,
                    'vendor_case_pack': 12,
                    'moq': 1,
                    'unit_cost_price': '50.00',
                }
            ]
        }

        res = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        snapshot = res.data['payload_snapshot']
        self.assertEqual(snapshot['andon_status'], 'TRIPPED')
        self.assertTrue(snapshot['is_andon_tripped'])
        self.assertTrue(any('Volume variance' in r for r in snapshot['andon_trip_reasons']))
        self.assertEqual(len(snapshot['andon_offending_items']), 1)
        self.assertEqual(snapshot['andon_offending_items'][0]['product_id'], str(self.prod_math.id))

    def test_confirm_transfer_blocked_by_tripped_andon(self):
        """
        Confirming a transfer when is_andon_tripped=True and andon_status='TRIPPED'
        fails with HTTP 400 unless an override_reason is provided.
        """
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={
                'vendor_name': 'Navneet Publications',
                'is_andon_tripped': True,
                'andon_status': 'TRIPPED',
                'andon_trip_reasons': ['VOLUME ANOMALY: Navneet Maths Std 10 ordered qty 60 exceeds baseline 12 by +400.0%'],
            },
            status=PipelineTransferLog.STATUS_PENDING,
            created_by=self.user
        )

        dummy_po_id = uuid.uuid4()
        confirm_payload = {
            'purchase_order_id': str(dummy_po_id),
            'po_display_id': '2001',
        }

        url = f'/api/analytics/pipeline-transfers/{log.id}/confirm-transfer/'
        res_fail = self.client.post(url, confirm_payload, format='json')
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('TPS Andon Latch is TRIPPED', res_fail.data['detail'])

        # Now supply override_reason
        confirm_payload['override_reason'] = 'Authorized for pre-season buffer build-up'
        res_ok = self.client.post(url, confirm_payload, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data['status'], PipelineTransferLog.STATUS_TRANSFERRED)

        log.refresh_from_db()
        self.assertEqual(log.status, PipelineTransferLog.STATUS_TRANSFERRED)
        self.assertEqual(log.payload_snapshot['andon_status'], 'OVERRIDDEN')
        self.assertTrue(log.payload_snapshot['is_overridden'])
        self.assertEqual(log.payload_snapshot['override_reason'], 'Authorized for pre-season buffer build-up')
        self.assertIn('Authorized for pre-season buffer build-up', log.notes)

    def test_override_andon_endpoint(self):
        """
        Dedicated endpoint POST /api/analytics/pipeline-transfers/{id}/override-andon/
        requires minimum 5 character justification and clears TRIPPED latch to OVERRIDDEN.
        """
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={
                'vendor_name': 'Navneet Publications',
                'is_andon_tripped': True,
                'andon_status': 'TRIPPED',
            },
            status=PipelineTransferLog.STATUS_PENDING,
            created_by=self.user
        )

        url = f'/api/analytics/pipeline-transfers/{log.id}/override-andon/'
        # Short reason (< 5 chars) should fail validation
        res_bad = self.client.post(url, {'reason': 'ok'}, format='json')
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid reason
        res_good = self.client.post(url, {'reason': 'Approved by Store Manager Ramesh'}, format='json')
        self.assertEqual(res_good.status_code, status.HTTP_200_OK)
        self.assertEqual(res_good.data['andon_status'], 'OVERRIDDEN')
        self.assertTrue(res_good.data['is_overridden'])
        self.assertEqual(res_good.data['override_reason'], 'Approved by Store Manager Ramesh')

        log.refresh_from_db()
        self.assertEqual(log.payload_snapshot['andon_status'], 'OVERRIDDEN')
        self.assertTrue(log.payload_snapshot['is_overridden'])
        self.assertIn('Approved by Store Manager Ramesh', log.notes)

    def test_po_preload_includes_andon_telemetry(self):
        """
        Verifies po-preload supplies andon_status, is_andon_tripped, and trip_reasons to frontend.
        """
        log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot={
                'vendor_id': str(self.vendor_navneet.id),
                'vendor_name': 'Navneet Publications',
                'total_packs': 5,
                'total_units': 60,
                'is_andon_tripped': True,
                'andon_status': 'TRIPPED',
                'andon_trip_reasons': ['VOLUME ANOMALY: Navneet Maths Std 10 spike'],
                'andon_offending_items': [{'product_id': str(self.prod_math.id)}],
                'items': [],
            },
            status=PipelineTransferLog.STATUS_PENDING,
            created_by=self.user
        )

        res = self.client.get(f'/api/analytics/pipeline-transfers/{log.id}/po-preload/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_andon_tripped'])
        self.assertEqual(res.data['andon_status'], 'TRIPPED')
        self.assertEqual(len(res.data['andon_trip_reasons']), 1)
        self.assertEqual(len(res.data['andon_offending_items']), 1)

    def test_studio_override_andon_endpoint_success(self):
        """
        POST /api/analytics/pipeline-transfers/studio-override-andon/
        Authorizes Studio latch in real-time with valid reason (>= 5 chars).
        """
        payload = {'reason': 'Approved seasonal buffer per Headmaster request'}
        res = self.client.post('/api/analytics/pipeline-transfers/studio-override-andon/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['andon_status'], 'OVERRIDDEN')
        self.assertTrue(res.data['is_overridden'])
        self.assertEqual(res.data['override_reason'], 'Approved seasonal buffer per Headmaster request')
        self.assertEqual(res.data['overridden_by'], self.user.username)
        self.assertIn('overridden_at', res.data)

    def test_studio_override_andon_endpoint_validation(self):
        """
        POST /api/analytics/pipeline-transfers/studio-override-andon/
        Rejects reason < 5 characters with HTTP 400.
        """
        payload = {'reason': 'bad'}
        res = self.client.post('/api/analytics/pipeline-transfers/studio-override-andon/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('reason', res.data)

    def test_dispatch_po_with_inline_override_reason(self):
        """
        When dispatching PO with a volume spike that trips the Andon latch,
        supplying override_reason (>= 5 chars) auto-authorizes and saves as OVERRIDDEN.
        """
        from procurement.models import PurchaseOrder, PurchaseOrderItem

        po = PurchaseOrder.objects.create(vendor=self.vendor_navneet, status='completed')
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.prod_math,
            purchased_packs=1,
            vendor_pack_size=12,
            unit_cost_price=Decimal('50.00')
        )

        payload = {
            'vendor_id': str(self.vendor_navneet.id),
            'items': [
                {
                    'product_id': str(self.prod_math.id),
                    'suggested_quantity': 60,
                    'vendor_case_pack': 12,
                    'moq': 1,
                    'unit_cost_price': '50.00',
                }
            ],
            'override_reason': 'Emergency pre-season rush buffer per Principal'
        }

        res = self.client.post('/api/analytics/pipeline-transfers/dispatch-po/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        snapshot = res.data['payload_snapshot']
        self.assertEqual(snapshot['andon_status'], 'OVERRIDDEN')
        self.assertTrue(snapshot['is_overridden'])
        self.assertEqual(snapshot['override_reason'], 'Emergency pre-season rush buffer per Principal')
        self.assertEqual(snapshot['overridden_by'], self.user.username)
        self.assertIn('overridden_at', snapshot)


class AnalyticsStudioComputeAPITestCase(APITestCase):
    """
    Test suite for Course 7 Slice 7.2:
    Sovereign Gateway Compute API (/api/analytics/compute/<engine_name>/)
    Validates authentication, engine routing, parameter ingestion, schema conformity,
    and Murphy's Catastrophe Guard in-process fallback.
    """
    def setUp(self):
        self.user = User.objects.create_user(
            username='studio_quant',
            password='testpassword123',
            email='quant@circleaz.in'
        )
        self.client.force_authenticate(user=self.user)

    def test_unauthenticated_request_rejected(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/analytics/compute/demand/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_engine_name_rejected(self):
        res = self.client.post('/api/analytics/compute/turbo_quantum/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)
        self.assertIn('supported_engines', res.data)

    def test_compute_demand_engine(self):
        payload = {
            'parameters': {
                'safetyDays': 18,
                'leadTime': 6,
                'surgeMultiplier': 2.5,
                'moqEnforce': True,
            }
        }
        res = self.client.post('/api/analytics/compute/demand/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'demand')
        self.assertTrue(res.data['is_fallback']) # Offline microservice in test runner
        self.assertGreaterEqual(res.data['execution_ms'], 0.0)
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Forecasted Units', [m['label'] for m in res.data['metrics']])
        self.assertIn('Master Cartons', [m['label'] for m in res.data['metrics']])
        self.assertIsInstance(res.data['items'], list)
        self.assertEqual(res.data['telemetry']['safety_stock_days'], 18)
        self.assertEqual(res.data['telemetry']['surge_multiplier'], 2.5)

    def test_compute_cross_sell_engine(self):
        payload = {
            'parameters': {
                'minSupport': 0.05,
                'minConfidence': 0.35,
                'minLift': 1.6,
            }
        }
        res = self.client.post('/api/analytics/compute/cross_sell/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'cross_sell')
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Active Rules', [m['label'] for m in res.data['metrics']])
        self.assertTrue(len(res.data['items']) > 0)
        self.assertIn('quant_details', res.data['items'][0])

    def test_compute_village_engine(self):
        payload = {
            'parameters': {
                'minOrderValue': 2500,
                'targetVillages': 8,
            }
        }
        res = self.client.post('/api/analytics/compute/village/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'village')
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Frontier Villages', [m['label'] for m in res.data['metrics']])
        self.assertTrue(len(res.data['items']) > 0)
        first_item = res.data['items'][0]
        self.assertIn('HIGH_GROWTH_FRONTIER', [it['target'] for it in res.data['items']] + ['CORE_FORTRESS'])

    def test_compute_pricing_engine(self):
        payload = {
            'parameters': {
                'priceDeltaPct': 8.0,
                'elasticityPrior': -0.70,
                'marginFloor': 15.0,
            }
        }
        res = self.client.post('/api/analytics/compute/pricing/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'pricing')
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Mean Elasticity', [m['label'] for m in res.data['metrics']])
        self.assertTrue(len(res.data['items']) > 0)
        self.assertIn('quant_details', res.data['items'][0])
        self.assertIn('profit_change_pct', res.data['items'][0]['quant_details'])

    def test_compute_defects_engine(self):
        payload = {
            'parameters': {
                'laplaceAlpha': 1.0,
                'laplaceBeta': 99.0,
                'freezeThreshold': 6.0,
            }
        }
        res = self.client.post('/api/analytics/compute/defects/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'defects')
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Defect Rate Smoothed', [m['label'] for m in res.data['metrics']])
        self.assertTrue(len(res.data['items']) > 0)
        self.assertTrue(res.data['items'][0]['quant_details']['consignment_excluded'])

    def test_compute_khata_engine(self):
        payload = {
            'parameters': {
                'maxDsoDays': 45,
                'creditLimit': 60000,
            }
        }
        res = self.client.post('/api/analytics/compute/khata/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'khata')
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Portfolio DSO', [m['label'] for m in res.data['metrics']])
        self.assertTrue(len(res.data['items']) > 0)

    def test_compute_andon_engine(self):
        payload = {
            'parameters': {
                'volumeThresholdPct': 30,
                'costThresholdPct': 15,
                'noiseFloorQty': 5,
            }
        }
        res = self.client.post('/api/analytics/compute/andon/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        self.assertEqual(res.data['engine'], 'andon')
        self.assertEqual(len(res.data['metrics']), 4)
        self.assertIn('Latch Status', [m['label'] for m in res.data['metrics']])
        self.assertTrue(len(res.data['items']) > 0)
        self.assertIn('quant_details', res.data['items'][0])


class StudioPersistenceAPITestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='studio_quant_persister',
            password='testpassword123',
            email='quant_persister@circleaz.in'
        )
        self.client.force_authenticate(user=self.user)

    def test_save_analysis_across_all_7_engines(self):
        engines = ['cross_sell', 'demand', 'village', 'pricing', 'defects', 'khata', 'andon']
        folder = AnalysisFolder.objects.create(name='Engine Verification Folder', created_by=self.user)

        for eng in engines:
            payload = {
                'name': f'{eng.capitalize()} Strategic Run',
                'folder': str(folder.id),
                'engine_type': eng,
                'parameters': {'sample_param': 42},
                'cached_insights': {'metric_val': 99.5, 'status': 'optimal'},
            }
            res = self.client.post('/api/analytics/saved-analyses/', payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"Failed for engine: {eng} -> {res.data}")
            self.assertEqual(res.data['engine_type'], eng)
            self.assertEqual(res.data['folder'], folder.id)
            self.assertEqual(res.data['parameters']['sample_param'], 42)

    def test_folder_tree_embeds_analyses_and_root_general(self):
        folder = AnalysisFolder.objects.create(name='Q2 Strategy Folder', created_by=self.user)
        saved_in_folder = SavedAnalysis.objects.create(
            name='Q2 Village Penetration',
            folder=folder,
            engine_type='village',
            parameters={'decay': 0.15},
            created_by=self.user
        )
        saved_unassigned = SavedAnalysis.objects.create(
            name='Orphan Ad-hoc Demand',
            folder=None,
            engine_type='demand',
            parameters={'lead_time': 7},
            created_by=self.user
        )

        res = self.client.get('/api/analytics/folders/tree/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should have the Q2 Strategy Folder and the virtual root-general folder
        self.assertEqual(len(res.data), 2)

        folder_node = next(f for f in res.data if f['id'] == str(folder.id))
        self.assertEqual(folder_node['name'], 'Q2 Strategy Folder')
        self.assertIn('analyses', folder_node)
        self.assertEqual(len(folder_node['analyses']), 1)
        self.assertEqual(folder_node['analyses'][0]['name'], 'Q2 Village Penetration')

        general_node = next(f for f in res.data if f.get('is_virtual') is True)
        self.assertEqual(general_node['id'], 'root-general')
        self.assertEqual(general_node['name'], 'General Investigations')
        self.assertIn('analyses', general_node)
        self.assertEqual(len(general_node['analyses']), 1)
        self.assertEqual(general_node['analyses'][0]['name'], 'Orphan Ad-hoc Demand')

    def test_create_and_query_discovery_segment_cohort(self):
        payload = {
            'name': 'Low Margin High Volume SKUs',
            'target_entity': 'product',
            'entity_ids': ['sku-001', 'sku-002', 'sku-003'],
            'cohort_metrics': {'avg_margin': 0.08, 'total_volume': 1500},
        }
        res_create = self.client.post('/api/analytics/segments/', payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_create.data['entity_count'], 3)
        self.assertEqual(res_create.data['name'], 'Low Margin High Volume SKUs')

        segment_id = res_create.data['id']
        res_list = self.client.get('/api/analytics/segments/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        results = res_list.data.get('results', res_list.data) if isinstance(res_list.data, dict) else res_list.data
        segment_in_list = next(s for s in results if s['id'] == segment_id)
        self.assertEqual(segment_in_list['target_entity'], 'product')
        self.assertEqual(segment_in_list['entity_ids'], ['sku-001', 'sku-002', 'sku-003'])

    def test_delete_saved_analysis_and_folder_lifecycle(self):
        folder = AnalysisFolder.objects.create(name='Temporary Scratchpad', created_by=self.user)
        analysis = SavedAnalysis.objects.create(
            name='Scratch Analysis',
            folder=folder,
            engine_type='pricing',
            created_by=self.user
        )

        res_del_analysis = self.client.delete(f'/api/analytics/saved-analyses/{analysis.id}/')
        self.assertEqual(res_del_analysis.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SavedAnalysis.objects.filter(id=analysis.id).exists())

        res_del_folder = self.client.delete(f'/api/analytics/folders/{folder.id}/')
        self.assertEqual(res_del_folder.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AnalysisFolder.objects.filter(id=folder.id).exists())
