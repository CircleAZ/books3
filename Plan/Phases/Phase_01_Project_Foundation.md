# Phase 1: Project Foundation & Core Infrastructure

## Overview
This phase establishes the foundational architecture, development environment, and core technical specifications for the entire AZ Books project.

## P4.md Coverage
- **Section 1**: Core Technical Specifications (Lines 6-51)
  - Section 1.1: ID Generation & Database
  - Section 1.2: Offline Support (PWA)
  - Section 1.3: Map Integration
  - Section 1.4: Technology Stack

## Objectives
1. Set up Django project structure with all app modules
2. Configure PostgreSQL database
3. Implement UUID-based primary key system
4. Set up display ID auto-increment logic with offline handling
5. Configure basic PWA infrastructure (Service Worker, manifest)
6. Set up IndexedDB for offline data storage
7. Integrate Leaflet.js and OpenStreetMap for maps
8. Configure Nominatim geocoding
9. Set up Django REST Framework (DRF) for API

## Deliverables
- [ ] Django project with app structure:
  - `account`
  - `dashboard`
  - `inventory`
  - `customers`
  - `orders`
  - `reports`
  - `finance`
  - `settings`
- [ ] Base models with UUID primary keys
- [ ] Display ID generation utilities
- [ ] PWA manifest.json and service-worker.js
- [ ] IndexedDB wrapper utilities
- [ ] Map component with geocoding integration
- [ ] PostgreSQL database configuration
- [ ] DRF configuration with JWT authentication

## Dependencies
- None (First phase)

## Technical Notes
- All tables use UUID v4 as primary key (`id`)
- Display IDs are auto-incrementing integers scoped to store/tenant
- Offline provisional IDs follow format: `TEMP-UUID-{n}`
- Last Write Wins conflict resolution strategy
- Store only lat, lng, and display address from geocoding API

## Success Criteria
- [ ] All Django apps created and registered
- [ ] Database migrations run successfully
- [ ] Basic PWA installable on mobile device
- [ ] Map component renders with geocoding working
- [ ] API endpoints respond with proper authentication
