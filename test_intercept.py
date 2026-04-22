from playwright.sync_api import sync_playwright
import json

def test_intercept():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        usf_data = []

        def handle_response(response):
            if "usf" in response.url.lower() and "search" in response.url.lower():
                try:
                    print(f"URL: {response.url}")
                    data = response.json()
                    usf_data.append(data)
                except:
                    pass

        page.on("response", handle_response)
        
        url = "https://www.navneetstore.com/collections/educational-books?usf_sort=title&uff_g4r6hm_tags=Gujarat%20Board"
        print("Navigating...")
        page.goto(url, wait_until='networkidle')
        
        if usf_data:
            print("Found USF Data!")
            for d in usf_data:
                # Try to print keys
                print(d.keys())
                if 'items' in d:
                    print(f"Items count: {len(d['items'])}")
                if 'data' in d and 'items' in d['data']:
                    print(f"Data Items count: {len(d['data']['items'])}")
        else:
            print("No USF search JSON found.")
            
        browser.close()

if __name__ == "__main__":
    test_intercept()
