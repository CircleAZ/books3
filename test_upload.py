import os, sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
django.setup()

from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

try:
    print(f"Using storage: {default_storage.__class__}")
    path = default_storage.save('test_file.txt', ContentFile(b'hello world'))
    print(f"SUCCESS: {path}")
except Exception as e:
    import traceback
    traceback.print_exc()
