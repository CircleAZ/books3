# Phase 7: Customer Management - Core Features

## Overview
This phase implements the core customer management functionality including customer listing, creation, viewing, editing, and the complex address/location system with map integration.

## P4.md Coverage
- **Section 3.4**: App: `customers` (Lines 241-330) - Core Features
  - Section 1: Customer Listing & Search
  - Section 2: Add New Customer
  - Section 3: View Customer Details
  - Section 4: Edit Customer

## Objectives
1. Build Customer database model with all fields
2. Implement customer listing with search and filters
3. Create Add New Customer form with all sections
4. Build address section with map integration (Leaflet/OSM)
5. Implement customer linking system (bidirectional)
6. Build customer detail view with purchase history
7. Implement Wallet/Store Credit system
8. Create edit customer functionality

## Deliverables
### Backend (Django)
- [ ] Customer model
  - UUID primary key, display ID
  - First/Middle/Last Name
  - Phone (required), Email
  - School/College (FK), Class (FK), Division (FK), Subdivision (FK)
  - Customer Group (FK)
  - Notes
  - Created date (Customer Since)
- [ ] Address model (linked to Customer)
  - Village, Faliya
  - Address text, Landmark/Hint
  - Location Tags (M2M)
  - Latitude, Longitude, Pincode
- [ ] CustomerLink model (bidirectional)
  - Customer A (FK), Customer B (FK)
  - Link Type (FK to LinkType)
- [ ] Wallet/Store Credit model
  - Customer (FK), Balance
  - Transaction history (Credits/Debits)
- [ ] Customer API endpoints (CRUD)
- [ ] Address API endpoints
- [ ] Customer Link API endpoints
- [ ] Wallet API endpoints

### Frontend
- [ ] Customer List page
  - Search bar (Name, Phone, Email, ID)
  - Table with columns: ID, Name, Phone, Email, School, Class, Location Tags, Total Spent, Last Order Date
  - Sortable columns
  - Clickable customer name (to details)
  - Phone/Email as tel:/mailto: links
  - Pagination
- [ ] Add New Customer page
  - Customer Details section (collapsible)
    - Name fields, Phone, Email
    - School/College select with add new popup
    - Class, Division, Subdivision (cascading selects)
    - Customer Group select with add new popup
    - Notes
  - Address section
    - Village, Faliya fields
    - Address text, Landmark/Hint
    - Location Tags select/add
    - Map component for location selection
    - Pincode (auto from map)
  - Links section
    - Add Link button
    - Link Type dropdown
    - Customer search/select
    - Display of added links with edit/delete
  - Save/Save & Add Another/Cancel buttons
- [ ] View Customer Details page
  - Basic Details section (Name, School, Class, Division, Subdivision, Group, Notes, Customer Since)
  - Edit Customer button
  - Addresses section (address, pincode, tag, map button, edit/delete)
  - Links section (name, type, edit/delete, add link)
  - Purchase History section (table with Order ID, Date, Total, Payment Status, Order Status, Export)
  - Wallet/Store Credit section (balance, history)
- [ ] Edit Customer page

## Dependencies
- Phase 1: Project Foundation (maps setup)
- Phase 2: UI Shell (navigation)
- Phase 3: Account & Authentication (permissions)

## Technical Notes
- Customer links are bidirectional (if A links to B, B shows A)
- Map integration uses Leaflet.js + OSM from Phase 1
- Store only lat, lng, display address (not full geocoding response)
- Wallet balance updated by overpayments, returns, and usage

## Success Criteria
- [ ] Customers can be created with all fields
- [ ] Address with map selection works
- [ ] Customer links work bidirectionally
- [ ] Customer list search and filters work
- [ ] Customer details show all sections
- [ ] Wallet displays balance and history
- [ ] Phone/Email links open respective apps
