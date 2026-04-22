"""
Upload Navneet products to PRODUCTION database via REST API.
No SSH required — authenticates via JWT and pushes data through the public API.

Usage:
  python upload_to_production.py

You will be prompted for:
  1. Your production login username
  2. Your production login password
  3. OTP code (sent to your email)
"""
import json
import os
import sys
import time
import requests
from getpass import getpass

# ── Configuration ──
API_BASE = "https://api.circleaz.in/api"
JSON_PATH = r"Z:\Navneet_Products\products.json"
IMAGE_DIR = r"Z:\Navneet_Products"

# ── Step 1: Authenticate ──
def authenticate():
    """Login → OTP → JWT tokens."""
    print("\n" + "=" * 60)
    print("  PRODUCTION UPLOAD — Authentication")
    print("=" * 60)
    
    username = input("Username: ").strip()
    password = getpass("Password: ")
    
    print("\n[1/3] Sending credentials...")
    login_resp = requests.post(f"{API_BASE}/account/login/", json={
        "username": username,
        "password": password,
        "remember_me": True,
    }, timeout=30)
    
    if login_resp.status_code != 200:
        print(f"  ERROR: {login_resp.json()}")
        sys.exit(1)
    
    login_data = login_resp.json()
    
    if "access" in login_data:
        print("  Authenticated (device token still valid, OTP skipped).")
        return login_data["access"]
    
    if login_data.get("requires_otp"):
        otp_session = login_data["otp_session"]
        email_hint = login_data.get("email", "your email")
        print(f"  OTP sent to {email_hint}")
        
        otp_code = input("\n[2/3] Enter OTP code: ").strip()
        
        verify_resp = requests.post(f"{API_BASE}/account/verify-otp/", json={
            "otp_session": otp_session,
            "code": otp_code,
        }, timeout=30)
        
        if verify_resp.status_code != 200:
            print(f"  OTP ERROR: {verify_resp.json()}")
            sys.exit(1)
        
        verify_data = verify_resp.json()
        print("  Authenticated successfully!")
        return verify_data["access"]
    
    print(f"  Unexpected response: {login_data}")
    sys.exit(1)


def get_or_create_category(session, name):
    resp = session.get(f"{API_BASE}/inventory/categories/")
    resp.raise_for_status()
    categories = resp.json()
    if isinstance(categories, dict) and "results" in categories:
        categories = categories["results"]
    for cat in categories:
        if cat["name"] == name:
            return cat["id"]
    resp = session.post(f"{API_BASE}/inventory/categories/", json={"name": name})
    resp.raise_for_status()
    return resp.json()["id"]


def get_or_create_vendor(session, name):
    resp = session.get(f"{API_BASE}/inventory/vendors/")
    resp.raise_for_status()
    vendors = resp.json()
    if isinstance(vendors, dict) and "results" in vendors:
        vendors = vendors["results"]
    for v in vendors:
        if v["name"] == name:
            return v["id"]
    resp = session.post(f"{API_BASE}/inventory/vendors/", json={"name": name})
    resp.raise_for_status()
    return resp.json()["id"]


def wipe_garbage_data(session, vendor_id):
    """Delete all products under the given vendor to ensure a clean slate."""
    print(f"\n[*] Wiping previous interrupted uploads for vendor 'Atul'...")
    page = 1
    products_to_delete = []
    
    while True:
        resp = session.get(f"{API_BASE}/inventory/products/", params={"vendor": vendor_id, "page": page, "page_size": 100})
        if resp.status_code != 200:
            break
        data = resp.json()
        results = data.get("results", data) if isinstance(data, dict) else data
        if not results:
            break
        for p in results:
            products_to_delete.append(p["id"])
        if isinstance(data, dict) and not data.get("next"):
            break
        page += 1

    if not products_to_delete:
        print("  No garbage data found. Slate is clean.")
        return

    print(f"  Found {len(products_to_delete)} garbage items. Obliterating...")
    for pid in products_to_delete:
        # 1. Soft Delete
        session.delete(f"{API_BASE}/inventory/products/{pid}/")
        # 2. Hard Delete
        session.post(f"{API_BASE}/inventory/products/{pid}/hard_delete/")
    print("  Garbage data completely wiped.")


def upload_products(access_token):
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {access_token}"})
    session.timeout = 60
    
    with open(JSON_PATH, 'r', encoding='utf-8-sig') as f:
        products = json.load(f)
    
    print(f"\n[3/3] Uploading {len(products)} products to production...")
    print("-" * 60)
    
    vendor_id = get_or_create_vendor(session, "Atul")
    print(f"  Vendor 'Atul': {vendor_id}")
    
    # Clean up the garbage from the previous run
    wipe_garbage_data(session, vendor_id)
    
    category_cache = {}
    unique_classes = set(item.get("Class", "") for item in products)
    for cls in unique_classes:
        cat_name = f"Nav_{cls}"
        category_cache[cat_name] = get_or_create_category(session, cat_name)
        print(f"  Category '{cat_name}': {category_cache[cat_name]}")
    
    print("-" * 60)
    
    imported = 0
    errors = 0
    
    for i, item in enumerate(products, 1):
        name = item["Name"]
        class_val = item.get("Class", "")
        price = float(item.get("Price", 0))
        image_file = item.get("ImageFile", "")
        
        cat_name = f"Nav_{class_val}"
        category_id = category_cache[cat_name]
        cost_price = round(price * 0.7, 2)
        selling_price = round(price * 0.9, 2)
        
        form_data = {
            "name": name,
            "category": str(category_id),
            "vendor": str(vendor_id),
            "cost_price": str(cost_price),
            "selling_price": str(selling_price),
            "stock_quantity": "0",
            "low_stock_threshold": "0",
        }
        
        files = {}
        img_path = os.path.join(IMAGE_DIR, image_file) if image_file else None
        if img_path and os.path.exists(img_path):
            files["images"] = (image_file, open(img_path, "rb"), "image/jpeg")
        
        try:
            resp = session.post(
                f"{API_BASE}/inventory/products/",
                data=form_data,
                files=files if files else None,
            )
            
            if resp.status_code in (200, 201):
                imported += 1
                # print first 50 chars safely to windows terminal using encode/decode
                safe_name = name[:50].encode('cp1252', 'replace').decode('cp1252')
                print(f"  [{i:3d}/128] OK: {safe_name}")
            else:
                errors += 1
                err = resp.text[:200]
                safe_name = name[:40].encode('cp1252', 'replace').decode('cp1252')
                print(f"  [{i:3d}/128] ERR ({resp.status_code}): {safe_name} — {err}")
        except Exception as e:
            errors += 1
            safe_name = name[:40].encode('cp1252', 'replace').decode('cp1252')
            print(f"  [{i:3d}/128] EXCEPTION: {safe_name} — {e}")
        finally:
            if files and "images" in files:
                files["images"][1].close()
        
        if i % 10 == 0:
            time.sleep(0.5)
    
    print("\n" + "=" * 60)
    print(f"  DONE: Imported={imported}, Errors={errors}")
    print("=" * 60)


if __name__ == "__main__":
    token = authenticate()
    upload_products(token)
