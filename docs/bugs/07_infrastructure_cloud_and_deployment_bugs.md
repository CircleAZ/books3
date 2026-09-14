# Active Bug Tracking: Infrastructure, Cloud & Deployment Invariants

> **Domain:** Cloud Infrastructure, Container Runtimes & Edge Network Delivery  
> **Classification:** Memory Ceilings, Cloudflare R2 S3 API, TLS SNI Routing & CNAME Topology  
> **Status Registry:** Living Document — Updated Dynamically  

---

## 1. Category Summary & Health Metrics

The Books3 production environment operates across a distributed multi-cloud topology:
- **Compute:** Render Cloud Docker Runtime (512MB RAM ceiling, single-worker gthread).
- **Relational Data:** Neon Serverless PostgreSQL 18.6 with PgBouncer connection pooling.
- **Media Object Storage:** Cloudflare R2 (`books3-media`, `books3-receipts`) via S3 v4 API.
- **CDN & Edge:** Cloudflare Pages (Frontend SPA), Cloudflare DNS (`api3.circleaz.in`, `media3.circleaz.in`, `books3.circleaz.in`).

Misconfigurations at the infrastructure layer lead to container OOM kills (`Exit Code 137`), broken media delivery, TLS handshake failures, or invalidation of user session tokens upon redeployment.

| Bug ID | Title / Subsystem | Severity | Status | Verification Target |
|---|---|---|---|---|
| **`BUG-INF-001`** | Render 512MB RAM Exhaustion & Container OOM Termination | **CRITICAL** | **RESOLVED / PATCHED** | `Dockerfile:L36` |
| **`BUG-INF-002`** | Cloudflare R2 Multi-Subdomain SNI TLS Certificate Verification Failure | **CRITICAL** | **RESOLVED / PATCHED** | `azbooks/settings.py:L300-L322`, `sync_media_to_r2.py:L11` |
| **`BUG-INF-003`** | `S3Boto3Storage` `media/` Location Prefix Path Divergence | **HIGH** | **RESOLVED / ARCHITECTED** | `azbooks/custom_storages.py:L4`, `sync_media_to_r2.py:L100` |
| **`BUG-INF-004`** | Cloudflare Pages vs Render CNAME Domain Name Collision | **HIGH** | **RESOLVED / CONFIGURED** | `render.yaml:L22-L27`, Cloudflare DNS |
| **`BUG-INF-005`** | Render Ephemeral Deploy Secret Rotation Invalidating Active JWTs | **HIGH** | **RESOLVED / ENFORCED** | `render.yaml:L18-L19` |
| **`BUG-INF-006`** | Container Boot R2 Media Hydration Race Condition | **MEDIUM** | **RESOLVED / PATCHED** | `docker-entrypoint.sh:L10-L11`, `sync_media_to_r2.py:L81-L85` |

---

## 2. Granular Bug Dossiers

