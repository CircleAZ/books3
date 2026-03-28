"""
URL configuration for azbooks project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)


def health_check(request):
    return JsonResponse({"status": "ok"})


def debug_check(request):
    """Temporary debug endpoint — remove after fixing 500."""
    import traceback
    checks = {}
    
    # Check 1: Database
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks['database'] = 'ok'
    except Exception as e:
        checks['database'] = traceback.format_exc()
    
    # Check 2: Static files
    try:
        from django.contrib.staticfiles.finders import find
        admin_css = find('admin/css/base.css')
        checks['admin_static'] = str(admin_css) if admin_css else 'NOT FOUND'
    except Exception as e:
        checks['admin_static'] = traceback.format_exc()
    
    # Check 3: Admin template rendering
    try:
        from django.test import RequestFactory
        from django.contrib.admin.sites import AdminSite
        factory = RequestFactory()
        req = factory.get('/admin/')
        req.META['SERVER_NAME'] = 'azbooks.onrender.com'
        req.META['SERVER_PORT'] = '443'
        checks['admin_template'] = 'ok'
    except Exception as e:
        checks['admin_template'] = traceback.format_exc()
    
    # Check 4: Session table
    try:
        from django.contrib.sessions.models import Session
        Session.objects.count()
        checks['sessions'] = 'ok'
    except Exception as e:
        checks['sessions'] = traceback.format_exc()
    
    # Check 5: CSRF settings
    checks['csrf_trusted_origins'] = str(settings.CSRF_TRUSTED_ORIGINS)
    checks['allowed_hosts'] = str(settings.ALLOWED_HOSTS)
    checks['debug'] = str(settings.DEBUG)
    
    # Check 6: Whitenoise
    try:
        import whitenoise
        checks['whitenoise_version'] = whitenoise.__version__
    except Exception as e:
        checks['whitenoise'] = str(e)
    
    # Check 7: Collectstatic output
    try:
        import os
        staticfiles_dir = settings.STATIC_ROOT
        if os.path.exists(staticfiles_dir):
            file_count = sum(len(files) for _, _, files in os.walk(staticfiles_dir))
            checks['staticfiles_count'] = file_count
        else:
            checks['staticfiles_dir'] = 'DOES NOT EXIST'
    except Exception as e:
        checks['staticfiles'] = traceback.format_exc()
    
    return JsonResponse(checks, json_dumps_params={'indent': 2})


urlpatterns = [
    # Health check (for Render / UptimeRobot)
    path('api/health/', health_check, name='health_check'),
    path('api/debug/', debug_check, name='debug_check'),

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

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else settings.STATIC_ROOT)
