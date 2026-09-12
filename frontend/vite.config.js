import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // Only precache the shell — lazy route chunks use browser HTTP cache.
        // Without this, Workbox would precache ALL 70+ chunks on first visit.
        globPatterns: ['**/*.html', '**/workbox-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // runtimeCaching REMOVED (2026-05-07):
        // See commit dabf0aa for full rationale.
      },
      // ── PWA Manifest (SINGLE SOURCE OF TRUTH) ──
      // DO NOT create public/manifest.json — Vite copies public/ to dist/
      // and it would conflict with the auto-generated manifest.webmanifest.
      manifest: {
        name: 'AZ Books',
        short_name: 'AZ Books',
        description: 'AZ Books Management System',
        theme_color: '#111322',
        background_color: '#111322',
        display: 'standalone',
        // Icons served from R2 CDN — generated dynamically from store logo
        // via `python manage.py generate_pwa_icons` or on logo upload.
        // See: settings_app/pwa_icons.py
        icons: [
          {
            src: 'https://media3.circleaz.in/media/store/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://media3.circleaz.in/media/store/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
