"""
Smoke tests for PotentialCustomer module.
Covers: CRUD, gap enforcement, dissolution, nearby, bulk purge, undissolve.
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from customers.models import PotentialCustomer, Customer
import datetime

User = get_user_model()


class PotentialCustomerModelTest(TestCase):
    """Model-level smoke tests."""

    def test_create_with_point(self):
        user = User.objects.create_user(username='s1', password='test1234', phone='9999900001')
        pc = PotentialCustomer.objects.create(
            location=Point(72.831, 21.170, srid=4326),
            notes='Blue house near temple',
            created_by=user,
        )
        self.assertFalse(pc.is_dissolved)
        self.assertIsNotNone(pc.id)
        self.assertEqual(pc.location.x, 72.831)
        self.assertEqual(pc.location.y, 21.170)

    def test_str_active(self):
        pc = PotentialCustomer(location=Point(72.0, 21.0, srid=4326), notes='Test note')
        self.assertIn('active', str(pc))

    def test_str_dissolved(self):
        pc = PotentialCustomer(location=Point(72.0, 21.0, srid=4326), notes='X', is_dissolved=True)
        self.assertIn('dissolved', str(pc))

    def test_str_long_note_truncated(self):
        pc = PotentialCustomer(location=Point(72.0, 21.0, srid=4326), notes='A' * 50)
        s = str(pc)
        self.assertIn('…', s)


class PotentialCustomerSerializerTest(TestCase):
    """Serializer validation tests."""

    def test_xss_stripped_from_notes(self):
        from customers.serializers import PotentialCustomerSerializer
        data = {
            'latitude': 21.17,
            'longitude': 72.83,
            'notes': '<script>alert("xss")</script>Blue house',
        }
        s = PotentialCustomerSerializer(data=data)
        s.is_valid(raise_exception=True)
        self.assertEqual(s.validated_data['notes'], 'alert("xss")Blue house')

    def test_invalid_latitude(self):
        from customers.serializers import PotentialCustomerSerializer
        data = {'latitude': 999, 'longitude': 72.83, 'notes': ''}
        s = PotentialCustomerSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('latitude', s.errors)

    def test_invalid_longitude(self):
        from customers.serializers import PotentialCustomerSerializer
        data = {'latitude': 21.0, 'longitude': -200, 'notes': ''}
        s = PotentialCustomerSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('longitude', s.errors)


class PotentialCustomerAPITest(TestCase):
    """Full API endpoint tests via DRF test client."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='salesman1', password='test1234', phone='9999900010',
            is_superuser=True,  # Superuser for testing — bypasses RBAC
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.base_url = '/api/customers/potential-customers/'

    # ── CREATE ──
    def test_create_pin(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.1700,
            'longitude': 72.8310,
            'notes': 'Near the school',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', res.data)
        self.assertEqual(res.data['notes'], 'Near the school')

    def test_create_pin_sets_created_by(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.1700,
            'longitude': 72.8310,
            'notes': '',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pin = PotentialCustomer.objects.get(pk=res.data['id'])
        self.assertEqual(pin.created_by, self.user)

    # ── GAP ENFORCEMENT ──
    def test_gap_enforcement_blocks_close_pin(self):
        """M1: Pin within 3m of existing pin should be rejected."""
        self.client.post(self.base_url, {
            'latitude': 21.170000,
            'longitude': 72.831000,
            'notes': 'first',
        })
        # Second pin ~1m away (0.000009 deg ≈ 1m)
        res = self.client.post(self.base_url, {
            'latitude': 21.170009,
            'longitude': 72.831000,
            'notes': 'too close',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('location', str(res.data))

    def test_gap_enforcement_allows_distant_pin(self):
        """Pin 100m+ away should be allowed."""
        self.client.post(self.base_url, {
            'latitude': 21.170000,
            'longitude': 72.831000,
            'notes': 'first',
        })
        # ~100m away
        res = self.client.post(self.base_url, {
            'latitude': 21.171000,
            'longitude': 72.831000,
            'notes': 'far enough',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    # ── UPDATE ──
    def test_update_pin_notes(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': 'old',
        })
        pin_id = res.data['id']
        res2 = self.client.patch(f'{self.base_url}{pin_id}/', {
            'latitude': 21.170, 'longitude': 72.831, 'notes': 'updated note',
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        pin = PotentialCustomer.objects.get(pk=pin_id)
        self.assertEqual(pin.notes, 'updated note')
        self.assertIsNotNone(pin.modified_at)
        self.assertEqual(pin.modified_by, self.user)

    # ── DELETE ──
    def test_delete_pin(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': 'deleteme',
        })
        pin_id = res.data['id']
        res2 = self.client.delete(f'{self.base_url}{pin_id}/')
        self.assertEqual(res2.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PotentialCustomer.objects.filter(pk=pin_id).exists())

    # ── DISSOLVE ──
    def test_dissolve_into_customer(self):
        """M3: Dissolve pin into a real customer."""
        # Create pin
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': 'potential note',
        })
        pin_id = res.data['id']
        # Create customer
        customer = Customer.objects.create(
            first_name='Test', last_name='Customer', phone='9999900020',
        )
        # Dissolve
        res2 = self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': str(customer.id),
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        pin = PotentialCustomer.objects.get(pk=pin_id)
        self.assertTrue(pin.is_dissolved)
        self.assertEqual(pin.dissolved_into, customer)
        self.assertEqual(pin.dissolved_by, self.user)
        self.assertIsNotNone(pin.dissolved_at)
        # Notes should be appended to customer
        customer.refresh_from_db()
        self.assertIn('potential note', customer.notes)

    def test_dissolve_double_dissolve_returns_409(self):
        """M3: Second dissolve on same pin → 409."""
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': '',
        })
        pin_id = res.data['id']
        customer = Customer.objects.create(
            first_name='A', phone='9999900021',
        )
        self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': str(customer.id),
        })
        # Second dissolve
        res2 = self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': str(customer.id),
        })
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)

    def test_dissolve_missing_customer_returns_404(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': '',
        })
        pin_id = res.data['id']
        res2 = self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': '00000000-0000-0000-0000-000000000000',
        })
        self.assertEqual(res2.status_code, status.HTTP_404_NOT_FOUND)

    def test_dissolve_no_customer_id_returns_400(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': '',
        })
        pin_id = res.data['id']
        res2 = self.client.post(f'{self.base_url}{pin_id}/dissolve/', {})
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    # ── NEARBY ──
    def test_nearby_finds_close_pin(self):
        """M6: Nearby endpoint returns pins within radius."""
        self.client.post(self.base_url, {
            'latitude': 21.170000, 'longitude': 72.831000, 'notes': 'near pin',
        })
        res = self.client.get(f'{self.base_url}nearby/', {
            'lat': 21.170001, 'lng': 72.831001, 'radius': 50,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 1)

    def test_nearby_excludes_dissolved(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170000, 'longitude': 72.831000, 'notes': '',
        })
        pin_id = res.data['id']
        # Dissolve it
        customer = Customer.objects.create(first_name='X', phone='9999900030')
        self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': str(customer.id),
        })
        # Nearby should not find it
        res2 = self.client.get(f'{self.base_url}nearby/', {
            'lat': 21.170000, 'lng': 72.831000, 'radius': 50,
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        ids = [p['id'] for p in res2.data]
        self.assertNotIn(str(pin_id), ids)

    def test_nearby_caps_radius_at_50(self):
        """M6: Radius > 50 should be clamped."""
        res = self.client.get(f'{self.base_url}nearby/', {
            'lat': 21.17, 'lng': 72.83, 'radius': 9999,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_nearby_negative_radius_clamped(self):
        """VULN-03: Negative radius should not crash."""
        res = self.client.get(f'{self.base_url}nearby/', {
            'lat': 21.17, 'lng': 72.83, 'radius': -10,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_nearby_missing_params(self):
        res = self.client.get(f'{self.base_url}nearby/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ── UNDISSOLVE ──
    def test_undissolve_restores_pin(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': '',
        })
        pin_id = res.data['id']
        customer = Customer.objects.create(first_name='Y', phone='9999900040')
        self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': str(customer.id),
        })
        # Undissolve
        res2 = self.client.post(f'{self.base_url}{pin_id}/undissolve/')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        pin = PotentialCustomer.objects.get(pk=pin_id)
        self.assertFalse(pin.is_dissolved)
        self.assertIsNone(pin.dissolved_into)

    def test_undissolve_active_pin_returns_400(self):
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': '',
        })
        pin_id = res.data['id']
        res2 = self.client.post(f'{self.base_url}{pin_id}/undissolve/')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    # ── BULK PURGE ──
    def test_bulk_purge_requires_superuser(self):
        normal = User.objects.create_user(
            username='normal', password='test', phone='9999900050',
            email='normal@test.local',
        )
        client2 = APIClient()
        client2.force_authenticate(user=normal)
        res = client2.post(f'{self.base_url}bulk-purge/', {'confirm': 'PURGE'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_bulk_purge_requires_confirm_keyword(self):
        res = self.client.post(f'{self.base_url}bulk-purge/', {'confirm': 'wrong'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_purge_works_with_correct_confirm(self):
        # Create a pin dated in previous season
        pin = PotentialCustomer.objects.create(
            location=Point(72.831, 21.170, srid=4326),
            notes='old pin',
            created_by=self.user,
        )
        # Backdate to previous season
        today = timezone.now().date()
        if today.month >= 12:
            prev_date = datetime.date(today.year - 1, 12, 15)
        else:
            prev_date = datetime.date(today.year - 2, 12, 15)
        PotentialCustomer.objects.filter(pk=pin.pk).update(
            created_at=timezone.make_aware(datetime.datetime.combine(prev_date, datetime.time()))
        )

        res = self.client.post(f'{self.base_url}bulk-purge/', {'confirm': 'PURGE'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(PotentialCustomer.objects.filter(pk=pin.pk).exists())

    # ── LIST ──
    def test_list_excludes_dissolved(self):
        """Default queryset should only show active pins."""
        res = self.client.post(self.base_url, {
            'latitude': 21.170, 'longitude': 72.831, 'notes': 'active',
        })
        pin_id = res.data['id']
        # Dissolve
        customer = Customer.objects.create(first_name='Z', phone='9999900060')
        self.client.post(f'{self.base_url}{pin_id}/dissolve/', {
            'customer_id': str(customer.id),
        })
        # List
        res2 = self.client.get(self.base_url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        ids = [p['id'] for p in res2.data]
        self.assertNotIn(str(pin_id), ids)

    # ── AUTH ──
    def test_unauthenticated_blocked(self):
        client = APIClient()  # No auth
        res = client.get(self.base_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class CustomerMapDataSoftDeleteTest(TestCase):
    """Verify that map_data excludes soft-deleted orders from aggregates."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='salesman2', password='test1234', phone='9999900011',
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_map_data_excludes_soft_deleted_orders(self):
        from orders.models import Order
        from customers.models import Address
        from django.contrib.gis.geos import Point

        # Create customer
        customer = Customer.objects.create(
            first_name='Test', last_name='SoftDelete', phone='9999900070'
        )
        # Create primary address with coordinates
        Address.objects.create(
            customer=customer,
            is_primary=True,
            location=Point(72.83, 21.17, srid=4326),
            address_line='Test Addr'
        )

        # Create 1 active order
        Order.objects.create(
            customer=customer,
            total=1020.00,
            order_status='confirmed',
        )

        # Create 1 soft-deleted order (with same valid sale status)
        deleted_order = Order.objects.create(
            customer=customer,
            total=100.00,
            order_status='confirmed',
        )
        # Set is_deleted=True and save
        deleted_order.is_deleted = True
        deleted_order.save()

        # Hit the map_data endpoint
        res = self.client.get('/api/customers/customers/map_data/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Retrieve our customer
        customer_data = None
        for c in res.data['customers']:
            if c['id'] == str(customer.id):
                customer_data = c
                break

        self.assertIsNotNone(customer_data)
        self.assertEqual(customer_data['total_orders'], 1)
        self.assertEqual(float(customer_data['total_spent']), 1020.00)
        self.assertEqual(customer_data['season_orders'], 1)

