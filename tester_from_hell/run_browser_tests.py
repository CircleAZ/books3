"""
run_browser_tests.py - Automated Browser Test Runner for AZ Books
Usage: python run_browser_tests.py [--headed] [--browser=chromium]
"""
import argparse, json, sys, time
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, expect
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

BASE_URL = "http://localhost:8000"
TEST_USER = {"username": "testuser", "password": "testpass123"}

class BrowserTestRunner:
    def __init__(self, headed=False, browser_type="chromium"):
        self.headed = headed
        self.browser_type = browser_type
        self.results = []

    def setup(self):
        self.playwright = sync_playwright().start()
        self.browser = getattr(self.playwright, self.browser_type).launch(headless=not self.headed)
        self.context = self.browser.new_context(viewport={"width": 1280, "height": 720})

    def teardown(self):
        if self.context: self.context.close()
        if self.browser: self.browser.close()
        self.playwright.stop()

    def login(self, page):
        page.goto(f"{BASE_URL}/login/")
        page.fill('input[name="username"]', TEST_USER["username"])
        page.fill('input[name="password"]', TEST_USER["password"])
        page.click('button[type="submit"]')

    def run_test(self, test_id, name, func):
        page = self.context.new_page()
        start = time.time()
        try:
            print(f"  🔄 {test_id}: {name}...", end="", flush=True)
            func(page)
            print(f" ✅ PASSED")
            self.results.append({"id": test_id, "status": "passed"})
        except Exception as e:
            print(f" ❌ FAILED: {e}")
            Path("screenshots").mkdir(exist_ok=True)
            page.screenshot(path=f"screenshots/{test_id}.png")
            self.results.append({"id": test_id, "status": "failed", "error": str(e)})
        finally:
            page.close()

    def test_login(self, page):
        page.goto(f"{BASE_URL}/login/")
        page.fill('input[name="username"]', TEST_USER["username"])
        page.fill('input[name="password"]', TEST_USER["password"])
        page.click('button[type="submit"]')
        expect(page).to_have_url(f"**dashboard**", timeout=10000)

    def test_products_page(self, page):
        self.login(page)
        page.goto(f"{BASE_URL}/inventory/products/")
        expect(page.locator('.product-row, table tr').first).to_be_visible()

    def test_mobile_view(self, page):
        page.set_viewport_size({"width": 375, "height": 667})
        self.login(page)
        expect(page.locator('.mobile-menu-toggle, .hamburger')).to_be_visible()

    def run_all(self):
        print("\n🔥 TESTER FROM HELL - Browser Tests 🔥\n")
        self.setup()
        try:
            tests = [
                ("AUTH-001", "Login", self.test_login),
                ("INV-001", "Products Page", self.test_products_page),
                ("RESP-001", "Mobile View", self.test_mobile_view),
            ]
            for t in tests: self.run_test(*t)
        finally:
            self.teardown()
        
        passed = sum(1 for r in self.results if r["status"] == "passed")
        print(f"\n✅ Passed: {passed}/{len(self.results)}")
        
        Path("reports").mkdir(exist_ok=True)
        with open("reports/results.json", "w") as f:
            json.dump(self.results, f)

def main():
    if not PLAYWRIGHT_AVAILABLE:
        print("Install playwright: pip install playwright && playwright install")
        return 1
    parser = argparse.ArgumentParser()
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--browser", default="chromium")
    args = parser.parse_args()
    BrowserTestRunner(args.headed, args.browser).run_all()
    return 0

if __name__ == "__main__":
    sys.exit(main())
