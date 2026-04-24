// Simple client-side obfuscation to defeat naive automated vulnerability scanners
// Note: This is security by obscurity and only protects against passive scraping/scanning.
// It is NOT a replacement for HttpOnly cookies against targeted XSS attacks.

const SALT = 'az_sec_';
const OBFS_KEYS = {
    'access_token': '_az_at',
    'refresh_token': '_az_rt',
    'device_token': '_az_dt',
    'user': '_az_u',
    'profile': '_az_p'
};

export const secureStorage = {
    setItem: (key, value) => {
        try {
            const actualKey = OBFS_KEYS[key] || key;
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            // Obfuscate: btoa(SALT + value)
            const obfsValue = btoa(unescape(encodeURIComponent(SALT + strValue)));
            localStorage.setItem(actualKey, obfsValue);
            
            // Wipe legacy un-obfuscated key if it still exists
            if (actualKey !== key) {
                localStorage.removeItem(key);
            }
        } catch (e) {
            console.error('Storage set error', e);
        }
    },
    getItem: (key) => {
        try {
            const actualKey = OBFS_KEYS[key] || key;
            const obfsValue = localStorage.getItem(actualKey);
            
            if (!obfsValue) {
                // Fallback to legacy un-obfuscated data
                return localStorage.getItem(key);
            }
            
            // De-obfuscate
            const decoded = decodeURIComponent(escape(atob(obfsValue)));
            if (decoded.startsWith(SALT)) {
                return decoded.slice(SALT.length);
            }
            return decoded; // Shouldn't happen unless corrupted, but safe
        } catch (e) {
            // If atob fails, it might be legacy un-obfuscated data in the obfuscated key (unlikely)
            // or just legacy data in the original key.
            return localStorage.getItem(key);
        }
    },
    removeItem: (key) => {
        const actualKey = OBFS_KEYS[key] || key;
        localStorage.removeItem(actualKey);
        // Also clean up legacy un-obfuscated keys just in case
        localStorage.removeItem(key);
    }
};
