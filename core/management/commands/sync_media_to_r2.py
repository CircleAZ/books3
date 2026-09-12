import os
import sys
import mimetypes
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

DEFAULT_ENDPOINT = "https://3d053348182946c12efe18f8f1ed5480.r2.cloudflarestorage.com"
DEFAULT_BUCKET = "books3-media"
SENTINEL_KEY = "media/.sync_completed_v1"

def get_content_type(file_path):
    mime, _ = mimetypes.guess_type(str(file_path))
    if mime:
        return mime
    ext = file_path.suffix.lower()
    if ext == '.webp':
        return 'image/webp'
    elif ext in ('.jpg', '.jpeg'):
        return 'image/jpeg'
    elif ext == '.png':
        return 'image/png'
    elif ext == '.svg':
        return 'image/svg+xml'
    elif ext == '.avif':
        return 'image/avif'
    return 'application/octet-stream'

class Command(BaseCommand):
    help = 'Idempotently synchronize local media assets to Cloudflare R2 bucket'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate upload without pushing files to R2',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force upload even if sentinel object exists',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']

        access_key = getattr(settings, 'AWS_ACCESS_KEY_ID', None) or os.getenv('R2_ACCESS_KEY_ID')
        secret_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None) or os.getenv('R2_SECRET_ACCESS_KEY')
        endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None) or os.getenv('R2_ENDPOINT_URL', DEFAULT_ENDPOINT)
        bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None) or os.getenv('R2_BUCKET_NAME', DEFAULT_BUCKET)

        # Safety Guard: If credentials are not present and not dry-run, do not crash local sandboxes
        if not dry_run and (not access_key or not secret_key):
            self.stdout.write(self.style.WARNING(
                "[-] R2 credentials not detected in environment. Bypassing media sync (Safe Sandbox mode)."
            ))
            return

        media_dir = Path(settings.BASE_DIR) / 'media'
        if not media_dir.exists():
            self.stdout.write(self.style.WARNING(f"[-] Media directory '{media_dir}' does not exist. Nothing to sync."))
            return

        s3 = None
        if not dry_run:
            s3 = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=Config(signature_version="s3v4")
            )

            # Fast-path sentinel check: If already synced and not forcing, exit in milliseconds
            if not force:
                try:
                    s3.head_object(Bucket=bucket, Key=SENTINEL_KEY)
                    self.stdout.write(self.style.SUCCESS(
                        f"[OK] Media sync sentinel '{SENTINEL_KEY}' exists. Bucket already hydrated. Skipping sync."
                    ))
                    return
                except ClientError as e:
                    error_code = e.response.get('Error', {}).get('Code')
                    if error_code != '404':
                        self.stdout.write(self.style.WARNING(f"Sentinel check warning: {e}. Proceeding with sync."))

        all_files = [p for p in media_dir.rglob("*") if p.is_file() and p.name != '.gitkeep']
        self.stdout.write(f"[INFO] Discovered {len(all_files)} media assets to synchronize from {media_dir}...")

        uploaded = 0
        skipped = 0
        failed = 0

        for file_path in all_files:
            rel_path = file_path.relative_to(media_dir).as_posix()
            key = f"media/{rel_path}"
            content_type = get_content_type(file_path)

            if dry_run:
                self.stdout.write(f"  [DRY-RUN] {rel_path} -> {key} ({content_type})")
                uploaded += 1
                continue

            # Idempotency check: Skip if object exists and matches size
            try:
                head = s3.head_object(Bucket=bucket, Key=key)
                if head.get('ContentLength') == file_path.stat().st_size:
                    skipped += 1
                    continue
            except ClientError:
                pass

            try:
                extra_args = {
                    "ContentType": content_type,
                    "CacheControl": "max-age=86400"
                }
                s3.upload_file(str(file_path), bucket, key, ExtraArgs=extra_args)
                uploaded += 1
                self.stdout.write(f"  [+] Uploaded: {key} ({content_type})")
            except Exception as e:
                failed += 1
                self.stdout.write(self.style.ERROR(f"  [!] Failed {key}: {e}"))

        self.stdout.write(self.style.SUCCESS(
            f"[RESULT] Media Sync Complete: {uploaded} uploaded, {skipped} already present, {failed} failed."
        ))

        # Write sentinel object if all uploaded without failures
        if not dry_run and failed == 0:
            try:
                s3.put_object(
                    Bucket=bucket,
                    Key=SENTINEL_KEY,
                    Body=b"SYNC_COMPLETE_OK",
                    ContentType="text/plain"
                )
                self.stdout.write(self.style.SUCCESS(f"[OK] Sentinel '{SENTINEL_KEY}' written to R2 bucket."))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Warning: Could not write sentinel '{SENTINEL_KEY}': {e}"))
