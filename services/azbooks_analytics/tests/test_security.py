"""
Unit tests for zero-trust security and table projection validation.
"""

import unittest
from services.azbooks_analytics.core.security import (
    validate_table_name,
    sanitize_column_name,
    SecurityViolation,
)


class SecurityTestCase(unittest.TestCase):
    def test_allowed_analytical_tables(self):
        self.assertEqual(validate_table_name("orders_order"), "orders_order")
        self.assertEqual(validate_table_name("orders_orderitem"), "orders_orderitem")
        self.assertEqual(validate_table_name("inventory_product"), "inventory_product")
        self.assertEqual(validate_table_name("customers_customer"), "customers_customer")

    def test_blacklisted_sensitive_tables_rejected(self):
        for blocked_table in [
            "account_user",
            "finance_employeesalary",
            "finance_salarypayment",
            "customers_legacydebt",
            "customers_wallet",
            "django_session",
        ]:
            with self.subTest(table=blocked_table):
                with self.assertRaises(SecurityViolation) as ctx:
                    validate_table_name(blocked_table)
                self.assertIn("SECURITY BREACH", str(ctx.exception))

    def test_unregistered_tables_rejected(self):
        with self.assertRaises(SecurityViolation):
            validate_table_name("random_unregistered_table")

    def test_sql_injection_attempts_rejected(self):
        injection_attempts = [
            "orders_order; DROP TABLE orders_order;",
            "orders_order--",
            "orders_order/*",
            "product' OR '1'='1",
        ]
        for bad_id in injection_attempts:
            with self.subTest(attempt=bad_id):
                with self.assertRaises(SecurityViolation):
                    validate_table_name(bad_id)
                with self.assertRaises(SecurityViolation):
                    sanitize_column_name(bad_id)


if __name__ == "__main__":
    unittest.main()
