"""
Unit and API integration tests for Engine 1: Market Basket & Cross-Selling.
"""

import unittest
import polars as pl
from fastapi.testclient import TestClient
from services.azbooks_analytics.main import app
from services.azbooks_analytics.engines.cross_sell import CrossSellEngine, cross_sell_engine


class CrossSellEngineTestCase(unittest.TestCase):
    def setUp(self):
        # Create deterministic synthetic retail baskets:
        # Order 1-6: Maths 9 + Geometry Box (Organic)
        # Order 7-8: Maths 9 + Geometry Box (Recommendation prompted)
        # Order 9: Maths 9 + Drawing Book (Organic)
        # Order 10: Science 9 + Pen (Organic)
        self.transactions = []
        for i in range(1, 7):
            self.transactions.extend([
                {"order_id": f"ORD-{i}", "product_id": "P-MATH", "product_name": "Navneet Maths Std 9", "attribution_source": "organic"},
                {"order_id": f"ORD-{i}", "product_id": "P-GEOM", "product_name": "Camlin Geometry Box", "attribution_source": "organic"},
            ])
        for i in range(7, 9):
            self.transactions.extend([
                {"order_id": f"ORD-{i}", "product_id": "P-MATH", "product_name": "Navneet Maths Std 9", "attribution_source": "recommendation"},
                {"order_id": f"ORD-{i}", "product_id": "P-GEOM", "product_name": "Camlin Geometry Box", "attribution_source": "recommendation"},
            ])
        self.transactions.extend([
            {"order_id": "ORD-9", "product_id": "P-MATH", "product_name": "Navneet Maths Std 9", "attribution_source": "organic"},
            {"order_id": "ORD-9", "product_id": "P-DRAW", "product_name": "Classmate Drawing Book", "attribution_source": "organic"},
            {"order_id": "ORD-10", "product_id": "P-SCI", "product_name": "Navneet Science Std 9", "attribution_source": "organic"},
            {"order_id": "ORD-10", "product_id": "P-PEN", "product_name": "Reynolds Pen Pack", "attribution_source": "organic"},
        ])
        self.df = pl.DataFrame(self.transactions)

    def test_basic_association_rules(self):
        engine = CrossSellEngine(min_support=0.05, min_confidence=0.10, min_lift=1.0)
        rules = engine.analyze(self.df)

        self.assertGreater(len(rules), 0)
        # Find rule Maths -> Geometry
        math_to_geom = next((r for r in rules if r.antecedent_ids == ["P-MATH"] and r.consequent_id == "P-GEOM"), None)
        self.assertIsNotNone(math_to_geom)
        self.assertEqual(math_to_geom.consequent_name, "Camlin Geometry Box")
        self.assertGreater(math_to_geom.confidence, 0.70)
        self.assertGreater(math_to_geom.lift, 1.0)
        self.assertEqual(math_to_geom.co_occurrence_count, 8)
        self.assertEqual(math_to_geom.organic_co_occurrence_count, 6)
        self.assertEqual(math_to_geom.prompted_co_occurrence_count, 2)
        self.assertIn("Customers purchasing 'Navneet Maths Std 9'", math_to_geom.pitch_script)

    def test_inverse_propensity_debiasing(self):
        # Engine with 1.0 weight (no de-biasing) vs 0.25 weight (de-biased)
        engine_standard = CrossSellEngine(min_support=0.01, min_confidence=0.01, min_lift=1.0, recommendation_weight=1.0)
        rules_standard = engine_standard.analyze(self.df)
        std_rule = next(r for r in rules_standard if r.antecedent_ids == ["P-MATH"] and r.consequent_id == "P-GEOM")

        engine_debiased = CrossSellEngine(min_support=0.01, min_confidence=0.01, min_lift=1.0, recommendation_weight=0.25)
        rules_debiased = engine_debiased.analyze(self.df)
        deb_rule = next(r for r in rules_debiased if r.antecedent_ids == ["P-MATH"] and r.consequent_id == "P-GEOM")

        # De-biased rule weights prompted pairs down:
        # Prompted transactions (ORD-7, ORD-8) have weight 0.25 instead of 1.0
        self.assertLess(deb_rule.support, std_rule.support)

    def test_empty_and_single_item_edge_cases(self):
        engine = CrossSellEngine()
        # Empty DataFrame
        self.assertEqual(engine.analyze(pl.DataFrame()), [])

        # Single item orders (cannot form pairs)
        single_items = pl.DataFrame([
            {"order_id": "O1", "product_id": "P1", "product_name": "Item 1", "attribution_source": "organic"},
            {"order_id": "O2", "product_id": "P2", "product_name": "Item 2", "attribution_source": "organic"},
        ])
        self.assertEqual(engine.analyze(single_items), [])

    def test_triplet_candidate_generation(self):
        # 10 orders containing Maths, Geometry, and Compass together
        triplet_tx = []
        for i in range(1, 11):
            triplet_tx.extend([
                {"order_id": f"ORD-{i}", "product_id": "P-MATH", "product_name": "Maths", "attribution_source": "organic"},
                {"order_id": f"ORD-{i}", "product_id": "P-GEOM", "product_name": "Geometry", "attribution_source": "organic"},
                {"order_id": f"ORD-{i}", "product_id": "P-COMP", "product_name": "Compass", "attribution_source": "organic"},
            ])
        engine = CrossSellEngine(min_support=0.05, min_confidence=0.10, min_lift=1.0, max_antecedents=2)
        rules = engine.analyze(pl.DataFrame(triplet_tx))
        triplet_rule = next((r for r in rules if len(r.antecedent_ids) == 2 and r.consequent_id == "P-COMP"), None)
        self.assertIsNotNone(triplet_rule)
        self.assertEqual(len(triplet_rule.antecedent_ids), 2)
        self.assertEqual(triplet_rule.consequent_name, "Compass")

    def test_customer_gap_analysis(self):
        orders = pl.DataFrame([
            # Customer A bought both Maths and Geometry
            {"customer_id": "C-1", "customer_name": "Ramesh Patel", "product_id": "P-MATH", "product_name": "Navneet Maths", "line_total": 250.0},
            {"customer_id": "C-1", "customer_name": "Ramesh Patel", "product_id": "P-GEOM", "product_name": "Camlin Geometry", "line_total": 120.0},
            # Customer B bought Maths only (TARGET GAP)
            {"customer_id": "C-2", "customer_name": "Suresh Shah", "product_id": "P-MATH", "product_name": "Navneet Maths", "line_total": 250.0},
            # Customer C bought Science only (Not in antecedent)
            {"customer_id": "C-3", "customer_name": "Dinesh Joshi", "product_id": "P-SCI", "product_name": "Navneet Science", "line_total": 220.0},
        ])

        cohort = cross_sell_engine.find_gap_customers(
            orders_df=orders,
            antecedent_ids=["P-MATH"],
            consequent_id="P-GEOM",
            consequent_price=120.0,
        )

        self.assertEqual(cohort.total_target_customers, 1)
        self.assertEqual(cohort.customers[0]["customer_id"], "C-2")
        self.assertEqual(cohort.customers[0]["customer_name"], "Suresh Shah")
        self.assertEqual(cohort.consequent_price, 120.0)
        self.assertEqual(cohort.estimated_incremental_revenue, 120.0)


