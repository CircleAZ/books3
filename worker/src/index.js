/**
 * AZ Books — Cloudflare Worker (API Gateway)
 * 
 * Version-Aware Adaptive Routing with automatic failover.
 * 
 * Architecture:
 *   User → CF Worker → Reads cached backend ranking
 *                    → Routes to freshest, fastest backend
 *                    → Falls through on failure
 * 
 * Self-Healing:
 *   Cron (every 5 min) → Probes all backends → Extracts version
 *   → Computes consensus (majority = latest deploy)
 *   → Ranks: fresh first, stale last, dead excluded
 *   → Caches ranking in CF Cache API
 * 
 * All instances share the same Neon database (Singapore).
 */

// Render backend instances — static list, ORDER DOES NOT MATTER.
// The cron job dynamically re-ranks these based on version freshness and latency.
const BACKENDS = [
  'https://azbooks.onrender.com',        // Account #1
  'https://azbooks2-xmxe.onrender.com',  // Account #2
  'https://azbooks3.onrender.com',       // Account #3
  'https://azbooks4.onrender.com',       // Account #4
  'https://azbooks5.onrender.com',       // Account #5
];

const BACKEND_TIMEOUT_MS = 8000;  // 8 seconds — if exceeded, try next backend
const PROBE_TIMEOUT_MS = 5000;    // 5 seconds — health probe timeout during cron

// Cache key for storing backend ranking
const RANKING_CACHE_KEY = 'https://internal.azbooks.worker/backend-ranking';

// SWR cache settings for GET requests
const CACHE_MAX_AGE = 60;           // 1 minute fresh
const CACHE_SWR_TTL = 3600;         // 1 hour stale-while-revalidate

// Paths that should NEVER be cached (auth, writes, real-time)
const NO_CACHE_PREFIXES = [
  '/api/token/',
  '/api/account/',
  '/api/health/',
  '/admin/',
  '/api/settings/',
  '/api/inventory/',
  '/api/finance/',
  '/api/orders/',
  '/api/customers/',
  '/api/reports/',
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

    // ── Ranking debug endpoint ──
    if (path === '/worker/ranking') {
      let ranking = await getCachedRanking();
      let source = 'cache';
      if (!ranking) {
        // Force synchronous probe if cache is empty
        const probeResults = await probeAllBackends();
        ranking = computeRanking(probeResults);
        await cacheRanking(ranking);
        source = 'sync_probe';
      }
      return new Response(JSON.stringify({ source, ranking }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── Route to backends with version-aware failover ──
    const response = await routeWithFailover(request, url, ctx);

    // Add CORS headers to all responses
    return addCORSHeaders(response, request);
  },

  /**
   * Cron Trigger — runs every 5 minutes.
   * Probes all backends, determines consensus version, ranks them,
   * and caches the ranking for the fetch handler.
   */
  async scheduled(event, env, ctx) {
    console.log('Cron: Starting version-aware health probe...');
    
    const probeResults = await probeAllBackends();
    const ranking = computeRanking(probeResults);
    
    // Cache the ranking for fetch handler to use
    await cacheRanking(ranking);
    
    console.log('Cron: Ranking cached.', JSON.stringify({
      consensus: ranking.consensusVersion,
      order: ranking.order.map(b => `[${b.index}] ${b.version} ${b.latencyMs}ms`),
      stale: ranking.stale.map(b => `[${b.index}] ${b.version}`),
      dead: ranking.dead.map(b => `[${b.index}]`),
    }));
  }
};


// ══════════════════════════════════════════════
// VERSION-AWARE PROBING & RANKING
// ══════════════════════════════════════════════

/**
 * Probe all backends in parallel. Extract version and measure latency.
 */
async function probeAllBackends() {
  const probes = BACKENDS.map(async (backend, index) => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      
      const res = await fetch(`${backend}/api/health/`, {
        method: 'GET',
        headers: {
          // Browser-like headers to bypass Render's Cloudflare bot protection.
          // Cron context has no client request to inherit headers from,
          // so bare-bones headers get flagged as automated traffic (403).
          'User-Agent': 'Mozilla/5.0 (compatible; AZBooks-VersionProbe/1.0)',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      const latencyMs = Date.now() - start;
      
      if (!res.ok) {
        return { index, url: backend, healthy: false, version: null, latencyMs, status: res.status };
      }
      
      const data = await res.json();
      return {
        index,
        url: backend,
        healthy: true,
        version: data.version || 'unknown',
        latencyMs,
        status: res.status,
      };
    } catch (err) {
      return { index, url: backend, healthy: false, version: null, latencyMs: Date.now() - start, error: err.message };
    }
  });
  
  return Promise.all(probes);
}


/**
 * Compute the consensus version and rank backends.
 * 
 * Consensus = the version reported by the MOST backends.
 * This is the "latest successful deploy" since new deploys propagate to most nodes.
 * 
 * Ranking priority:
 *   1. Healthy + consensus version (sorted by latency — fastest first)
 *   2. Healthy + non-consensus version (stale but alive — last resort)
 *   3. Dead backends — excluded entirely
 */
function computeRanking(probeResults) {
  const healthy = probeResults.filter(p => p.healthy);
  const dead = probeResults.filter(p => !p.healthy);
  
  // Count version occurrences
  const versionCounts = {};
  for (const p of healthy) {
    versionCounts[p.version] = (versionCounts[p.version] || 0) + 1;
  }
  
  // Consensus = most common version among healthy backends
  let consensusVersion = 'unknown';
  let maxCount = 0;
  for (const [version, count] of Object.entries(versionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      consensusVersion = version;
    }
  }
  
  // Split healthy into fresh (consensus) and stale (non-consensus)
  const fresh = healthy
    .filter(p => p.version === consensusVersion)
    .sort((a, b) => a.latencyMs - b.latencyMs); // fastest first
  
  const stale = healthy
    .filter(p => p.version !== consensusVersion)
    .sort((a, b) => a.latencyMs - b.latencyMs);
  
  // Final order: fresh first, then stale
  const order = [...fresh, ...stale];
  
  return {
    consensusVersion,
    versionCounts,
    order,
    stale,
    dead,
    timestamp: Date.now(),
  };
}


/**
 * Cache the computed ranking in the CF Cache API.
 */
async function cacheRanking(ranking) {
  try {
    const cache = caches.default;
    const response = new Response(JSON.stringify(ranking), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600', // 10 min TTL (cron runs every 5)
      },
    });
    await cache.put(new Request(RANKING_CACHE_KEY), response);
  } catch (e) {
    console.error('Failed to cache ranking:', e.message);
  }
}


/**
 * Read the cached ranking. Returns null if cache is empty/expired.
 */
async function getCachedRanking() {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(RANKING_CACHE_KEY));
    if (cached) {
      return cached.json();
    }
  } catch (e) {
    // Cache read failure — non-critical
  }
  return null;
}


