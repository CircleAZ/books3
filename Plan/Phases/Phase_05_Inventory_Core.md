# Phase 5: Inventory Management - Core Features

## Overview
This phase implements the core inventory management functionality including product listing, CRUD operations, and the product database model with AVCO costing.

## P4.md Coverage
- **Section 3.3**: App: `inventory` (Lines 160-239) - Core Features
  - Section 1: Product Listing & Search
  - Section 2: Add New Product
  - Section 3: View Product Details
  - Section 4: Edit Product
  - Section 5: Manage Deleted Products

## Objectives
1. Build Product database model with all fields
2. Implement AVCO (Weighted Average Cost) costing logic
3. Create product listing with search and filters
4. Build Add New Product form with all fields
5. Implement product detail view with stock history
6. Create edit product functionality
7. Implement soft delete and restore system
8. Build permanent delete with confirmation

## Deliverables
### Backend (Django)
- [ ] Product model
  - UUID primary key, display ID
  - Name, Description, Category (FK), Vendor (FK)
  - Is Additional flag
  - Cost Price, Selling Price (tax exclusive)
  - Stock Quantity (with negative allowed)
  - Low Stock Threshold
  - Images (multiple, with primary flag)
  - Tags (M2M)
  - Soft delete fields (is_deleted, deleted_at)
- [ ] Product API endpoints (CRUD)
- [ ] Stock history model
- [ ] AVCO calculation utility
- [ ] Negative stock handling logic

### Frontend
- [ ] Product List page
  - Search bar (name, ID, category, vendor)
  - Table with columns: Image, ID, Name, Category, Vendor, Cost, Selling, Stock, Threshold
  - Sortable columns
  - Bulk actions (Delete, Change Category/Vendor, Activate/Deactivate)
  - Pagination
- [ ] Add New Product page
  - All form fields per P4.md 3.3.2
  - Add Category popup integration
  - Add Vendor popup integration
  - Add Tag popup integration
  - Multiple image upload
  - Save/Save & Add Another/Cancel buttons
- [ ] View Product Details page
  - All details display
  - Image gallery
  - Stock history log
  - Action buttons (Edit, Delete, Restore, Adjust Stock)
- [ ] Edit Product page
- [ ] Deleted Products list with restore/permanent delete

## Dependencies
- Phase 1: Project Foundation (models, DB)
- Phase 2: UI Shell (navigation integration)
- Phase 3: Account & Authentication (permissions)

## Technical Notes
- AVCO: New Cost = (Current Stock × Current Average Cost + New Stock × Purchase Cost) / (Current Stock + New Stock)
- Negative stock uses "Last Known Cost" for COGS
- Inventory adjustments for cost differences recorded in current period
- Images stored in media directory with thumbnails

## Success Criteria
- [ ] Products can be created with all fields
- [ ] Product list loads with search and filters
- [ ] Products can be viewed, edited, deleted
- [ ] Soft-deleted products can be restored
- [ ] Stock history tracks all changes
- [ ] AVCO calculations are correct
