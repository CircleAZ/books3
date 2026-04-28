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
        runtimeCaching: [
          // ── GET requests: NetworkFirst with 5s timeout ──
          // Serves cached API data when offline (read-only offline)
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60, // 24 hours
              },
            },
          },
          // ── Mutating requests: NetworkOnly, NO BackgroundSync ──
          // BackgroundSync is UNSAFE for non-idempotent operations.
          // It replays requests on network recovery without knowing if the
          // server already processed the original — causing duplicate orders,
          // payments, and stock deductions. Failed mutations must surface
          // errors to the user so they can retry manually with full context.
        ],
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
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
