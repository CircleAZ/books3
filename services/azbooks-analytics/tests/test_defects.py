"""
Unit and Integration Tests for Engine 5: Product Quality & Customer Dissatisfaction Radar.
Tests Bayesian Laplace defect smoothing, strict consignment return segregation,
vendor scorecard grading, PO freeze recommendations, and dissatisfied customer churn clusters.
"""

import unittest
from fastapi.testclient import TestClient
from services.azbooks_analytics.main import app
from services.azbooks_analytics.engines.defects import (
    QualityDefectRadarEngine,
    defect_engine,
)


class TestQualityDefectRadarEngine(unittest.TestCase):
    def setUp(self):
        self.engine = QualityDefectRadarEngine(
            alpha=1.0,
            beta=99.0,
            po_freeze_threshold=6.0,
            min_defects_for_freeze=5,
        )
        self.client = TestClient(app)

        # Realistic retail test dataset
        self.sample_sales = [
            # Product 1: Best-selling syllabus guide (1,000 units sold)
            {
                "product_id": "p-navneet-10",
                "product_name": "Navneet Digest Class 10 Science",
                "category_name": "Textbook",
                "vendor_id": "v-navneet",
                "vendor_name": "Navneet Education Ltd",
                "customer_id": "c-001",
                "quantity": 600,
            },
            {
                "product_id": "p-navneet-10",
                "product_name": "Navneet Digest Class 10 Science",
                "category_name": "Textbook",
                "vendor_id": "v-navneet",
                "vendor_name": "Navneet Education Ltd",
                "customer_id": "c-002",
                "quantity": 400,
            },
            # Product 2: Fragile Clear Book Covers (500 units sold)
            {
                "product_id": "p-clear-cover",
                "product_name": "Clear Plastic Book Cover 50m",
                "category_name": "Stationery",
                "vendor_id": "v-plasticorp",
                "vendor_name": "PlastiCorp Gujarat",
                "customer_id": "c-003",
                "quantity": 300,
            },
            {
                "product_id": "p-clear-cover",
                "product_name": "Clear Plastic Book Cover 50m",
                "category_name": "Stationery",
                "vendor_id": "v-plasticorp",
                "vendor_name": "PlastiCorp Gujarat",
                "customer_id": "c-004",
                "quantity": 200,
            },
            # Product 3: Single specialty item (1 unit sold)
            {
                "product_id": "p-art-pen",
                "product_name": "Calligraphy Dip Pen Gold",
                "category_name": "Stationery",
                "vendor_id": "v-crafts",
                "vendor_name": "Artisan Crafts",
                "customer_id": "c-005",
                "quantity": 1,
            },
        ]

        self.sample_returns = [
            # Consignment returns for Product 1 (300 units returned unsold at end of term)
            {
                "product_id": "p-navneet-10",
                "customer_id": "c-001",
                "customer_name": "Bardoli Vidyalaya School Outlet",
                "phone": "+919825100001",
                "village_name": "Bardoli",
                "reason": "consignment_unsold",
                "quantity": 300,
                "refund_amount": 45000.0,
            },
            # Physical defect for Product 1 (only 2 units with misprint/binding defect)
            {
                "product_id": "p-navneet-10",
                "customer_id": "c-002",
                "customer_name": "Ramesh Patel",
                "phone": "+919825100002",
                "village_name": "Kadod",
                "reason": "binding_failure",
                "quantity": 2,
                "refund_amount": 300.0,
            },
            # Defective returns for Product 2 (40 units with split seams)
            {
                "product_id": "p-clear-cover",
                "customer_id": "c-003",
                "customer_name": "Pooja Stationery Store",
                "phone": "+919825100003",
                "village_name": "Valod",
                "reason": "damaged",
                "quantity": 25,
                "refund_amount": 2500.0,
            },
            {
                "product_id": "p-clear-cover",
                "customer_id": "c-004",
                "customer_name": "Deepak Shah",
                "phone": "+919825100004",
                "village_name": "Valod",
                "reason": "quality_issue",
                "quantity": 15,
                "refund_amount": 1500.0,
            },
            # Single defect for Product 3 (1 broken pen out of 1 sold)
            {
                "product_id": "p-art-pen",
                "customer_id": "c-005",
                "customer_name": "Anita Desai",
                "phone": "+919825100005",
                "village_name": "Mahuva",
                "reason": "broken",
                "quantity": 1,
                "refund_amount": 250.0,
            },
        ]

    def test_strict_consignment_return_segregation(self):
        """
        NON-NEGOTIABLE INVARIANT:
        Unsold consignment returns (300 units) MUST NOT be counted as defects.
        Only the 2 physical binding_failure returns enter the defect rate calculation.
        """
        products = self.engine.analyze_products(self.sample_sales, self.sample_returns)
        navneet = next((p for p in products if p.product_id == "p-navneet-10"), None)
        self.assertIsNotNone(navneet)

        self.assertEqual(navneet.units_sold, 1000)
        self.assertEqual(navneet.consignment_unsold_returns, 300)
        self.assertEqual(navneet.physical_defect_returns, 2)
        self.assertEqual(navneet.consignment_return_rate_pct, 30.0)

        # Defect rate is evaluated ONLY on 2 physical defects:
        # theta = (2 + 1) / (1000 + 100) = 3 / 1100 = 0.27%
        self.assertEqual(navneet.bayesian_defect_rate_pct, 0.27)
        self.assertEqual(navneet.quality_status, "EXCELLENT")
        self.assertEqual(navneet.primary_defect_reason, "binding_failure")

    def test_bayesian_laplace_small_sample_smoothing(self):
        """
        Small-sample smoothing test: 1 unit sold and 1 returned broken.
        Raw rate is 100%, but Bayesian smoothed rate is (1+1)/(1+100) = 1.98%.
        Prevents premature panic on 1-off returns.
        """
        products = self.engine.analyze_products(self.sample_sales, self.sample_returns)
        art_pen = next((p for p in products if p.product_id == "p-art-pen"), None)
        self.assertIsNotNone(art_pen)

        self.assertEqual(art_pen.units_sold, 1)
        self.assertEqual(art_pen.physical_defect_returns, 1)
        self.assertEqual(art_pen.raw_defect_rate_pct, 100.0)
        self.assertEqual(art_pen.bayesian_defect_rate_pct, 1.98)
        self.assertEqual(art_pen.quality_status, "ACCEPTABLE")

    def test_vendor_scorecard_and_po_freeze(self):
        """
        PlastiCorp Gujarat has 40 defects on 500 units sold.
        theta = (40 + 1) / (500 + 100) = 41 / 600 = 6.83% (> 6.0% threshold).
        With 40 >= 5 defects, PO Freeze Latch MUST trip!
        """
        vendors = self.engine.analyze_vendors(self.sample_sales, self.sample_returns)
        v_map = {v.vendor_id: v for v in vendors}

        plasticorp = v_map.get("v-plasticorp")
        self.assertIsNotNone(plasticorp)
        self.assertEqual(plasticorp.total_physical_defects, 40)
        self.assertEqual(plasticorp.bayesian_defect_density_pct, 6.83)
        self.assertEqual(plasticorp.vendor_quality_grade, "CRITICAL_PO_FREEZE")
        self.assertTrue(plasticorp.po_freeze_recommended)
        self.assertIn("FREEZE PO CREATION", plasticorp.recommended_procurement_action)

        # Navneet: 2 defects on 1000 units sold -> 0.27% -> EXCELLENT, no freeze
        navneet = v_map.get("v-navneet")
        self.assertIsNotNone(navneet)
        self.assertEqual(navneet.bayesian_defect_density_pct, 0.27)
        self.assertEqual(navneet.vendor_quality_grade, "EXCELLENT")
        self.assertFalse(navneet.po_freeze_recommended)

    def test_dissatisfied_customer_retention_extraction(self):
        """
        Extracts customers experiencing physical defects (e.g. Pooja Stationery with 25 defective covers).
        Customers with only consignment returns (Bardoli Vidyalaya) are NOT flagged as dissatisfied churn risks.
        """
        dissatisfied = self.engine.extract_dissatisfied_customers(
            self.sample_sales,
            self.sample_returns,
            min_defective_items=2,
        )
        cust_ids = [c.customer_id for c in dissatisfied]

        # Pooja (25 defects) and Deepak (15 defects) and Ramesh (2 defects) qualify
        self.assertIn("c-003", cust_ids)  # Pooja (25 defects) -> CRITICAL
        self.assertIn("c-004", cust_ids)  # Deepak (15 defects) -> CRITICAL
        self.assertIn("c-002", cust_ids)  # Ramesh (2 defects) -> HIGH

        # Bardoli Vidyalaya (c-001) had 300 consignment returns, but 0 physical defects -> MUST NOT BE IN RISK LIST!
        self.assertNotIn("c-001", cust_ids)

        pooja = next(c for c in dissatisfied if c.customer_id == "c-003")
        self.assertEqual(pooja.churn_risk_level, "CRITICAL")
        self.assertEqual(pooja.defective_items_returned, 25)

    def test_api_product_radar_endpoint(self):
        """Tests POST /api/v1/engines/defects/product-radar via FastAPI TestClient."""
        payload = {
            "sales_records": self.sample_sales,
            "return_records": self.sample_returns,
        }
        res = self.client.post("/api/v1/engines/defects/product-radar", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_products"], 3)
        self.assertGreater(data["execution_ms"], 0.0)

    def test_api_vendor_scorecard_endpoint(self):
        """Tests POST /api/v1/engines/defects/vendor-scorecard."""
        payload = {
            "sales_records": self.sample_sales,
            "return_records": self.sample_returns,
            "po_freeze_threshold": 6.0,
            "min_defects_for_freeze": 5,
        }
        res = self.client.post("/api/v1/engines/defects/vendor-scorecard", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_vendors"], 3)
        self.assertEqual(data["po_freeze_count"], 1)  # PlastiCorp
        self.assertEqual(data["excellent_count"], 1)   # Navneet

    def test_api_customer_risk_endpoint(self):
        """Tests POST /api/v1/engines/defects/customer-risk."""
        payload = {
            "sales_records": self.sample_sales,
            "return_records": self.sample_returns,
            "min_defective_items": 2,
        }
        res = self.client.post("/api/v1/engines/defects/customer-risk", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_at_risk_customers"], 3)
        self.assertGreater(data["total_refund_exposure"], 0.0)


if __name__ == "__main__":
    unittest.main()
