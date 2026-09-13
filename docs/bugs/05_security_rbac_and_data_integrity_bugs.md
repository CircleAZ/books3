# Active Bug Tracking: Security, RBAC & Data Integrity Invariants

> **Domain:** Access Control, Role-Based Authorization, Database Restoration & Script Isolation  
> **Classification:** Privilege Escalation, Admin Lockout, Off-Ledger Mutation & Foreign Key Integrity  
> **Status Registry:** Living Document — Updated Dynamically  

---

## 1. Category Summary & Health Metrics

Security and data integrity invariants ensure that authenticated roles operate within their strictly defined boundaries, destructive administrative operations are gated behind explicit safety latches, and backend database relationships remain referentially intact without dangling records or off-ledger mutations.

| Bug ID | Title / Subsystem | Severity | Status | Verification Target |
|---|---|---|---|---|
| **`BUG-SEC-001`** | Administrative Self-Lockout Vulnerability in System Roles | **HIGH** | **RESOLVED / PATCHED** | `RolesPermissions.jsx:L84` |
| **`BUG-SEC-002`** | Destructive Database Restoration Without Maintenance Mode Gate | **CRITICAL** | **RESOLVED / PATCHED** | `DataManagement.jsx:L65-L68` |
| **`BUG-SEC-003`** | Dangling Location Tag Deletion Corrupting Customer Addresses | **HIGH** | **RESOLVED / PATCHED** | `ManageTags.jsx:L120-L126`, `customers/views.py:L1410-L1419` |
| **`BUG-SEC-004`** | Hardcoded Cross-Workspace Path Injection in CLI Utility Scripts | **HIGH** | **OPEN / ACTION REQUIRED** | `scripts/reverse_ghost_refund.py:L5`, `scripts/fix_orphaned_payments.py:L5` |
| **`BUG-SEC-005`** | Direct Off-Ledger Wallet Balance Mutation in Remediation Scripts | **CRITICAL** | **OPEN / AUDIT ACTIVE** | `scripts/reverse_ghost_refund.py:L20-L27` |
| **`BUG-SEC-006`** | Orphaned Outlet Financial Inflows Missing Ledger Postings | **HIGH** | **RESOLVED / SCRIPTED** | `scripts/fix_orphaned_payments.py:L15-L35` |

---

## 2. Granular Bug Dossiers

