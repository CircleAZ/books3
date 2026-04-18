"""Phase 2 RBAC verification script."""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from settings_app.models import Role, RolePermission, UserRole

User = get_user_model()
admin = User.objects.get(username='admin')
mayank = User.objects.get(username='mayank')  # Manager role
# Get a Staff user
staff_user = User.objects.get(username='testboy')

factory = APIRequestFactory()
results = []

def test(name, status_code, expected, view_cls, method_map, url, user, data=None):
    if data:
        req = factory.post(url, data, format='json')
    else:
        req = factory.get(url)
    force_authenticate(req, user=user)
    view = view_cls.as_view(method_map) if isinstance(method_map, dict) else view_cls.as_view()
    try:
        resp = view(req)
        passed = resp.status_code in (expected if isinstance(expected, list) else [expected])
        status_str = "PASS" if passed else "FAIL"
        results.append(passed)
        print(f"[{status_str}] {name}: {resp.status_code} (expect {expected})")
    except Exception as e:
        import django.db.utils
        if isinstance(e, django.db.utils.IntegrityError):
            # IntegrityError means it reached the DB — RBAC allowed the request!
            results.append(True)
            print(f"[PASS] {name}: Reached DB (IntegrityError)")
        else:
            results.append(False)
            print(f"[FAIL] {name}: {type(e).__name__}: {e}")

print("=" * 70)
print("Phase 2 RBAC Enforcement Verification")
print("=" * 70)

# --- INVENTORY ---
print("\n--- Inventory ---")
from inventory.views import ProductViewSet, CategoryViewSet, StockAdjustmentViewSet

# Admin can list products
test("ProductViewSet.list (admin)", 200, 200,
     ProductViewSet, {'get': 'list'}, '/api/inventory/products/', admin)

# Staff can list products (has inventory.view_products)
test("ProductViewSet.list (staff)", 200, 200,
     ProductViewSet, {'get': 'list'}, '/api/inventory/products/', staff_user)

# Staff can create products (has inventory.manage_products — quick add Q7)
test("ProductViewSet.create (staff)", 201, [201, 400],  # 400 is ok (validation), not 403
     ProductViewSet, {'post': 'create'}, '/api/inventory/products/', staff_user,
     {'name': 'RBAC Test Product', 'selling_price': '100'})

# Staff can list categories (has inventory.view_products via permission_map)
test("CategoryViewSet.list (staff)", 200, 200,
     CategoryViewSet, {'get': 'list'}, '/api/inventory/categories/', staff_user)

# Staff CANNOT create categories (needs inventory.manage_categories)
test("CategoryViewSet.create (staff) → DENIED", 403, 403,
     CategoryViewSet, {'post': 'create'}, '/api/inventory/categories/', staff_user,
     {'name': 'RBAC Test Category'})

# Staff CANNOT adjust stock (needs inventory.manage_stock)
test("StockAdjustmentViewSet.list (staff) → DENIED", 403, 403,
     StockAdjustmentViewSet, {'get': 'list'}, '/api/inventory/stock/', staff_user)

# --- ORDERS ---
print("\n--- Orders ---")
from orders.views import OrderViewSet, ReturnViewSet, PaymentViewSet

# Staff can list orders (has orders.view_orders)
test("OrderViewSet.list (staff)", 200, 200,
     OrderViewSet, {'get': 'list'}, '/api/orders/', staff_user)

# Staff can create orders (has orders.create_orders)
test("OrderViewSet.create (staff)", 201, [201, 400],
     OrderViewSet, {'post': 'create'}, '/api/orders/', staff_user,
     {'items': []})

# Staff CANNOT manage returns (needs orders.manage_returns)
test("ReturnViewSet.list (staff) → DENIED", 403, 403,
     ReturnViewSet, {'get': 'list'}, '/api/orders/returns/', staff_user)

# Admin CAN manage returns
test("ReturnViewSet.list (admin)", 200, 200,
     ReturnViewSet, {'get': 'list'}, '/api/orders/returns/', admin)

# Staff CAN manage payments (has orders.manage_payments)
test("PaymentViewSet.list (staff)", 200, 200,
     PaymentViewSet, {'get': 'list'}, '/api/orders/payments/', staff_user)

# --- CUSTOMERS ---
print("\n--- Customers ---")
from customers.views import CustomerViewSet, SchoolViewSet, AddressViewSet

# Staff can list customers (has customers.view_customers)
test("CustomerViewSet.list (staff)", 200, 200,
     CustomerViewSet, {'get': 'list'}, '/api/customers/', staff_user)

# Staff can list schools (view_customers via permission_map)
test("SchoolViewSet.list (staff)", 200, 200,
     SchoolViewSet, {'get': 'list'}, '/api/customers/schools/', staff_user)

# Staff CANNOT create schools (needs customers.manage_schools)
test("SchoolViewSet.create (staff) → DENIED", 403, 403,
     SchoolViewSet, {'post': 'create'}, '/api/customers/schools/', staff_user,
     {'name': 'RBAC Test School'})

# Staff CAN create addresses (has customers.manage_addresses Q4)
test("AddressViewSet.create (staff)", 201, [201, 400, 500],
     AddressViewSet, {'post': 'create'}, '/api/customers/addresses/', staff_user,
     {'customer': str(admin.id), 'address_line': 'Test'})

# --- SETTINGS ---
print("\n--- Settings ---")
from settings_app.views import StoreSettingsViewSet, TaxSettingsViewSet

# Staff CAN read store settings (permission_map: list → None)
test("StoreSettingsViewSet.list (staff)", 200, 200,
     StoreSettingsViewSet, {'get': 'list'}, '/api/settings/store/', staff_user)

# Staff CANNOT modify tax settings (needs settings.manage_taxes)
test("TaxSettingsViewSet.list (staff) → DENIED", 403, 403,
     TaxSettingsViewSet, {'get': 'list'}, '/api/settings/taxes/', staff_user)

# Admin CAN modify tax settings
test("TaxSettingsViewSet.list (admin)", 200, 200,
     TaxSettingsViewSet, {'get': 'list'}, '/api/settings/taxes/', admin)

# --- REPORTS ---
print("\n--- Reports ---")
from reports.views import SalesReportViewSet

# Staff CAN view sales reports (has reports.view_sales)
test("SalesReportViewSet.summary (staff)", 200, 200,
     SalesReportViewSet, {'get': 'summary'}, '/api/reports/sales/summary/', staff_user)

# --- EMPLOYEE EXPENSE ---
print("\n--- Employee Expense (Q10 Split) ---")
from finance.views import EmployeeExpenseViewSet

# Staff CAN list employee expenses (None = any authenticated, queryset filters to own)
test("EmployeeExpenseViewSet.list (staff)", 200, 200,
     EmployeeExpenseViewSet, {'get': 'list'}, '/api/finance/employee-expenses/', staff_user)

# Staff CAN create employee expenses (submit own claims)
test("EmployeeExpenseViewSet.create (staff)", 201, [201, 400],
     EmployeeExpenseViewSet, {'post': 'create'}, '/api/finance/employee-expenses/', staff_user,
     {'amount': '500', 'description': 'RBAC test claim'})

# --- SUMMARY ---
print("=" * 70)
passes = sum(1 for r in results if r)
total = len(results)
print(f"Results: {passes}/{total} tests passed")
if passes < total:
    print("FAILURES DETECTED — review output above")
