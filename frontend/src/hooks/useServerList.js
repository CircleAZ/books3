import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_DEBOUNCE_MS = 300;

/**
 * useServerList — standardized hook for server-side paginated list pages.
 *
 * Handles: pagination state, debounced search, filter state, AbortController
 * request cancellation, DRF paginated response parsing, and location-key refetch.
 *
 * @param {string} endpoint - API endpoint URL (from ENDPOINTS config)
 * @param {Object} options
 * @param {Object}  [options.filterConfig={}]  - Initial filter shape, e.g. { status: '', category: '' }
 * @param {number}  [options.pageSize=20]      - Expected DRF PAGE_SIZE for totalPages calculation
 * @param {number}  [options.debounceMs=300]   - Debounce delay for search input (ms)
 * @param {Function} [options.buildParams]     - (debouncedSearch, filters) => URLSearchParams or plain object.
 *                                               Maps filter keys to backend query param names.
 *                                               If omitted, filter keys are sent as-is + 'search' param.
 *
 * @returns {Object} { data, loading, totalPages, totalCount, page, setPage,
 *                     search, setSearch, filters, setFilter, clearFilters,
 *                     isFilterActive, refresh }
 */
export default function useServerList(endpoint, options = {}) {
    const {
        filterConfig = {},
        pageSize = DEFAULT_PAGE_SIZE,
        debounceMs = DEFAULT_DEBOUNCE_MS,
        buildParams,
        initialSearch = '',
    } = options;

    const { fetchWithAuth } = useAuth();

    // Stable refs for options that may be passed unmemoized from callers
    const buildParamsRef = useRef(buildParams);
    buildParamsRef.current = buildParams;

    const filterConfigRef = useRef(filterConfig);
    filterConfigRef.current = filterConfig;

    const pageSizeRef = useRef(pageSize);
    pageSizeRef.current = pageSize;

    // --- State ---
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState(initialSearch);
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
    const [filters, setFilters] = useState({ ...filterConfig });

    const abortControllerRef = useRef(null);

    // --- Debounced search ---
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1); // Reset page on search change (batched with debounce)
        }, debounceMs);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]); // debounceMs is stable (from options on mount)

    // --- Filter helpers ---
    const setFilter = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    }, []);

    const clearFilters = useCallback(() => {
        setFilters({ ...filterConfigRef.current });
        setSearch('');
        setDebouncedSearch('');
        setPage(1);
    }, []);

    const isFilterActive = search !== '' || Object.values(filters).some(v => v !== '');

    // Ref for fetchWithAuth to prevent network refetch cascades on auth context re-renders
    const fetchWithAuthRef = useRef(fetchWithAuth);
    useEffect(() => {
        fetchWithAuthRef.current = fetchWithAuth;
    }, [fetchWithAuth]);

    // Explicit refresh trigger index
    const [refreshIndex, setRefreshIndex] = useState(0);

// --- Data fetching ---
    // Invariant refs for deduplication and idempotent network scheduling
    const lastFetchedUrlRef = useRef('');
    const inFlightUrlRef = useRef('');
    const lastRefreshIndexRef = useRef(0);

    // Stringify filters to guarantee primitive value comparison in useEffect dependency array
    const filtersKey = JSON.stringify(filters);

    useEffect(() => {
        let queryParams;

        if (buildParamsRef.current) {
            // Consumer provides custom param mapping
            const customParams = buildParamsRef.current(debouncedSearch, filters);
            queryParams = customParams instanceof URLSearchParams
                ? customParams
                : new URLSearchParams(customParams);
        } else {
            // Default: send filter keys as-is + search
            queryParams = new URLSearchParams({
                search: debouncedSearch,
                ...filters,
            });
        }

        // Always inject page
        queryParams.set('page', page);

        // Remove empty params to keep URLs clean
        const cleanParams = new URLSearchParams();
        for (const [key, value] of queryParams.entries()) {
            if (value !== '' && value !== undefined && value !== null) {
                cleanParams.append(key, value);
            }
        }

        const targetUrl = `${endpoint}?${cleanParams.toString()}`;
        const isManualRefresh = refreshIndex !== lastRefreshIndexRef.current;
        lastRefreshIndexRef.current = refreshIndex;

        // DEDUPLICATION GATE:
        // 1. If this exact query is already fetched and rendered (and it's NOT an explicit manual refresh), bail out!
        if (!isManualRefresh && targetUrl === lastFetchedUrlRef.current) {
            return;
        }

        // 2. If this exact query is ALREADY IN FLIGHT, do not cancel and re-trigger identical work!
        if (!isManualRefresh && targetUrl === inFlightUrlRef.current) {
            return;
        }

        // 3. New query parameter target: abort prior in-flight request if different
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        inFlightUrlRef.current = targetUrl;

        let isMounted = true;
        setLoading(true);

        const executeFetch = async () => {
            try {
                const response = await fetchWithAuthRef.current(targetUrl, {
                    signal: controller.signal,
                });

                if (controller.signal.aborted || !isMounted) return;

                if (response.ok) {
                    const json = await response.json();
                    if (!isMounted || controller.signal.aborted) return;
                    lastFetchedUrlRef.current = targetUrl;
                    inFlightUrlRef.current = '';
                    setData(json.results || []);
                    setTotalCount(json.count || 0);
                    setTotalPages(Math.ceil((json.count || 0) / (pageSizeRef.current || DEFAULT_PAGE_SIZE)));
                } else {
                    inFlightUrlRef.current = '';
                    console.error(`useServerList: fetch failed for ${endpoint}`, response.status);
                }
            } catch (error) {
                if (error.name === 'AbortError') return;
                inFlightUrlRef.current = '';
                console.error(`useServerList: error fetching ${endpoint}`, error);
            } finally {
                if (isMounted && !controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        executeFetch();

        return () => {
            isMounted = false;
            // Only abort if this controller is still the active in-flight request
            if (abortControllerRef.current === controller) {
                controller.abort();
                inFlightUrlRef.current = '';
            }
        };
    }, [endpoint, page, debouncedSearch, filtersKey, refreshIndex]);

    // --- Refresh (re-fetch current state) ---
    const refresh = useCallback(() => {
        setRefreshIndex(prev => prev + 1);
    }, []);

    return {
        data,
        loading,
        totalPages,
        totalCount,
        page,
        setPage,
        search,
        setSearch,
        filters,
        setFilter,
        clearFilters,
        isFilterActive,
        refresh,
    };
}
