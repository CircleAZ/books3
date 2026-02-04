# 🌐 Comprehensive Browser Test Suite

This document contains automated and manual browser testing scenarios for the AZ Books application.

## Prerequisites

```bash
# Install Playwright (recommended for automated tests)
pip install playwright
playwright install chromium

# Or use Selenium
pip install selenium webdriver-manager
```

---

## 1. Authentication & Session Browser Tests

### BTEST-001: Login Flow Complete
```python
"""
Automated test: Complete login flow
"""
from playwright.sync_api import sync_playwright, expect

def test_login_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        
        # Navigate to login
        page.goto("http://localhost:8000/login/")
        
        # Fill credentials
        page.fill('input[name="username"]', 'testuser')
        page.fill('input[name="password"]', 'testpass123')
        
        # Submit
        page.click('button[type="submit"]')
        
        # Verify redirect to dashboard
        expect(page).to_have_url("http://localhost:8000/dashboard/")
        
        # Verify user info displayed
        expect(page.locator('.user-name')).to_contain_text('testuser')
        
        browser.close()
```

### BTEST-002: Session Persistence After Refresh
```python
def test_session_persistence():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        # Login
        page.goto("http://localhost:8000/login/")
        page.fill('input[name="username"]', 'testuser')
        page.fill('input[name="password"]', 'testpass123')
        page.click('button[type="submit"]')
        page.wait_for_url("**/dashboard/")
        
        # Refresh page
        page.reload()
        
        # Should still be logged in
        expect(page).to_have_url("http://localhost:8000/dashboard/")
        expect(page.locator('.user-name')).to_be_visible()
        
        browser.close()
```

### BTEST-003: Logout Clears Session
```python
def test_logout_clears_session():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        # Login first
        page.goto("http://localhost:8000/login/")
        page.fill('input[name="username"]', 'testuser')
        page.fill('input[name="password"]', 'testpass123')
        page.click('button[type="submit"]')
        page.wait_for_url("**/dashboard/")
        
        # Logout
        page.click('.user-menu')
        page.click('text=Logout')
        
        # Confirm logout
        page.click('button:has-text("Confirm")')
        
        # Should redirect to login
        expect(page).to_have_url("http://localhost:8000/login/")
        
        # Try to access protected page
        page.goto("http://localhost:8000/dashboard/")
        
        # Should redirect back to login
        expect(page).to_have_url("http://localhost:8000/login/")
        
        browser.close()
```

### BTEST-004: Multiple Tabs Session Sync
```python
def test_multiple_tabs_session():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        
        # Open Tab 1, login
        page1 = context.new_page()
        page1.goto("http://localhost:8000/login/")
        page1.fill('input[name="username"]', 'testuser')
        page1.fill('input[name="password"]', 'testpass123')
        page1.click('button[type="submit"]')
        
        # Open Tab 2
        page2 = context.new_page()
        page2.goto("http://localhost:8000/dashboard/")
        
        # Tab 2 should be logged in (shared session)
        expect(page2.locator('.user-name')).to_contain_text('testuser')
        
        # Logout from Tab 1
        page1.click('.user-menu')
        page1.click('text=Logout')
        page1.click('button:has-text("Confirm")')
        
        # Tab 2 should detect logout on next action
        page2.reload()
        expect(page2).to_have_url("http://localhost:8000/login/")
        
        browser.close()
```

---

## 2. POS/Order Creation Browser Tests

### BTEST-005: Complete Order Creation Flow
```python
def test_complete_order_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=100)
        page = browser.new_page()
        
        # Login
        login(page)
        
        # Navigate to New Order
        page.click('text=New Order')
        expect(page).to_have_url("**/orders/new/")
        
        # Search and select customer
        page.fill('#customer-search', 'John Doe')
        page.click('.customer-result:first-child')
        
        # Add products
        page.fill('#product-search', 'Harry Potter')
        page.click('.product-result:first-child')
        
        # Verify item in cart
        expect(page.locator('.cart-item')).to_be_visible()
        
        # Adjust quantity
        page.fill('.cart-item input[name="quantity"]', '3')
        
        # Apply discount
        page.click('#add-discount')
        page.fill('#discount-amount', '10')
        page.select_option('#discount-type', 'percentage')
        
        # Proceed to payment
        page.click('#proceed-to-payment')
        
        # Select payment method
        page.click('text=Cash')
        page.fill('#amount-paid', '1000')
        
        # Complete order
        page.click('#complete-order')
        
        # Verify success
        expect(page.locator('.order-success')).to_be_visible()
        expect(page.locator('.order-id')).to_contain_text('ORD-')
        
        browser.close()
```

