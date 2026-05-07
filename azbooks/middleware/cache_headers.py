"""
SWR Cache Middleware for Cloudflare Edge Caching.

Adds Cloudflare-CDN-Cache-Control headers with stale-while-revalidate
to safe, business-scoped GET endpoints. Cloudflare reads these headers
for edge caching decisions, then STRIPS them before forwarding to the
browser — preventing browser-level shared caching of authenticated data.

Security constraints:
- Only 200 OK responses are cached
- Responses with Set-Cookie are never cached
- Only GET requests are cached
- Never caches auth, orders, finance, messaging, or outlet endpoints
- Browser sees Cache-Control: private, no-cache (always revalidates)
- Cloudflare sees Cloudflare-CDN-Cache-Control: public, max-age=X

History:
- 2026-05-07: Switched from Cache-Control: public to Cloudflare-CDN-Cache-Control
              to prevent cross-user CDN cache leakage via Authorization header bypass.
              Split routes into exact-match and prefix-match categories.
              Added /api/outlets/ and /api/inventory/stock to exclusions.
              Reduced /api/inventory/products/ TTL from 120s to 30s.
"""


class SWRCacheMiddleware:
    """Add Cloudflare-CDN-Cache-Control headers for edge caching."""

    # Exact-match routes: only the exact path gets cached (not sub-paths)
    # e.g., /api/inventory/products/ is cached, /api/inventory/products/42/ is NOT
    CACHEABLE_EXACT_ROUTES = {
        '/api/dashboard/stats/': 60,
        '/api/dashboard/top-products/': 120,
        '/api/dashboard/sales-trend/': 120,
        '/api/dashboard/alerts/': 60,
        '/api/inventory/products/': 30,       # Reduced from 120s — prices change mid-season
        '/api/inventory/categories/': 300,
        '/api/inventory/vendors/': 300,
        '/api/customers/customers/map_data/': 300,
    }

    # Prefix-match routes: any path starting with this prefix gets cached
    # Used for report sub-endpoints (/api/reports/sales/, /api/reports/inventory/, etc.)
    CACHEABLE_PREFIX_ROUTES = {
        '/api/reports/': 120,
    }

    # NEVER cache these
    EXCLUDED_PREFIXES = (
        '/api/account/',
        '/api/token/',
        '/api/health/',
        '/api/orders/',       # Write-heavy, real-time
        '/api/finance/',      # Sensitive financial data
        '/api/messaging/',    # Stateful
        '/api/outlets/',      # Consignment data, real-time
        '/api/inventory/stock',  # stock-history, stock-adjustments — real-time
        '/admin/',
    )

    STALE_TTL = 3600  # Serve stale for up to 1 hour while revalidating

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Only cache GET requests
        if request.method != 'GET':
            return response

        # Only cache 200 OK
        if response.status_code != 200:
            return response

        # Never cache responses with Set-Cookie (session leakage prevention)
        if response.has_header('Set-Cookie'):
            return response

        # Check exclusions first
        path = request.path
        if path.startswith(self.EXCLUDED_PREFIXES):
            return response

        # Check if path matches a cacheable route
        max_age = self._get_max_age(path)
        if max_age is not None:
            # Browser: always revalidate, never use shared cache
            response['Cache-Control'] = 'private, no-cache'
            # Cloudflare: cache at edge, stripped before reaching browser
            response['Cloudflare-CDN-Cache-Control'] = (
                f'public, max-age={max_age}, '
                f'stale-while-revalidate={self.STALE_TTL}'
            )
            response['Vary'] = 'Accept-Encoding'

        return response

    def _get_max_age(self, path):
        """Match path against cacheable routes.

        Exact routes match only the exact path (with optional query string).
        Prefix routes match any path starting with the prefix.
        """
        # Check exact routes first (higher priority)
        if path in self.CACHEABLE_EXACT_ROUTES:
            return self.CACHEABLE_EXACT_ROUTES[path]

        # Check prefix routes
        for prefix, ttl in self.CACHEABLE_PREFIX_ROUTES.items():
            if path.startswith(prefix):
                return ttl

        return None
"""
    Cloudflare strips these headers because of the "Cloudflare-" prefix:
    https://developers.cloudflare.com/cache/concepts/cache-control/
"""
