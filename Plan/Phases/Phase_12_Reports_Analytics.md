# Phase 12: Reporting & Analytics

## Overview
This phase implements the centralized reporting and analytics module including sales reports, inventory reports, customer reports, user activity logs, and the data export center.

## P4.md Coverage
- **Section 3.6**: App: `reports` (Lines 463-524)
  - Section 1: Sales Reports
  - Section 2: Inventory Reports
  - Section 3: Customer Reports
  - Section 4: User Activity Log
  - Section 5: Data Export Center

## Objectives
1. Build Sales Reports with all sub-reports
2. Build Inventory Reports with all sub-reports
3. Build Customer Reports including CLV and RFM analysis
4. Implement Customer Location Reports with map visualization
5. Build User Activity Log
6. Create Data Export Center
7. Implement CSV/Excel export functionality

## Deliverables
### Backend (Django)
- [ ] Sales Reports APIs
  - Sales Summary (total sales, orders, AOV)
  - Top Selling Products (by qty/value)
  - Sales by Customer
  - Sales Trends data
- [ ] Inventory Reports APIs
  - Current Stock Valuation
  - Stock Movement Report
  - Aging Stock Report
  - Low Stock/Out of Stock Reports
  - Inventory Turnover Rate
  - Dead Stock Analysis
- [ ] Customer Reports APIs
  - Customer Summary (active, new, repeat, avg spend)
  - Top Customers (by value, by volume)
  - New Customer Acquisition trends
  - Customer Lifetime Value calculation
  - RFM Segmentation calculation
  - Customers by Location
- [ ] Activity Log model + API
  - User (FK), Action Type, Description, Timestamp
- [ ] Export utilities (CSV, Excel)

### Frontend
- [ ] Reports landing page with sections
- [ ] Sales Reports section
  - Sales Summary with date filters (Today, Week, Month, Custom)
  - Group by Payment Method
  - Top Selling Products chart/table with date filter
  - Sales by Customer table with date filter
  - Sales Trends line chart
  - Export buttons (CSV/Excel)
- [ ] Inventory Reports section
  - Stock Valuation report (by cost and selling price)
  - Stock Movement report (inflows, outflows, adjustments)
  - Aging Stock report (products not sold in X days)
  - Low Stock report
  - Out of Stock report
  - Inventory Turnover Rate display
  - Dead Stock Analysis
  - Export buttons
- [ ] Customer Reports section
  - Customer Summary with date filters
  - Group by Customer Tag
  - Top Customers tables (by value, by volume)
  - New Customer Acquisition chart
  - Customer Lifetime Value list
  - RFM Segmentation view with segment descriptions
  - Customer Location Reports
    - Table by Location Tag/Pincode/Village/Faliya
    - Customer Location Map (Leaflet.js)
      - Pins for customer locations
      - Name/info on hover/click
      - Filter by tag/pincode/village
  - Export buttons
- [ ] User Activity Log page
  - Table: User, Action, Description, Timestamp
  - Filters: User, Date, Action Type
- [ ] Data Export Center page
  - Export Products (CSV/Excel)
  - Export Customers (CSV/Excel)
  - Export Orders (CSV/Excel)
  - Optional: Scheduled exports (advanced)

## Dependencies
- Phase 5-6: Inventory (product data)
- Phase 7-8: Customers (customer data)
- Phase 9-11: Orders (order data)
- Phase 3: Account (user activity tracking)

## Technical Notes
- RFM Analysis: Recency, Frequency, Monetary value scoring
- CLV = Average Order Value × Purchase Frequency × Customer Lifespan
- Dead Stock = Items with 0 sales in extended period
- Map integration reuses Leaflet.js from Phase 1
- Activity tracking should be implemented via signals/middleware

## Success Criteria
- [ ] All sales reports generate with correct data
- [ ] All inventory reports generate with correct data
- [ ] All customer reports generate correctly
- [ ] RFM segmentation shows correct segments
- [ ] Customer location map works with filters
- [ ] User activity log tracks key actions
- [ ] CSV/Excel exports work for all reports
- [ ] Date filters work across all reports
