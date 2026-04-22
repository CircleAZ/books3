#!/bin/bash
set -e

echo "==> Running cluster migrations and database initialization safely..."
python manage.py cluster_migrate

echo "==> Loading PostGIS geographic boundary data..."
python manage.py load_geodata data/layered_geocoding_data.json

echo "==> Starting server..."
exec "$@"
