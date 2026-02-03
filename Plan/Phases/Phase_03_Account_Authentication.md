# Phase 3: Account & Authentication System

## Overview
This phase implements the complete user account system including authentication, profile management, and activity logging.

## P4.md Coverage
- **Section 3.1**: App: `account` (My profile/User Profile) (Lines 130-138)
  - User Details
  - Change Password
  - Profile Picture
  - Role display
  - Activity Log
  - Login/Logout

## Objectives
1. Implement JWT-based authentication system
2. Build login page with username, password, and "Remember Me"
3. Create logout functionality with confirmation prompt
4. Build user profile page with all details
5. Implement password change functionality
6. Create profile picture upload system
7. Build activity log display
8. Set up role-based access foundation

## Deliverables
### Backend (Django)
- [ ] User model extension with additional fields
- [ ] JWT authentication endpoints
- [ ] Profile API endpoints (GET, PUT)
- [ ] Password change endpoint
- [ ] Profile picture upload endpoint
- [ ] Activity log model and endpoints

### Frontend
- [ ] Login page
  - Username field
  - Password field
  - Remember Me checkbox
  - Login button
  - Error handling
- [ ] User Profile page
  - Name, ID, Email, Phone display
  - Edit functionality
  - Profile picture display/upload
  - Role display (read-only)
  - Activity log (last actions)
- [ ] Change Password dialog/page
- [ ] Logout confirmation modal
- [ ] Session management

## Dependencies
- Phase 1: Project Foundation (JWT setup in DRF)
- Phase 2: UI Shell (Profile dropdown integration)

## Technical Notes
- Use DRF's Token/JWT authentication
- Activity log should track key user actions
- Profile pictures stored in media directory
- "Remember Me" extends token expiration

## Success Criteria
- [ ] Users can log in with valid credentials
- [ ] Invalid credentials show proper error
- [ ] Profile displays correctly after login
- [ ] Password can be changed
- [ ] Profile picture uploads work
- [ ] Activity log shows recent actions
- [ ] Logout clears session properly
