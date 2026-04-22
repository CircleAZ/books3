import os
import requests
import json
import time

def retry_missing_images():
    output_dir = r"Z:\Navneet_Products"
    json_path = os.path.join(output_dir, 'products.json')
    
    with open(json_path, 'r', encoding='utf-8') as f:
        products = json.load(f)
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
    
    missing = []
    for p in products:
        filepath = os.path.join(output_dir, p['ImageFile'])
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            missing.append(p)
            
    print(f"Found {len(missing)} missing images. Retrying via API fallback to avoid HTML parsing...")
    
    # We already have the API data if we fetch it again, it's faster and less prone to DNS blocks than scraping 100 HTML pages
    url = "https://svc-3-usf.hotyon.com/search?q=&apiKey=11ceb3e6-0e00-4708-9dcd-a5a3054c834f&country=IN&locale=en&getProductDescription=0&collection=477736337704&facetFilters=%7B%22975445402%22%3A%5B%22tags%22%2C%5B%22Gujarat%20Board%22%5D%5D%7D&skip=0&take=200&sort=title"
    res = requests.get(url, headers={'Origin': 'https://www.navneetstore.com'})
    api_items = res.json().get('data', {}).get('items', [])
    
    for i, prod in enumerate(missing):
        print(f"Retrying {i+1}/{len(missing)}: {prod['ImageFile']}")
        
        img_url = ""
        url_name = prod['ProductURL'].split('/')[-1]
        
        for item in api_items:
            if item.get('urlName') == url_name:
                if item.get('images'):
                    img_url = item['images'][0]['url']
                    if img_url.startswith('//'):
                        img_url = 'https:' + img_url
                    break
                    
        if img_url:
            img_url = img_url.split('?')[0] 
            img_res = requests.get(img_url, headers=headers)
            if img_res.status_code == 200:
                filepath = os.path.join(output_dir, prod['ImageFile'])
                with open(filepath, 'wb') as f:
                    f.write(img_res.content)
            else:
                print(f" Failed HTTP {img_res.status_code} for {img_url}")
        else:
            print(" No image url found in API")
            
        time.sleep(0.5)

if __name__ == "__main__":
    retry_missing_images()
