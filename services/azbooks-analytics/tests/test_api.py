"""
Integration tests for FastAPI analytical endpoints.
"""

import unittest
from fastapi.testclient import TestClient
from services.azbooks_analytics.main import app


class APITestCase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root_endpoint(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["service"], "azbooks-analytics")
        self.assertEqual(data["status"], "operational")

    def test_health_endpoint(self):
        res = self.client.get("/api/v1/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertTrue(data["wastegate"]["wastegate_active"])
        self.assertIn("MiB", data["wastegate"]["max_memory"])
        self.assertEqual(data["wastegate"]["threads"], 2)

    def test_wastegate_status_endpoint(self):
        res = self.client.get("/api/v1/wastegate/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["wastegate_active"])

    def test_engines_list_endpoint(self):
        res = self.client.get("/api/v1/engines")
        self.assertEqual(res.status_code, 200)
        engines = res.json()
        self.assertEqual(len(engines), 5)
        engine_ids = [e["engine_id"] for e in engines]
        self.assertIn("cross_sell", engine_ids)
        self.assertIn("demand", engine_ids)
        self.assertIn("village", engine_ids)
        self.assertIn("pricing", engine_ids)
        self.assertIn("defect_radar", engine_ids)

    def test_wastegate_stress_test_endpoint(self):
        res = self.client.post("/api/v1/wastegate/stress-test?row_count=50000")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["rows_processed"], 50000)
        self.assertTrue(data["execution_ms"] > 0)


if __name__ == "__main__":
    unittest.main()
