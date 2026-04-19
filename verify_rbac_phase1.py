"""Phase 1 RBAC verification script."""
from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
User = get_user_model()
admin = User.objects.get(username='admin')
mayank = User.objects.get(username='mayank')
factory = APIRequestFactory()

print("=" * 60)
print("Phase 1 RBAC Fix Verification")
print("=" * 60)

# Test 1: BankAccountViewSet (was 403 due to manage_bank_accounts mismatch)
from finance.views import BankAccountViewSet
req = factory.get('/api/finance/bank-accounts/')
force_authenticate(req, user=admin)
view = BankAccountViewSet.as_view({'get': 'list'})
resp = view(req)
status1 = "PASS" if resp.status_code == 200 else "FAIL"
print(f"[{status1}] Test 1 - BankAccountViewSet (admin): {resp.status_code} (expect 200)")

# Test 2: InlineSchoolCreateView (was 403 due to inline_create_taxonomy)
from customers.views import InlineSchoolCreateView
req = factory.post('/api/customers/inline-school/', {'type': 'school', 'name': 'RCA Probe'}, format='json')
force_authenticate(req, user=admin)
view = InlineSchoolCreateView.as_view()
resp = view(req)
status2 = "PASS" if resp.status_code in (200, 201) else "FAIL"
print(f"[{status2}] Test 2 - InlineSchoolCreateView (admin): {resp.status_code} (expect 200/201)")

# Test 3: Staff user CAN also access InlineSchool
req2 = factory.post('/api/customers/inline-school/', {'type': 'school', 'name': 'RCA Probe 2'}, format='json')
force_authenticate(req2, user=mayank)
resp2 = InlineSchoolCreateView.as_view()(req2)
status3 = "PASS" if resp2.status_code in (200, 201) else "FAIL"
print(f"[{status3}] Test 3 - InlineSchoolCreateView (mayank/Staff): {resp2.status_code} (expect 200/201)")

# Test 4: Login response role field
from settings_app.models import Role
rbac_roles = Role.objects.filter(role_users__user=admin)
rbac_name = rbac_roles.first().name if rbac_roles.exists() else None
status4 = "PASS" if rbac_name == "Admin" else "FAIL"
print(f"[{status4}] Test 4 - Admin RBAC role: {rbac_name} (expect Admin)")
print(f"         Admin CharField role: {admin.role} (orphaned, should be ignored)")

# Test 5: UserRole coverage
from settings_app.models import UserRole
total = User.objects.filter(is_active=True).count()
assigned = UserRole.objects.values('user').distinct().count()
status5 = "PASS" if assigned == total else "FAIL"
print(f"[{status5}] Test 5 - UserRole coverage: {assigned}/{total} users assigned")

# Test 6: Manager now has finance.manage_banking
from settings_app.models import RolePermission
manager_has_banking = RolePermission.objects.filter(
    role__name='Manager',
    permission__codename='finance.manage_banking'
).exists()
status6 = "PASS" if manager_has_banking else "FAIL"
print(f"[{status6}] Test 6 - Manager has finance.manage_banking: {manager_has_banking}")

print("=" * 60)
passes = sum(1 for s in [status1, status2, status3, status4, status5, status6] if s == "PASS")
print(f"Results: {passes}/6 tests passed")
