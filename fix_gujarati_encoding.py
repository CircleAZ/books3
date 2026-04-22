"""
Fix Gujarati encoding in products.json by:
  1. Reversing the double-encoding (UTF-8 → Latin-1 → UTF-8)
  2. For names that still have broken bytes, fetch correct title from Shopify product page
"""
import json
import re
import sys
import requests
from bs4 import BeautifulSoup

JSON_PATH = r"Z:\Navneet_Products\products.json"

def fix_double_encoding(text):
    """
    Reverse double-encoding: text was UTF-8, misread as latin-1, re-encoded as UTF-8.
    Decode back: current string → encode as latin-1 → decode as UTF-8.
    """
    try:
        fixed = text.encode('latin-1').decode('utf-8')
        return fixed
    except (UnicodeDecodeError, UnicodeEncodeError):
        return None  # Can't fix with this method

def has_garbled_text(text):
    """Check if text contains garbled latin-1-as-UTF-8 sequences (àª, à¤, etc.)"""
    return bool(re.search(r'[àáâãäåæçèéêëìíîïðñòóôõöøùúûüý]', text))

def has_broken_bytes(text):
    """Check if text still has replacement characters or raw bytes after fix."""
    return '\ufffd' in text or bool(re.search(r'[\x80-\x9f]', text))

def fetch_correct_title_from_shopify(product_url):
    """Scrape the correct product title directly from the Shopify product page."""
    try:
        resp = requests.get(product_url, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Shopify stores title in <title> tag or og:title meta
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            return og_title['content'].strip()
        
        title_tag = soup.find('title')
        if title_tag:
            # Remove " | Navneet Store" or similar suffix
            raw = title_tag.text.strip()
            raw = re.sub(r'\s*\|\s*Navneet\s*Store.*$', '', raw).strip()
            return raw
        
        return None
    except Exception as e:
        print(f"    Shopify fetch error: {e}")
        return None

def extract_name_from_title(title):
    """
    Split title by | delimiter:
      'Navneet Bhugol (ભૂગોળ) | STD 12 | Gujarat Board'
    Strip Navneet/Navaneet prefix, return just the name part.
    """
    parts = [p.strip() for p in title.split('|')]
    name = parts[0]
    
    # Strip Navneet/Navaneet prefix
    for prefix in ['Navaneet ', 'Navneet ']:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    
    return name

# ── Main ──
with open(JSON_PATH, 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

print(f"Loaded {len(data)} products from products.json")
print("=" * 70)

fixed_encoding = 0
fixed_shopify = 0
already_clean = 0
failed = 0

for i, item in enumerate(data):
    name = item['Name']
    title = item.get('title', '')
    
    # Check if name has garbled text
    if not has_garbled_text(name) and not has_broken_bytes(name):
        already_clean += 1
        continue
    
    # Attempt 1: Fix double-encoding on name
    fixed_name = fix_double_encoding(name)
    
    if fixed_name and not has_broken_bytes(fixed_name):
        item['Name'] = fixed_name
        fixed_encoding += 1
        print(f"  [{i+1:3d}] ENCODING FIX: {fixed_name.encode('unicode_escape').decode('ascii')[:60]}")
        
        # Also fix title
        fixed_title = fix_double_encoding(title)
        if fixed_title:
            item['title'] = fixed_title
        continue
    
    # Attempt 2: Fetch from Shopify product page
    product_url = item.get('ProductURL', '')
    if product_url:
        print(f"  [{i+1:3d}] Fetching from Shopify: {product_url}")
        shopify_title = fetch_correct_title_from_shopify(product_url)
        
        if shopify_title:
            correct_name = extract_name_from_title(shopify_title)
            item['Name'] = correct_name
            item['title'] = shopify_title
            fixed_shopify += 1
            print(f"         → {correct_name.encode('unicode_escape').decode('ascii')[:60]}")
            continue
    
    failed += 1
    print(f"  [{i+1:3d}] FAILED: {repr(name)[:60]}")

# Save fixed JSON
with open(JSON_PATH, 'w', encoding='utf-8-sig') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print("\n" + "=" * 70)
print(f"Results: Encoding-fixed={fixed_encoding}, Shopify-fixed={fixed_shopify}, "
      f"Already clean={already_clean}, Failed={failed}")
print(f"Saved to {JSON_PATH}")
