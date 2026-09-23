"""
Harsh Unit Tests for Wave 3: Activity Log Audit Trail Tokenized Search.
Tests all qualifiers, negations, free text, cheatsheet schema, and suggestions.
"""

from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from reports.models import ActivityLog
from reports.filters import ActivityLogTokenizedSearchFilter

User = get_user_model()


class ActivityLogTokenizedSearchTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='audit_admin',
            email='audit_admin@example.com',
            password='testpassword'
        )
        self.staff = User.objects.create_user(
            username='audit_clerk',
            email='audit_clerk@example.com',
            password='testpassword'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

        now = timezone.now()
        yesterday_dt = now - timedelta(days=1)

        self.log1 = ActivityLog.objects.create(
            user=self.admin,
            action_type='delete',
            entity_type='Order',
            entity_id='1001',
            description='Admin deleted Order #1001',
            details='Cancelled by customer request',
            ip_address='192.168.1.100'
        )
        self.log2 = ActivityLog.objects.create(
            user=self.staff,
            action_type='create',
            entity_type='Customer',
            entity_id='501',
            description='Clerk registered new customer Ramesh',
            details='Walk-in registration',
            ip_address='192.168.1.105'
        )
        self.log3 = ActivityLog.objects.create(
            user=self.admin,
            action_type='export',
            entity_type='FinancialReport',
            entity_id='pnl_q3',
            description='Exported Q3 P&L report as CSV',
            details='Export generated with 450 rows',
            ip_address='192.168.1.100'
        )
        self.log4 = ActivityLog.objects.create(
            user=self.staff,
            action_type='login',
            entity_type='User',
            entity_id=str(self.staff.id),
            description='Staff clerk logged into dashboard',
            details='Session started',
            ip_address='192.168.1.105'
        )

    def test_action_and_model_search(self):
        q = ActivityLogTokenizedSearchFilter.parse_query('action:delete model:Order')
        qs = ActivityLog.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.log1)

    def test_user_filter(self):
        q = ActivityLogTokenizedSearchFilter.parse_query('user:audit_admin')
        qs = ActivityLog.objects.filter(q)
        self.assertEqual(qs.count(), 2)
        self.assertIn(self.log1, qs)
        self.assertIn(self.log3, qs)

    def test_id_filter(self):
        q = ActivityLogTokenizedSearchFilter.parse_query('id:1001')
        qs = ActivityLog.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.log1)

    def test_negation(self):
        q = ActivityLogTokenizedSearchFilter.parse_query('-action:login')
        qs = ActivityLog.objects.filter(q)
        self.assertEqual(qs.count(), 3)
        for log in qs:
            self.assertNotEqual(log.action_type, 'login')

    def test_free_text_search(self):
        q = ActivityLogTokenizedSearchFilter.parse_query('Ramesh')
        qs = ActivityLog.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.log2)

    def test_activity_log_suggestions_schema(self):
        res = self.client.get('/api/reports/activity/search-suggestions/')
        self.assertEqual(res.status_code, 200)
        prefixes = [p['prefix'] for p in res.data['prefixes']]
        self.assertIn('action', prefixes)
        self.assertIn('model', prefixes)
        self.assertIn('user', prefixes)
        self.assertIn('date', prefixes)

    def test_activity_log_suggestions_counts(self):
        res_action = self.client.get('/api/reports/activity/search-suggestions/?prefix=action')
        self.assertEqual(res_action.status_code, 200)
        action_map = {s['value']: s['count'] for s in res_action.data['suggestions']}
        self.assertEqual(action_map['delete'], 1)
        self.assertEqual(action_map['create'], 1)
        self.assertEqual(action_map['export'], 1)
        self.assertEqual(action_map['login'], 1)

        res_model = self.client.get('/api/reports/activity/search-suggestions/?prefix=model')
        self.assertEqual(res_model.status_code, 200)
        model_map = {s['value']: s['count'] for s in res_model.data['suggestions']}
        self.assertEqual(model_map['Order'], 1)
        self.assertEqual(model_map['Customer'], 1)

    def test_activity_log_api_list_filter(self):
        res = self.client.get('/api/reports/activity/?search=action:export')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['results']), 1)
        self.assertEqual(res.data['results'][0]['action_type'], 'export')
