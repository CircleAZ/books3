"""
Data migration: Retroactive image optimization.
Converts all existing ProductImage originals to max 1500x1500 WebP,
generates 150x150 thumbnails, and deletes the raw originals.

Runs during `python manage.py migrate` — no HTTP endpoint needed.
"""
from django.db import migrations


def optimize_existing_images(apps, schema_editor):
    """Process all existing ProductImage records through the optimization pipeline."""
    # We must import the REAL model (not the historical one) because we need
    # the _process_images() method and Pillow logic which aren't on historical models.
    from inventory.models import ProductImage

    images = ProductImage.objects.all()
    total = images.count()
    success = 0
    skipped = 0

    print(f"\n  [PURGE] Found {total} images to process...")

    for idx, img in enumerate(images, 1):
        try:
            if img.image and img.image.name and not img.image.name.endswith('_opt.webp'):
                img._process_images()
                img.save(update_fields=['image', 'thumbnail'])
                success += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"  [PURGE] Error on {img.id}: {e}")

        if idx % 10 == 0:
            print(f"  [PURGE] Progress: {idx}/{total}")

    print(f"  [PURGE] Complete! Optimized: {success}, Skipped: {skipped}, Total: {total}")


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0003_productimage_thumbnail'),
    ]

    operations = [
        migrations.RunPython(
            optimize_existing_images,
            reverse_code=migrations.RunPython.noop,  # Irreversible
        ),
    ]