// ══════════════════════════════════════════════
// REQUEST ROUTING
// ══════════════════════════════════════════════

/**
 * Route request using cached ranking. Falls back to default order if no ranking.
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

  // ── Get ranked backend order ──
  const ranking = await getCachedRanking();
  let orderedBackends;
  
  if (ranking && ranking.order && ranking.order.length > 0) {
    // Use version-aware ranking
    orderedBackends = ranking.order.map(b => ({ url: b.url || BACKENDS[b.index], index: b.index }));
    
    // Append any backends not in the ranking (edge case: new backend added)
    const rankedIndices = new Set(orderedBackends.map(b => b.index));
    for (let i = 0; i < BACKENDS.length; i++) {
      if (!rankedIndices.has(i)) {
        orderedBackends.push({ url: BACKENDS[i], index: i });
      }
    }
  } else {
    // No ranking cached — use default order
    orderedBackends = BACKENDS.map((url, index) => ({ url, index }));
  }

  // ── Buffer body to allow multiple retries ──
  let bodyBuffer = undefined;
  if (!isGET && request.method !== 'HEAD') {
    try {
      bodyBuffer = await request.clone().arrayBuffer();
    } catch(e) {
      // Body might be empty or unreadable
    }
  }

  // ── Try each backend in ranked order ──
  let lastError = null;

  for (const backend of orderedBackends) {
    try {
      const backendUrl = backend.url + url.pathname + url.search;
      
      const controller = new AbortController();
      // Login POST requests might take longer due to password hashing + cold starts
      const timeoutMs = isGET ? BACKEND_TIMEOUT_MS : 15000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const newHeaders = new Headers(request.headers);
      newHeaders.set('X-Forwarded-Host', url.host);

      const backendRequest = new Request(backendUrl, {
        method: request.method,
        headers: newHeaders,
        body: bodyBuffer,
        signal: controller.signal,
        redirect: 'manual',
      });

      const response = await fetch(backendRequest);
      clearTimeout(timeout);

      // If backend returned an infrastructure-level error, try next.
      // 403 = Render/Cloudflare bot protection block (not a Django 403)
      // 502-504 = backend down, deploying, or overloaded
      if (response.status === 403 || (response.status >= 502 && response.status <= 504)) {
        lastError = new Error(`Backend ${backend.index} returned ${response.status}`);
        continue;
      }

      // Success — cache GET responses at the edge
      if (isGET && response.ok && !isNoCachePath(path)) {
        const responseToCache = response.clone();
        ctx.waitUntil(cacheResponse(url, responseToCache));
      }

      // Tag which backend served this request
      const resp = new Response(response.body, response);
      resp.headers.set('X-Backend', `${backend.index}`);
      resp.headers.set('X-Cache', 'MISS');

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
    backends_tried: orderedBackends.length,
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}


// ══════════════════════════════════════════════
// CACHING UTILITIES
// ══════════════════════════════════════════════

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


// ══════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Idempotency-Key',
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
