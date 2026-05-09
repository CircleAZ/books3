import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'books2.settings')
django.setup()

from django.test import RequestFactory
from customers.views import GeographicRegionViewSet

# Create a fake request
factory = RequestFactory()
request = factory.get('/api/customers/georegions/reverse_geocode/?lat=20.810189&lng=72.858588')

# Call the view
view = GeographicRegionViewSet.as_view({'get': 'reverse_geocode'})
response = view(request)
print("Status:", response.status_code)
print("Data:", response.data)
