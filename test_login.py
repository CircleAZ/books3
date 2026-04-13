import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from account.models import User
from django.test import RequestFactory
from account.views import LoginView

factory = RequestFactory()

# Create a test user if it doesn't exist
user, created = User.objects.get_or_create(username='testadmin')
if created:
    user.set_password('testpassword123')
    user.email = 'test@example.com'
    user.save()

# Simulate Login request
request = factory.post('/api/account/login/', {
    'username': 'testadmin',
    'password': 'testpassword123'
}, content_type='application/json')

view = LoginView.as_view()

try:
    response = view(request)
    print("STATUS:", response.status_code)
    print("RESPONSE:", response.data)
except Exception as e:
    import traceback
    traceback.print_exc()
