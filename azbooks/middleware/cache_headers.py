"""
SWR Cache Middleware for Cloudflare Edge Caching.

Adds Cache-Control headers with stale-while-revalidate to safe,
business-scoped GET endpoints. Cloudflare's native SWR support
handles background revalidation automatically.

Security constraints (V.O.R.T.E.X. approved):
- Only 200 OK responses are cached
- Responses with Set-Cookie are never cached
- Only GET requests are cached
- Never caches auth endpoints, health checks, or write-heavy endpoints
"""


class SWRCacheMiddleware:
    """Add stale-while-revalidate Cache-Control headers for Cloudflare."""

    # Prefix → max-age (seconds fresh at edge)
    # stale-while-revalidate is always 1 hour (3600s)
    CACHEABLE_ROUTES = {
        '/api/dashboard/stats/': 60,
        '/api/dashboard/top-products/': 120,
        '/api/dashboard/sales-trend/': 120,
        '/api/dashboard/alerts/': 60,
        '/api/inventory/products/': 120,
        '/api/inventory/categories/': 300,
        '/api/inventory/vendors/': 300,
        '/api/customers/customers/map_data/': 300,
        '/api/reports/': 120,
        '/api/settings/store/': 600,
    }

    # NEVER cache these (V.O.R.T.E.X. directive)
    EXCLUDED_PREFIXES = (
        '/api/account/',
        '/api/token/',
        '/api/health/',
        '/api/orders/',       # Write-heavy, real-time
        '/api/finance/',      # Sensitive financial data
        '/api/messaging/',    # Stateful
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
            response['Cache-Control'] = (
                f'public, max-age={max_age}, '
                f'stale-while-revalidate={self.STALE_TTL}'
            )
            response['Vary'] = 'Accept-Encoding'

        return response

    def _get_max_age(self, path):
        """Match path against cacheable routes. Supports prefix matching."""
        for prefix, ttl in self.CACHEABLE_ROUTES.items():
            if path.startswith(prefix):
                return ttl
        return None
