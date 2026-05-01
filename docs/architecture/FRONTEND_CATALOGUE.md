# Frontend Catalogue Architecture

## Overview
The frontend catalogue (`catalog/index.html`) is a standalone, monolithic, single-page presentation layer designed to showcase inventory. It operates independently of the React frontend (`/frontend`), functioning essentially as an interactive, scroll-snapping brochure hosted at `circleaz.in`.

## 1. Data Ingestion & Fallback Mechanism
The catalogue utilizes a dual-layer data ingestion strategy to ensure 100% uptime, even if the primary database or API goes offline.

### Primary Path: API Fetch
On load, `initCatalog()` attempts to fetch live product data from the Django backend:
- **Endpoint:** `GET https://books.circleaz.in/api/inventory/products/`
- **Timeout:** Enforced 3000ms (3 seconds) limit.
- **Payload Processing:** It expects a paginated response (`data.results`) or a flat array (`data`). It maps the backend `Product` model fields (`name`, `selling_price`, `images`, `description`) into the frontend render format.
- **Categorical Styling:** The script injects specific background colors (`bg`), blob gradients (`blobs`), and accent colors based on the backend `category_name` (e.g., Notebooks receive blue hues, Art receives brown hues).

### Secondary Path: The Hardcoded Fallback
If the API fails (timeout, 500 error, CORS issue), the `catch` block intercepts the failure and engages the `FALLBACK_PRODUCTS` array.
- This is a hardcoded array of JSON objects residing directly inside `index.html`.
- It relies entirely on static, pre-optimized images stored in the `./scan/` directory.
- It bypasses all live stock checks and pricing updates.

## 2. Image Optimization Pipeline (`optimize.py`)
To prevent the monolithic HTML file from suffering massive load times due to high-resolution product scans, an offline Python script manages image compression.

- **Location:** `catalog/optimize.py`
- **Mechanism:** Uses the `Pillow` (PIL) library to traverse the `catalog/scan/` and `catalog/Logo/` directories.
- **Compression Logic:** 
  - Detects `.png`, `.jpg`, `.jpeg`.
  - Resizes any image exceeding 1500px (width or height) using `LANCZOS` resampling.
  - Converts and saves the output strictly as `.webp` at 80% quality.
  - Automatically deletes the original source file.

## 3. UI/UX Architecture
The visual layer relies on vanilla CSS and GSAP (GreenSock Animation Platform) rather than a heavy framework like React.

### Scroll-Snapping & Layout
- The `html` element enforces `scroll-snap-type: y mandatory`.
- Each product is rendered as a `<section class="product-page">`, acting as a full viewport container (`100vh`).

### Background Mesh & Gradients
- The background consists of a fixed CSS mesh (`bgMesh` animation) combined with dynamic, floating blurred circles (`.bg-blob`) to create a glassmorphism/premium effect.
- **Offline Color Map (`COLOR_MAP`):** A hardcoded dictionary mapping specific image filenames to pre-calculated average RGB values. When a product slide becomes active, `window.updateSectionColor()` cross-references the image source against the `COLOR_MAP` to dynamically animate the background gradients to match the product's dominant colors.

### 3D Image Gallery
- Products with multiple images render a stacked 3D gallery.
- Navigation (Arrows, Dots, or Swipe/Drag) recalculates the `z-index`, `transform` (scale, rotate), and `opacity` of the images.
- GSAP's `ScrollTrigger` plugin links the appearance of the product information (`.info`) and the gallery (`.gallery`) to the user's scroll position, executing a parallax-style entry animation as the section enters the viewport.

## 4. Known Constraints & Manual Filters
- **No Stock Sync Offline:** If the catalogue falls back to offline mode, out-of-stock items will still render unless manually commented out of the `FALLBACK_PRODUCTS` array.
- **Dynamic Hard-Filters:** Explicit product exclusions (e.g., removing a discontinued item when the API is active but the DB hasn't been updated) are handled via hardcoded `Array.prototype.filter()` injections immediately after the API JSON parse block.
