import os, django, requests
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from rest_framework_simplejwt.tokens import RefreshToken
from account.models import User

user = User.objects.filter(is_superuser=True).first()
refresh = str(RefreshToken.for_user(user))

res = requests.post("https://azbooks.onrender.com/api/token/refresh/", json={"refresh": refresh})
print("STATUS:", res.status_code)
print("BODY:", res.text)
