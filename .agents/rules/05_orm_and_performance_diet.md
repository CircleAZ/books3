# Rule 05: Django ORM, Serialization Diet & Performance Architecture

## 1. Permanent Ban on `SerializerMethodField` in List Views
- **The Performance Tax:** `SerializerMethodField` forces Django to execute an un-batched Python function for every row in a serialized list. In a list view of 50 items, that is 200–400 synchronous Python function calls blocking the web worker.
- **Strict Rule:** `SerializerMethodField` that queries the database or performs calculations across related rows is **STRICTLY PROHIBITED** on list endpoints.
- **Enforcement:** Calculations must be pushed into PostgreSQL via database annotations in `get_queryset()`:
  - Use `F()` expressions, `Coalesce()`, and `Subquery()` annotations.
  - Expose annotated values as simple, read-only serializer fields (`serializers.DecimalField(read_only=True)`).

## 2. Eradication of N+1 Database Query Loops
- **Foreign Key Rule:** Always use `select_related()` for single-valued relationships (ForeignKey, OneToOne).
- **Reverse Relation Rule:** Always use `prefetch_related()` for multi-valued relationships (ManyToMany, reverse ForeignKeys).
- **Prefetch Cache Eviction Gotcha:** Executing `.filter()` on a prefetched related manager (e.g. `obj.loans.filter(is_active=True)`) **bypasses the prefetch cache completely** and fires a new raw SQL query for every row. 
  - To filter prefetched sets in Python, iterate over `obj.loans.all()` or use a `Prefetch(to_attr=...)` object.

## 3. Bounded Querysets & Chunked Iterators (`.iterator()`)
- **Memory Ceiling Hazard:** On Render's 512MB RAM tier, loading 5,000+ model instances into memory via `Model.objects.all()` causes an instant `OOMKilled Error 137`.
- **Bulk Export Invariant:** All CSV exports, background batch operations, and large report generation tasks MUST use `queryset.iterator(chunk_size=1000)`:
  ```python
  for item in large_queryset.iterator(chunk_size=1000):
      process_row(item)
  ```
- **Values / ValuesList Bypass:** For read-only reporting endpoints that do not require model instance methods, use `.values()` or `.values_list()` to bypass Python object instantiation entirely.

## 4. Soft-Delete Aggregation Parity
- **The Metric Discrepancy Trap:** `SoftDeleteModel` sets `is_deleted = models.BooleanField(default=False)`. Raw SQL queries or custom managers without `is_deleted=False` include deleted records (e.g., 413 total orders vs 396 active business orders; 472 total customers vs 469 active customers).
- **Strict Rule:** Every audit query, dashboard summary metric, and reconciliation calculation must explicitly include `WHERE is_deleted = false` or filter through the default manager.

## 5. Mandatory Database Indexing (`db_index=True`)
- **The Table Scan Bottleneck:** Neon Free Tier compute is throttled during heavy sequential table scans.
- **Indexing Mandate:** Any column used in `.filter()`, `.exclude()`, `.order_by()`, or soft-delete lookups on high-growth tables (`Order`, `OrderItem`, `Product`, `StockAdjustment`, `BankTransaction`, `Customer`) MUST declare `db_index=True` or participate in a `models.Index(fields=[...])` composite index.
