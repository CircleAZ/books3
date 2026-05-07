"""
PWA Icon Generator — generates PWA-required icon sizes from store logo.

When a logo is uploaded via StoreSettings, this module:
1. Opens the source image with Pillow
2. Resizes to 192×192, 512×512, 180×180 (apple-touch-icon)
3. Saves each as PNG to the default storage backend (R2 in production)

If no logo exists, generates a text-based fallback icon with store initials.

All icons are saved at fixed paths so the manifest URLs remain stable:
  store/pwa-icon-192.png
  store/pwa-icon-512.png
  store/apple-touch-icon.png
"""

import io
import logging
from PIL import Image, ImageDraw, ImageFont
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

# Fixed R2/storage paths — manifest URLs point here
ICON_SIZES = {
    'store/pwa-icon-192.png': 192,
    'store/pwa-icon-512.png': 512,
    'store/apple-touch-icon.png': 180,
}

# Branding constants for fallback icon
FALLBACK_BG_COLOR = (26, 26, 46)       # #1a1a2e — matches app dark theme
FALLBACK_TEXT_COLOR = (255, 255, 255)   # white
FALLBACK_ACCENT_COLOR = (99, 102, 241)  # #6366f1 — indigo accent


def generate_pwa_icons(logo_field=None, store_name='AZ Books'):
    """
    Generate PWA icons from an uploaded logo or create text-based defaults.

    Args:
        logo_field: ImageField instance (StoreSettings.logo) or None
        store_name: Store name for generating initials fallback

    Returns:
        list of saved file paths, or empty list on failure
    """
    saved_paths = []

    for path, size in ICON_SIZES.items():
        try:
            if logo_field and _logo_exists(logo_field):
                icon_data = _resize_logo(logo_field, size)
            else:
                icon_data = _generate_text_icon(store_name, size)

            # Save to storage (R2 in production, local filesystem in dev)
            # delete old file first to avoid stale cache
            if default_storage.exists(path):
                default_storage.delete(path)

            saved_name = default_storage.save(path, ContentFile(icon_data))
            saved_paths.append(saved_name)
            logger.info(f"PWA icon generated: {saved_name} ({size}×{size})")

        except Exception as e:
            logger.error(f"Failed to generate PWA icon {path} ({size}×{size}): {e}")

    return saved_paths


def _logo_exists(logo_field):
    """Check if the logo file actually exists in storage."""
    try:
        return bool(logo_field and logo_field.name and default_storage.exists(logo_field.name))
    except Exception:
        return False


def _resize_logo(logo_field, size):
    """
    Open the logo from storage, resize to a square PNG.
    Uses center-crop to maintain aspect ratio before scaling.
    """
    with logo_field.open('rb') as f:
        img = Image.open(f)
        img = img.convert('RGBA')

    # Center-crop to square
    w, h = img.size
    if w != h:
        edge = min(w, h)
        left = (w - edge) // 2
        top = (h - edge) // 2
        img = img.crop((left, top, left + edge, top + edge))

    # Resize with high-quality resampling
    img = img.resize((size, size), Image.LANCZOS)

    # Add a solid white background (for transparency support)
    background = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    background.paste(img, (0, 0), img)
    final = background.convert('RGB')

    buf = io.BytesIO()
    final.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


def _generate_text_icon(store_name, size):
    """
    Generate a professional text-based icon with store initials.
    Used when no logo has been uploaded.
    """
    img = Image.new('RGB', (size, size), FALLBACK_BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Extract initials (max 2 chars)
    words = store_name.strip().split()
    if not words:
        initials = 'AZ'
    elif len(words[0]) <= 2:
        # Short brand name like "AZ" — use it directly
        initials = words[0].upper()
    elif len(words) >= 2:
        initials = (words[0][0] + words[1][0]).upper()
    else:
        initials = words[0][:2].upper()

    # Draw a subtle accent circle behind the text
    padding = size // 6
    circle_bbox = [padding, padding, size - padding, size - padding]
    draw.ellipse(circle_bbox, fill=FALLBACK_ACCENT_COLOR)

    # Use the largest built-in font available, then scale
    # Pillow's default font is small, so we use truetype with a calculated size
    font_size = size // 3
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except (OSError, IOError):
        try:
            # Linux/Render fallback fonts
            for fallback in [
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
            ]:
                try:
                    font = ImageFont.truetype(fallback, font_size)
                    break
                except (OSError, IOError):
                    continue
            else:
                # Last resort: Pillow's built-in bitmap font
                font = ImageFont.load_default()
        except Exception:
            font = ImageFont.load_default()

    # Center the text
    bbox = draw.textbbox((0, 0), initials, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2
    y = (size - text_h) // 2 - (bbox[1])  # Adjust for font ascent offset

    draw.text((x, y), initials, fill=FALLBACK_TEXT_COLOR, font=font)

    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()
