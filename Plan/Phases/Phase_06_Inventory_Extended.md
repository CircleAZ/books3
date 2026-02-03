# Phase 6: Inventory Management - Extended Features

## Overview
This phase completes the inventory module with category management, vendor management, stock adjustments, and inventory reports.

## P4.md Coverage
- **Section 3.3**: App: `inventory` (Lines 160-239) - Extended Features
  - Section 6: Manage Categories
  - Section 7: Manage Vendors
  - Section 8: Stock Adjustments
  - Section 9: Inventory Reports (link to reports app)

## Objectives
1. Build category management system
2. Build vendor management system
3. Implement stock adjustment functionality
4. Create products-to-order views (negative and low stock)
5. Build stock adjustment logging

## Deliverables
### Backend (Django)
- [ ] Category model
  - Name, product count
- [ ] Category API endpoints (CRUD)
- [ ] Vendor model
  - Name, Contact Person, Email, Phone, Address, Notes
  - Product count
- [ ] Vendor API endpoints (CRUD)
- [ ] Stock Adjustment model
  - Product (FK), Adjustment Type, Quantity, Reason, Date
- [ ] Stock Adjustment API endpoints
- [ ] Products-to-order aggregation endpoints

### Frontend
- [ ] Manage Categories page
  - Category list (Name, Product Count)
  - Add New Category popup
  - Sort by: Alphabetical, Creation Date, Product Count
  - Edit category popup
  - Delete category (with reassign/uncategorized option)
- [ ] Manage Vendors page
  - Vendor list (Name, Contact, Email, Phone, Products Count)
  - Add New Vendor popup
  - Sort by: Alphabetical, Creation Date
  - Edit vendor popup
  - Delete vendor (products vendor field cleared)
- [ ] Stock Adjustments page
  - Products to order section
    - Negative stock products list
    - Low stock products list
    - Columns: Name, Category, Vendor, Amount to order, Threshold
  - Manual stock adjustment form
    - Product search/select
    - Adjustment Type (Increase/Decrease)
    - Quantity, Reason, Date
  - Stock adjustment log

## Dependencies
- Phase 5: Inventory Core (Product model, APIs)
- Phase 1: Project Foundation

## Technical Notes
- Category deletion requires handling of products (reassign or uncategorized)
- Vendor deletion clears vendor field on associated products
- Stock adjustments update stock history log
- Low stock = stock <= threshold

## Success Criteria
- [ ] Categories can be added, edited, deleted
- [ ] Vendors can be managed with full CRUD
- [ ] Products-to-order lists show correct data
- [ ] Stock adjustments update inventory correctly
- [ ] Adjustment log shows all changes
- [ ] Category/Vendor popups work from product form