### BTEST-006: Cart Persistence During Navigation
```python
def test_cart_persistence():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        page.goto("http://localhost:8000/orders/new/")
        
        # Add item to cart
        page.fill('#product-search', 'Product 1')
        page.click('.product-result:first-child')
        
        # Navigate away
        page.goto("http://localhost:8000/customers/")
        
        # Navigate back
        page.goto("http://localhost:8000/orders/new/")
        
        # Cart should still have item
        expect(page.locator('.cart-item')).to_be_visible()
        
        browser.close()
```

### BTEST-007: Double Click Prevention on Order Submit
```python
def test_double_click_prevention():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        create_order_to_payment_step(page)
        
        # Attempt double click
        submit_button = page.locator('#complete-order')
        submit_button.dblclick()
        
        # Wait for response
        page.wait_for_load_state('networkidle')
        
        # Should only see ONE order created message
        success_messages = page.locator('.order-success')
        expect(success_messages).to_have_count(1)
        
        browser.close()
```

---

## 3. Inventory Browser Tests

### BTEST-008: Product CRUD Operations
```python
def test_product_crud():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login_as_admin(page)
        
        # CREATE
        page.goto("http://localhost:8000/inventory/products/new/")
        page.fill('#product-name', 'Test Product 123')
        page.fill('#selling-price', '99.99')
        page.select_option('#category', 'Books')
        page.click('#save-product')
        
        expect(page.locator('.success-message')).to_be_visible()
        
        # READ
        page.goto("http://localhost:8000/inventory/products/")
        page.fill('#search', 'Test Product 123')
        expect(page.locator('.product-row')).to_be_visible()
        
        # UPDATE
        page.click('.product-row:has-text("Test Product 123") .edit-btn')
        page.fill('#selling-price', '149.99')
        page.click('#save-product')
        expect(page.locator('.success-message')).to_be_visible()
        
        # DELETE
        page.click('.product-row:has-text("Test Product 123") .delete-btn')
        page.click('#confirm-delete')
        expect(page.locator('.success-message')).to_be_visible()
        
        browser.close()
```

### BTEST-009: Stock Adjustment with Validation
```python
def test_stock_adjustment():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login_as_admin(page)
        page.goto("http://localhost:8000/inventory/adjustments/")
        
        # Select product
        page.fill('#product-search', 'Harry Potter')
        page.click('.product-result:first-child')
        
        # Try adjustment without reason (should fail)
        page.fill('#adjustment-quantity', '-5')
        page.click('#submit-adjustment')
        expect(page.locator('.error-message')).to_contain_text('Reason required')
        
        # Add reason
        page.fill('#adjustment-reason', 'Damaged stock')
        page.click('#submit-adjustment')
        expect(page.locator('.success-message')).to_be_visible()
        
        browser.close()
```

---

## 4. Customer Management Browser Tests

### BTEST-010: Customer Creation with Map
```python
def test_customer_with_map():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        
        login(page)
        page.goto("http://localhost:8000/customers/new/")
        
        # Fill basic details
        page.fill('#first-name', 'Test')
        page.fill('#last-name', 'Customer')
        page.fill('#phone', '9876543210')
        
        # Wait for map to load
        page.wait_for_selector('#map.leaflet-container')
        
        # Click on map to set location
        map_element = page.locator('#map')
        map_element.click(position={"x": 200, "y": 150})
        
        # Verify coordinates populated
        expect(page.locator('#latitude')).not_to_have_value('')
        expect(page.locator('#longitude')).not_to_have_value('')
        
        # Save
        page.click('#save-customer')
        expect(page.locator('.success-message')).to_be_visible()
        
        browser.close()
```

### BTEST-011: Customer Link Creation
```python
def test_customer_linking():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        
        # Open customer A
        page.goto("http://localhost:8000/customers/1/")
        
        # Add link
        page.click('#add-link')
        page.fill('#link-customer-search', 'Customer B')
        page.click('.customer-result:first-child')
        page.select_option('#link-type', 'Relative')
        page.click('#save-link')
        
        expect(page.locator('.linked-customers')).to_contain_text('Customer B')
        
        # Verify reverse link on Customer B
        page.goto("http://localhost:8000/customers/2/")
        expect(page.locator('.linked-customers')).to_contain_text('Customer A')
        
        browser.close()
```

