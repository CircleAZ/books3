import os
import django
from django.urls import resolve
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

print("--- QA URL RESOLUTION CHECK V2 ---")

paths = [
    '/api/token/',
    '/api/token/refresh/',
    '/admin/login/', # Standard admin
]

for p in paths:
    try:
        match = resolve(p)
        print(f"PASS: {p} resolves to {match.func.__name__ if hasattr(match, 'func') else match.view_name}")
    except Exception as e:
        print(f"FAIL: {p} - {e}")

print("\n--- APP URLS ---")
# Check if app urls are empty or not
import importlib
apps = ['account', 'dashboard', 'inventory', 'customers', 'orders', 'reports', 'finance', 'settings_app']
for app in apps:
    try:
        mod = importlib.import_module(f'{app}.urls')
        if hasattr(mod, 'urlpatterns'):
            print(f"INFO: {app}.urls has {len(mod.urlpatterns)} patterns")
        else:
            print(f"WARN: {app}.urls has no urlpatterns list")
    except Exception as e:
        print(f"FAIL: {app}.urls import error: {e}")
