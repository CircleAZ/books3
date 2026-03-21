#!/bin/bash
set -e

echo "==> Running migrations..."
python manage.py migrate --noinput

echo "==> Creating superuser (if not exists)..."
python manage.py shell -c "
from account.models import User
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@azbooks.local', 'admin')
    print('   ✓ Superuser \"admin\" created (password: admin)')
else:
    print('   ✓ Superuser \"admin\" already exists')
"

echo "==> Seeding default data..."
python manage.py seed_all

echo "==> Starting server..."
exec "$@"
