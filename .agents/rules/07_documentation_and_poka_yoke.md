# Rule 07: Documentation Standards, Poka-Yoke & Data Repair Governance

## 1. The 6-Stage Forensic Data Repair Gate (Poka-Yoke)
Every single data reconciliation vector in **Track 2 (The Reconciliation Crucible)** mutates active database records in Neon (`ep-raspy-lake-b39hlekz`). To guarantee zero data corruption or ledger drift, every repair document must strictly follow this 6-stage lifecycle template before execution:

1. **Forensic Problem Statement:** Exact entity identifiers, record UUIDs, and quantifiable drift (e.g. `Product #1047: stock_quantity = -1, physical_stock = 0, owed_quantity = 1`).
2. **Deterministic SQL Audit Query:** The exact, reproducible SQL/ORM query demonstrating the anomaly and proving the scope of affected rows.
3. **Root Cause Analysis (RCA):** The exact historical code flaw or operational bypass that introduced the discrepancy.
4. **Surgical Repair Specification:** The Python management command or migration script, row-locking (`select_for_update`) strategy, and atomic rollback latch.
5. **Ledger Immutability Proof:** Mathematical verification that `LedgerService`, `StockAdjustment`, and historical tables remain in perfect equilibrium.
6. **Execution Log & Sign-Off:** Timestamp, number of rows modified, and post-repair audit check returning zero remaining anomalies.

## 2. Docs-as-Code Invariant
- **Atomic Commits:** No bug fix, architecture refactoring, or data repair script may be committed to `main` without its corresponding documentation file in the same atomic commit.
- **Single Source of Truth:** A developer or auditor should never have to read the raw source code to understand system data flows, state machines, or failure states. If a document states "refer to the code for details," the document is incomplete and rejected.

## 3. Document Status Banners
Every technical document, architecture specification, and audit report MUST begin with an explicit lifecycle status banner:
- `[DRAFT]`: Work in progress; not yet vetted by the Expert Panel.
- `[UNDER_PANEL_REVIEW]`: Being debated under panel scrutiny.
- `[APPROVED_FOR_EXECUTION]`: Formally signed off and cleared for implementation.
- `[SEALED_HISTORICAL]`: Immutable archive of completed operations.

## 4. Diagram & Mathematical Formatting Standards
- **Mermaid Diagrams:** All state transitions and component interactions must be modeled via Mermaid code blocks. Node labels containing parentheses or special characters MUST be quoted (e.g. `id["Order (Confirmed)"]`). HTML tags inside Mermaid labels are forbidden.
- **KaTeX Equations:** Financial formulas must use KaTeX syntax. Literal currency symbols must be escaped (`\$`) to prevent markdown syntax collisions.
- **Zero Raw Code Dumps:** Do not paste monolithic code blocks into documentation. Use structural diagrams, sequence flows, parameter tables, and bulleted interface invariants.
