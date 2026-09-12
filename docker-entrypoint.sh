#!/bin/bash
set -e

echo "==> Running cluster migrations and database initialization safely..."
python manage.py cluster_migrate

echo "==> Generating PWA icons (if missing)..."
python manage.py generate_pwa_icons

echo "==> Synchronizing media assets to Cloudflare R2 (idempotent)..."
python manage.py sync_media_to_r2 || echo "Media sync warning: non-fatal bypass"

echo "==> Starting server..."
exec "$@"
