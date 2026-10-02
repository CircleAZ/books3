"""
Unit and Integration Tests for Engine 4: Dynamic Pricing & Margin Elasticity Simulator.
Tests Log-Log econometric regression, Bayesian shrinkage on zero-variance prices,
positive elasticity anomaly clamping, mechanical governor ceilings, scenario simulations,
and FastAPI REST endpoints.
"""

import unittest
from fastapi.testclient import TestClient
from services.azbooks_analytics.main import app
from services.azbooks_analytics.engines.pricing import (
    DynamicPricingEngine,
    pricing_engine,
)


class TestDynamicPricingEngine(unittest.TestCase):
    def setUp(self):
        self.engine = DynamicPricingEngine(
            max_price_hike_pct=0.15,
            max_price_drop_pct=0.20,
            min_gross_margin_pct=0.05,
            shrinkage_regularizer=0.15,
        )
        self.client = TestClient(app)

    def test_log_log_regression_elastic_demand(self):
        """Standard elastic commodity (e.g. branded ballpen): price increases lead to steep volume drop."""
        # P = 20, 25, 30, 35; Q = 500, 320, 200, 130
        prices = [20.0, 25.0, 30.0, 35.0]
        quantities = [500.0, 320.0, 200.0, 130.0]

        e, r2, p_var, conf, has_ano, _ = self.engine.compute_elasticity(
            prices=prices,
            quantities=quantities,
            category_name="Stationery",
        )
        self.assertLess(e, -1.5)  # Highly elastic
        self.assertGreater(r2, 0.90)  # Strong fit
        self.assertFalse(has_ano)
        self.assertIn(conf, ["HIGH", "MODERATE"])

    def test_log_log_regression_inelastic_demand(self):
        """Inelastic school syllabus digest: price increases have minimal volume attrition."""
        # P = 140, 145, 150, 155; Q = 100, 97, 95, 93
        prices = [140.0, 145.0, 150.0, 155.0]
        quantities = [100.0, 97.0, 95.0, 93.0]

        e, r2, p_var, conf, has_ano, _ = self.engine.compute_elasticity(
            prices=prices,
            quantities=quantities,
            category_name="Textbook",
        )
        self.assertGreater(e, -1.0)  # Inelastic (between 0.0 and -1.0)
        self.assertLess(e, 0.0)
        self.assertFalse(has_ano)

    def test_zero_price_variance_bayesian_shrinkage(self):
        """Fixed-price textbook with zero price variance shrinks safely to category prior without ZeroDivisionError."""
        # Fixed price = 180.0 across all transactions
        prices = [180.0, 180.0, 180.0, 180.0, 180.0]
        quantities = [12.0, 15.0, 20.0, 8.0, 14.0]

        e, r2, p_var, conf, has_ano, reason = self.engine.compute_elasticity(
            prices=prices,
            quantities=quantities,
            category_name="Textbook",
        )
        self.assertEqual(p_var, 0.0)
        self.assertEqual(conf, "LOW_SHRUNK")
        self.assertFalse(has_ano)
        # Should match textbook baseline prior (-0.65)
        self.assertEqual(e, -0.65)
        self.assertIn("Zero historical price variation", reason)

    def test_positive_elasticity_anomaly_clamping(self):
        """Confounded rush-season data where higher prices coincide with higher sales is clamped safely."""
        # Spurious upward-sloping demand
        prices = [100.0, 110.0, 120.0, 130.0]
        quantities = [50.0, 70.0, 90.0, 120.0]

        e, r2, p_var, conf, has_ano, reason = self.engine.compute_elasticity(
            prices=prices,
            quantities=quantities,
            category_name="Notebook",
        )
        self.assertTrue(has_ano)
        self.assertLess(e, 0.0)  # Clamped to downward slope
        self.assertIn("positive regression slope", reason)

    def test_mechanical_governor_hike_ceiling(self):
        """Inelastic product price recommendations are strictly capped at max +15% hike (TPS Andon Cord ceiling)."""
        # Inelastic elasticity = -0.40. Unconstrained math -> infinity.
        opt_p, change_pct, reason = self.engine.calculate_optimal_price(
            current_price=100.0,
            unit_cost=70.0,
            elasticity=-0.40,
            mrp=150.0,
        )
        self.assertEqual(opt_p, 115.0)  # Exactly +15% ceiling
        self.assertEqual(change_pct, 15.0)

    def test_mrp_override_cap(self):
        """If MRP is tighter than the +15% ceiling, MRP acts as the hard mechanical stop."""
        opt_p, change_pct, _ = self.engine.calculate_optimal_price(
            current_price=100.0,
            unit_cost=70.0,
            elasticity=-0.40,
            mrp=108.0,  # MRP is only +8%
        )
        self.assertEqual(opt_p, 108.0)
        self.assertEqual(change_pct, 8.0)

    def test_gross_margin_floor(self):
        """Calculated price cannot breach unit cost + 5% gross margin floor."""
        # Unit cost 90.0, current price 100.0. Min gross margin 5% -> 90 / 0.95 = 94.74.
        opt_p, change_pct, _ = self.engine.calculate_optimal_price(
            current_price=100.0,
            unit_cost=90.0,
            elasticity=-2.5,  # Wildly elastic
        )
        min_allowed = 90.0 / 0.95
        self.assertGreaterEqual(opt_p, round(min_allowed, 2))

    def test_price_simulation_optimal_expansion(self):
        """Simulating a +5% price hike on an inelastic product expands total profit."""
        sim = self.engine.simulate_price_change(
            product_id="prod-101",
            product_name="Navneet Maths Std 10",
            current_price=100.0,
            proposed_price=105.0,
            unit_cost=70.0,
            baseline_volume=100.0,
            elasticity=-0.50,
        )
        self.assertEqual(sim.price_change_pct, 5.0)
        # Volume drops by approx 2.4%
        self.assertLess(sim.volume_change_pct, 0.0)
        self.assertGreater(sim.volume_change_pct, -3.0)
        # Profit expands
        self.assertGreater(sim.profit_change_pct, 0.0)
        self.assertEqual(sim.verdict, "OPTIMAL_EXPANSION")
        self.assertFalse(sim.andon_latch_tripped)

    def test_price_simulation_andon_latch_trip(self):
        """Simulating a +25% hike breaches the +15% throttle limit and trips the TPS Andon latch."""
        sim = self.engine.simulate_price_change(
            product_id="prod-102",
            product_name="Drawing Book A4",
            current_price=100.0,
            proposed_price=125.0,  # +25% hike
            unit_cost=50.0,
            baseline_volume=100.0,
            elasticity=-1.8,
        )
        self.assertTrue(sim.andon_latch_tripped)
        self.assertEqual(sim.verdict, "ANDON_LATCH_TRIPPED")
        self.assertIn("Andon Cord tripped", sim.commercial_summary)

    def test_api_elasticity_endpoint(self):
        """Tests POST /api/v1/engines/pricing/elasticity via FastAPI TestClient."""
        payload = {
            "product_id": "p-test-01",
            "product_name": "Geometry Box Deluxe",
            "category_name": "Stationery",
            "current_price": 120.0,
            "unit_cost": 80.0,
            "transactions": [
                {"price": 110.0, "quantity": 60.0},
                {"price": 120.0, "quantity": 45.0},
                {"price": 130.0, "quantity": 30.0},
                {"price": 140.0, "quantity": 18.0},
            ],
        }
        res = self.client.post("/api/v1/engines/pricing/elasticity", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["result"]["demand_classification"], "ELASTIC")
        self.assertGreater(data["execution_ms"], 0.0)

    def test_api_batch_elasticity_endpoint(self):
        """Tests POST /api/v1/engines/pricing/batch-elasticity."""
        payload = {
            "items": [
                {
                    "product_id": "p-01",
                    "product_name": "Textbook Gujarati Std 1",
                    "category_name": "Textbook",
                    "current_price": 50.0,
                    "unit_cost": 35.0,
                },
                {
                    "product_id": "p-02",
                    "product_name": "Marker Pen Pack of 4",
                    "category_name": "Stationery",
                    "current_price": 80.0,
                    "unit_cost": 50.0,
                },
            ]
        }
        res = self.client.post("/api/v1/engines/pricing/batch-elasticity", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_items"], 2)
        self.assertEqual(len(data["results"]), 2)

    def test_api_simulate_endpoint(self):
        """Tests POST /api/v1/engines/pricing/simulate."""
        payload = {
            "product_id": "p-01",
            "product_name": "Textbook Gujarati Std 1",
            "current_price": 50.0,
            "proposed_price": 55.0,
            "unit_cost": 35.0,
            "baseline_volume": 200.0,
            "price_elasticity": -0.65,
        }
        res = self.client.post("/api/v1/engines/pricing/simulate", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["simulation"]["price_change_pct"], 10.0)
        self.assertGreater(data["simulation"]["projected_profit"], data["simulation"]["baseline_profit"])


if __name__ == "__main__":
    unittest.main()
