from playwright.sync_api import sync_playwright
import time
import re

def test_playwright_scrape():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = context.new_page()
        
        # We can add stealth here if needed, but often custom UA is enough for basic Shopify
        url = "https://www.navneetstore.com/collections/educational-books?usf_sort=title&uff_g4r6hm_tags=Gujarat%20Board"
        print(f"Navigating to {url}...")
        page.goto(url, wait_until='networkidle')
        
        print("Page loaded. Scrolling to bottom to trigger infinite scroll/lazy loading...")
        
        previous_count = 0
        retries = 0
        while retries < 5:
            # Scroll to bottom
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)
            
            # Check if there is a 'Load More' button and click it
            try:
                load_more = page.query_selector("button:has-text('Load more'), a:has-text('Load more')")
                if load_more and load_more.is_visible():
                    load_more.click()
                    time.sleep(2)
            except:
                pass
                
            # Count products
            products = page.query_selector_all("a[href*='/products/']")
            current_count = len(products)
            print(f"Found {current_count} product links...")
            
            if current_count == previous_count:
                retries += 1
            else:
                retries = 0
                previous_count = current_count
                
            if current_count >= 130:
                break
                
        # Get unique links
        links = set()
        for p_elem in page.query_selector_all("a[href*='/products/']"):
            href = p_elem.get_attribute('href')
            if href:
                links.add(href.split('?')[0])
                
        print(f"Total unique product links: {len(links)}")
        for link in list(links)[:5]:
            print(link)
            
        browser.close()

if __name__ == "__main__":
    test_playwright_scrape()
