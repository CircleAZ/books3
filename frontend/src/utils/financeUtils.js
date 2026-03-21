/**
 * Shared finance utility functions.
 * Extracted from individual pages to eliminate duplication (P3 Fix 9.3).
 */

/**
 * Format a number in Indian locale with 2 decimal places.
 * @param {number|string} value - The value to format
 * @returns {string} Formatted string like "1,23,456.78"
 */
export function formatINR(value) {
    return parseFloat(value || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Parse API error response into a user-friendly string.
 * @param {object|string} data - API response data
 * @returns {string} Human-readable error message
 */
export function parseApiError(data) {
    if (!data) return 'An unknown error occurred.';
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.error) return data.error;
    // Flatten field errors
    const messages = [];
    for (const [field, errs] of Object.entries(data)) {
        const errStr = Array.isArray(errs) ? errs.join(', ') : errs;
        messages.push(`${field}: ${errStr}`);
    }
    return messages.join(' | ') || JSON.stringify(data);
}
