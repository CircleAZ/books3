/**
 * Shared utilities for Customer Map & Coverage List
 */

const STORAGE_KEY = 'az_map_filters';
const COVERAGE_CACHE_KEY = 'az_coverage_data';

// ── Filter persistence ──

export function saveFilters(filters) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (e) {
        // localStorage full — fail silently
    }
}

export function loadFilters() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

// ── Coverage List offline cache ──

export function saveCoverageCache(data) {
    try {
        localStorage.setItem(COVERAGE_CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now(),
        }));
    } catch (e) {
        // localStorage full
    }
}

export function loadCoverageCache() {
    try {
        const raw = localStorage.getItem(COVERAGE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            data: parsed.data,
            timestamp: parsed.timestamp,
            age: Date.now() - parsed.timestamp,
        };
    } catch (e) {
        return null;
    }
}

// ── Season helpers ──

function getCurrentSeasonYear() {
    const now = new Date();
    // Season = Dec → Nov. If Dec+, current season started this year.
    return now.getMonth() >= 11 ? now.getFullYear() : now.getFullYear() - 1;
}

function getSeasonLabel(year) {
    return `Dec ${year} – Nov ${year + 1}`;
}

// ── Build query string from filter state ──

export function buildFilterQuery(filters) {
    const params = new URLSearchParams();
    if (filters.season) params.set('season', filters.season);
    if (filters.village) params.set('village', filters.village);
    if (filters.status && filters.status.length > 0 && filters.status.length < 6) {
        params.set('status', filters.status.join(','));
    }
    if (filters.group) params.set('group', filters.group);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

// ── Time formatting for offline banner ──

export function formatCacheAge(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
