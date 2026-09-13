# Rule 01: Sovereign Cloud & Database Latch Architecture

## 1. Zero-Contamination Startup Latch
- **Permanent Ban:** Any connection string containing `ep-autumn-star` (the legacy `books2` database) is strictly forbidden.
- **Enforcement:** `azbooks/settings.py` enforces a fatal `RuntimeError` on startup if `ep-autumn-star` is detected in `DATABASE_URL`. Under NO circumstances may this guard be disabled, bypassed, or commented out.
- **Active Sovereign DB:** The sole authorized production database is Neon PostgreSQL 18.6 cluster: `ep-raspy-lake-b39hlekz`.

## 2. Multi-Node Cluster Migration Safety
- **Deadlock Prevention:** Render automatically deploys web instances concurrently. Standard `python manage.py migrate` triggers PostgreSQL DDL deadlocks and `IntegrityError` collisions if multiple instances execute migrations simultaneously.
- **Cluster Migration Protocol:** All deployments must run `python manage.py cluster_migrate` via `docker-entrypoint.sh`. This acquires a distributed Redis lock (`azbooks_cluster_migration_lock`) ensuring only the leader node executes schema mutations while backup nodes wait.
- **Neon PgBouncer Host Bypass:** Neon PgBouncer transaction poolers reject schema migrations with `MigrationSchemaMissing`. `cluster_migrate.py` must strip `-pooler` from `DATABASES['default']['HOST']` during migration execution to establish a direct connection.

## 3. PostgreSQL Sequence Synchronization
- **Post-Hydration Sequence Invariant:** After any data restore, dump ingestion, or bulk row insertion, PostgreSQL auto-increment sequences DO NOT automatically advance. Failing to sync sequences causes immediate `IntegrityError: duplicate key value violates unique constraint` on subsequent inserts.
- **Mandatory Sync Query:** Every restored table must have its sequence synchronized to the current maximum primary key:
  `SELECT setval(pg_get_serial_sequence('table_name', 'id'), (SELECT COALESCE(MAX(id), 1) FROM table_name));`

## 4. Cloudflare R2 Media & Receipt Topology
- **Verified Account ID:** Cloudflare R2 account ID is strictly `3d053348182946c12efe18f8f1ed5480`. Any typo triggers edge TLS handshake aborts (`SSLV3_ALERT_HANDSHAKE_FAILURE`).
- **Endpoint URL:** `https://3d053348182946c12efe18f8f1ed5480.r2.cloudflarestorage.com`
- **Location Prefix Invariant:** `PublicMediaStorage` sets `location = 'media'`. All R2 storage objects MUST be prefixed with `media/` (e.g. `media/products/...`, `media/store/...`). Direct root keys like `products/...` cause 404s on the public CDN domain `media3.circleaz.in`.
- **Receipt Storage:** Customer receipts must be uploaded to private bucket `books3-receipts` and never stored on Render's ephemeral filesystem.

## 5. Render Free-Tier Hardware Constraints (512MB RAM Ceiling)
- **OOM Kill Prevention:** Monolithic Django + DRF exceeds 512MB RAM if multiple Gunicorn workers spawn.
- **Worker Configuration:** Docker entrypoint must run strictly 1 worker with threads:
  `gunicorn azbooks.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 4 --worker-class gthread --max-requests 500 --max-requests-jitter 50 --timeout 120`
- **Max Requests Recycling:** `--max-requests 500` forces worker process recycling to flush insidious memory leaks before breaching the 512MB ceiling.
- **Persistent Secret Key:** `SECRET_KEY` in `render.yaml` must have `sync: false`. Setting `generateValue: true` rotates the secret key on every deploy, instantly invalidating all active JWT tokens across all salesmen devices.
