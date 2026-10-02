"""
Unit and API integration tests for Engine 2: Seasonal Demand & Replenishment Forecaster.
"""

from datetime import date
import unittest
from fastapi.testclient import TestClient
from services.azbooks_analytics.main import app
from services.azbooks_analytics.engines.demand import SeasonalDemandEngine, demand_engine


class DemandEngineTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = SeasonalDemandEngine()

    def test_peak_season_lead_time_expansion(self):
        # Peak rush dates (April 15 to June 30)
        peak_date_may = date(2026, 5, 20)
        self.assertTrue(self.engine.is_peak_rush_season(peak_date_may))
        eff_lead_peak = self.engine.calculate_effective_lead_time(4, peak_date_may)
        self.assertEqual(eff_lead_peak, 14.0)  # 4 * 3.5

        peak_date_apr_end = date(2026, 4, 20)
        self.assertTrue(self.engine.is_peak_rush_season(peak_date_apr_end))

        # Off-peak dates
        offpeak_date_jan = date(2026, 1, 15)
        self.assertFalse(self.engine.is_peak_rush_season(offpeak_date_jan))
        eff_lead_offpeak = self.engine.calculate_effective_lead_time(4, offpeak_date_jan)
        self.assertEqual(eff_lead_offpeak, 4.0)

        offpeak_date_apr_early = date(2026, 4, 10)
        self.assertFalse(self.engine.is_peak_rush_season(offpeak_date_apr_early))

    def test_tsb_intermittent_forecasting(self):
        # 30 days: mostly 0s, 3 sales of 10 units
        intermittent_sales = [0] * 7 + [10] + [0] * 9 + [15] + [0] * 10 + [8] + [0] * 2
        res = self.engine.compute_replenishment(
            product_id="SKU-SLOW-1",
            product_name="Oxford English-Gujarati Dictionary",
            daily_sales_history=intermittent_sales,
            current_stock=5,
            owed_stock=0,
            base_lead_time_days=4,
            horizon_days=30,
            vendor_case_pack=5,
            as_of_date=date(2026, 1, 15),
        )

        self.assertEqual(res.forecast_method, "tsb_intermittent")
        self.assertGreater(res.forecasted_daily_demand, 0.0)
        self.assertGreater(res.forecasted_horizon_demand, 0.0)
        self.assertGreater(res.safety_stock_units, 0)
        # Verify master-pack quantization (must be multiple of 5)
        self.assertEqual(res.recommended_po_quantity % 5, 0)

    def test_master_carton_quantization(self):
        # Constant demand of 5 units/day for 30 days = 150 units
        sales = [5.0] * 30
        # Available stock = 20, Safety stock ~ 15 -> Net req ~ 145 units
        # Vendor case pack = 24
        res = self.engine.compute_replenishment(
            product_id="SKU-BOOK-1",
            product_name="Navneet Single Line 176p",
            daily_sales_history=sales,
            current_stock=20,
            owed_stock=0,
            base_lead_time_days=4,
            horizon_days=30,
            vendor_case_pack=24,
            moq=48,
            as_of_date=date(2026, 1, 15),
        )

        self.assertGreater(res.net_requirement_units, 0)
        # PO must be multiple of 24 and at least MOQ (48)
        self.assertEqual(res.recommended_po_quantity % 24, 0)
        self.assertGreaterEqual(res.recommended_po_quantity, 48)
        self.assertEqual(res.recommended_carton_count, res.recommended_po_quantity // 24)

    def test_stockout_risk_grading(self):
        # 1. Critical risk: stock cover <= lead time
        # Daily demand = 10, Lead time = 5 days, Stock = 20 (DOIR = 2.0 days <= 5 days)
        res_crit = self.engine.compute_replenishment(
            product_id="SKU-CRIT",
            product_name="Apsara Platinum Pencil Box",
            daily_sales_history=[10.0] * 14,
            current_stock=20,
            owed_stock=0,
            base_lead_time_days=5,
            as_of_date=date(2026, 1, 15),
        )
        self.assertEqual(res_crit.stockout_risk, "CRITICAL")

        # 2. Warning risk: lead time < stock cover <= lead time * 2
        # Stock = 70 (DOIR = 7.0 days, between 5 and 10 days)
        res_warn = self.engine.compute_replenishment(
            product_id="SKU-WARN",
            product_name="Apsara Platinum Pencil Box",
            daily_sales_history=[10.0] * 14,
            current_stock=70,
            owed_stock=0,
            base_lead_time_days=5,
            as_of_date=date(2026, 1, 15),
        )
        self.assertEqual(res_warn.stockout_risk, "WARNING")

        # 3. Healthy risk: stock cover > lead time * 2
        # Stock = 250 (DOIR = 25.0 days > 10 days)
        res_ok = self.engine.compute_replenishment(
            product_id="SKU-OK",
            product_name="Apsara Platinum Pencil Box",
            daily_sales_history=[10.0] * 14,
            current_stock=250,
            owed_stock=0,
            base_lead_time_days=5,
            as_of_date=date(2026, 1, 15),
        )
        self.assertEqual(res_ok.stockout_risk, "HEALTHY")

    def test_available_stock_owed_deduction(self):
        # Physical stock = 100, but Owed to customers = 80 -> Available = 20
        res = self.engine.compute_replenishment(
            product_id="SKU-OWED",
            product_name="Navneet Maths Std 10",
            daily_sales_history=[5.0] * 20,
            current_stock=100,
            owed_stock=80,
            base_lead_time_days=4,
            as_of_date=date(2026, 1, 15),
        )
        self.assertEqual(res.current_physical_stock, 100)
        self.assertEqual(res.owed_reserved_stock, 80)
        self.assertEqual(res.available_stock, 20)
        self.assertLess(res.days_of_inventory_remaining, 10.0)


class DemandAPITestCase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_forecast_endpoint(self):
        payload = {
            "product_id": "P-101",
            "product_name": "Navneet Drawing Book A4",
            "daily_sales_history": [2.0, 3.0, 4.0, 2.0, 5.0, 3.0, 4.0],
            "current_stock": 10,
            "owed_stock": 2,
            "base_lead_time_days": 4,
            "horizon_days": 30,
            "vendor_case_pack": 10,
            "moq": 20,
            "target_date": "2026-05-10",  # peak rush date
        }
        res = self.client.post("/api/v1/engines/demand/forecast", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        fc = data["forecast"]
        self.assertEqual(fc["product_id"], "P-101")
        self.assertTrue(fc["is_peak_season"])
        self.assertEqual(fc["effective_lead_time_days"], 14.0)  # 4 * 3.5
        self.assertEqual(fc["recommended_po_quantity"] % 10, 0)
        self.assertGreaterEqual(fc["recommended_po_quantity"], 20)

    def test_batch_replenishment_endpoint(self):
        payload = {
            "items": [
                {
                    "product_id": "P-HEALTHY",
                    "product_name": "Paper Clips",
                    "daily_sales_history": [1.0] * 10,
                    "current_stock": 100,
                    "base_lead_time_days": 3,
                },
                {
                    "product_id": "P-CRITICAL",
                    "product_name": "Class 10 NCERT Science",
                    "daily_sales_history": [15.0] * 10,
                    "current_stock": 5,
                    "base_lead_time_days": 4,
                    "target_date": "2026-05-15",
                },
            ]
        }
        res = self.client.post("/api/v1/engines/demand/batch-replenishment", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["total_items"], 2)
        self.assertEqual(data["critical_risk_count"], 1)
        self.assertEqual(data["healthy_count"], 1)
        # CRITICAL item must be sorted first
        self.assertEqual(data["recommendations"][0]["product_id"], "P-CRITICAL")
        self.assertEqual(data["recommendations"][0]["stockout_risk"], "CRITICAL")


if __name__ == "__main__":
    unittest.main()
