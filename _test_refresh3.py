import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from rest_framework_simplejwt.tokens import RefreshToken
from account.models import User
from account.serializers import CustomTokenRefreshSerializer

user = User.objects.filter(is_superuser=True).first()
refresh = RefreshToken.for_user(user)

serializer = CustomTokenRefreshSerializer(data={'refresh': str(refresh)})
if serializer.is_valid():
    print("Keys:", serializer.validated_data.keys())
    print("Has refresh?", 'refresh' in serializer.validated_data)
