"""
URL configuration for azbooks project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.views.decorators.http import require_safe
from django_ratelimit.decorators import ratelimit
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)


@require_safe
@ratelimit(key='header:x-forwarded-for', rate='60/m', method=['GET', 'HEAD'])
def health_check(request):
    """Minimal health endpoint for UptimeRobot / Render / CF Worker warm-up.
    Rate-limited to 60 req/min per real client IP (via X-Forwarded-For for Cloudflare/proxy)."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    # Health check (for Render / UptimeRobot / CF Worker)
    path('api/health/', health_check, name='health_check'),

    # Admin
    path('admin/', admin.site.urls),
    
    # JWT Authentication endpoints
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    
    # App URLs (to be implemented in each app)
    path('api/account/', include('account.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/customers/', include('customers.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/settings/', include('settings_app.urls')),
    path('api/messaging/', include('messaging.urls')),
    
    # Core RBAC endpoints
    path('api/core/', include('core.urls')),
]

# Serve media files in development AND fallback for production if R2 is not configured
# WARNING: Serving media through Django in production is inefficient but required if no R2/S3 is set up.
from django.urls import re_path
from django.views.static import serve

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else settings.STATIC_ROOT)
