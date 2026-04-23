from django.core.management.base import BaseCommand
from inventory.models import ProductImage

class Command(BaseCommand):
    help = 'Generate thumbnails for existing ProductImage objects'

    def handle(self, *args, **kwargs):
        images = ProductImage.objects.filter(thumbnail='') | ProductImage.objects.filter(thumbnail__isnull=True)
        total = images.count()
        
        self.stdout.write(self.style.WARNING(f"Found {total} images missing thumbnails. Generating now..."))
        
        success = 0
        for idx, img in enumerate(images, 1):
            try:
                img._generate_thumbnail()
                img.save(update_fields=['thumbnail'])
                success += 1
                if idx % 10 == 0:
                    self.stdout.write(f"[{idx}/{total}] Generated thumbnail for {img.product.name}")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed for {img.product.name}: {e}"))
                
        self.stdout.write(self.style.SUCCESS(f"Finished! Successfully generated {success}/{total} thumbnails."))
