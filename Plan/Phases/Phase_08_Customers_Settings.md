# Phase 8: Customer Settings & Configuration

## Overview
This phase implements the customer-specific settings including management of schools, classes, divisions, subdivisions, customer groups, location tags, and link types.

## P4.md Coverage
- **Section 3.4**: App: `customers` (Lines 315-330) - Settings
  - Section 5: Customer Settings
    - 5.1: Manage Customer Groups
    - 5.2: Manage Schools/Colleges
    - 5.3: Manage Classes
    - 5.4: Manage Divisions
    - 5.5: Manage Subdivisions
    - 5.6: Manage Location Tags
    - 5.7: Manage Link Types
  - Section 6: Customer Reports (link to reports app)

## Objectives
1. Build CustomerGroup CRUD with API
2. Build School/College CRUD with class linking
3. Build Class CRUD with division linking
4. Build Division CRUD with subdivision linking
5. Build Subdivision CRUD
6. Build Location Tags with merge functionality
7. Build Link Types management

## Deliverables
### Backend (Django)
- [ ] CustomerGroup model + API
- [ ] School model + API
  - Name, linked Classes (M2M or reverse FK)
- [ ] Class model + API
  - Name, linked Schools (M2M), linked Divisions
- [ ] Division model + API
  - Name, linked Classes (M2M), linked Subdivisions
- [ ] Subdivision model + API
  - Name, linked Divisions (M2M)
- [ ] LocationTag model + API
  - Name, merge functionality
- [ ] LinkType model + API
  - Name (e.g., Nearby, Relative, Classmate)

### Frontend
- [ ] Customer Settings page layout
- [ ] Manage Customer Groups section
  - List, Add, Edit, Delete
- [ ] Manage Schools/Colleges section
  - List with class count
  - Add/Edit/Delete
  - Link/Unlink Classes
- [ ] Manage Classes section
  - List with division count
  - Add/Edit/Delete
  - Link/Unlink Divisions
- [ ] Manage Divisions section
  - List with subdivision count
  - Add/Edit/Delete
  - Link/Unlink Subdivisions
- [ ] Manage Subdivisions section
  - List
  - Add/Edit/Delete
- [ ] Manage Location Tags section
  - List
  - Add/Edit/Delete
  - Merge Tags functionality
- [ ] Manage Link Types section
  - List
  - Add/Edit/Delete

## Dependencies
- Phase 7: Customers Core (Customer model, integrations)
- Phase 1: Project Foundation

## Technical Notes
- School → Class → Division → Subdivision is a hierarchical structure
- Classes can belong to multiple schools
- Location tag merge combines all usages into target tag
- These settings affect the customer form cascading dropdowns

## Success Criteria
- [ ] All entity types can be CRUD managed
- [ ] School-Class linking works
- [ ] Class-Division linking works
- [ ] Division-Subdivision linking works
- [ ] Location tags can be merged
- [ ] Link types appear in customer links dropdown
- [ ] Cascading dropdowns use these settings