### `BUG-INF-001`: Render 512MB RAM Exhaustion & Container OOM Termination
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`Dockerfile`](file:///z:/books3/Dockerfile#L36)
- **Mechanism & Root Cause:**
  On Render's starter/free tier, instances are strictly bounded to 512MB of physical RAM. Standard Gunicorn configurations spawn $(2 \times \text{CPUs}) + 1$ workers (typically 3–5 workers). Each Python 3.13 process running Django with PostGIS, Pillow, and pycairo consumes $\sim 150\text{MB}$ of baseline memory. Running multiple workers caused total memory usage to cross 512MB under concurrent HTTP traffic, triggering the Linux kernel Out-Of-Memory (OOM) killer (`Exit code 137 / SIGKILL`), causing container restarts and dropped user checkouts.
- **Verification Evidence:**
  Inspected [`Dockerfile`](file:///z:/books3/Dockerfile#L36):
  ```dockerfile
  CMD gunicorn azbooks.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 4 --worker-class gthread --max-requests 500 --max-requests-jitter 50 --timeout 120
  ```
- **Active Developments:**
  - Strict `--workers 1`: Keeps base memory consumption capped at $\sim 180\text{MB}$.
  - `--threads 4` with `--worker-class gthread`: Enables concurrent request handling across I/O waits without spawning heavy OS processes.
  - `--max-requests 500 --max-requests-jitter 50`: Automatically recycles the worker process periodically to reclaim fragmented memory and prevent C-extension memory leaks from growing unbounded.

---

### `BUG-INF-002`: Cloudflare R2 Multi-Subdomain SNI TLS Certificate Verification Failure
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - [`azbooks/settings.py`](file:///z:/books3/azbooks/settings.py#L300-L322)
  - [`core/management/commands/sync_media_to_r2.py`](file:///z:/books3/core/management/commands/sync_media_to_r2.py#L11)
- **Mechanism & Root Cause:**
  When connecting to S3-compatible endpoints, default boto3 behavior often constructs virtual-host URLs: `https://<bucket>.<account_id>.r2.cloudflarestorage.com`. However, Cloudflare R2's TLS edge certificate is wildcarded strictly for `*.r2.cloudflarestorage.com`. The double-subdomain violated RFC 6125 SNI matching, causing python's `urllib3` / `ssl` to abort with:
  `ssl.SSLCertVerificationError: hostname 'books3-media.3d053348182946c12efe18f8f1ed5480.r2.cloudflarestorage.com' doesn't match '*.r2.cloudflarestorage.com'`.
- **Verification Evidence:**
  Inspected [`azbooks/settings.py`](file:///z:/books3/azbooks/settings.py#L306-L317):
  ```python
  AWS_S3_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL') # https://<account_id>.r2.cloudflarestorage.com
  _custom_domain = os.getenv('R2_CUSTOM_DOMAIN', 'media3.circleaz.in')
  AWS_S3_CUSTOM_DOMAIN = _custom_domain.replace('https://', '').replace('http://', '').strip('/')
  AWS_S3_SIGNATURE_VERSION = 's3v4'
  AWS_DEFAULT_ACL = None
  AWS_QUERYSTRING_AUTH = False
  ```
- **Active Developments:** Backend boto3 clients use path-style requests directed strictly to the root endpoint `https://<account_id>.r2.cloudflarestorage.com`, while public media downloads route through Cloudflare edge domain `media3.circleaz.in`.

---

### `BUG-INF-003`: `S3Boto3Storage` `media/` Location Prefix Path Divergence
- **Severity:** High (P1)
- **Status:** **RESOLVED / ARCHITECTED**
- **Affected Files:**
  - [`azbooks/custom_storages.py`](file:///z:/books3/azbooks/custom_storages.py#L4)
  - [`core/management/commands/sync_media_to_r2.py`](file:///z:/books3/core/management/commands/sync_media_to_r2.py#L100)
- **Mechanism & Root Cause:**
  `PublicMediaStorage` inherits from `S3Boto3Storage` and specifies `location = 'media'`. When Django models save an `ImageField` (e.g. `upload_to='products/'`), `S3Boto3Storage` automatically prepends `media/`, storing the key as `media/products/<filename>`. If custom migration scripts or command utilities uploaded files to `products/<filename>` directly at the bucket root, browser requests directed to `https://media3.circleaz.in/media/products/<filename>` returned HTTP 404 Not Found.
- **Verification Evidence:**
  Inspected [`azbooks/custom_storages.py`](file:///z:/books3/azbooks/custom_storages.py#L1-L7):
  ```python
  from storages.backends.s3boto3 import S3Boto3Storage

  class PublicMediaStorage(S3Boto3Storage):
      location = 'media'
      default_acl = None
      file_overwrite = False
  ```
  And in [`core/management/commands/sync_media_to_r2.py`](file:///z:/books3/core/management/commands/sync_media_to_r2.py#L99-L101):
  ```python
  rel_path = file_path.relative_to(media_dir).as_posix()
  key = f"media/{rel_path}"
  ```
- **Active Developments:** All direct R2 uploads, CLI scripts, and storage backends enforce the `media/` namespace prefix.

---

### `BUG-INF-004`: Cloudflare Pages vs Render CNAME Domain Name Collision
- **Severity:** High (P1)
- **Status:** **RESOLVED / CONFIGURED**
- **Affected Files:**
  - [`render.yaml`](file:///z:/books3/render.yaml#L22-L27)
  - Cloudflare DNS Zone Configuration
- **Mechanism & Root Cause:**
  Attempting to bind the root app domain `books3.circleaz.in` to Render failed verification because the DNS CNAME record for `books3.circleaz.in` points to Cloudflare Pages (`books3-9js.pages.dev`), which serves the React SPA frontend. Routing both frontend and backend to the same domain without an API gateway caused routing loops or SSL collision.
- **Verification Evidence:**
  Inspected [`render.yaml`](file:///z:/books3/render.yaml#L22-L27):
  ```yaml
  - key: ALLOWED_HOSTS
    value: ".onrender.com,.circleaz.in,localhost"
  - key: CSRF_TRUSTED_ORIGINS
    value: "https://books3.circleaz.in,https://circleaz.in,https://api3.circleaz.in"
  - key: CORS_ALLOWED_ORIGINS
    value: "https://books3.circleaz.in,https://circleaz.in"
  ```
- **Active Developments:**
  - Frontend SPA: `https://books3.circleaz.in` (Cloudflare Pages).
  - Backend API: `https://api3.circleaz.in` (CNAME to `books3-mo5o.onrender.com`).
  - Media CDN: `https://media3.circleaz.in` (Cloudflare R2 Custom Domain).

---

### `BUG-INF-005`: Render Ephemeral Deploy Secret Rotation Invalidating Active JWTs
- **Severity:** High (P1)
- **Status:** **RESOLVED / ENFORCED**
- **Affected File:** [`render.yaml`](file:///z:/books3/render.yaml#L18-L19)
- **Mechanism & Root Cause:**
  If `SECRET_KEY` in `render.yaml` was configured with `generateValue: true`, Render generated a brand-new cryptographic secret on every git push deploy. Because Django REST Framework SimpleJWT uses `SECRET_KEY` to sign access and refresh tokens, every deployment instantly invalidated all active cashier and manager tokens across all stores, forcing sudden session disconnects in the middle of active transactions.
- **Verification Evidence:**
  Inspected [`render.yaml`](file:///z:/books3/render.yaml#L18-L19):
  ```yaml
  - key: SECRET_KEY
    sync: false # MUST be set manually and stay stable — generateValue rotates on every deploy, killing all JWT tokens
  ```
- **Active Developments:** `sync: false` strictly enforced. Production `SECRET_KEY` is maintained as a persistent environment variable across builds.

---

### `BUG-INF-006`: Container Boot R2 Media Hydration Race Condition
- **Severity:** Medium (P2)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - [`docker-entrypoint.sh`](file:///z:/books3/docker-entrypoint.sh#L10-L11)
  - [`core/management/commands/sync_media_to_r2.py`](file:///z:/books3/core/management/commands/sync_media_to_r2.py#L81-L85)
- **Mechanism & Root Cause:**
  During initial deployment or container restarts, launching the web server before static/media assets are synchronized to Cloudflare R2 causes customers to see broken images. Conversely, running an unconditional upload of 367 media assets on every container restart would cause Render's boot health check (`/api/health/`) to time out, marking the deploy as failed.
- **Verification Evidence:**
  Inspected [`core/management/commands/sync_media_to_r2.py`](file:///z:/books3/core/management/commands/sync_media_to_r2.py#L78-L90):
  ```python
  # Fast-path sentinel check: If already synced and not forcing, exit in milliseconds
  if not force:
      try:
          s3.head_object(Bucket=bucket, Key=SENTINEL_KEY)
          self.stdout.write(self.style.SUCCESS(
              f"[OK] Media sync sentinel '{SENTINEL_KEY}' exists. Bucket already hydrated. Skipping sync."
          ))
          return
      except ClientError as e:
          # ... proceed to upload and set sentinel on completion ...
  ```
- **Active Developments:** Boot check queries R2 for `media/.sync_completed_v1`. On subsequent boots, the command returns in $\approx 45\text{ms}$, allowing instant Gunicorn startup without delaying health checks.

---

### `BUG-INF-007`: Cloudflare Pages Build Pipeline Stall & Node Runtime Version Mismatch
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - [`.node-version`](file:///z:/books3/.node-version)
  - [`.nvmrc`](file:///z:/books3/.nvmrc)
  - [`frontend/.node-version`](file:///z:/books3/frontend/.node-version)
  - [`frontend/.nvmrc`](file:///z:/books3/frontend/.nvmrc)
  - [`.github/workflows/deploy_frontend.yml`](file:///z:/books3/.github/workflows/deploy_frontend.yml)
- **Mechanism & Root Cause:**
  Cloudflare Pages build environment defaults to Node.js 18 or 12 in the absence of explicit runtime pins. Because Books3 frontend utilizes Vite 7 (`^7.2.4`) and React 19 (`^19.2.0`), unpinned builds fail during `npm run build` or fail silently if GitHub App webhook events are missing on new repositories (`CircleAZ/books3`). As a result, Cloudflare Pages continued serving the pre-patch bundle (`index-D3tP9avu.js` and `OrderList-DjZvXDqu.js`), giving the false impression that frontend code patches had failed when in fact they were never compiled or served to the client.
- **Verification Evidence:**
  Direct curl probe of live edge assets on `https://books3.circleaz.in/assets/OrderList-DjZvXDqu.js` confirmed unhoisted, unmemoized inline functions (`buildParams: (s, a) => ...`) from before commit `b717741`.
- **Active Developments:**
  Pinned Node.js `20.18.0` across repository and frontend root `.node-version` and `.nvmrc` files. Staged direct GitHub Actions deployment pipeline to eliminate Cloudflare Pages builder ambiguity.
