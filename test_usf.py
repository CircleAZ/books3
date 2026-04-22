import requests
import json

def fetch_usf():
    url = "https://svc-3-usf.hotyon.com/search?q=&apiKey=11ceb3e6-0e00-4708-9dcd-a5a3054c834f&country=IN&locale=en&getProductDescription=0&collection=477736337704&facetFilters=%7B%22975445402%22%3A%5B%22tags%22%2C%5B%22Gujarat%20Board%22%5D%5D%7D&skip=0&take=200&sort=title"
    
    headers = {
        'Origin': 'https://www.navneetstore.com',
        'Referer': 'https://www.navneetstore.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    res = requests.get(url, headers=headers)
    data = res.json()
    
    items = data.get('data', {}).get('items', [])
    print(f"Fetched {len(items)} items")
    if items:
        # Save the first item to see its structure
        with open('z:\\books2\\sample_item.json', 'w') as f:
            json.dump(items[0], f, indent=2)

if __name__ == "__main__":
    fetch_usf()
