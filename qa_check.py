
import os
import django
from django.conf import settings
from django.urls import resolve, reverse
from django.core.management import call_command
from io import StringIO
import sys

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

print("--- QA AUTOMATED CHECK ---")

# 1. Check Apps
apps_to_check = [
    'core', 'account', 'dashboard', 'inventory', 
    'customers', 'orders', 'reports', 'finance', 'settings_app'
]
print(f"\n[CHECK] Verifying {len(apps_to_check)} apps are installed...")
for app in apps_to_check:
    if app in settings.INSTALLED_APPS:
        print(f"  OK: {app}")
    else:
        print(f"  FAIL: {app} not in INSTALLED_APPS")

# 2. Check URLs
print("\n[CHECK] Verifying URL configurations...")
urls_to_check = [
    'api/token/',
    'api/token/refresh/',
    'api/account/',
    'api/dashboard/',
    'api/inventory/',
    'api/customers/',
    'api/orders/',
    'api/reports/',
    'api/finance/',
    'api/settings/',
]

for url in urls_to_check:
    try:
        # resolve expects a path without leading slash usually, but let's test resolving the path
        # If it's an include, it might not resolve exactly without a sub-path, 
        # but the include itself should be resolvable if we check the pattern.
        # Actually, resolve() checks if a path matches.
        # For includes, we often need a dummy path.
        
        # However, we can also check via import.
        if url.endswith('/'):
            path = url
        else:
            path = url + '/'
            
        # Try to resolve. 
        # Note: resolve() might fail if the included URLconf is empty or has no patterns matching "" (empty string).
        # But we want to ensure the top level routing works.
        try:
            match = resolve(path)
            print(f"  OK: Resolved '{path}' -> {match.view_name or match.func.__name__ if hasattr(match, 'func') else 'Include'}")
        except Exception as e:
            # If it's an include without a default view, it might fail on the exact path if strict.
            # But normally 'api/account/' should resolve if there is a path like path('', views.index) in the included urlconf.
            # If the included urlconf is empty, it might fail 404.
            print(f"  WARNING: Could not resolve exact path '{path}'. This might be normal if the app has no default route. Error: {e}")
            
            # Let's try importing the urlconf directly to be sure it exists.
            app_name = url.split('/')[1]
            if app_name in ['token', 'admin']: continue 
            
            try:
                from importlib import import_module
                mod = import_module(f"{app_name}.urls")
                print(f"    -> But module '{app_name}.urls' imports successfully.")
            except ImportError as ie:
                print(f"  FAIL: Could not import '{app_name}.urls': {ie}")

    except Exception as e:
        print(f"  FAIL: Error checking {url}: {e}")

# 3. Check Database Connection (basic)
print("\n[CHECK] Database Configuration...")
from django.db import connection
try:
    with connection.cursor() as cursor:
        print("  OK: Database connection successful (using default/sqlite or configured PG).")
except Exception as e:
    print(f"  FAIL: Database connection failed: {e}")

print("\n--- QA CHECK COMPLETE ---")

