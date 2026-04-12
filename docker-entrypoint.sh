#!/bin/bash
set -e

echo "==> Running cluster migrations and database initialization safely..."
python manage.py cluster_migrate

echo "==> Starting server..."
exec "$@"
