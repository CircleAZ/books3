"""
Unit & API tests for Khata Working Capital Gate Engine — azbooks-analytics.
"""

import unittest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from services.azbooks_analytics.engines.khata_gate import KhataWorkingCapitalGateEngine
from services.azbooks_analytics.main import app


class TestKhataWorkingCapitalGateEngine(unittest.TestCase):
    def setUp(self):
        self.today = date.today()
        self.client = TestClient(app)

    def test_zero_debt_account_cleared(self):
        """Accounts with 0 balance must clear the gate with 0 DSO."""
        invoices = [
            {'id': 'inv-1', 'date': (self.today - timedelta(days=10)).isoformat(), 'amount': 5000.0, 'net_paid': 5000.0},
        ]
        res = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id='acc-zero',
            account_name='Zero Debt Customer',
            invoices=invoices,
            payments=[],
            as_of_date=self.today,
        )
        self.assertTrue(res['is_cleared'])
        self.assertEqual(res['status'], 'CLEARED')
        self.assertEqual(res['outstanding_balance'], 0.0)
        self.assertEqual(res['max_dso_days'], 0)
        self.assertEqual(len(res['violations']), 0)

    def test_healthy_recent_credit_cleared(self):
        """Accounts with recent invoice (<= 30 days) and within limit must clear."""
        invoices = [
            {'id': 'inv-1', 'date': (self.today - timedelta(days=15)).isoformat(), 'amount': 12000.0, 'net_paid': 2000.0},
        ]
        res = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id='acc-healthy',
            account_name='Healthy Customer',
            invoices=invoices,
            payments=[],
            credit_limit=50000.0,
            as_of_date=self.today,
        )
        self.assertTrue(res['is_cleared'])
        self.assertEqual(res['status'], 'CLEARED')
        self.assertEqual(res['outstanding_balance'], 10000.0)
        self.assertEqual(res['max_dso_days'], 15)
        self.assertEqual(res['aging_breakdown']['current_0_30'], 10000.0)

    def test_watchlist_elevated_dso_warning(self):
        """Invoices between 31 and 45 days old trip the WARNING state without blocking."""
        invoices = [
            {'id': 'inv-1', 'date': (self.today - timedelta(days=38)).isoformat(), 'amount': 15000.0, 'net_paid': 0.0},
        ]
        res = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id='acc-watch',
            account_name='Watchlist Customer',
            invoices=invoices,
            payments=[],
            credit_limit=50000.0,
            as_of_date=self.today,
        )
        self.assertTrue(res['is_cleared'])
        self.assertEqual(res['status'], 'WARNING')
        self.assertEqual(res['max_dso_days'], 38)
        self.assertEqual(res['aging_breakdown']['watchlist_31_45'], 15000.0)
        self.assertIn("ELEVATED RISK", res['recommended_action'])

    def test_delinquent_dso_breach_blocked(self):
        """Invoices > 45 days old must trip the hard gate and block replenishment."""
        invoices = [
            {'id': 'inv-1', 'date': (self.today - timedelta(days=52)).isoformat(), 'amount': 8000.0, 'net_paid': 0.0},
            {'id': 'inv-2', 'date': (self.today - timedelta(days=5)).isoformat(), 'amount': 4000.0, 'net_paid': 0.0},
        ]
        res = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id='acc-delinquent',
            account_name='Delinquent Customer',
            invoices=invoices,
            payments=[],
            credit_limit=50000.0,
            max_dso_threshold=45,
            as_of_date=self.today,
        )
        self.assertFalse(res['is_cleared'])
        self.assertEqual(res['status'], 'BLOCKED')
        self.assertEqual(res['max_dso_days'], 52)
        self.assertEqual(res['outstanding_balance'], 12000.0)
        self.assertEqual(res['aging_breakdown']['delinquent_46_60'], 8000.0)
        self.assertEqual(res['aging_breakdown']['current_0_30'], 4000.0)
        self.assertTrue(any("DSO limit exceeded" in v for v in res['violations']))
        self.assertIn("HALT REPLENISHMENT", res['recommended_action'])

    def test_credit_limit_breach_blocked(self):
        """Exceeding credit limit must immediately block replenishment even with recent invoices."""
        invoices = [
            {'id': 'inv-1', 'date': (self.today - timedelta(days=10)).isoformat(), 'amount': 65000.0, 'net_paid': 0.0},
        ]
        res = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id='acc-limit',
            account_name='Limit Breached Customer',
            invoices=invoices,
            payments=[],
            credit_limit=50000.0,
            as_of_date=self.today,
        )
        self.assertFalse(res['is_cleared'])
        self.assertEqual(res['status'], 'BLOCKED')
        self.assertEqual(res['credit_utilization_pct'], 130.0)
        self.assertTrue(any("Credit limit breached" in v for v in res['violations']))

    def test_aging_bucketing_and_legacy_debt(self):
        """Verifies multi-bucket breakdown and inclusion of legacy debt in 61+ day bucket."""
        invoices = [
            {'id': 'i1', 'date': (self.today - timedelta(days=10)).isoformat(), 'amount': 5000.0, 'net_paid': 0.0},
            {'id': 'i2', 'date': (self.today - timedelta(days=40)).isoformat(), 'amount': 4000.0, 'net_paid': 0.0},
            {'id': 'i3', 'date': (self.today - timedelta(days=55)).isoformat(), 'amount': 3000.0, 'net_paid': 0.0},
            {'id': 'i4', 'date': (self.today - timedelta(days=75)).isoformat(), 'amount': 2000.0, 'net_paid': 0.0},
        ]
        res = KhataWorkingCapitalGateEngine.evaluate_account(
            account_id='acc-all',
            account_name='Complex Aging Customer',
            invoices=invoices,
            payments=[],
            credit_limit=100000.0,
            legacy_debt_amount=10000.0,
            as_of_date=self.today,
        )
        self.assertEqual(res['aging_breakdown']['current_0_30'], 5000.0)
        self.assertEqual(res['aging_breakdown']['watchlist_31_45'], 4000.0)
        self.assertEqual(res['aging_breakdown']['delinquent_46_60'], 3000.0)
        self.assertEqual(res['aging_breakdown']['critical_61_plus'], 12000.0)  # 2000 + 10000 legacy
        self.assertEqual(res['outstanding_balance'], 24000.0)
        self.assertFalse(res['is_cleared'])

    def test_batch_gate_check(self):
        """Verifies batch evaluation and summary aggregation."""
        accounts = [
            {
                'account_id': 'a1',
                'account_name': 'Good School',
                'invoices': [{'id': '1', 'date': (self.today - timedelta(days=10)).isoformat(), 'amount': 5000.0, 'net_paid': 5000.0}],
            },
            {
                'account_id': 'a2',
                'account_name': 'Slow School',
                'invoices': [{'id': '2', 'date': (self.today - timedelta(days=35)).isoformat(), 'amount': 15000.0, 'net_paid': 0.0}],
            },
            {
                'account_id': 'a3',
                'account_name': 'Defaulter School',
                'invoices': [{'id': '3', 'date': (self.today - timedelta(days=65)).isoformat(), 'amount': 28000.0, 'net_paid': 0.0}],
            }
        ]
        batch_res = KhataWorkingCapitalGateEngine.batch_gate_check(accounts)
        self.assertEqual(batch_res['total_accounts_evaluated'], 3)
        self.assertEqual(batch_res['cleared_accounts_count'], 1)
        self.assertEqual(batch_res['warning_accounts_count'], 1)
        self.assertEqual(batch_res['blocked_accounts_count'], 1)
        self.assertEqual(batch_res['total_blocked_receivables_exposure'], 28000.0)

    def test_api_evaluate_account_endpoint(self):
        """Verifies POST /api/v1/engines/khata/evaluate-account via FastAPI TestClient."""
        payload = {
            'account_id': 'test-acc-1',
            'account_name': 'Test Vidyalaya',
            'invoices': [
                {'id': 'inv-101', 'date': (self.today - timedelta(days=50)).isoformat(), 'amount': 18500.0, 'net_paid': 0.0}
            ],
            'credit_limit': 50000.0,
            'max_dso_threshold': 45
        }
        res = self.client.post('/api/v1/engines/khata/evaluate-account', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['gate_status'], 'BLOCKED')
        self.assertFalse(data['is_cleared'])
        self.assertEqual(data['max_dso_days'], 50)
        self.assertEqual(data['outstanding_balance'], 18500.0)

    def test_api_batch_gate_check_endpoint(self):
        """Verifies POST /api/v1/engines/khata/batch-gate-check via FastAPI TestClient."""
        payload = {
            'accounts': [
                {
                    'account_id': 'acc-1',
                    'account_name': 'Navsari Academy',
                    'invoices': [{'id': 'i1', 'date': (self.today - timedelta(days=12)).isoformat(), 'amount': 8000.0, 'net_paid': 0.0}],
                    'credit_limit': 30000.0
                },
                {
                    'account_id': 'acc-2',
                    'account_name': 'Surat High School',
                    'invoices': [{'id': 'i2', 'date': (self.today - timedelta(days=60)).isoformat(), 'amount': 45000.0, 'net_paid': 0.0}],
                    'credit_limit': 40000.0
                }
            ],
            'max_dso_threshold': 45
        }
        res = self.client.post('/api/v1/engines/khata/batch-gate-check', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['total_accounts_evaluated'], 2)
        self.assertEqual(data['cleared_accounts_count'], 1)
        self.assertEqual(data['blocked_accounts_count'], 1)
        self.assertEqual(data['total_blocked_receivables_exposure'], 45000.0)


if __name__ == '__main__':
    unittest.main()
