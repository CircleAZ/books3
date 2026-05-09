import os
import django
import sys

sys.path.append(r'z:\books2')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

User = get_user_model()
u = User.objects.first()
client = APIClient(SERVER_NAME='localhost')
client.force_authenticate(user=u)

r = client.get('/api/finance/all-transactions/')
if r.status_code != 200:
    import re
    m = re.search(r'<title>(.*?)</title>', r.content.decode('utf-8'))
    print("Title:", m.group(1) if m else 'no title')
    
    m2 = re.search(r'<pre class="exception_value">(.*?)</pre>', r.content.decode('utf-8'), re.DOTALL)
    print("Exception:", m2.group(1) if m2 else 'no exc')
else:
    print("Success")
