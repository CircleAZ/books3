"""
Unit & API tests for TPS Andon Cord Engine — azbooks-analytics.
"""

import unittest
from datetime import date
from fastapi.testclient import TestClient
from services.azbooks_analytics.engines.andon_cord import TPSAndonCordEngine
from services.azbooks_analytics.main import app


class TestTPSAndonCordEngine(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.normal_date = date(2026, 4, 15)  # Mid-April peak summer rush

    def test_healthy_order_within_tolerance(self):
        """Proposed quantities and costs within tolerances must return CLEARED."""
        items = [
            {
                'product_id': 'prod-1',
                'product_name': 'Navneet Maths Std 10',
                'proposed_quantity': 105,
                'baseline_quantity': 100,      # +5%
                'proposed_unit_cost': 62.0,
                'baseline_unit_cost': 60.0,     # +3.3%
                'selling_price': 80.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date,
            vendor_name='Navneet Publications'
        )
        self.assertEqual(res['andon_status'], 'CLEARED')
        self.assertFalse(res['is_tripped'])
        self.assertEqual(res['offending_items_count'], 0)
        self.assertEqual(len(res['trip_reasons']), 0)

    def test_volume_spike_tripped(self):
        """Proposed quantity +50% above baseline with delta >= 5 must trip Andon latch."""
        items = [
            {
                'product_id': 'prod-2',
                'product_name': 'Navneet Science Std 10',
                'proposed_quantity': 150,
                'baseline_quantity': 100,      # +50% spike, delta=50
                'proposed_unit_cost': 70.0,
                'baseline_unit_cost': 70.0,
                'selling_price': 95.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res['andon_status'], 'TRIPPED')
        self.assertTrue(res['is_tripped'])
        self.assertEqual(res['offending_items_count'], 1)
        self.assertTrue(any('Volume variance +50.0%' in r for r in res['trip_reasons']))

    def test_volume_drop_tripped(self):
        """Proposed quantity -50% below baseline with delta >= 5 must trip Andon latch."""
        items = [
            {
                'product_id': 'prod-3',
                'product_name': 'Chetana English Std 8',
                'proposed_quantity': 50,
                'baseline_quantity': 100,      # -50% drop, delta=-50
                'proposed_unit_cost': 45.0,
                'baseline_unit_cost': 45.0,
                'selling_price': 60.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res['andon_status'], 'TRIPPED')
        self.assertTrue(res['is_tripped'])
        self.assertTrue(any('Volume variance -50.0%' in r for r in res['trip_reasons']))

    def test_volume_noise_floor_passes(self):
        """1 unit to 2 units is +100%, but delta=1 is below noise floor (5) -> must stay CLEARED."""
        items = [
            {
                'product_id': 'prod-pen',
                'product_name': 'Reynolds 045 Fine Carbure Ball Pen',
                'proposed_quantity': 2,
                'baseline_quantity': 1,        # +100% relative, but delta=1
                'proposed_unit_cost': 8.0,
                'baseline_unit_cost': 8.0,
                'selling_price': 10.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res['andon_status'], 'CLEARED')
        self.assertFalse(res['is_tripped'])

    def test_cost_hike_tripped(self):
        """Cost price hike > 15% with line cost delta >= 500 must trip Andon latch."""
        items = [
            {
                'product_id': 'prod-book',
                'product_name': 'Oxford School Atlas',
                'proposed_quantity': 30,
                'baseline_quantity': 30,
                'proposed_unit_cost': 260.0,
                'baseline_unit_cost': 200.0,   # +30% cost hike, line delta = 60 * 30 = 1800 >= 500
                'selling_price': 300.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res['andon_status'], 'TRIPPED')
        self.assertTrue(res['is_tripped'])
        self.assertTrue(any('Unit cost hike +30.0%' in r for r in res['trip_reasons']))

    def test_cost_hike_noise_floor_passes(self):
        """Cost hike > 15% but line cost delta < 500 -> passes without halting operations."""
        items = [
            {
                'product_id': 'prod-eraser',
                'product_name': 'Apsara Non-Dust Eraser',
                'proposed_quantity': 10,
                'baseline_quantity': 10,
                'proposed_unit_cost': 4.0,
                'baseline_unit_cost': 3.0,     # +33% cost hike, line delta = 1 * 10 = 10 < 500
                'selling_price': 5.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res['andon_status'], 'CLEARED')
        self.assertFalse(res['is_tripped'])

    def test_margin_compression_tripped(self):
        """Gross margin compression > 15 percentage points must trip Andon latch."""
        # Selling price 100. Baseline cost 50 (margin 50%). Proposed cost 70 (margin 30%).
        # Margin drop is 20 percentage points (> 15% threshold).
        items = [
            {
                'product_id': 'prod-diary',
                'product_name': 'School Student Almanac Diary',
                'proposed_quantity': 50,
                'baseline_quantity': 50,
                'proposed_unit_cost': 70.0,
                'baseline_unit_cost': 50.0,
                'selling_price': 100.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res['andon_status'], 'TRIPPED')
        self.assertTrue(res['is_tripped'])
        self.assertTrue(any('Gross margin compressed' in r for r in res['trip_reasons']))

    def test_unanchored_new_sku_trial_vs_large(self):
        """New SKU with baseline 0: Small trial batch (<= 10) CLEARED; Large batch (> 10) TRIPPED."""
        small_trial = [
            {
                'product_id': 'new-sku-1',
                'product_name': 'New Gujarat Board Vedic Maths Std 9',
                'proposed_quantity': 8,
                'baseline_quantity': 0,
                'proposed_unit_cost': 50.0,
                'baseline_unit_cost': 0.0,
                'selling_price': 75.0,
            }
        ]
        res_small = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=small_trial,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res_small['andon_status'], 'CLEARED')

        large_unanchored = [
            {
                'product_id': 'new-sku-2',
                'product_name': 'New Sanskrit Grammar Guide',
                'proposed_quantity': 80,
                'baseline_quantity': 0,
                'proposed_unit_cost': 60.0,
                'baseline_unit_cost': 0.0,
                'selling_price': 90.0,
            }
        ]
        res_large = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=large_unanchored,
            evaluation_date=self.normal_date
        )
        self.assertEqual(res_large['andon_status'], 'TRIPPED')
        self.assertTrue(any('Unanchored new SKU' in r for r in res_large['trip_reasons']))

    def test_late_season_june_cutoff_tripped(self):
        """Orders generated between June 1st and June 15th with >= 20 units must trip late-season latch."""
        june_date = date(2026, 6, 5)  # 5 days before schools reopen
        items = [
            {
                'product_id': 'prod-textbook',
                'product_name': 'Class 10 Syllabus Textbook',
                'proposed_quantity': 25,
                'baseline_quantity': 25,
                'proposed_unit_cost': 100.0,
                'baseline_unit_cost': 100.0,
                'selling_price': 130.0,
            }
        ]
        res = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=items,
            evaluation_date=june_date
        )
        self.assertEqual(res['andon_status'], 'TRIPPED')
        self.assertTrue(res['is_tripped'])
        self.assertTrue(any('LATE-SEASON INVENTORY RISK' in r for r in res['trip_reasons']))

    def test_fastapi_andon_evaluate_endpoint(self):
        """FastAPI route /api/v1/engines/governance/andon-evaluate returns typed JSON schema."""
        payload = {
            'items': [
                {
                    'product_id': 'prod-api-1',
                    'product_name': 'Navneet English Grammar Std 10',
                    'proposed_quantity': 180,
                    'baseline_quantity': 100,  # +80% spike
                    'proposed_unit_cost': 50.0,
                    'baseline_unit_cost': 50.0,
                    'selling_price': 75.0,
                }
            ],
            'evaluation_date': '2026-04-20',
            'vendor_name': 'Navneet Publications'
        }
        response = self.client.post('/api/v1/engines/governance/andon-evaluate', json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['andon_status'], 'TRIPPED')
        self.assertTrue(data['is_tripped'])
        self.assertEqual(data['total_items_evaluated'], 1)
        self.assertEqual(data['offending_items_count'], 1)
        self.assertIn('trip_reasons', data)
        self.assertIn('evaluations', data)
        self.assertIn('execution_ms', data)
