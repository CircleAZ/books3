import os, sys, traceback

try:
    import django
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
    django.setup()
    from django.core.files.storage import default_storage
    from django.core.files.base import ContentFile
    default_storage.save('test_file.txt', ContentFile(b'hello world'))
except Exception as e:
    with open('error.log', 'w') as f:
        traceback.print_exc(file=f)
