# Phase 11: Order Management - Returns & Refunds

## Overview
This phase implements the complete returns and refunds workflow including item returns, stock management, refund processing, and credit notes.

## P4.md Coverage
- **Section 3.5**: App: `orders` (Lines 446-461) - Returns & Refunds
  - Section 4: Manage Returns & Refunds
    - 4.1: Initiate Return/Refund Process
    - 4.2: Stock Management for Returns
    - 4.3: Refund Processing
    - 4.4: List of all Returns/Refunds
  - Section 5: Sales Reports (link to reports app)

## Objectives
1. Build Return/Refund database models
2. Implement return initiation workflow
3. Build item selection for returns with quantities
4. Implement return reasons management
5. Build stock management options (return to inventory or damaged)
6. Implement refund calculation and processing
7. Build credit note/refund receipt generation
8. Create returns/refunds listing page

## Deliverables
### Backend (Django)
- [ ] Return model
  - Order (FK)
  - Status (Initiated, Items Received, Completed, Cancelled)
  - Created timestamp
- [ ] ReturnItem model
  - Return (FK), OrderItem (FK)
  - Quantity returned
  - Reason (FK to ReturnReason)
  - Stock action (Return to Inventory / Mark Damaged)
- [ ] ReturnReason model
  - Name (Damaged, Wrong Item, Changed Mind, etc.)
- [ ] Refund model
  - Return (FK, optional), Order (FK)
  - Amount, Method (Cash/UPI - manual)
  - Transaction ID/Note
  - Status
- [ ] CreditNote model (for refund receipts)
- [ ] Return API endpoints (initiate, update status, complete)
- [ ] Refund API endpoints
- [ ] Returns list API with filters

### Frontend
- [ ] Initiate Return/Refund page
  - Find original order (by Order ID or Customer search)
  - Order details display
  - Select items to return
    - Checkbox per item
    - Quantity input (max = original qty)
    - Reason dropdown per item
  - Stock management options per item
    - Return item(s) to inventory (sellable)
    - Mark as damaged/unsellable
  - Proceed button
- [ ] Refund Processing section
  - Calculate refund amount (full or partial)
  - Amount input (editable)
  - Refund method (Cash/UPI - Manual)
  - Transaction ID/Note input
  - Record Refund button
- [ ] Generate Credit Note/Refund Receipt button
- [ ] Returns/Refunds List page
  - Table: Return ID, Order ID, Customer, Date, Items Count, Status, Refund Status
  - Filters: Date range, Status
  - Clickable to return details
- [ ] Return Details page
  - Return info, items returned, refund info
  - Status update buttons

## Dependencies
- Phase 10: Orders Management (Order status system)
- Phase 5: Inventory Core (stock updates)

## Technical Notes
- Returns update Order's return_status field
- Refunds update Order's refund_status field
- Stock restoration only if "Return to Inventory" selected
- Manual refund means admin physically refunds and records in system
- Credit notes are PDF receipts for refunds

## Success Criteria
- [ ] Return can be initiated from delivered order
- [ ] Items can be selected with quantities
- [ ] Return reasons can be selected
- [ ] Stock action options work correctly
- [ ] Refund amount calculates correctly
- [ ] Refund can be recorded with details
- [ ] Credit note generates as PDF
- [ ] Returns list shows all returns with status
- [ ] Order status updates reflect return/refund state
