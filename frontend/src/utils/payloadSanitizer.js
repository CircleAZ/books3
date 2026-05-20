/**
 * Payload Sanitizer — Frontera Protocol Layer 1
 *
 * Ensures the frontend never sends empty strings for nullable FK/numeric
 * fields. This is the first line of defense; the backend serializer
 * to_internal_value coercion is the second (infallible) layer.
 *
 * Usage:
 *   import { sanitizeFKFields, sanitizeNumericFields } from '../utils/payloadSanitizer';
 *   const payload = { customer_group: '', amount: '' };
 *   sanitizeFKFields(payload, ['customer_group']);
 *   sanitizeNumericFields(payload, ['amount']);
 *   // Result: { customer_group: null, amount: null }
 */

/**
 * Converts empty strings to null for specified FK (foreign key) fields.
 * Mutates the object in place for efficiency.
 *
 * @param {Object} obj - The payload object to sanitize
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} The same object (mutated in place)
 */
export function sanitizeFKFields(obj, fields) {
    if (!obj || typeof obj !== 'object') return obj;
    for (const field of fields) {
        if (field in obj && (obj[field] === '' || obj[field] === undefined)) {
            obj[field] = null;
        }
    }
    return obj;
}

/**
 * Converts empty/invalid strings to null for specified numeric fields.
 * Mutates the object in place.
 *
 * @param {Object} obj - The payload object to sanitize
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} The same object (mutated in place)
 */
export function sanitizeNumericFields(obj, fields) {
    if (!obj || typeof obj !== 'object') return obj;
    for (const field of fields) {
        if (field in obj) {
            const val = obj[field];
            if (val === '' || val === undefined || val === null) {
                obj[field] = null;
            } else {
                const parsed = parseFloat(val);
                obj[field] = isNaN(parsed) ? null : parsed;
            }
        }
    }
    return obj;
}

/**
 * Sanitizes a student object's FK fields.
 * Used for both primary and additional student entries.
 *
 * @param {Object} student - A student payload object
 * @returns {Object} The same object (mutated in place)
 */
export function sanitizeStudentFKs(student) {
    return sanitizeFKFields(student, ['school', 'class_obj', 'division', 'subdivision']);
}

/**
 * Trims and sanitizes financial fields, returning precise base-10 strings
 * rather than floating-point numbers to prevent binary rounding drift.
 * Mutates the object in place.
 *
 * @param {Object} obj - The payload object to sanitize
 * @param {string[]} fields - Array of field names to check
 * @returns {Object} The same object (mutated in place)
 */
export function sanitizeDecimalFields(obj, fields) {
    if (!obj || typeof obj !== 'object') return obj;
    for (const field of fields) {
        if (field in obj) {
            const val = obj[field];
            if (val === '' || val === undefined || val === null) {
                obj[field] = null;
            } else {
                const trimmed = String(val).trim();
                // Ensure it represents a valid decimal number
                obj[field] = isNaN(parseFloat(trimmed)) ? null : trimmed;
            }
        }
    }
    return obj;
}
