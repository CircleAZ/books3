/**
 * AZ Books — Cloudflare Worker (API Gateway)
 * 
 * Routes API requests to 3 Render instances with automatic failover.
 * Implements SWR edge caching for GET requests and background warm-up.
 * 
 * Architecture:
 *   User → CF Worker → Primary Render (8s timeout)
 *                    → Backup 1 (8s timeout)  
 *                    → Backup 2 (8s timeout)
 * 
 * All 3 instances share the same Neon database (Singapore).
 */

// Render backend instances — update these after creating accounts #2 and #3
const BACKENDS = [
  'https://azbooks.onrender.com',      // Account #1 — Primary
  'https://azbooks-b.onrender.com',    // Account #2 — Backup 1
  'https://azbooks-c.onrender.com',    // Account #3 — Backup 2
];

const BACKEND_TIMEOUT_MS = 8000;  // 8 seconds — if exceeded, try next backend

// SWR cache settings for GET requests
const CACHE_MAX_AGE = 60;           // 1 minute fresh
const CACHE_SWR_TTL = 3600;         // 1 hour stale-while-revalidate

// Paths that should NEVER be cached (auth, writes, real-time)
const NO_CACHE_PREFIXES = [
  '/api/token/',
  '/api/account/',
  '/api/health/',
  '/admin/',
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS Preflight ──
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // ── Health check for the Worker itself ──
    if (path === '/worker/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        backends: BACKENDS.length,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── Route to backends with failover ──
    const response = await routeWithFailover(request, url, ctx);

    // Add CORS headers to all responses
    return addCORSHeaders(response, request);
  }
};


/**
 * Try each backend in order. If one fails or times out, try the next.
 * For GET requests, check edge cache first and use SWR strategy.
 */
async function routeWithFailover(request, url, ctx) {
  const isGET = request.method === 'GET';
  const path = url.pathname;

  // ── SWR Cache for GET requests ──
  if (isGET && !isNoCachePath(path)) {
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    
    const cached = await cache.match(cacheKey);
    if (cached) {
      const age = cached.headers.get('X-Cache-Time');
      const cacheTime = age ? parseInt(age) : 0;
      const now = Math.floor(Date.now() / 1000);
      
      if (now - cacheTime < CACHE_MAX_AGE) {
        // Fresh — serve directly
        const resp = new Response(cached.body, cached);
        resp.headers.set('X-Cache', 'HIT');
        return resp;
      }
      
      if (now - cacheTime < CACHE_MAX_AGE + CACHE_SWR_TTL) {
        // Stale but within SWR window — serve stale, revalidate in background
        ctx.waitUntil(revalidateCache(request, url, cache, cacheKey));
        const resp = new Response(cached.body, cached);
        resp.headers.set('X-Cache', 'STALE');
        return resp;
      }
    }
  }

  // ── Try each backend ──
  let lastError = null;

  for (let i = 0; i < BACKENDS.length; i++) {
    const backend = BACKENDS[i];
    
    try {
      const backendUrl = backend + url.pathname + url.search;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

      const backendRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? request.body 
          : undefined,
        signal: controller.signal,
        redirect: 'follow',
      });

      const response = await fetch(backendRequest);
      clearTimeout(timeout);

      // If backend returned 502/503/504, try next
      if (response.status >= 502 && response.status <= 504) {
        lastError = new Error(`Backend ${i} returned ${response.status}`);
        continue;
      }

      // Success — cache GET responses at the edge
      if (isGET && response.ok && !isNoCachePath(path)) {
        const responseToCache = response.clone();
        ctx.waitUntil(cacheResponse(url, responseToCache));
      }

      // Tag which backend served this request
      const resp = new Response(response.body, response);
      resp.headers.set('X-Backend', `${i}`);
      resp.headers.set('X-Cache', 'MISS');

      // Background: warm up other backends to prevent sleep
      if (i === 0) {
        ctx.waitUntil(warmUpBackends(1));
      }

      return resp;

    } catch (err) {
      lastError = err;
      // Timeout or network error — try next backend
      continue;
    }
  }

  // All backends failed
  return new Response(JSON.stringify({
    error: 'All backends unavailable',
    message: 'Please try again in 30 seconds. The system is warming up.',
    backends_tried: BACKENDS.length,
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}


/**
 * Cache a successful GET response at the CF edge.
 */
async function cacheResponse(url, response) {
  try {
    const cache = caches.default;
    const body = await response.arrayBuffer();
    
    const cachedResponse = new Response(body, {
      status: response.status,
      headers: response.headers,
    });
    
    cachedResponse.headers.set('X-Cache-Time', String(Math.floor(Date.now() / 1000)));
    cachedResponse.headers.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE + CACHE_SWR_TTL}`);
    
    const cacheKey = new Request(url.toString());
    await cache.put(cacheKey, cachedResponse);
  } catch (e) {
    // Cache write failure is non-critical
  }
}


/**
 * Revalidate a stale cache entry in the background.
 */
async function revalidateCache(request, url, cache, cacheKey) {
  try {
    const response = await routeWithFailover(
      new Request(url.toString(), { method: 'GET', headers: request.headers }),
      url,
      { waitUntil: () => {} }  // No nested waitUntil
    );
    
    if (response.ok) {
      await cacheResponse(url, response.clone());
    }
  } catch (e) {
    // Revalidation failure is non-critical — stale data continues serving
  }
}


/**
 * Ping backends in the background to keep them warm.
 * Starts from the given index to avoid pinging the one that just responded.
 */
async function warmUpBackends(startIndex) {
  const warmUpPromises = [];
  
  for (let i = startIndex; i < BACKENDS.length; i++) {
    warmUpPromises.push(
      fetch(`${BACKENDS[i]}/api/health/`, {
        method: 'GET',
        headers: { 'User-Agent': 'AZBooks-Worker-Warmup' },
      }).catch(() => {})  // Ignore failures
    );
  }
  
  await Promise.allSettled(warmUpPromises);
}


/**
 * Check if a path should never be cached.
 */
function isNoCachePath(path) {
  return NO_CACHE_PREFIXES.some(prefix => path.startsWith(prefix));
}


/**
 * Handle CORS preflight requests.
 */
function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = [
    'https://books.circleaz.in',
    'https://circleaz.in',
    'https://www.circleaz.in',
    'http://localhost:5173',
    'http://localhost:3000',
  ];

  const responseHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };

  if (allowedOrigins.includes(origin)) {
    responseHeaders['Access-Control-Allow-Origin'] = origin;
  }

  return new Response(null, { status: 204, headers: responseHeaders });
}


/**
 * Add CORS headers to proxied responses.
 */
function addCORSHeaders(response, request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = [
    'https://books.circleaz.in',
    'https://circleaz.in',
    'https://www.circleaz.in',
    'http://localhost:5173',
    'http://localhost:3000',
  ];

  const newResponse = new Response(response.body, response);
  
  if (allowedOrigins.includes(origin)) {
    newResponse.headers.set('Access-Control-Allow-Origin', origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return newResponse;
}