---

## 5. Responsive Design Tests

### BTEST-012: Mobile Viewport Tests
```python
def test_mobile_viewport():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        # Test on iPhone 12 viewport
        page = browser.new_page(
            viewport={"width": 390, "height": 844},
            device_scale_factor=3,
            is_mobile=True
        )
        
        login(page)
        
        # Desktop sidebar should be hidden
        expect(page.locator('.desktop-sidebar')).not_to_be_visible()
        
        # Mobile hamburger should be visible
        expect(page.locator('.mobile-menu-toggle')).to_be_visible()
        
        # Open mobile menu
        page.click('.mobile-menu-toggle')
        expect(page.locator('.mobile-sidebar')).to_be_visible()
        
        # Bottom nav should be visible
        expect(page.locator('.bottom-nav')).to_be_visible()
        
        browser.close()
```

### BTEST-013: Tablet Viewport Tests
```python
def test_tablet_viewport():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        # Test on iPad viewport
        page = browser.new_page(
            viewport={"width": 768, "height": 1024}
        )
        
        login(page)
        page.goto("http://localhost:8000/orders/new/")
        
        # POS layout should be side-by-side
        cart = page.locator('.cart-section')
        products = page.locator('.products-section')
        
        cart_box = cart.bounding_box()
        products_box = products.bounding_box()
        
        # Cart and products should be side by side (same Y)
        assert abs(cart_box['y'] - products_box['y']) < 10
        
        browser.close()
```

---

## 6. Error Handling Browser Tests

### BTEST-014: Network Error Handling
```python
def test_network_error_handling():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        
        # Simulate offline
        page.context.set_offline(True)
        
        # Try to load products
        page.goto("http://localhost:8000/inventory/products/")
        
        # Should show offline message or cached data
        offline_indicator = page.locator('.offline-indicator')
        expect(offline_indicator).to_be_visible()
        
        # Go back online
        page.context.set_offline(False)
        page.reload()
        
        # Should load normally
        expect(page.locator('.product-list')).to_be_visible()
        expect(offline_indicator).not_to_be_visible()
        
        browser.close()
```

### BTEST-015: Form Validation Errors
```python
def test_form_validation():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        page.goto("http://localhost:8000/inventory/products/new/")
        
        # Submit empty form
        page.click('#save-product')
        
        # Check for validation errors
        expect(page.locator('#product-name-error')).to_be_visible()
        expect(page.locator('#product-name-error')).to_contain_text('required')
        
        # Fill required field
        page.fill('#product-name', 'Test')
        
        # Error should clear
        expect(page.locator('#product-name-error')).not_to_be_visible()
        
        browser.close()
```

---

## 7. Performance Tests

### BTEST-016: Page Load Performance
```python
def test_page_load_performance():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        
        # Measure dashboard load time
        start = time.time()
        page.goto("http://localhost:8000/dashboard/")
        page.wait_for_load_state('networkidle')
        dashboard_time = time.time() - start
        
        assert dashboard_time < 3, f"Dashboard took {dashboard_time}s"
        
        # Measure products page load
        start = time.time()
        page.goto("http://localhost:8000/inventory/products/")
        page.wait_for_load_state('networkidle')
        products_time = time.time() - start
        
        assert products_time < 5, f"Products took {products_time}s"
        
        browser.close()
```

### BTEST-017: Large Data Set Performance
```python
def test_large_list_performance():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        
        # Load page with many products
        page.goto("http://localhost:8000/inventory/products/?limit=1000")
        
        start = time.time()
        page.wait_for_selector('.product-row')
        render_time = time.time() - start
        
        assert render_time < 5, f"Rendering 1000 products took {render_time}s"
        
        # Scroll performance
        start = time.time()
        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        scroll_time = time.time() - start
        
        assert scroll_time < 1, f"Scrolling took {scroll_time}s"
        
        browser.close()
```

---

## 8. Accessibility Tests

### BTEST-018: Keyboard Navigation
```python
def test_keyboard_navigation():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        page.goto("http://localhost:8000/login/")
        
        # Tab to username
        page.keyboard.press('Tab')
        focused = page.locator(':focus')
        expect(focused).to_have_attribute('name', 'username')
        
        # Tab to password
        page.keyboard.press('Tab')
        focused = page.locator(':focus')
        expect(focused).to_have_attribute('name', 'password')
        
        # Tab to submit
        page.keyboard.press('Tab')
        focused = page.locator(':focus')
        expect(focused).to_have_attribute('type', 'submit')
        
        browser.close()
```

