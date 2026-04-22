import os
import requests
import json
import re
from bs4 import BeautifulSoup

def scrape_navneet():
    output_dir = r"Z:\Navneet_Products"
    os.makedirs(output_dir, exist_ok=True)
    
    # Fetch data from USF API
    url = "https://svc-3-usf.hotyon.com/search?q=&apiKey=11ceb3e6-0e00-4708-9dcd-a5a3054c834f&country=IN&locale=en&getProductDescription=0&collection=477736337704&facetFilters=%7B%22975445402%22%3A%5B%22tags%22%2C%5B%22Gujarat%20Board%22%5D%5D%7D&skip=0&take=200&sort=title"
    
    headers = {
        'Origin': 'https://www.navneetstore.com',
        'Referer': 'https://www.navneetstore.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    print("Fetching product list from USF API...")
    res = requests.get(url, headers=headers)
    data = res.json()
    items = data.get('data', {}).get('items', [])
    
    print(f"Total items fetched: {len(items)}")
    
    final_products = []
    
    for item in items:
        title = item.get('title', '')
        url_name = item.get('urlName', '')
        
        # Exclude Combos
        if 'combo' in url_name.lower() or 'combo' in title.lower():
            continue
            
        # Parse Name and Class
        # e.g., "Golden Key to Computers | STD 11 |Gujarat Board"
        # Match pattern: (Name) | (STD/Class ClassNum) | (Board)
        name_part = title
        class_part = ""
        
        parts = [p.strip() for p in title.split('|')]
        name_part = parts[0]
        
        if len(parts) > 1:
            m = re.search(r'\d+', parts[1])
            if m:
                class_part = m.group(0)
        
        price = 0
        variants = item.get('variants', [])
        if variants:
            price = variants[0].get('price', 0)
            
        product_url = f"https://www.navneetstore.com/products/{url_name}"
        
        product_data = {
            "title": title,
            "Name": name_part,
            "Class": class_part,
            "Price": price,
            "ProductURL": product_url,
            "ImageFile": f"{url_name}.jpg"
        }
        
        final_products.append(product_data)
        
    print(f"Products after filtering combos: {len(final_products)}")
    
    # Download highest quality image from product details page
    for i, prod in enumerate(final_products):
        print(f"Scraping image for {i+1}/{len(final_products)}: {prod['ProductURL']}")
        try:
            p_res = requests.get(prod['ProductURL'], headers=headers, timeout=10)
            soup = BeautifulSoup(p_res.text, 'html.parser')
            
            # Find og:image for the highest quality product image
            og_img = soup.find('meta', property='og:image')
            img_url = ""
            if og_img and og_img.get('content'):
                img_url = og_img['content']
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
            
            # Fallback if og:image fails
            if not img_url:
                for item in items:
                    if item.get('urlName') == prod['ProductURL'].split('/')[-1]:
                        if item.get('images'):
                            img_url = item['images'][0]['url']
                            if img_url.startswith('//'):
                                img_url = 'https:' + img_url
                            break
                            
            if img_url:
                # Remove query params and size suffixes to get the original high res
                img_url = img_url.split('?')[0] 
                img_url = re.sub(r'_\d+x\d+(@2x)?(?=\.\w+$)', '', img_url)
                
                img_res = requests.get(img_url, headers=headers, timeout=10)
                if img_res.status_code == 200:
                    filepath = os.path.join(output_dir, prod['ImageFile'])
                    with open(filepath, 'wb') as f:
                        f.write(img_res.content)
                else:
                    print(f" Failed to download image: {img_url} (status {img_res.status_code})")
            else:
                print(" No image found.")
        except Exception as e:
            print(f" Error processing {prod['ProductURL']}: {e}")
            
    # Save structured json
    with open(os.path.join(output_dir, 'products.json'), 'w', encoding='utf-8') as f:
        json.dump(final_products, f, indent=4, ensure_ascii=False)
        
    print("Scraping completed!")

if __name__ == "__main__":
    scrape_navneet()
