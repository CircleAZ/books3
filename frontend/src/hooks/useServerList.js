import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
    } = options;

    const { fetchWithAuth } = useAuth();
    const location = useLocation();

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
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
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
    // Single source of truth: network requests run IF AND ONLY IF query params, location, or refreshIndex change.
    // fetchWithAuth and options are accessed via refs to maintain mathematical referential immunity.
    useEffect(() => {
        // Cancel prior in-flight request on new trigger
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        let isMounted = true;
        setLoading(true);

        const executeFetch = async () => {
            try {
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

                const response = await fetchWithAuthRef.current(
                    `${endpoint}?${cleanParams.toString()}`,
                    { signal: controller.signal }
                );

                if (controller.signal.aborted || !isMounted) return;

                if (response.ok) {
                    const json = await response.json();
                    if (!isMounted || controller.signal.aborted) return;
                    setData(json.results || []);
                    setTotalCount(json.count || 0);
                    setTotalPages(Math.ceil((json.count || 0) / (pageSizeRef.current || DEFAULT_PAGE_SIZE)));
                } else {
                    console.error(`useServerList: fetch failed for ${endpoint}`, response.status);
                }
            } catch (error) {
                if (error.name === 'AbortError') return;
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
            controller.abort();
        };
    }, [endpoint, page, debouncedSearch, filters, location.key, refreshIndex]);

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
