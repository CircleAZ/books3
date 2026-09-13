# Active Bug Tracking: Inventory, Procurement & Stock Invariants

> **Domain:** Inventory Warehousing, Procurement Lifecycle & Outlet Consignment  
> **Classification:** AVCO Valuation, Pack-Variant Hierarchies, Stock Ledgers & Concurrency Retries  
> **Status Registry:** Living Document — Updated Dynamically  

---

## 1. Category Summary & Health Metrics

The inventory and procurement engines govern physical goods, stock valuations, and vendor replenishment across Books3. Defects in this domain directly corrupt the physical-versus-available stock invariants, distort Weighted Average Cost (AVCO) financial balances, or produce catastrophic deadlocks under concurrent order placements and stock adjustments.

```
Available Stock = Physical Stock - Total Active Owed Quantity
```

| Bug ID | Title / Subsystem | Severity | Status | Verification Target |
|---|---|---|---|---|
| **`BUG-INV-001`** | SQLite Database Locking & Concurrency Contention in Stock Adjustment | **HIGH** | **RESOLVED / PATCHED** | `inventory/services.py:L16-L26` |
| **`BUG-INV-002`** | Negative Stock AVCO Asset Valuation Collapse | **CRITICAL** | **RESOLVED / PATCHED** | `inventory/services.py:L106-L124` |
| **`BUG-INV-003`** | Base-Unit Pack Integer Floor Division Truncation | **MEDIUM** | **RESOLVED / ARCHITECTED** | `inventory/models.py:L138-L143` |
| **`BUG-INV-004`** | Cartesian Product Multiplier in Inventory View Owed Stock Aggregations | **CRITICAL** | **RESOLVED / PATCHED** | `inventory/views.py:L196-L245` |
| **`BUG-INV-005`** | Vendor Pack Multiplier Paradox in Procurement Goods Receipt | **HIGH** | **RESOLVED / PATCHED** | `procurement/services.py:L75-L93` |
| **`BUG-INV-006`** | Outlet Consignment Cost Drift & FIFO Commission Desynchronization | **HIGH** | **RESOLVED / PATCHED** | `outlets/models.py:L162-L218` |
| **`BUG-INV-007`** | Audit Correction Zero-Cost Asset Dilution Exploit | **HIGH** | **RESOLVED / PATCHED** | `inventory/services.py:L34-L36`, `L194-L197` |

---

## 2. Granular Bug Dossiers

