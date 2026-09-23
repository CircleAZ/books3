"""
Unit Tests for Customer Tokenized Search Filter and Autocomplete Suggestions API.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient
from rest_framework import status

from customers.models import Customer, Address, Wallet, GeographicRegion
from settings_app.models import CustomerGroup, Permission, Role, RolePermission

User = get_user_model()


class CustomerTokenizedSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='cashier_test',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        # Create test customer groups
        self.group_retail = CustomerGroup.objects.create(name='Retail Tier 1')
        self.group_wholesale = CustomerGroup.objects.create(name='Wholesale')

        # Create village boundary
        self.village_valod = GeographicRegion.objects.create(name='Valod')
        self.village_kadod = GeographicRegion.objects.create(name='Kadod')

        # Customer 1: Aarav Patel (Bardoli, Surat, Wallet: 500, with GPS coords)
        self.c1 = Customer.objects.create(
            first_name='Aarav',
            last_name='Patel',
            phone='9876543210',
            email='aarav.patel@example.com',
            customer_group=self.group_retail
        )
        Address.objects.create(
            customer=self.c1,
            taluka='Bardoli',
            district='Surat',
            region=self.village_valod,
            location=Point(72.831, 21.170, srid=4326),
            is_primary=True
        )
        Wallet.objects.create(customer=self.c1, balance=Decimal('500.00'))

        # Customer 2: Suresh Shah (Kamrej, Surat, Wallet: 50)
        self.c2 = Customer.objects.create(
            first_name='Suresh',
            last_name='Shah',
            phone='9822233344',
            email='suresh.shah@example.com',
            customer_group=self.group_wholesale
        )
        Address.objects.create(
            customer=self.c2,
            taluka='Kamrej',
            district='Surat',
            region=self.village_kadod,
            is_primary=True
        )
        Wallet.objects.create(customer=self.c2, balance=Decimal('50.00'))

        # Customer 3: Priya Patel (Navsari City, Navsari, Wallet: 0)
        self.c3 = Customer.objects.create(
            first_name='Priya',
            last_name='Patel',
            phone='9711122233',
            email='priya.p@test.com',
            customer_group=self.group_retail
        )
        Address.objects.create(
            customer=self.c3,
            taluka='Navsari City',
            district='Navsari',
            is_primary=True
        )
        Wallet.objects.create(customer=self.c3, balance=Decimal('0.00'))

    def test_raw_free_text_search(self):
        """Standard search string matches first name, last name, or phone."""
        response = self.client.get('/api/customers/customers/?search=Patel')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c['id'] for c in response.data['results']]
        self.assertIn(str(self.c1.id), ids)
        self.assertIn(str(self.c3.id), ids)
        self.assertNotIn(str(self.c2.id), ids)

    def test_targeted_phone_token(self):
        """phone: prefix matches specific phone numbers."""
        response = self.client.get('/api/customers/customers/?search=phone:9876543210')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_relational_taluka_token(self):
        """taluka: token filters via Exists() subquery on Address."""
        response = self.client.get('/api/customers/customers/?search=taluka:Bardoli')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_relational_district_token(self):
        """district: token filters customers in Surat."""
        response = self.client.get('/api/customers/customers/?search=district:Surat')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c['id'] for c in response.data['results']]
        self.assertIn(str(self.c1.id), ids)
        self.assertIn(str(self.c2.id), ids)
        self.assertNotIn(str(self.c3.id), ids)

    def test_relational_village_token(self):
        """village: token filters via region name polygon boundary."""
        response = self.client.get('/api/customers/customers/?search=village:Valod')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_numeric_wallet_range_filter(self):
        """wallet:>100 matches customers with balances greater than 100."""
        response = self.client.get('/api/customers/customers/?search=wallet:>100')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_negation_token(self):
        """-taluka:Bardoli excludes customers located in Bardoli."""
        response = self.client.get('/api/customers/customers/?search=-taluka:Bardoli')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c['id'] for c in response.data['results']]
        self.assertNotIn(str(self.c1.id), ids)
        self.assertIn(str(self.c2.id), ids)
        self.assertIn(str(self.c3.id), ids)

    def test_quoted_string_with_spaces(self):
        """taluka:"Navsari City" matches multi-word token values in quotes."""
        response = self.client.get('/api/customers/customers/?search=taluka:"Navsari City"')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c3.id))

    def test_dangling_unmatched_quote_does_not_crash(self):
        """Unclosed quotes e.g. taluka:"Bardoli are safely auto-balanced."""
        response = self.client.get('/api/customers/customers/?search=taluka:"Bardoli')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_hybrid_multi_condition_search(self):
        """Patel district:Surat wallet:>100 combines free text and multiple tokens."""
        response = self.client.get('/api/customers/customers/?search=Patel district:Surat wallet:>100')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_search_suggestions_cheatsheet(self):
        """Calling search-suggestions without prefix returns cheatsheet schema."""
        response = self.client.get('/api/customers/customers/search-suggestions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('prefixes', response.data)
        prefix_keys = [p['prefix'] for p in response.data['prefixes']]
        self.assertIn('phone', prefix_keys)
        self.assertIn('taluka', prefix_keys)
        self.assertIn('wallet', prefix_keys)

    def test_search_suggestions_values_with_count(self):
        """Calling search-suggestions with prefix returns distinct values and counts."""
        response = self.client.get('/api/customers/customers/search-suggestions/?prefix=taluka')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['prefix'], 'taluka')
        values = {s['value']: s['count'] for s in response.data['suggestions']}
        self.assertIn('Bardoli', values)
        self.assertEqual(values['Bardoli'], 1)
        self.assertIn('Kamrej', values)
        self.assertEqual(values['Kamrej'], 1)

    def test_filter_by_missing_coords(self):
        """coords:false returns customers with no GPS coordinates saved."""
        response = self.client.get('/api/customers/customers/?search=coords:false')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        returned_ids = {r['id'] for r in response.data['results']}
        self.assertIn(str(self.c2.id), returned_ids)
        self.assertIn(str(self.c3.id), returned_ids)
        self.assertNotIn(str(self.c1.id), returned_ids)

    def test_filter_by_saved_coords(self):
        """coords:true returns customers with saved GPS coordinates."""
        response = self.client.get('/api/customers/customers/?search=coords:true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.c1.id))

    def test_filter_by_negated_coords(self):
        """-coords:true returns customers with no GPS coordinates saved."""
        response = self.client.get('/api/customers/customers/?search=-coords:true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)

    def test_search_suggestions_coords(self):
        """Calling search-suggestions with prefix=coords returns true and false counts."""
        response = self.client.get('/api/customers/customers/search-suggestions/?prefix=coords')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['prefix'], 'coords')
        suggestions = {s['value']: s['count'] for s in response.data['suggestions']}
        self.assertEqual(suggestions['true'], 1)
        self.assertEqual(suggestions['false'], 2)

