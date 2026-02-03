"""
Phase 1 Verification Tests - Project Foundation
Run with: python test_phase1.py
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

def test_django_check():
    """Run Django system check."""
    from django.core.management import call_command
    from io import StringIO
    out = StringIO()
    try:
        call_command('check', stdout=out)
        print("✓ PASSED: Django system check - no issues")
        return True
    except Exception as e:
        print(f"✗ FAILED: Django system check - {e}")
        return False

def test_apps_loaded():
    """Verify all apps are properly configured."""
    from django.apps import apps
    expected_apps = ['account', 'dashboard', 'inventory', 'customers', 
                     'orders', 'reports', 'finance', 'settings_app', 'core']
    passed = True
    for app_name in expected_apps:
        try:
            app_config = apps.get_app_config(app_name)
            print(f"✓ PASSED: App '{app_name}' is registered")
        except LookupError:
            print(f"✗ FAILED: App '{app_name}' not found")
            passed = False
    return passed

def test_jwt_urls():
    """Verify JWT endpoints are configured."""
    from django.urls import reverse, NoReverseMatch
    jwt_urls = ['token_obtain_pair', 'token_refresh', 'token_verify']
    passed = True
    for url_name in jwt_urls:
        try:
            url = reverse(url_name)
            print(f"✓ PASSED: JWT URL '{url_name}' -> {url}")
        except NoReverseMatch:
            print(f"✗ FAILED: JWT URL '{url_name}' not configured")
            passed = False
    return passed

def test_core_models():
    """Verify core models are properly defined."""
    try:
        from core.models import UUIDPrimaryKeyModel, TimestampedModel, SoftDeleteModel, DisplayIDMixin
        print("✓ PASSED: Core models imported successfully")
        
        # Check UUIDPrimaryKeyModel has id field
        if hasattr(UUIDPrimaryKeyModel, '_meta'):
            print("✓ PASSED: UUIDPrimaryKeyModel is a valid model")
        return True
    except ImportError as e:
        print(f"✗ FAILED: Core models import error - {e}")
        return False

def test_drf_config():
    """Verify DRF is configured."""
    from django.conf import settings
    if hasattr(settings, 'REST_FRAMEWORK'):
        print("✓ PASSED: REST_FRAMEWORK settings configured")
        if 'rest_framework_simplejwt.authentication.JWTAuthentication' in \
           settings.REST_FRAMEWORK.get('DEFAULT_AUTHENTICATION_CLASSES', []):
            print("✓ PASSED: JWT Authentication is default")
            return True
    print("✗ FAILED: DRF or JWT not properly configured")
    return False

def test_database():
    """Verify database is accessible."""
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        print("✓ PASSED: Database connection successful")
        return True
    except Exception as e:
        print(f"✗ FAILED: Database connection - {e}")
        return False

def test_app_urls_importable():
    """Verify all app URL modules are importable."""
    apps = ['account', 'dashboard', 'inventory', 'customers', 
            'orders', 'reports', 'finance', 'settings_app']
    passed = True
    for app in apps:
        try:
            module = __import__(f'{app}.urls', fromlist=['urlpatterns'])
            print(f"✓ PASSED: {app}.urls is importable")
        except ImportError as e:
            print(f"✗ FAILED: {app}.urls import error - {e}")
            passed = False
    return passed

if __name__ == '__main__':
    print("=" * 60)
    print("PHASE 1 VERIFICATION TESTS - AZ BOOKS PROJECT FOUNDATION")
    print("=" * 60)
    
    results = []
    results.append(("Django System Check", test_django_check()))
    results.append(("Apps Loaded", test_apps_loaded()))
    results.append(("JWT URLs", test_jwt_urls()))
    results.append(("Core Models", test_core_models()))
    results.append(("DRF Configuration", test_drf_config()))
    results.append(("Database Connection", test_database()))
    results.append(("App URLs Importable", test_app_urls_importable()))
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    passed = sum(1 for _, r in results if r)
    failed = len(results) - passed
    print(f"Passed: {passed}/{len(results)}")
    print(f"Failed: {failed}/{len(results)}")
    
    if failed == 0:
        print("\n✓ ALL TESTS PASSED - Phase 1 verified!")
    else:
        print("\n✗ SOME TESTS FAILED - Fix issues before proceeding")
        sys.exit(1)
