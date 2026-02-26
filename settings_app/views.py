from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .models import (
    StoreSettings, Role, Permission, TaxSettings, 
    PaymentMethod, NotificationPreference, IntegrationSettings
)
from .serializers import (
    StoreSettingsSerializer, RoleSerializer, RoleUpdateSerializer,
    TaxSettingsSerializer, PaymentMethodSerializer, 
    NotificationPreferenceSerializer, UserSerializer, PermissionSerializer,
    ReceiptSettingsSerializer, IntegrationSettingsSerializer, UPIAccountSerializer
)

User = get_user_model()

class IsAdminUser(permissions.BasePermission):
    """
    Custom permission to only allow admins to edit settings.
    For now, we stick to Django's is_staff or specific role check.
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_staff

class StoreSettingsViewSet(viewsets.GenericViewSet):
    """
    Manage Store Settings (Singleton).
    """
    queryset = StoreSettings.objects.all()
    serializer_class = StoreSettingsSerializer
    permission_classes = [IsAdminUser]

    def list(self, request):
        instance = StoreSettings.get_instance()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request):
        instance = StoreSettings.get_instance()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def upload_logo(self, request):
        instance = StoreSettings.get_instance()
        logo = request.FILES.get('logo')
        if not logo:
            return Response({'error': 'No logo provided'}, status=status.HTTP_400_BAD_REQUEST)
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
        if logo.content_type not in allowed_types:
            allowed_str = ", ".join(allowed_types)
            return Response(
                {"error": f"Invalid file type. Allowed: {allowed_str}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        instance.logo = logo
        instance.save()
        return Response(StoreSettingsSerializer(instance).data)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]
    
    def get_queryset(self):
        # Prevent Deleting/Editing Superuser by normal admins if needed
        return User.objects.all().order_by('-date_joined')

    @action(detail=True, methods=['post'])
    def toggle_activation(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
             return Response({'error': 'Cannot deactivate yourself'}, status=status.HTTP_400_BAD_REQUEST)
        
        user.is_active = not user.is_active
        user.save()
        return Response({'status': 'updated', 'is_active': user.is_active})

class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    permission_classes = [IsAdminUser]
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RoleUpdateSerializer
        return RoleSerializer

    @action(detail=False, methods=['get'])
    def permissions(self, request):
        perms = Permission.objects.all()
        # Group by category
        data = {}
        for p in perms:
            if p.category not in data:
                data[p.category] = []
            data[p.category].append({
                'id': str(p.id),
                'name': p.name,
                'codename': p.codename
            })
        return Response(data)

class FinancialSettingsViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminUser]
    
    @action(detail=False, methods=['get'])
    def taxes(self, request):
        queryset = TaxSettings.objects.all()
        serializer = TaxSettingsSerializer(queryset, many=True)
        return Response(serializer.data)

class TaxSettingsViewSet(viewsets.ModelViewSet):
    queryset = TaxSettings.objects.all()
    serializer_class = TaxSettingsSerializer
    permission_classes = [IsAdminUser]

class NotificationSettingsViewSet(viewsets.ModelViewSet):
    queryset = NotificationPreference.objects.all()
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAdminUser]

from .models import ReceiptSettings, UPIAccount, IntegrationSettings

class ReceiptSettingsViewSet(viewsets.GenericViewSet):
    """
    Manage Receipt Settings (Singleton).
    """
    queryset = ReceiptSettings.objects.all()
    serializer_class = ReceiptSettingsSerializer
    permission_classes = [IsAdminUser]

    def list(self, request):
        instance = ReceiptSettings.get_instance()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request):
        instance = ReceiptSettings.get_instance()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PaymentMethodViewSet(viewsets.ModelViewSet):
    """CRUD for payment methods."""
    queryset = PaymentMethod.objects.all()
    serializer_class = PaymentMethodSerializer
    permission_classes = [IsAdminUser]


class UPIAccountViewSet(viewsets.ModelViewSet):
    """CRUD for UPI accounts."""
    queryset = UPIAccount.objects.all()
    serializer_class = UPIAccountSerializer
    permission_classes = [IsAdminUser]


class IntegrationSettingsViewSet(viewsets.ModelViewSet):
    """CRUD for third-party integrations."""
    queryset = IntegrationSettings.objects.all()
    serializer_class = IntegrationSettingsSerializer
    permission_classes = [IsAdminUser]


class SystemInfoView(APIView):
    """System information and health check."""
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        import django
        return Response({
            'version': '1.0.0',
            'django_version': django.get_version(),
            'status': 'healthy',
        })


class DataManagementView(APIView):
    """Backup and restore controls."""
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        """Get last backup info."""
        return Response({
            'last_backup': None,
            'backup_available': False,
            'message': 'Backup functionality is configured at the infrastructure level.'
        })
    
    def post(self, request):
        """Trigger backup (placeholder)."""
        action = request.data.get('action', 'backup')
        if action == 'backup':
            return Response({
                'status': 'info',
                'message': 'Database backup should be triggered via server admin tools.'
            })
        return Response(
            {'error': 'Invalid action. Use: backup'},
            status=status.HTTP_400_BAD_REQUEST
        )