### `BUG-SEC-001`: Administrative Self-Lockout Vulnerability in System Roles
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/settings/RolesPermissions.jsx`](file:///z:/books3/frontend/src/pages/settings/RolesPermissions.jsx#L84)
- **Mechanism & Root Cause:**
  In the RBAC configuration matrix, superusers can toggle permissions for any role. If an administrator accidentally unchecked settings or user management permissions for the system `Admin` role, all administrators were immediately stripped of settings access upon token refresh. This created an irreversible lockout from the UI, requiring direct SQL database manipulation to restore.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/settings/RolesPermissions.jsx`](file:///z:/books3/frontend/src/pages/settings/RolesPermissions.jsx#L80-L86):
  ```jsx
  <label>
      <input
          type="checkbox"
          checked={role.permissions.includes(perm.codename)}
          onChange={(e) => handlePermissionChange(role.id, perm.codename, e.target.checked)}
          disabled={role.is_system && role.name === 'Admin' && perm.category === 'settings'} // Prevent locking out admin
      />
      {perm.name}
  </label>
  ```
- **Active Developments:** Checkbox input is strictly disabled with a permanent lock for system-designated Admin roles on all `settings` category permissions.

---

### `BUG-SEC-002`: Destructive Database Restoration Without Maintenance Mode Gate
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/settings/DataManagement.jsx`](file:///z:/books3/frontend/src/pages/settings/DataManagement.jsx#L65-L68)
- **Mechanism & Root Cause:**
  Restoring a database snapshot while the application actively processes live POS checkouts or payment webhook callbacks creates severe table locking contention and unrecoverable database corruption. Allowing operators to trigger a database import without first freezing the application state is a catastrophic operational risk.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/settings/DataManagement.jsx`](file:///z:/books3/frontend/src/pages/settings/DataManagement.jsx#L64-L71):
  ```jsx
  <button
      className={`btn ${maintenanceMode ? 'btn-danger' : 'btn-disabled'}`}
      onClick={handleRestore}
      disabled={!maintenanceMode}
  >
      Restore Data
  </button>
  ```
- **Active Developments:** System strictly disallows triggering database restoration unless the "Maintenance Mode" hardware-style software latch is explicitly engaged, which turns off public API ingress.

---

### `BUG-SEC-003`: Dangling Location Tag Deletion Corrupting Customer Addresses
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - Frontend: [`frontend/src/pages/settings/ManageTags.jsx`](file:///z:/books3/frontend/src/pages/settings/ManageTags.jsx#L120-L126)
  - Backend: [`customers/views.py`](file:///z:/books3/customers/views.py#L1410-L1419)
- **Mechanism & Root Cause:**
  When delivery location tags (e.g. "Main Market", "Sector 4") were deleted, existing customer shipping addresses lost their route groupings or retained broken many-to-many references. Logistics drivers relying on tag groupings for delivery batches lost track of pending shipments.
- **Verification Evidence:**
  Frontend initiates merge in `ManageTags.jsx:L120-L126`:
  ```javascript
  const res = await fetchWithAuth(
      `${ENDPOINTS.CUSTOMERS_LOCATION_TAGS}${mergeSource.id}/merge/`,
      {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_tag_id: mergeTarget })
      }
  );
  ```
  Backend executes atomic reassignment in `customers/views.py:L1410-L1419`:
  ```python
  with db_transaction.atomic():
      # Reassign all addresses from source to target
      from .models import Address
      for address in Address.objects.filter(location_tags=source_tag):
          address.location_tags.add(target_tag)
          address.location_tags.remove(source_tag)
      
      source_name = source_tag.name
      source_tag.delete()
  ```
- **Active Developments:** Location tags cannot be orphaned; users can either merge them into another existing tag atomically or confirm full strip.

---

### `BUG-SEC-004`: Hardcoded Cross-Workspace Path Injection in CLI Utility Scripts
- **Severity:** High (P1)
- **Status:** **OPEN / ACTION REQUIRED**
- **Affected Files:**
  - [`scripts/reverse_ghost_refund.py`](file:///z:/books3/scripts/reverse_ghost_refund.py#L5)
  - [`scripts/fix_orphaned_payments.py`](file:///z:/books3/scripts/fix_orphaned_payments.py#L5)
- **Mechanism & Root Cause:**
  Legacy utility scripts created during past hotfix sessions contain the hardcoded line:
  `sys.path.append(r'z:\books2')`.
  This is a direct violation of Workspace Rule #3 ("STRICT WORKSPACE PURITY"). In production or isolated Docker deployments where `z:\books2` does not exist, executing these scripts immediately crashes with `ModuleNotFoundError` or inadvertently imports outdated legacy models from the previous repository.
- **Verification Evidence:**
  Inspected [`scripts/reverse_ghost_refund.py`](file:///z:/books3/scripts/reverse_ghost_refund.py#L5):
  ```python
  import os
  import django
  import sys

  sys.path.append(r'z:\books2')
  os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
  django.setup()
  ```
- **Active Developments:** Target for refactoring. Must be updated to resolve relative project root dynamically (`Path(__file__).resolve().parent.parent`) and execute within the sovereign Books3 environment.

---

### `BUG-SEC-005`: Direct Off-Ledger Wallet Balance Mutation in Remediation Scripts
- **Severity:** Critical (P0)
- **Status:** **OPEN / AUDIT ACTIVE**
- **Affected File:** [`scripts/reverse_ghost_refund.py`](file:///z:/books3/scripts/reverse_ghost_refund.py#L20-L27)
- **Mechanism & Root Cause:**
  The `reverse_ghost_refund.py` script attempts to undo an invalid refund by directly subtracting from `wallet.balance` and raw-deleting `WalletTransaction` and `Refund` objects:
  ```python
  wallet.balance -= wt.amount
  wallet.save()
  wt.delete()
  ```
  This bypasses `LedgerService.process_withdrawal()`, corrupts double-entry accounting integrity, leaves no immutable audit record of why money disappeared, and causes cash-to-wallet variance.
- **Verification Evidence:**
  Inspected [`scripts/reverse_ghost_refund.py`](file:///z:/books3/scripts/reverse_ghost_refund.py#L20-L27):
  ```python
  # 1. Deduct amount from wallet
  wallet.balance -= wt.amount
  wallet.save()
  print(f"Deducted {wt.amount} from {wallet.customer.full_name}'s wallet. New balance: {wallet.balance}")

  # 2. Delete the wallet transaction
  wt.delete()
  print("Deleted WalletTransaction.")
  ```
- **Active Developments:** This script is flagged as dangerous. Any balance adjustments must be converted to an immutable balancing ledger transaction (`LedgerService`) rather than an in-place column update and row deletion.

---

### `BUG-SEC-006`: Orphaned Outlet Financial Inflows Missing Ledger Postings
- **Severity:** High (P1)
- **Status:** **RESOLVED / SCRIPTED**
- **Affected File:** [`scripts/fix_orphaned_payments.py`](file:///z:/books3/scripts/fix_orphaned_payments.py#L15-L35)
- **Mechanism & Root Cause:**
  During offline or degraded outlet operation, certain `OutletPayment` records were committed without linking to a corresponding `BankTransaction` or `CashWalletTransaction`. This allowed cash or bank balances to remain unposted in the main accounting books, obscuring actual company cash holdings.
- **Verification Evidence:**
  Inspected [`scripts/fix_orphaned_payments.py`](file:///z:/books3/scripts/fix_orphaned_payments.py#L15-L20):
  ```python
  orphaned = OutletPayment.objects.filter(bank_transaction__isnull=True, wallet_transaction__isnull=True)
  count = orphaned.count()
  print(f"Found {count} orphaned OutletPayments.")
  ```
- **Active Developments:** Script provisions missing transactions to restore double-entry balance. Permanent fix enforced in `outlets/views.py` ensuring transactions fail atomically if ledger posting fails.
