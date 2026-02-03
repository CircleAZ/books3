# Phase 14: Settings & Configuration Application

## Overview
This phase implements the comprehensive settings and configuration module including store information, user/employee management, RBAC permissions, financial settings, operational settings, notifications, integrations, and data management.

## P4.md Coverage
- **Section 3.8**: App: `settings` (Lines 699-776)
  - Section 1: Store & Business Information
  - Section 2: Employee Management
  - Section 3: Financial Settings
  - Section 4: Operational Settings
  - Section 5: Notification Preferences
  - Section 6: Integrations
  - Section 7: Data Management
  - Section 8: System Information

## Objectives
1. Build Store & Business Information management
2. Implement Employee/User Management system
3. Build Role-Based Access Control (RBAC) system
4. Implement Tax Settings
5. Build Payment Methods configuration
6. Implement Receipt Customization
7. Build Return Reasons management
8. Implement Notification Preferences
9. Build Integration settings (Email, SMS, WhatsApp, Maps)
10. Implement Data Backup/Restore with Maintenance Mode
11. Create System Information page

## Deliverables
### Backend (Django)
- [ ] StoreSettings model (singleton)
  - Name, Address, Contact (Phone, Email, Website)
  - Business Registration Numbers
  - Logo (file upload)
  - Currency Symbol/Formatting
  - Timezone
- [ ] User/Employee model extensions
- [ ] Role model + API
- [ ] Permission model + API
- [ ] RolePermission mapping
- [ ] UserRole assignment
- [ ] Default roles (Admin, Manager, Cashier) with permissions
- [ ] TaxSettings model (enable/disable, rates)
- [ ] PaymentMethod model (Cash, UPI enable/disable)
- [ ] UPIAccount model
- [ ] ReceiptSettings model
- [ ] ReturnReason model + API
- [ ] NotificationPreference model
- [ ] IntegrationSettings models (SMTP, SMS, WhatsApp, Maps)
- [ ] Backup/Restore utilities
- [ ] Maintenance Mode flag

### Frontend
- [ ] Settings landing page with sections
- [ ] Store & Business Information section
  - Store Name, Address, Contact Details
  - Business Registration Numbers
  - Store Logo upload
  - Currency Settings
  - Timezone selector
- [ ] Employee Management section
  - Employee/User List
  - Add New User (Username, Email, Password, Role)
  - User ID auto-generation
  - Profile Picture upload
  - Edit User / Assign Roles
  - Soft Delete User (with restore option)
  - Deleted Users list
  - Deactivate/Activate User
  - Manage Roles & Permissions
    - Role list with permissions matrix
    - Create/Edit Role
    - Assign permissions to roles
    - Permission matrix display (as in P4.md)
- [ ] Financial Settings section
  - Tax Settings
    - Enable/Disable toggle
    - Define Tax Rates (Name, Percentage)
    - Tax Application Rules
  - Payment Methods
    - Enable/Disable Cash, UPI
    - UPI Settings (Add/Remove/Enable/Disable UPI IDs)
- [ ] Operational Settings section
  - Receipt Customization
    - Header/Footer text
    - Show/Hide information toggles
    - Template selection (if multiple)
  - Return Reasons management (Add, Edit, Delete)
- [ ] Notification Preferences section
  - Low Stock Alerts (toggle, recipients)
  - New Orders (toggle, recipients)
  - Daily Sales Summary (toggle, recipients)
- [ ] Integrations section
  - Email Gateway Settings (SMTP configuration)
  - SMS Gateway Settings (API key, Sender ID)
  - WhatsApp API Settings
  - Map Service API Key
- [ ] Data Management section
  - Backup Data button (manual trigger)
  - Restore Data (with Maintenance Mode requirement)
  - Maintenance Mode toggle (logs out users, disables APIs)
- [ ] System Information section
  - Application Version
  - About Page
  - Check for Updates button

## Dependencies
- Phase 3: Account (user base model)
- Phase 1: Project Foundation (base settings)

## Technical Notes
- RBAC: Define Roles, assign Permissions to Roles, assign Roles to Users
- Default roles as per P4.md permission matrix
- Maintenance Mode must be active for restore operation
- Tax settings affect order calculations
- UPI Settings affect payment processing in POS
- Receipt settings affect receipt generation

## Success Criteria
- [ ] Store information can be updated
- [ ] Users can be created with roles
- [ ] RBAC enforces permissions correctly
- [ ] Tax settings enable/disable taxation
- [ ] Payment methods can be configured
- [ ] Receipt customization works
- [ ] Notifications can be configured
- [ ] Integration settings can be saved
- [ ] Backup creates downloadable file
- [ ] Restore only works in Maintenance Mode
- [ ] System info displays correctly
