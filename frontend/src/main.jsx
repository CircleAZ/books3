import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA Service Worker — Cleanup legacy registrations
// The Workbox SW (sw.js) is auto-registered by vite-plugin-pwa.
// This block unregisters the old static service-worker.js if still active.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const reg of registrations) {
      // Keep only the Workbox-generated sw.js; unregister everything else
      if (reg.active && !reg.active.scriptURL.endsWith('/sw.js')) {
        reg.unregister().then(() => {
          console.log('Unregistered legacy SW:', reg.active?.scriptURL);
        });
      }
    }
  });
}
