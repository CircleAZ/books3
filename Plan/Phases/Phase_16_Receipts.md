# Phase 16: Receipts & Public Receipt View

## Overview
Implements the receipt system including public web receipt view, masked details, and PDF download with phone verification.

## P4.md Coverage
- **Section 5**: Receipt & Message Formats (Lines 820-843)
  - 5.1: Public Receipt View (Web)
  - 5.2: Message Format (SMS/WhatsApp)

## Objectives
1. Build public receipt web view at `/r/{uuid}`
2. Implement masked customer details for privacy
3. Build PDF receipt generation with phone verification
4. Create message templates (English & Gujarati)
5. Integrate receipt sending with order completion

## Deliverables
### Backend
- [ ] Receipt model (Order FK, UUID for public access, PDF file)
- [ ] Public Receipt API endpoint (no auth required)
- [ ] PDF generation utility with store branding
- [ ] Phone verification for PDF download
- [ ] Receipt sending integration (Email auto-send, SMS/WhatsApp queue)

### Frontend
- [ ] Public Receipt View page (`/r/{uuid}`)
  - Store Logo & Header
  - Masked customer details (Jai*** / 12******)
  - Item list (Qty, Price)
  - Totals, Taxes, Discounts
  - "Download PDF" button with phone verification modal
- [ ] Receipt Customization (header/footer in Settings)

### Message Templates
- [ ] English templates (3 variations)
- [ ] Gujarati templates (3 variations)
- [ ] Spintax integration

## Dependencies
- Phase 9-11: Orders
- Phase 14: Settings (receipt customization)
- Phase 15: Messaging System

## Success Criteria
- [ ] Public receipt accessible without login
- [ ] Customer details properly masked
- [ ] PDF downloads after phone verification
- [ ] Receipts auto-send on order completion
