# Phase 9: Order Management - POS Interface

## Overview
This phase implements the Point of Sale (POS) interface for creating new orders, including customer selection, product addition, order summary, and payment processing.

## P4.md Coverage
- **Section 3.5**: App: `orders` (Lines 333-371) - Create New Order
  - Section 1: Create New Order (POS Interface)
    - 1.1: Customer Selection
    - 1.2: Product Addition
    - 1.3: Order Summary
    - 1.4: Payment Processing
    - 1.5: Order Completion
    - 1.6: Quick Buttons

## Objectives
1. Build Order and OrderItem database models
2. Build Payment model for multi-payment support
3. Create POS interface layout
4. Implement customer search and selection
5. Implement Guest Checkout logic (single guest customer)
6. Build product search and addition with quick create
7. Implement item-level and order-level discounts
8. Build payment processing with multiple methods
9. Implement Hold Order (draft) functionality
10. Create order completion and receipt generation trigger

## Deliverables
### Backend (Django)
- [ ] Order model
  - UUID primary key, display ID
  - Customer (FK), Guest fields (name, phone, email)
  - Status fields (payment, delivery, return, refund, cancellation)
  - Subtotal, Discounts, Total
  - Notes, Created/Updated timestamps
- [ ] OrderItem model
  - Order (FK), Product (FK)
  - Quantity, Unit Price
  - Line discount (type, amount)
  - Line total
- [ ] Payment model
  - Order (FK), Method (Cash/UPI)
  - Amount Paid, Date/Time
  - UPI Account reference (if UPI)
- [ ] Order API endpoints (Create, Update, Hold as draft)
- [ ] Payment API endpoints
- [ ] Guest Customer singleton record

### Frontend
- [ ] Create New Order page (POS Interface)
  - Customer Selection section
    - Search existing customer
    - Add New Customer (collapsible full form)
    - Guest Checkout button
  - Product Addition section
    - Product search bar
    - Browse by Category quick picks
    - "+" Quick Create button (opens modal)
      - Name, Estimated Price, Category, Reference Photo
      - Creates product with is_additional=True
    - Cart display
      - Product name, quantity controls, price, line total
      - Item-level discount (% or fixed)
      - Remove item button
  - Order Summary section
    - Subtotal
    - Order-level discount (% or fixed)
    - Total Amount
  - Payment Processing section
    - Payment method selector (Cash/UPI)
    - UPI account selector (if UPI) with QR display
    - Amount Paid input
    - Add Payment button (for split payments)
    - Payment list with amounts
    - Change Due calculation (for cash overpayment)
  - Action Buttons
    - Hold Order (save as draft)
    - Complete Order & Generate Receipt
    - Clear Cart
    - Cancel Order
- [ ] Draft Orders list (access held orders)

## Dependencies
- Phase 5: Inventory Core (Product model)
- Phase 7: Customers Core (Customer model)
- Phase 3: Account & Authentication

## Technical Notes
- Guest Checkout uses a single permanent Customer record with id='guest-customer-uuid'
- Guest order details stored in Order record (guest_name, guest_phone, guest_email)
- Multiple payment methods per order supported
- Item discount and order discount both supported
- Quick create product sets is_additional=True

## Success Criteria
- [ ] Customer can be searched and selected
- [ ] Guest checkout works correctly
- [ ] Products can be added to cart
- [ ] Quick create product works
- [ ] Discounts apply correctly (item and order level)
- [ ] Multiple payment methods can be added
- [ ] Change due calculates correctly
- [ ] Order can be held as draft
- [ ] Order completes successfully
