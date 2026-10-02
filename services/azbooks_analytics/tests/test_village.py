"""
Unit and Integration Tests for Engine 3: Geographic Village Penetration & Momentum Matrix.
Tests H3 spatial tokenization, RMI zero-division immunity, penetration depth bounding,
strategic quadrant classification, cohort extraction, and FastAPI endpoints.
"""

import unittest
from fastapi.testclient import TestClient
from services.azbooks_analytics.main import app
from services.azbooks_analytics.engines.village import (
    GeographicVillageEngine,
    village_engine,
)


class TestGeographicVillageEngine(unittest.TestCase):
    def setUp(self):
        self.engine = GeographicVillageEngine(
            frontier_rmi_threshold=0.15,
            penetration_threshold=0.35,
            default_capacity_floor=25,
        )
        self.client = TestClient(app)

        # Realistic South Gujarat geographic sample dataset (Bardoli, Valod, Kadod, Mahuva)
        self.sample_records = [
            # Village 1: Krushnapur (High growth, low penetration -> HIGH_GROWTH_FRONTIER)
            {
                "village_id": "v-krushnapur",
                "village_name": "Krushnapur",
                "taluka": "Valod",
                "district": "Tapi",
                "customer_id": "c-001",
                "customer_name": "Shree Sardar Vidhyalaya",
                "phone": "+919825100001",
                "order_id": "ord-101",
                "order_total": 45000.0,
                "season": "current",
                "latitude": 21.1442,
                "longitude": 73.1436,
                "estimated_capacity": 100,
            },
            {
                "village_id": "v-krushnapur",
                "village_name": "Krushnapur",
                "taluka": "Valod",
                "district": "Tapi",
                "customer_id": "c-002",
                "customer_name": "Krushnapur Primary School",
                "phone": "+919825100002",
                "order_id": "ord-102",
                "order_total": 25000.0,
                "season": "current",
                "latitude": 21.1445,
                "longitude": 73.1439,
                "estimated_capacity": 100,
            },
            {
                "village_id": "v-krushnapur",
                "village_name": "Krushnapur",
                "taluka": "Valod",
                "district": "Tapi",
                "customer_id": "c-001",
                "customer_name": "Shree Sardar Vidhyalaya",
                "phone": "+919825100001",
                "order_id": "ord-103",
                "order_total": 35000.0,
                "season": "prior",
                "latitude": 21.1442,
                "longitude": 73.1436,
                "estimated_capacity": 100,
            },
            # Village 2: Bardoli Town (High revenue, high penetration -> CORE_FORTRESS)
            {
                "village_id": "v-bardoli",
                "village_name": "Bardoli Center",
                "taluka": "Bardoli",
                "district": "Surat",
                "customer_id": "c-003",
                "customer_name": "Kanya Chhatralaya",
                "phone": "+919825100003",
                "order_id": "ord-201",
                "order_total": 80000.0,
                "season": "current",
                "latitude": 21.1255,
                "longitude": 73.1122,
                "estimated_capacity": 5,
            },
            {
                "village_id": "v-bardoli",
                "village_name": "Bardoli Center",
                "taluka": "Bardoli",
                "district": "Surat",
                "customer_id": "c-004",
                "customer_name": "Bardoli High School",
                "phone": "+919825100004",
                "order_id": "ord-202",
                "order_total": 95000.0,
                "season": "current",
                "latitude": 21.1258,
                "longitude": 73.1125,
                "estimated_capacity": 5,
            },
            {
                "village_id": "v-bardoli",
                "village_name": "Bardoli Center",
                "taluka": "Bardoli",
                "district": "Surat",
                "customer_id": "c-003",
                "customer_name": "Kanya Chhatralaya",
                "phone": "+919825100003",
                "order_id": "ord-203",
                "order_total": 60000.0,
                "season": "prior",
                "latitude": 21.1255,
                "longitude": 73.1122,
                "estimated_capacity": 5,
            },
            # Village 3: Mahuva (Declining revenue, high penetration -> AT_RISK_DEFENSIVE)
            {
                "village_id": "v-mahuva",
                "village_name": "Mahuva",
                "taluka": "Mahuva",
                "district": "Surat",
                "customer_id": "c-005",
                "customer_name": "Mahuva Educational Trust",
                "phone": "+919825100005",
                "order_id": "ord-301",
                "order_total": 20000.0,
                "season": "current",
                "latitude": 20.9572,
                "longitude": 73.1491,
                "estimated_capacity": 2,
            },
            {
                "village_id": "v-mahuva",
                "village_name": "Mahuva",
                "taluka": "Mahuva",
                "district": "Surat",
                "customer_id": "c-005",
                "customer_name": "Mahuva Educational Trust",
                "phone": "+919825100005",
                "order_id": "ord-302",
                "order_total": 50000.0,
                "season": "prior",
                "latitude": 20.9572,
                "longitude": 73.1491,
                "estimated_capacity": 2,
            },
            # Village 4: Degama (Newly opened, ₹0 prior revenue -> Division by Zero Test)
            {
                "village_id": "v-degama",
                "village_name": "Degama",
                "taluka": "Valod",
                "district": "Tapi",
                "customer_id": "c-006",
                "customer_name": "Degama Ashram Shala",
                "phone": "+919825100006",
                "order_id": "ord-401",
                "order_total": 18000.0,
                "season": "current",
                "latitude": 21.1610,
                "longitude": 73.2045,
                "estimated_capacity": 30,
            },
        ]

    def test_h3_spatial_token_generation_valid(self):
        """Valid coordinates generate non-zero uint64 tokens and matching 15-character hex strings."""
        t7, h7, t8, h8, is_geo = self.engine.latlng_to_h3_tokens(21.1255, 73.1122)
        self.assertTrue(is_geo)
        self.assertIsInstance(t7, int)
        self.assertGreater(t7, 0)
        self.assertEqual(len(h7), 15)
        self.assertEqual(int(h7, 16), t7)

        self.assertIsInstance(t8, int)
        self.assertGreater(t8, 0)
        self.assertEqual(len(h8), 15)
        self.assertEqual(int(h8, 16), t8)

    def test_h3_spatial_token_generation_invalid(self):
        """Invalid, None, NaN, and out-of-range coordinates gracefully fallback without crashing."""
        for invalid_lat, invalid_lng in [
            (None, None),
            (21.12, None),
            (None, 73.11),
            (999.0, 73.11),
            (21.12, 999.0),
            (float("nan"), 73.11),
        ]:
            t7, h7, t8, h8, is_geo = self.engine.latlng_to_h3_tokens(invalid_lat, invalid_lng)
            self.assertFalse(is_geo)
            self.assertEqual(t7, 0)
            self.assertEqual(h7, "")
            self.assertEqual(t8, 0)
            self.assertEqual(h8, "")

    def test_revenue_momentum_zero_division_immunity(self):
        """Verifies that villages with ₹0 prior revenue (like newly opened Degama) do not cause ZeroDivisionError."""
        matrix = self.engine.analyze(self.sample_records)
        degama_item = next((m for m in matrix if m.village_id == "v-degama"), None)
        self.assertIsNotNone(degama_item)
        self.assertEqual(degama_item.prior_season_revenue, 0.0)
        self.assertEqual(degama_item.current_season_revenue, 18000.0)
        # RMI = (18000 - 0) / max(1.0, 0) = 18000.0 (clean finite float, no NaN/Infinity)
        self.assertEqual(degama_item.revenue_momentum_index, 18000.0)
        self.assertEqual(degama_item.strategic_quadrant, "HIGH_GROWTH_FRONTIER")

    def test_strategic_quadrant_classification(self):
        """Verifies accurate assignment to HIGH_GROWTH_FRONTIER, CORE_FORTRESS, and AT_RISK_DEFENSIVE."""
        matrix = self.engine.analyze(self.sample_records)
        v_map = {m.village_id: m for m in matrix}

        # Krushnapur: Curr ₹70,000 vs Prior ₹35,000 (+100% RMI), Penetration 2/100 = 0.02 (< 0.35) -> FRONTIER
        self.assertEqual(v_map["v-krushnapur"].strategic_quadrant, "HIGH_GROWTH_FRONTIER")
        self.assertEqual(v_map["v-krushnapur"].penetration_depth, 0.02)
        self.assertEqual(v_map["v-krushnapur"].revenue_momentum_index, 1.0)

        # Bardoli: Curr ₹175,000 vs Prior ₹60,000 (+191% RMI), Penetration 2/5 = 0.40 (>= 0.35) -> CORE_FORTRESS
        self.assertEqual(v_map["v-bardoli"].strategic_quadrant, "CORE_FORTRESS")
        self.assertEqual(v_map["v-bardoli"].penetration_depth, 0.40)

        # Mahuva: Curr ₹20,000 vs Prior ₹50,000 (-60% RMI), Penetration 1/2 = 0.50 (>= 0.35) -> AT_RISK_DEFENSIVE
        self.assertEqual(v_map["v-mahuva"].strategic_quadrant, "AT_RISK_DEFENSIVE")
        self.assertEqual(v_map["v-mahuva"].penetration_depth, 0.50)
        self.assertEqual(v_map["v-mahuva"].revenue_momentum_index, -0.6)

    def test_penetration_depth_clamping(self):
        """Penetration depth is strictly bounded in [0.0, 1.0] even if customers exceed capacity."""
        overflow_records = [
            {
                "village_id": "v-tiny",
                "customer_id": f"c-{i}",
                "order_id": f"ord-{i}",
                "order_total": 1000.0,
                "season": "current",
                "estimated_capacity": 2,  # 5 customers on 2 capacity
            }
            for i in range(5)
        ]
        matrix = self.engine.analyze(overflow_records)
        self.assertEqual(len(matrix), 1)
        self.assertEqual(matrix[0].penetration_depth, 1.0)  # Clamped to 1.0, not 2.5
        self.assertEqual(matrix[0].penetration_percentage, 100.0)

    def test_target_cohort_extraction(self):
        """Extracts customer cohort for HIGH_GROWTH_FRONTIER villages."""
        cohort = self.engine.extract_target_cohort(
            self.sample_records,
            target_quadrants=["HIGH_GROWTH_FRONTIER"],
        )
        self.assertEqual(cohort["target_quadrants"], ["HIGH_GROWTH_FRONTIER"])
        # Qualifying villages: Krushnapur and Degama
        self.assertEqual(cohort["target_village_count"], 2)
        # Customers: c-001, c-002, c-006 = 3 customers
        self.assertEqual(cohort["total_customers"], 3)
        cust_ids = [c["customer_id"] for c in cohort["customers"]]
        self.assertIn("c-001", cust_ids)
        self.assertIn("c-002", cust_ids)
        self.assertIn("c-006", cust_ids)
        self.assertNotIn("c-003", cust_ids)  # Bardoli (CORE_FORTRESS) excluded

    def test_api_village_penetration_endpoint(self):
        """Tests POST /api/v1/engines/village/penetration via FastAPI TestClient."""
        response = self.client.post(
            "/api/v1/engines/village/penetration",
            json={"records": self.sample_records},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_villages"], 4)
        self.assertEqual(data["frontier_count"], 2)
        self.assertEqual(data["fortress_count"], 1)
        self.assertEqual(data["at_risk_count"], 1)
        self.assertGreater(data["execution_ms"], 0.0)

    def test_api_village_target_cohort_endpoint(self):
        """Tests POST /api/v1/engines/village/target-cohort via FastAPI TestClient."""
        response = self.client.post(
            "/api/v1/engines/village/target-cohort",
            json={
                "records": self.sample_records,
                "target_quadrants": ["AT_RISK_DEFENSIVE"],
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["target_village_count"], 1)  # Only Mahuva
        self.assertEqual(data["total_customers"], 1)
        self.assertEqual(data["customers"][0]["customer_id"], "c-005")
        self.assertGreater(data["execution_ms"], 0.0)


if __name__ == "__main__":
    unittest.main()
