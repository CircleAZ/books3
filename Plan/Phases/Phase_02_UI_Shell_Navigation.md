# Phase 2: UI Shell & Navigation Structure

## Overview
This phase builds the complete UI shell including the persistent header, bottom navigation bar, main navigation drawer, and user profile dropdown. This creates the navigation backbone for all subsequent feature development.

## P4.md Coverage
- **Section 2**: User Interface Structure (Lines 54-125)
  - Section 2.1: Persistent Top Bar (Header)
  - Section 2.2: Bottom Navigation Bar
  - Section 2.3: Main Navigation Drawer (Sidebar)
  - Section 2.4: User Profile Dropdown

## Objectives
1. Build persistent top bar with hamburger menu, page title, search, notifications, and profile
2. Implement global Omni-Search (Ctrl+K) functionality
3. Create bottom navigation bar with 5 main sections
4. Build collapsible navigation drawer with all menu items
5. Implement user profile dropdown menu
6. Set up responsive layout system
7. Create notification badge system

## Deliverables
- [ ] `TopBar` component
  - Hamburger icon (opens drawer)
  - Dynamic page title
  - Global search icon (Ctrl+K trigger)
  - Notification icon with badge
  - User profile avatar
- [ ] `BottomNavBar` component
  - Dashboard, Inventory, New Order, Customers, Orders icons
  - Active state highlighting
- [ ] `NavigationDrawer` component
  - App logo/name
  - Collapsible menu sections
  - All navigation links as per P4.md 2.3
- [ ] `UserProfileDropdown` component
  - User name & email display
  - My Profile, Settings, Notifications, Logout links
  - Logout confirmation prompt
- [ ] `OmniSearch` modal component
  - Search Products, Customers, Orders, Menu Actions
- [ ] Responsive layout wrapper

## Dependencies
- Phase 1: Project Foundation (base project structure)

## Technical Notes
- Use React or Vue SPA as per tech stack decision
- Bottom nav should be hidden on certain full-screen interfaces
- Omni-Search should support keyboard navigation
- Drawer should be closeable on mobile with swipe gestures

## Success Criteria
- [ ] Navigation between all placeholder pages works
- [ ] Omni-Search opens with Ctrl+K
- [ ] Drawer opens/closes smoothly
- [ ] Bottom nav highlights active section
- [ ] Profile dropdown shows/hides correctly
- [ ] Responsive on mobile and desktop
