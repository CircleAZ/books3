"""
Unit Tests for Product Tokenized Search Filter and Autocomplete Suggestions API.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from inventory.models import Product, Category, Vendor, Tag

User = get_user_model()


class ProductTokenizedSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='inventory_search_tester',
            password='password123',
            is_staff=True,
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        self.cat_stationery = Category.objects.create(name='Stationery')
        self.cat_books = Category.objects.create(name='Textbooks')

        self.vendor_navneet = Vendor.objects.create(name='Navneet Publications')
        self.vendor_classmate = Vendor.objects.create(name='ITC Classmate')

        self.tag_exam = Tag.objects.create(name='Exam Prep')
        self.tag_primary = Tag.objects.create(name='Primary')

        # Product 1: Classmate Longbook (In Stock, Stationery, Classmate, 100 stock, threshold 10, price 75)
        self.p1 = Product.objects.create(
            name='Classmate Longbook 160 Pages',
            description='Single line spiral notebook',
            category=self.cat_stationery,
            vendor=self.vendor_classmate,
            cost_price=Decimal('45.00'),
            selling_price=Decimal('75.00'),
            stock_quantity=100,
            physical_stock=95,
            low_stock_threshold=10,
            is_pack=False
        )
        self.p1.tags.add(self.tag_primary)

        # Product 2: Physics 12th Guide (Low Stock, Textbooks, Navneet, 5 stock, threshold 10, price 450)
        self.p2 = Product.objects.create(
            name='Physics 12th Master Guide',
            description='Comprehensive science guide',
            category=self.cat_books,
            vendor=self.vendor_navneet,
            cost_price=Decimal('300.00'),
            selling_price=Decimal('450.00'),
            stock_quantity=5,
            physical_stock=4,
            low_stock_threshold=10,
            is_pack=False
        )
        self.p2.tags.add(self.tag_exam)

        # Product 3: Chemistry 12th Pack (Out of Stock, Pack, 0 stock, price 1200)
        self.p3 = Product.objects.create(
            name='Chemistry 12th Set of 3',
            description='Bundle pack of three volumes',
            category=self.cat_books,
            vendor=self.vendor_navneet,
            cost_price=Decimal('800.00'),
            selling_price=Decimal('1200.00'),
            stock_quantity=0,
            physical_stock=0,
            low_stock_threshold=5,
            is_pack=True,
            pack_size=3
        )

    def test_free_text_matches_name_and_description(self):
        """Free text matches product name or description."""
        res = self.client.get('/api/inventory/products/?search=Longbook')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

        res_desc = self.client.get('/api/inventory/products/?search=spiral')
        self.assertEqual(res_desc.status_code, status.HTTP_200_OK)
        self.assertEqual(res_desc.data['count'], 1)
        self.assertEqual(res_desc.data['results'][0]['id'], str(self.p1.id))

    def test_display_id_token(self):
        """id: matches display_id."""
        res = self.client.get(f'/api/inventory/products/?search=id:{self.p1.display_id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

    def test_category_token(self):
        """category: matches Category name."""
        res = self.client.get('/api/inventory/products/?search=category:Stationery')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

    def test_vendor_token(self):
        """vendor: matches Vendor name."""
        res = self.client.get('/api/inventory/products/?search=vendor:"Navneet Publications"')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res.data['results']]
        self.assertIn(str(self.p2.id), ids)
        self.assertIn(str(self.p3.id), ids)
        self.assertNotIn(str(self.p1.id), ids)

    def test_tag_token(self):
        """tag: matches Tag name."""
        res = self.client.get('/api/inventory/products/?search=tag:"Exam Prep"')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p2.id))

    def test_stock_numeric_comparison(self):
        """stock:>50 matches products with stock greater than 50."""
        res = self.client.get('/api/inventory/products/?search=stock:>50')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

    def test_physical_numeric_comparison(self):
        """physical:<10 matches products with physical stock less than 10."""
        res = self.client.get('/api/inventory/products/?search=physical:<10')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res.data['results']]
        self.assertIn(str(self.p2.id), ids)
        self.assertIn(str(self.p3.id), ids)
        self.assertNotIn(str(self.p1.id), ids)

    def test_price_numeric_comparison(self):
        """price:>400 matches items priced above 400."""
        res = self.client.get('/api/inventory/products/?search=price:>400')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res.data['results']]
        self.assertIn(str(self.p2.id), ids)
        self.assertIn(str(self.p3.id), ids)
        self.assertNotIn(str(self.p1.id), ids)

    def test_cost_numeric_comparison(self):
        """cost:<100 matches items with cost price below 100."""
        res = self.client.get('/api/inventory/products/?search=cost:<100')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

    def test_stock_status_tokens(self):
        """status:in_stock, status:low_stock, status:out_of_stock."""
        res_in = self.client.get('/api/inventory/products/?search=status:in_stock')
        self.assertEqual(res_in.status_code, status.HTTP_200_OK)
        self.assertEqual(res_in.data['count'], 1)
        self.assertEqual(res_in.data['results'][0]['id'], str(self.p1.id))

        res_low = self.client.get('/api/inventory/products/?search=status:low_stock')
        self.assertEqual(res_low.status_code, status.HTTP_200_OK)
        self.assertEqual(res_low.data['count'], 1)
        self.assertEqual(res_low.data['results'][0]['id'], str(self.p2.id))

        res_out = self.client.get('/api/inventory/products/?search=status:out_of_stock')
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)
        self.assertEqual(res_out.data['count'], 1)
        self.assertEqual(res_out.data['results'][0]['id'], str(self.p3.id))

    def test_pack_token(self):
        """pack:true filters pack bundles only."""
        res_pack = self.client.get('/api/inventory/products/?search=pack:true')
        self.assertEqual(res_pack.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pack.data['count'], 1)
        self.assertEqual(res_pack.data['results'][0]['id'], str(self.p3.id))

        res_single = self.client.get('/api/inventory/products/?search=pack:false')
        self.assertEqual(res_single.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res_single.data['results']]
        self.assertIn(str(self.p1.id), ids)
        self.assertIn(str(self.p2.id), ids)
        self.assertNotIn(str(self.p3.id), ids)

    def test_negation_token(self):
        """-category:Textbooks excludes textbook products."""
        res = self.client.get('/api/inventory/products/?search=-category:Textbooks')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

    def test_suggestions_cheatsheet(self):
        """Calling search-suggestions without prefix returns product qualifier cheatsheet."""
        res = self.client.get('/api/inventory/products/search-suggestions/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('prefixes', res.data)
        prefix_keys = [p['prefix'] for p in res.data['prefixes']]
        self.assertIn('category', prefix_keys)
        self.assertIn('vendor', prefix_keys)
        self.assertIn('status', prefix_keys)
        self.assertIn('stock', prefix_keys)
        self.assertIn('pack', prefix_keys)

    def test_suggestions_category_and_vendor_values(self):
        """Calling search-suggestions with prefix returns live distinct values and counts."""
        res_cat = self.client.get('/api/inventory/products/search-suggestions/?prefix=category')
        self.assertEqual(res_cat.status_code, status.HTTP_200_OK)
        cat_vals = [s['value'] for s in res_cat.data['suggestions']]
        self.assertIn('Textbooks', cat_vals)
        self.assertIn('Stationery', cat_vals)

        res_vend = self.client.get('/api/inventory/products/search-suggestions/?prefix=vendor&q=Navneet')
        self.assertEqual(res_vend.status_code, status.HTTP_200_OK)
        vend_vals = [s['value'] for s in res_vend.data['suggestions']]
        self.assertIn('Navneet Publications', vend_vals)

    def test_numeric_with_space(self):
        """price:> 400 and stock:< 10 should parse correctly and not fail."""
        res = self.client.get('/api/inventory/products/?search=price:> 400')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in res.data['results']]
        self.assertIn(str(self.p2.id), ids)
        self.assertIn(str(self.p3.id), ids)

    def test_capitalized_prefix(self):
        """Category:Stationery should work identically to category:Stationery."""
        res = self.client.get('/api/inventory/products/?search=Category:Stationery')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

    def test_quoted_free_text_phrase(self):
        """\"Classmate Longbook\" as quoted phrase matches p1."""
        res = self.client.get('/api/inventory/products/?search="Classmate Longbook"')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['id'], str(self.p1.id))

