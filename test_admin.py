import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from account.models import User, EmailOTP
from django.test import RequestFactory
from account.views import OTPVerifyView

factory = RequestFactory()

try:
    admin = User.objects.get(username='admin')
    print("Admin email is:", repr(admin.email))
except Exception as e:
    print("Admin does not exist")

