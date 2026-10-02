"""
Unit tests for DuckDB Mechanical Wastegate.
"""

import unittest
from services.azbooks_analytics.core.wastegate import wastegate


class WastegateTestCase(unittest.TestCase):
    def test_wastegate_connection_clamping(self):
        status = wastegate.get_status()
        self.assertTrue(status["wastegate_active"])
        # DuckDB converts '220MB' into binary mebibytes: 209.8 MiB
        self.assertIn("209.8 MiB", status["max_memory"])
        self.assertEqual(status["threads"], 2)
        self.assertTrue(status["preserve_insertion_order"])

    def test_synthetic_vectorized_query(self):
        with wastegate.connection_scope() as conn:
            df = conn.execute("""
                SELECT 
                    (range % 10) as category_id,
                    COUNT(*) as item_count,
                    SUM(range * 2.5) as total_value
                FROM range(100000)
                GROUP BY category_id
                ORDER BY category_id;
            """).df()

            self.assertEqual(len(df), 10)
            self.assertEqual(df["item_count"].sum(), 100000)


if __name__ == "__main__":
    unittest.main()
