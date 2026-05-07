import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // runtimeCaching REMOVED (2026-05-07):
        // Workbox NetworkFirst cached ALL /api/ GET responses in CacheStorage
        // for 24 hours. cache:'no-store' in fetchWithAuth does NOT prevent
        // CacheStorage writes (only browser HTTP cache). During Render cold
        // starts (>5s), Workbox served stale prices/stock/balances silently.
        // Static asset precaching (index.html, CSS, JS) is unaffected.
      },
      // includeAssets: add here when brand icons land in public/
      // ── PWA Manifest (SINGLE SOURCE OF TRUTH) ──
      // DO NOT create public/manifest.json — Vite copies public/ to dist/
      // and it would conflict with the auto-generated manifest.webmanifest.
      manifest: {
        name: 'AZ Books',
        short_name: 'AZ Books',
        description: 'AZ Books Management System',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
