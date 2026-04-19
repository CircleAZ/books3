import sys
import time
import os
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.conf import settings

# Attempt to import redis, which is backed by the Upstash Redis instance
try:
    import redis
except ImportError:
    redis = None

class Command(BaseCommand):
    help = 'Runs database migrations safely across a multi-node cluster using a Redis lock.'

    def handle(self, *args, **options):
        redis_url = os.getenv('REDIS_URL')
        
        # If no Redis is configured or available, fallback to standard migration
        if not redis or not redis_url:
            self.stdout.write(self.style.WARNING("Redis not detected. Running standard local migration."))
            call_command('migrate', interactive=False)
            try:
                call_command('createcachetable', 'django_cache')
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Cache table creation warning: {e}"))
            return

        self.stdout.write("Initializing Redis connection for distributed lock...")
        client = redis.Redis.from_url(redis_url, decode_responses=True)
        
        lock_key = "azbooks_cluster_migration_lock"
        # 3 minute timeout on the lock to prevent deadlocks if a container crashes mid-migration
        lock_timeout = 180 

        self.stdout.write(f"Attempting to acquire cluster lock: {lock_key}...")
        
        # nx=True ensures only ONE node can set this value. 
        # The node that successfully sets it becomes the migration leader.
        if client.set(lock_key, "locked", nx=True, ex=lock_timeout):
            self.stdout.write(self.style.SUCCESS("✅ Lock acquired! This node is the Migration Leader."))
            try:
                self.stdout.write("Running migrations...")
                call_command('migrate', interactive=False)
                
                self.stdout.write("Ensuring cache table exists...")
                try:
                    call_command('createcachetable', 'django_cache')
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"Cache table creation warning: {e}"))
                
                self.stdout.write("Ensuring superuser exists...")
                try:
                    from account.models import User
                    superuser_email = os.getenv('SUPERUSER_EMAIL', 'adm.circle.az@gmail.com')
                    if not User.objects.filter(username='admin').exists():
                        admin = User.objects.create_superuser('admin', superuser_email, 'admin')
                        admin.email_verified = True
                        admin.save(update_fields=['email_verified'])
                        self.stdout.write(self.style.SUCCESS('   ✓ Superuser "admin" created (email verified)'))
                    else:
                        # Update existing admin email if it's the placeholder
                        admin = User.objects.get(username='admin')
                        if admin.email == 'admin@azbooks.local':
                            admin.email = superuser_email
                            admin.email_verified = True
                            admin.save(update_fields=['email', 'email_verified'])
                            self.stdout.write(self.style.SUCCESS(f'   ✓ Admin email updated to {superuser_email}'))
                except Exception as e:
                    self.stdout.write(f"Superuser check failed (ignoring): {e}")

                self.stdout.write("Seeding default data...")
                try:
                    call_command('seed_all')
                except Exception as e:
                    self.stdout.write(f"Seeding failed (ignoring): {e}")

                self.stdout.write(self.style.SUCCESS("✅ Migrations and initializations complete."))
            finally:
                # Release the lock immediately after completing
                client.delete(lock_key)
                self.stdout.write("Lock released.")
        else:
            self.stdout.write(self.style.WARNING("⚠️ Another node holds the lock. Pausing boot sequence to wait..."))
            # Wait for the lock to be released by the leader
            retries = 0
            while client.get(lock_key) == "locked":
                if retries > 60: # Max wait 2 minutes (60 * 2s)
                    self.stdout.write(self.style.ERROR("Wait timed out. Bypassing lock. DB state may be unstable."))
                    sys.exit(1)
                time.sleep(2)
                retries += 1
            
            self.stdout.write(self.style.SUCCESS("✅ Wait complete. The Leader node successfully initialized the database."))
            self.stdout.write("Proceeding with boot sequence.")
