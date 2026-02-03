# Phase 10: Order Management - View, Edit & Status System

## Overview
This phase implements order listing, viewing order details, editing orders, and the complete order status state machine.

## P4.md Coverage
- **Section 3.5**: App: `orders` (Lines 373-444) - View & Manage Orders
  - Section 2: View Orders
    - 2.1: Orders List
    - 2.2: View Order Details
  - Section 3: Manage Order Statuses (State Machine)
    - 3.1: Payment Status
    - 3.2: Delivery Status
    - 3.3: Return Status
    - 3.4: Refund Status
    - 3.5: Cancellation Status
    - 3.6: Order Status (Derived)

## Objectives
1. Build order listing with advanced search/filter
2. Implement order detail view with full information
3. Build order status state machine logic
4. Implement order editing (with delivery status restrictions)
5. Build status update functionality
6. Implement order cancellation flow
7. Create order notes functionality

## Deliverables
### Backend (Django)
- [ ] Order status fields implementation
  - payment_status (Pending, Partial, Completed, Overpaid)
  - delivery_status (Pending, Processing, Completed)
  - return_status (NA, Item Received, Completed, Cancelled)
  - refund_status (NA, Pending, Partial, Completed, Cancelled)
  - cancellation_status (NA, Pending, Completed, Cancelled)
- [ ] Derived order_status property (computed per state machine rules)
- [ ] Order status history model (tracks all status changes)
- [ ] Order notes model
- [ ] Orders list API with filters
- [ ] Order detail API
- [ ] Order update API (with delivery restriction logic)
- [ ] Status update API (with state machine validation)
- [ ] Order cancellation API

### Frontend
- [ ] Orders List page
  - Advanced Search/Filter
    - Order ID, Customer Name/ID
    - Date Range picker
    - Order Status, Payment Status dropdowns
  - Table columns: Order ID, Customer Name, Date, Total, Payment Status, Order Status, Items Count
  - All columns sortable
  - Pagination
  - Clickable Order ID opens details
- [ ] View Order Details page
  - Full Order Information display
    - Customer details
    - Products table (Name, Qty, Price, Line Total)
    - Discounts breakdown
    - Payments made list
    - Current statuses display
  - Order Status History timeline
  - Actions section
    - Update Order Status (state machine transitions)
    - Download Receipt as PDF
    - Re-send Receipt (Email/Message/WhatsApp)
    - Add Note to Order
    - Edit Order (disabled if Delivered)
    - Initiate Return/Refund (only if Delivered)
    - Cancel Order (disabled if Delivered)
- [ ] Edit Order page (full create order form, pre-filled)
  - Stock restoration for removed/reduced items
- [ ] Order Notes modal
- [ ] Status Update modal
- [ ] Cancel Order confirmation modal

## Dependencies
- Phase 9: Orders POS (Order creation, base models)
- Phase 5: Inventory Core (stock updates)

## Technical Notes
- Derived Order Status follows precedence order in P4.md 3.6
- Delivered orders CANNOT be edited - must use Returns workflow
- Status changes recorded in history with timestamp
- Item removal/reduction restores inventory stock
- State machine must validate allowed transitions

## Success Criteria
- [ ] Orders list loads with filters working
- [ ] Order details show complete information
- [ ] Status updates follow state machine rules
- [ ] Derived status displays correctly
- [ ] Edit is blocked for delivered orders
- [ ] Cancel order works for non-delivered orders
- [ ] Notes can be added to orders
- [ ] Status history shows all changes
