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
          // ── POST requests: NetworkOnly + BackgroundSync ──
          // Queues failed POST requests (create order, add customer, etc.)
          // and replays them when connectivity returns
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'offline-post-queue',
                options: {
                  maxRetentionTime: 24 * 60, // 24 hours in minutes
                },
              },
            },
          },
          // ── PUT requests: NetworkOnly + BackgroundSync ──
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkOnly',
            method: 'PUT',
            options: {
              backgroundSync: {
                name: 'offline-put-queue',
                options: {
                  maxRetentionTime: 24 * 60,
                },
              },
            },
          },
          // ── PATCH requests: NetworkOnly + BackgroundSync ──
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkOnly',
            method: 'PATCH',
            options: {
              backgroundSync: {
                name: 'offline-patch-queue',
                options: {
                  maxRetentionTime: 24 * 60,
                },
              },
            },
          },
          // ── DELETE requests: NetworkOnly + BackgroundSync ──
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkOnly',
            method: 'DELETE',
            options: {
              backgroundSync: {
                name: 'offline-delete-queue',
                options: {
                  maxRetentionTime: 24 * 60,
                },
              },
            },
          },
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