class CrossSellAPITestCase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_rules_endpoint(self):
        payload = {
            "transactions": [
                {"order_id": "1", "product_id": "101", "product_name": "A", "attribution_source": "organic"},
                {"order_id": "1", "product_id": "102", "product_name": "B", "attribution_source": "organic"},
                {"order_id": "2", "product_id": "101", "product_name": "A", "attribution_source": "organic"},
                {"order_id": "2", "product_id": "102", "product_name": "B", "attribution_source": "organic"},
                {"order_id": "3", "product_id": "101", "product_name": "A", "attribution_source": "organic"},
                {"order_id": "3", "product_id": "103", "product_name": "C", "attribution_source": "organic"},
            ],
            "min_support": 0.05,
            "min_confidence": 0.10,
            "min_lift": 1.0,
        }
        res = self.client.post("/api/v1/engines/cross-sell/rules", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertGreaterEqual(data["total_rules"], 1)

    def test_gap_analysis_endpoint(self):
        payload = {
            "orders_data": [
                {"customer_id": "C-1", "customer_name": "Anil", "product_id": "P1", "product_name": "Pen", "line_total": 50.0},
                {"customer_id": "C-1", "customer_name": "Anil", "product_id": "P2", "product_name": "Refill", "line_total": 20.0},
                {"customer_id": "C-2", "customer_name": "Bhavik", "product_id": "P1", "product_name": "Pen", "line_total": 50.0},
            ],
            "antecedent_ids": ["P1"],
            "consequent_id": "P2",
            "consequent_price": 20.0,
        }
        res = self.client.post("/api/v1/engines/cross-sell/gap-analysis", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_target_customers"], 1)
        self.assertEqual(data["customers"][0]["customer_name"], "Bhavik")
        self.assertEqual(data["estimated_incremental_revenue"], 20.0)


if __name__ == "__main__":
    unittest.main()
