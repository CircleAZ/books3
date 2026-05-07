import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ISSUE #8: Catch beforeinstallprompt globally BEFORE React hydrates to prevent race conditions
window.deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredInstallPrompt = e;
    // Dispatch a custom event so the React component knows it's ready if it's already mounted
    window.dispatchEvent(new Event('app-install-prompt-ready'));
});

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

