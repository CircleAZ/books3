"""
Retroactive Image Purge — Client-Side Approach.

Downloads each product image from R2, resizes locally with Pillow,
deletes the old image via API, and re-uploads the optimized version.

No server-side code needed. Uses only existing API endpoints.

Usage:
  pip install Pillow requests
  python retroactive_purge.py
"""
import sys
import os
import time
import requests
from io import BytesIO
from getpass import getpass
from PIL import Image, ImageOps

API_BASE = "https://api.circleaz.in/api"


def authenticate():
    """Login → OTP → JWT access token."""
    print("\n" + "=" * 60)
    print("  RETROACTIVE PURGE — Authentication")
    print("=" * 60)

    username = input("Username: ").strip()
    password = getpass("Password: ")

    print("\n[1/2] Sending credentials...")
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
        print("  Authenticated (OTP skipped).")
        return login_data["access"]

    if login_data.get("requires_otp"):
        otp_session = login_data["otp_session"]
        email_hint = login_data.get("email", "your email")
        print(f"  OTP sent to {email_hint}")

        otp_code = input("\n[2/2] Enter OTP code (6 digits): ").strip()

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


def optimize_image(image_bytes, max_size):
    """Resize and convert image bytes to WebP."""
    img = Image.open(BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    if img.mode not in ('L', 'RGB', 'RGBA'):
        img = img.convert('RGBA')
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    out = BytesIO()
    img.save(out, format='WebP', quality=85)
    out.seek(0)
    return out


def get_all_product_ids(session):
    """Fetch ALL product IDs (paginated list)."""
    product_ids = []
    page = 1
    while True:
        resp = session.get(f"{API_BASE}/inventory/products/", params={"page": page, "page_size": 50})
        if resp.status_code != 200:
            break
        data = resp.json()
        results = data.get("results", []) if isinstance(data, dict) else data
        if not results:
            break
        for p in results:
            product_ids.append((p["id"], p.get("name", "?")))
        if isinstance(data, dict) and not data.get("next"):
            break
        page += 1
    return product_ids


def get_product_detail(session, pid):
    """Fetch a single product's detail (includes images)."""
    resp = session.get(f"{API_BASE}/inventory/products/{pid}/")
    if resp.status_code == 200:
        return resp.json()
    return None


def purge_images(access_token):
    """Download, resize, delete old, re-upload optimized."""
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {access_token}"})
    session.timeout = 60

    print("\n[*] Fetching all products...")
    product_ids = get_all_product_ids(session)
    print(f"    Found {len(product_ids)} products. Fetching details...")

    total_images = 0
    optimized = 0
    skipped = 0
    errors = 0

    for i, (pid, pname) in enumerate(product_ids, 1):
        # Fetch product detail to get images
        product = get_product_detail(session, pid)
        if not product:
            continue

        images = product.get("images", [])

        if not images:
            continue

        for img_data in images:
            img_id = img_data["id"]
            img_url = img_data.get("image", "")
            total_images += 1

            # Skip already-optimized images
            if img_url.endswith("_opt.webp"):
                skipped += 1
                continue

            try:
                # 1. Download original image from R2 (public URL, no auth needed)
                dl_resp = requests.get(img_url, timeout=30)
                if dl_resp.status_code != 200:
                    print(f"  [{i}] SKIP download failed ({dl_resp.status_code}): {pname}")
                    errors += 1
                    continue

                original_bytes = dl_resp.content
                original_kb = len(original_bytes) / 1024

                # 2. Resize locally
                optimized_io = optimize_image(original_bytes, 1500)
                new_kb = len(optimized_io.getvalue()) / 1024

                # 3. Delete old image via API
                del_resp = session.post(
                    f"{API_BASE}/inventory/products/{pid}/remove_image/",
                    json={"image_id": str(img_id)}
                )
                if del_resp.status_code != 200:
                    print(f"  [{i}] SKIP delete failed ({del_resp.status_code}): {pname}")
                    errors += 1
                    continue

                # 4. Re-upload optimized image
                optimized_io.seek(0)
                fname = os.path.basename(img_url).rsplit('.', 1)[0] + "_opt.webp"

                up_resp = session.patch(
                    f"{API_BASE}/inventory/products/{pid}/",
                    files={"images": (fname, optimized_io, "image/webp")}
                )

                if up_resp.status_code in (200, 201):
                    optimized += 1
                    safe = pname.encode('cp1252', 'replace').decode('cp1252')
                    print(f"  [{i:3d}] OK: {safe} — {original_kb:.0f}KB → {new_kb:.0f}KB")
                else:
                    print(f"  [{i:3d}] UPLOAD ERR ({up_resp.status_code}): {pname} — {up_resp.text[:100]}")
                    errors += 1

            except Exception as e:
                print(f"  [{i:3d}] ERROR: {pname} — {e}")
                errors += 1

        # Throttle to avoid rate limiting
        if i % 5 == 0:
            time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"  PURGE COMPLETE")
    print(f"  Total images: {total_images}")
    print(f"  Optimized:    {optimized}")
    print(f"  Skipped:      {skipped}")
    print(f"  Errors:       {errors}")
    print("=" * 60)


if __name__ == "__main__":
    token = authenticate()
    purge_images(token)
