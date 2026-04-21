#!/bin/bash
set -e

echo "==> Running cluster migrations and database initialization safely..."
python manage.py cluster_migrate

# !! TEMPORARY - REMOVE AFTER SUCCESSFUL WIPE !!
echo "==> Wiping test data from production..."
python manage.py wipe_test_data --confirm
# !! END TEMPORARY !!

echo "==> Starting server..."
exec "$@"
