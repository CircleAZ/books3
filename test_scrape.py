import requests
from bs4 import BeautifulSoup
import re

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

def test_pagination():
    base_url = "https://www.navneetstore.com/collections/educational-books"
    params = {
        'usf_sort': 'title',
        'uff_g4r6hm_tags': 'Gujarat Board',
        'page': 1
    }
    
    product_links = set()
    
    for page in range(1, 10):
        params['page'] = page
        print(f"Fetching page {page}...")
        res = requests.get(base_url, params=params, headers=headers)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Shopify collections usually have product links under .grid-view-item__link or similar, or just find all a hrefs with /products/
        links = soup.find_all('a', href=re.compile(r'/products/'))
        page_links = set(f"https://www.navneetstore.com{a['href'].split('?')[0]}" for a in links)
        
        if not page_links:
            print("No links found on this page. Stopping.")
            break
            
        new_links = page_links - product_links
        if not new_links:
            print("No NEW links found. Stopping.")
            break
            
        print(f"Found {len(new_links)} new products.")
        product_links.update(new_links)
        
    print(f"Total unique products found: {len(product_links)}")
    for link in list(product_links)[:5]:
        print(link)

if __name__ == "__main__":
    test_pagination()
