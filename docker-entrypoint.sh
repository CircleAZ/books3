#!/bin/bash
set -e

echo "==> Running cluster migrations and database initialization safely..."
python manage.py cluster_migrate

echo "==> Generating PWA icons (if missing)..."
python manage.py generate_pwa_icons

echo "==> Starting server..."
exec "$@"
