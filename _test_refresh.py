import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from rest_framework_simplejwt.tokens import RefreshToken
from account.models import User
from account.serializers import CustomTokenRefreshSerializer

user = User.objects.filter(is_superuser=True).first()
if not user:
    print('No user')
    exit()

refresh = RefreshToken.for_user(user)

serializer = CustomTokenRefreshSerializer(data={'refresh': str(refresh)})
try:
    is_valid = serializer.is_valid()
    print(f"Is valid: {is_valid}")
    if is_valid:
        print("Success")
    else:
        print("Errors:", serializer.errors)
except Exception as e:
    import traceback
    traceback.print_exc()
