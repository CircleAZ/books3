# ============================================
# AZ Books — Django Backend
# ============================================
FROM python:3.13-slim

# Prevent Python from writing .pyc and enable unbuffered stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV NEW_RELIC_CONFIG_FILE=newrelic.ini

WORKDIR /app

# System deps for psycopg2-binary, Pillow, pycairo, and GDAL (PostGIS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libjpeg62-turbo-dev zlib1g-dev pkg-config libcairo2-dev \
    gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project source
COPY . .

# Copy entrypoint
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Collect static files (if any)
RUN python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["newrelic-admin", "run-program", "gunicorn", "azbooks.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
