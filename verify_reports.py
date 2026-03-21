import os
import sys
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from pprint import pprint
import re

def print_error(response):
    print("STATUS:", response.status_code)
    try:
        content = response.content.decode('utf-8')
        tb = re.search(r'<textarea id="traceback_area".*?>(.*?)</textarea>', content, re.DOTALL)
        if tb:
            print(tb.group(1).replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'"))
        else:
            print(content[:500])
    except Exception as e:
        print("Could not parse error:", e)


def verify():
    client = APIClient()
    User = get_user_model()
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        print("No superuser found.")
        sys.exit(1)
        
    client.force_authenticate(user=user)

    print("--- 1. Testing P&L Endpoint ---")
    response = client.get('/api/reports/finance/pnl/?period=month')
    if response.status_code == 200:
        pprint(response.json())
    else:
        print_error(response)

    print("\n--- 2. Testing Cash Flow Endpoint ---")
    response = client.get('/api/reports/finance/cash_flow/?period=month')
    if response.status_code == 200:
        pprint(response.json())
    else:
        print_error(response)

    print("\n--- 3. Testing Balance Sheet Endpoint ---")
    response = client.get('/api/reports/finance/balance_sheet/')
    if response.status_code == 200:
        pprint(response.json())
    else:
        print_error(response)

if __name__ == '__main__':
    verify()