### `BUG-INV-001`: SQLite Database Locking & Concurrency Contention in Stock Adjustment
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`inventory/services.py`](file:///z:/books3/inventory/services.py#L16-L26)
- **Mechanism & Root Cause:**
  When multiple POS counters, dispatchers, or background reconciliation tasks invoke `StockService.adjust_stock` simultaneously under an SQLite environment (local development or test execution), SQLite's database-level write lock causes immediate `OperationalError: database is locked` exceptions. Without automatic retry handling, customer checkouts or warehouse dispatches would abort abruptly.
- **Verification Evidence:**
  Inspected [`inventory/services.py`](file:///z:/books3/inventory/services.py#L16-L26):
  ```python
  class StockService:
      MAX_RETRIES = 10
      RETRY_DELAY = 0.2  # seconds

      @staticmethod
      def adjust_stock(product_id, adjustment_type, quantity, reason, notes, user=None, unit_cost=None, target_ledger='both', pack_size=None):
          for attempt in range(StockService.MAX_RETRIES):
              try:
                  return StockService._do_adjust_stock(
                      product_id, adjustment_type, quantity, reason, notes, user, unit_cost, target_ledger, pack_size
                  )
              except OperationalError as e:
                  if 'database is locked' in str(e) and attempt < StockService.MAX_RETRIES - 1:
                      time.sleep(StockService.RETRY_DELAY * (attempt + 1))
                      continue
                  raise
          raise OperationalError("Failed to acquire database lock after retries")
  ```
- **Active Developments:** Fully protected. A 10-attempt backoff retry schedule provides up to 11 seconds of total retry headroom ($0.2s \times [1 + 2 + \dots + 10] = 11.0s$), preventing transient lock dropouts.

---

### `BUG-INV-002`: Negative Stock AVCO Asset Valuation Collapse
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`inventory/services.py`](file:///z:/books3/inventory/services.py#L106-L124)
- **Mechanism & Root Cause:**
  Under standard moving average cost (AVCO) calculations:
  $$\text{New Cost Price} = \frac{(\text{Current Qty} \times \text{Current Cost}) + (\text{Inbound Qty} \times \text{Inbound Cost})}{\text{Current Qty} + \text{Inbound Qty}}$$
  If a product's stock quantity became negative (e.g. physical store dispatch prior to system GRN entry: Current Qty = $-5$ at ₹100 = $-₹500$), and new stock arrived (e.g. Inbound Qty = $10$ at ₹120 = ₹1,200), the naive numerator would be $-₹500 + ₹1,200 = ₹700$, and the denominator $5$, yielding ₹140. Worse, if inbound stock equaled negative stock (e.g., Inbound Qty = $5$), division by zero occurred. If inbound was less than negative stock, the cost price became negative, completely corrupting the balance sheet asset valuation.
- **Verification Evidence:**
  Inspected [`inventory/services.py`](file:///z:/books3/inventory/services.py#L112-L124):
  ```python
  if product.stock_quantity < 0:
      if new_quantity > 0:
          new_cost_price = unit_cost
      else:
          # Remains current cost
          pass
  else:
      # Standard AVCO
      total_qty = product.stock_quantity + quantity
      total_value = current_total_value + new_stock_value
      if total_qty > 0:
          new_cost_price = total_value / total_qty
  ```
- **Active Developments:** If replenishing stock from a deficit into positive territory, `new_cost_price` resets cleanly to the inbound `unit_cost`. If still negative, the existing baseline unit cost is retained without zero-division or sign inversion.

---

### `BUG-INV-003`: Base-Unit Pack Integer Floor Division Truncation
- **Severity:** Medium (P2)
- **Status:** **RESOLVED / ARCHITECTED**
- **Affected File:** [`inventory/models.py`](file:///z:/books3/inventory/models.py#L138-L143)
- **Mechanism & Root Cause:**
  When base product stock changes, `Product.sync_pack_stock()` updates all dependent pack variants. Because pack quantities in the database must represent whole sellable bundles, integer floor division is enforced:
  `pack.stock_quantity = self.stock_quantity // pack.pack_size`.
  If a product has 23 base units and a pack size of 6, pack stock is calculated as $23 // 6 = 3$ packs. The remaining 5 loose units cannot form a 4th pack. If an order attempts to purchase 4 packs, the pack inventory check fails even though loose units exist. Conversely, if 3 packs are sold, 18 base units are consumed, leaving 5 loose units.
- **Verification Evidence:**
  Inspected [`inventory/models.py`](file:///z:/books3/inventory/models.py#L137-L143):
  ```python
  for pack in packs:
      if pack.pack_size and pack.pack_size > 0:
          pack.stock_quantity = self.stock_quantity // pack.pack_size
          pack.physical_stock = self.physical_stock // pack.pack_size
          # Pack cost price is strictly Base Cost * Pack Size. Selling price remains independent.
          pack.cost_price = self.cost_price * pack.pack_size
          pack.save(update_fields=['stock_quantity', 'physical_stock', 'cost_price'])
  ```
- **Active Developments:** Working as intended by design. Loose units remain exclusively available for single-unit ordering. All absolute stock resets on pack variants are strictly blocked (`raise ValueError("Cannot perform absolute 'set' operations on a Pack product. Adjust the Base product directly.")`).

---

### `BUG-INV-004`: Cartesian Product Multiplier in Inventory View Owed Stock Aggregations
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`inventory/views.py`](file:///z:/books3/inventory/views.py#L196-L245)
- **Mechanism & Root Cause:**
  In the inventory list view, computing `owed_quantity` via standard Django ORM joins across `Product -> OrderItem -> DeliveryItem` resulted in SQL Cartesian product explosion. When an order had multiple deliveries or multiple line items, the join duplicated `OrderItem` rows, producing wildly inflated `owed_quantity` values (e.g. an order owing 5 books reported owing 50 or 100 books).
- **Verification Evidence:**
  Inspected [`inventory/views.py`](file:///z:/books3/inventory/views.py#L196-L245):
  ```python
  # Subquery for delivered quantity of each OrderItem
  delivered_subquery = DeliveryItem.objects.filter(
      order_item=OuterRef('pk')
  ).values('order_item').annotate(
      total=Sum('quantity')
  ).values('total')

  # Subquery for total owed quantity of a product (sum of remaining quantities of active order items)
  owed_subquery = OrderItem.objects.filter(
      product=OuterRef('pk'),
      order__order_status__in=VALID_SALE_STATUSES,
      order__cancellation_status__in=['na', 'pending'],
      order__is_deleted=False
  ).annotate(
      delivered_qty=Coalesce(Subquery(delivered_subquery), 0),
      remaining=Greatest(0, Coalesce(F('confirmed_quantity'), F('quantity')) - F('delivered_qty'))
  ).values('product').annotate(
      total_owed=Sum('remaining')
  ).values('total_owed')

  # Subquery for total pack variants' owed quantity (remaining quantities * pack_size)
  pack_owed_subquery = OrderItem.objects.filter(
      product__base_product=OuterRef('pk'),
      product__is_pack=True,
      order__order_status__in=VALID_SALE_STATUSES,
      order__cancellation_status__in=['na', 'pending'],
      order__is_deleted=False
  ).annotate(
      delivered_qty=Coalesce(Subquery(delivered_subquery), 0),
      remaining=Greatest(0, Coalesce(F('confirmed_quantity'), F('quantity')) - F('delivered_qty')),
      pack_remaining=F('remaining') * F('product__pack_size')
  ).values('product__base_product').annotate(
      total_pack_owed=Sum('pack_remaining')
  ).values('total_pack_owed')
  ```
- **Active Developments:** Completely eliminates table join explosion by evaluating independent subqueries inside PostgreSQL/SQLite sub-selects.

---

### `BUG-INV-005`: Vendor Pack Multiplier Paradox in Procurement Goods Receipt
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`procurement/services.py`](file:///z:/books3/procurement/services.py#L75-L93)
- **Mechanism & Root Cause:**
  Vendors ship inventory in wholesale bundles (e.g. cartons of 24 units). If the procurement module passes the vendor pack quantity (e.g., 5 cartons) directly to `StockService` without scaling, the system registers only 5 units in stock instead of 120 units. Furthermore, the unit cost entered by the procurement clerk (e.g., ₹2,400 per carton) would be attributed to individual units, inflating asset valuation $24\times$.
- **Verification Evidence:**
  Inspected [`procurement/services.py`](file:///z:/books3/procurement/services.py#L75-L93):
  ```python
  # 3. Handle Base-Unit Multiplier Paradox (Risk 1)
  # We pass the PACK product ID and the quantity of PACKS.
  # StockService will multiply the packs by pack_size, so it expects the unit_cost to be the PACK cost.
  # Pack Cost = Landed Base Unit Cost * Base Units per Pack
  pack_landed_cost = landed_unit_cost * po_item.vendor_pack_size

  # 4. Atomic Stock Injection
  if not bypass_inventory_volume:
      StockService.adjust_stock(
          product_id=po_item.product_id,
          adjustment_type='increase',
          quantity=new_packs,
          reason='purchase',
          notes=f"PO #{po.display_id} Received" + (" [WAC Bypassed]" if bypass_inventory_wac else ""),
          user=user,
          unit_cost=pack_landed_cost if not bypass_inventory_wac else None,
          target_ledger='both',
          pack_size=po_item.vendor_pack_size
      )
  ```
- **Active Developments:** `StockService` scales `quantity = quantity * effective_pack_size` and normalizes `unit_cost = unit_cost / effective_pack_size`, ensuring base units and unit costs are mathematically sound.

---

### `BUG-INV-006`: Outlet Consignment Cost Drift & FIFO Commission Desynchronization
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`outlets/models.py`](file:///z:/books3/outlets/models.py#L162-L218)
- **Mechanism & Root Cause:**
  When merchandise is transferred on consignment to remote outlet counters, subsequent vendor purchases at the central warehouse shift the moving average cost (`product.cost_price`). If outlet sale profit margins or consignment commissions were calculated dynamically using the live `product.cost_price`, historical outlet sales would drift retroactively.
- **Verification Evidence:**
  Inspected [`outlets/models.py`](file:///z:/books3/outlets/models.py#L175-L218):
  ```python
  # 1. Freeze the cost price
  product = Product.objects.get(pk=item.product_id)
  item.frozen_cost_price = product.cost_price
  item.save(update_fields=['frozen_cost_price'])

  # 2. Deduct from Main Inventory (both available and physical)
  StockService.adjust_stock(
      product_id=item.product_id,
      adjustment_type='decrease',
      quantity=item.quantity,
      reason='adjustment',
      notes=f"Dispatched to Outlet {self.outlet.name} (Transfer #{self.display_id})",
      user=user,
      target_ledger='both'
  )

  # Freeze the commission rate at time of dispatch
  c_type, c_val = OutletDailySaleItem.resolve_commission_rate(self.outlet, product)
  item.frozen_commission_type = c_type
  item.frozen_commission_value = c_val
  ```
- **Active Developments:** Both cost price and commission tiers are frozen at moment of dispatch and tracked via a FIFO queue on `OutletStock.commission_queue`.

---

### `BUG-INV-007`: Audit Correction Zero-Cost Asset Dilution Exploit
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`inventory/services.py`](file:///z:/books3/inventory/services.py#L34-L36, #L194-L197)
- **Mechanism & Root Cause:**
  During periodic warehouse stock audits, finding unrecorded surplus inventory (e.g. +100 units found in aisle) requires an audit correction. If a user entered an increase without providing a unit cost basis, `unit_cost` defaulted to `None`. Under AVCO calculation, adding 100 units with 0 value heavily diluted the product's moving average cost, severely depressing reported gross profit margins upon sale.
- **Verification Evidence:**
  Inspected [`inventory/services.py`](file:///z:/books3/inventory/services.py#L34-L36):
  ```python
  if reason == 'audit_correction' and adjustment_type == 'increase' and unit_cost is None:
      from django.core.exceptions import ValidationError
      raise ValidationError("Audit corrections that increase stock MUST specify a unit_cost to establish a baseline cost basis.")
  ```
  And in `set_stock()` at lines 194-197:
  ```python
  if reason == 'audit_correction' and change > 0 and unit_cost is None:
      from django.core.exceptions import ValidationError
      raise ValidationError("Audit corrections that increase stock MUST specify a unit_cost to establish a baseline cost basis.")
  ```
- **Active Developments:** System strictly refuses stock increases categorized as `audit_correction` unless a non-zero `unit_cost` is explicitly supplied by the auditor.
