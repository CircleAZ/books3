import os, django, json, base64
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from rest_framework_simplejwt.tokens import RefreshToken
from account.models import User
from account.serializers import CustomTokenRefreshSerializer

user = User.objects.filter(is_superuser=True).first()
refresh = RefreshToken.for_user(user)

serializer = CustomTokenRefreshSerializer(data={'refresh': str(refresh)})
if serializer.is_valid():
    rotated_refresh = serializer.validated_data['refresh']
    payload = json.loads(base64.urlsafe_b64decode(rotated_refresh.split('.')[1] + '==').decode('utf-8'))
    print("Rotated refresh payload:", payload)
