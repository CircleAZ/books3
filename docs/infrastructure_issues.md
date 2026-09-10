# AZ Books — Infrastructure Issues Backlog

*Identified during PWA audit on 2026-05-07. To be addressed one by one.*

---

## 1. 🔴 Stale API Cache (24-Hour TTL on Financial Data

**File:** [vite.config.js](file:///z:/books2/frontend/vite.config.js#L13-L28)

The Workbox `runtimeCaching` config applies `NetworkFirst` with a **24-hour cache** to ALL `/api/` GET endpoints — including orders, payments, stock, and balances.

**Risk:** A salesman could see stale stock quantities, outdated payment statuses, or old prices from cache. We literally just changed B5 80 from ₹25 → ₹20 and any cached API response would still show ₹25 for up to 24 hours.

**Fix:** Split caching into tiers:
- `NetworkOnly` — financial endpoints (orders, payments, stock, balances)
- `NetworkFirst` (short TTL) — semi-static data (products, customers)
- `CacheFirst` — truly static data (schools, classes, templates)

**Status:** `[x]` Completed in commit `dabf0aa`. Note: The proposed tiered fix was REJECTED during architectural review. Per `cache_fix_impact_analysis.md`, `runtimeCaching` was completely eradicated to eliminate 100% of stale data vectors. Edge caching via `Cloudflare-CDN-Cache-Control` was implemented instead.

---

## 2. 🟡 Duplicate Manifest Files

**Files:**
- [public/manifest.json](file:///z:/books2/frontend/public/manifest.json) (static, hand-written)
- `vite.config.js` manifest block (auto-generated at build time)

`vite-plugin-pwa` generates its own `manifest.webmanifest` from the config. The static `public/manifest.json` is a duplicate that could conflict or confuse the browser.

**Fix:** Delete `public/manifest.json`. Use only the Vite-generated manifest.

**Status:** `[x]` Completed in commit `6730832` — Deleted `public/manifest.json` and centralized config to `vite.config.js`.

---

## 3. 🔴 Missing PWA Icons

**File:** [vite.config.js](file:///z:/books2/frontend/vite.config.js#L43-L54)

References `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`, and `masked-icon.svg` in both the manifest and `includeAssets` — but **none of these files exist** in `/public/`.

**Impact:** Chrome's installability check fails. The `<link rel="apple-touch-icon">` in `index.html` points to a 404.

**Fix:** Generate proper icons from a source logo and place in `/public/`.

**Status:** `[x]` Commit `6463568` — Dynamic icons from store logo via Pillow + R2 CDN

---

## 4. 🟡 Generic Favicon

**File:** [public/vite.svg](file:///z:/books2/frontend/public/vite.svg)

The app uses the default Vite logo as its favicon. Not branded.

**Fix:** Replace with AZ Books branded favicon (`.ico` + `.svg`).

**Status:** `[x]` Commit `48ef6ab` — Removed `vite.svg`, added 32x32 dynamic generation to `pwa_icons.py`, updated `index.html`

---

## 5. 🟡 Service Worker Registration Not Explicit

**File:** [main.jsx](file:///z:/books2/frontend/src/main.jsx)

The `vite-plugin-pwa` config says `registerType: 'autoUpdate'`, which should auto-inject SW registration. But `main.jsx` has no `import { registerSW } from 'virtual:pwa-register'` — it only has legacy SW cleanup code. The auto-injection may work, but there's **no update prompt UI** if a new version is available, and no way to know if the SW actually registered successfully.

**Fix:** Explicit `registerSW` import with `onNeedRefresh` callback for update prompt.

**Status:** `[x]` Completed in commit (pending). Migrated to `prompt` mode with a robust `<PWAPrompt />` global banner that protects state with `window.confirm`, stops offline bricking, and auto-reloads zombie tabs via `controllerchange`.

---

## 6. 🟡 Wrong Theme Color for Dark App

**Files:**
- [index.html](file:///z:/books2/frontend/index.html#L7) — `<meta name="theme-color" content="#ffffff">`
- [manifest.json](file:///z:/books2/frontend/public/manifest.json#L7) — `"theme_color": "#ffffff"`
- [vite.config.js](file:///z:/books2/frontend/vite.config.js#L42) — `theme_color: '#ffffff'`

The app uses a dark theme but all theme color declarations are `#ffffff` (white). On Android, this makes the **status bar and window header white** — visually jarring against the dark UI.

**Fix:** Set theme color to match the app's `--color-bg-primary` (dark value).

**Status:** `[x]` Commit `6463568` — theme_color set to `#111322` (dark theme)

---

## 7. 🟡 Missing iOS Meta Tags

**File:** [index.html](file:///z:/books2/frontend/index.html)

No `apple-mobile-web-app-capable` or `apple-mobile-web-app-status-bar-style` meta tags. iOS Safari users who add to home screen won't get standalone mode or proper status bar styling.

**Fix:** Add iOS-specific meta tags to `index.html`.

**Status:** `[x]` Commit `6463568` — added apple-mobile-web-app-capable + status-bar-style

---

## 8. 🟢 No Install Prompt UX

No `beforeinstallprompt` event handling. Users who visit on mobile Chrome see no guidance to install the app. They'd have to manually find the browser's "Add to Home Screen" option.

**Fix:** Capture the event, show a branded install banner. Low priority — cosmetic.

**Status:** `[x]` Completed in commit (pending). Developed `<PWAInstallPrompt>` UI with OS-specific flows. Captured `beforeinstallprompt` globally in `main.jsx` to prevent React hydration race conditions, and deployed a robust WebView trap detector to stop false iOS flags.

---

## Priority Order (Suggested)

| # | Issue | Severity | Effort |
|---|---|---|---|
| 1 | Stale API Cache | 🔴 Critical | Medium |
| 3 | Missing PWA Icons | 🔴 Blocking | Low (need logo) |
| 2 | Duplicate Manifest | 🟡 Moderate | Trivial |
| 5 | SW Registration | 🟡 Moderate | Low |
| 6 | Theme Color Mismatch | 🟡 Cosmetic | Trivial |
| 7 | iOS Meta Tags | 🟡 Cosmetic | Trivial |
| 4 | Generic Favicon | 🟢 Cosmetic | Low (need logo) |
| 8 | Install Prompt | 🟢 Nice-to-have | Medium |