### BTEST-019: Screen Reader Compatibility
```python
def test_aria_labels():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        login(page)
        page.goto("http://localhost:8000/dashboard/")
        
        # Check for main landmarks
        expect(page.locator('main, [role="main"]')).to_be_visible()
        expect(page.locator('nav, [role="navigation"]')).to_be_visible()
        
        # Check buttons have accessible names
        buttons = page.locator('button')
        for i in range(buttons.count()):
            button = buttons.nth(i)
            # Button should have text, aria-label, or title
            text = button.text_content().strip()
            aria_label = button.get_attribute('aria-label')
            title = button.get_attribute('title')
            
            assert text or aria_label or title, "Button without accessible name"
        
        browser.close()
```

---

## 9. Browser Compatibility Tests

### BTEST-020: Cross-Browser Testing
```python
def test_chrome():
    run_basic_test('chromium')

def test_firefox():
    run_basic_test('firefox')

def test_webkit():
    run_basic_test('webkit')

def run_basic_test(browser_type):
    with sync_playwright() as p:
        browser = getattr(p, browser_type).launch()
        page = browser.new_page()
        
        # Run through critical path
        page.goto("http://localhost:8000/login/")
        page.fill('input[name="username"]', 'testuser')
        page.fill('input[name="password"]', 'testpass123')
        page.click('button[type="submit"]')
        
        expect(page).to_have_url("**/dashboard/")
        
        page.goto("http://localhost:8000/orders/new/")
        expect(page.locator('#product-search')).to_be_visible()
        
        browser.close()
```

---

## 10. PWA Installation Tests

### BTEST-021: PWA Install Flow
```python
def test_pwa_install():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        # Navigate to app
        page.goto("http://localhost:8000/")
        
        # Check manifest
        manifest_link = page.locator('link[rel="manifest"]')
        expect(manifest_link).to_have_attribute('href')
        
        # Check service worker registration
        sw_registered = page.evaluate('''() => {
            return navigator.serviceWorker.ready.then(() => true)
        }''')
        assert sw_registered, "Service worker not registered"
        
        browser.close()
```

---

## Test Runner Script

```python
"""
run_browser_tests.py - Execute all browser tests
"""
import subprocess
import sys

def main():
    # Run with pytest
    result = subprocess.run([
        sys.executable, '-m', 'pytest',
        'browser_tests.py',
        '-v',
        '--html=browser_test_report.html',
        '--self-contained-html'
    ])
    
    return result.returncode

if __name__ == '__main__':
    sys.exit(main())
```

---

## Helper Functions

```python
"""
helpers.py - Common test utilities
"""
def login(page, username='testuser', password='testpass123'):
    page.goto("http://localhost:8000/login/")
    page.fill('input[name="username"]', username)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_url("**/dashboard/")

def login_as_admin(page):
    login(page, 'admin', 'adminpass123')

def create_order_to_payment_step(page):
    page.goto("http://localhost:8000/orders/new/")
    page.fill('#customer-search', 'Test Customer')
    page.click('.customer-result:first-child')
    page.fill('#product-search', 'Test Product')
    page.click('.product-result:first-child')
    page.click('#proceed-to-payment')
```

---

## Test Execution Checklist

| Test ID | Status | Browsers Tested | Notes |
|---------|--------|-----------------|-------|
| BTEST-001 | ⬜ | Chrome, Firefox, Safari | |
| BTEST-002 | ⬜ | | |
| BTEST-003 | ⬜ | | |
| BTEST-004 | ⬜ | | |
| BTEST-005 | ⬜ | | |
| BTEST-006 | ⬜ | | |
| BTEST-007 | ⬜ | | |
| BTEST-008 | ⬜ | | |
| BTEST-009 | ⬜ | | |
| BTEST-010 | ⬜ | | |
| BTEST-011 | ⬜ | | |
| BTEST-012 | ⬜ | | |
| BTEST-013 | ⬜ | | |
| BTEST-014 | ⬜ | | |
| BTEST-015 | ⬜ | | |
| BTEST-016 | ⬜ | | |
| BTEST-017 | ⬜ | | |
| BTEST-018 | ⬜ | | |
| BTEST-019 | ⬜ | | |
| BTEST-020 | ⬜ | | |
| BTEST-021 | ⬜ | | |
