"""
Account app serializers for AZ Books
"""
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.settings import api_settings
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import ActivityLog

User = get_user_model()


class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Custom proxy for TokenRefreshSerializer to reinstate 
    extended lifespans if the user enabled "Remember Me".
    """
    def validate(self, attrs):
        data = super().validate(attrs)
        refresh_str = data.get('refresh')
        
        if refresh_str:
            new_refresh = RefreshToken(refresh_str)
            user_id = new_refresh[api_settings.USER_ID_CLAIM]
            
            try:
                user = User.objects.get(id=user_id)
                new_access = new_refresh.access_token
                
                # REINJECT RBAC CLAIMS (Must happen on every rotation, regardless of remember_me)
                new_access['username'] = user.username
                new_access['first_name'] = user.first_name
                new_access['last_name'] = user.last_name
                new_access['role'] = user.role
                new_access['is_staff'] = user.is_staff
                new_access['is_superuser'] = user.is_superuser
                
                # Fetch fresh permissions from DB structure
                try:
                    from account.models import User
                    from rest_framework_simplejwt.tokens import RefreshToken
                    user_permissions = []
                    if user.is_superuser:
                        user_permissions.append('all')
                    else:
                        from account.models import RolePermission
                        perms = RolePermission.objects.filter(role=user.role).select_related('permission')
                        user_permissions = [p.permission.codename for p in perms]
                    new_access['permissions'] = user_permissions
                except Exception:
                    new_access['permissions'] = []

                if getattr(user, 'remember_me_enabled', False):
                    # Reinstate the extended 7-day lifespan on the new Refresh Token
                    new_refresh.set_exp(lifetime=timedelta(days=7))
                    new_access.set_exp(lifetime=timedelta(hours=4))
                    
                data['refresh'] = str(new_refresh)
                data['access'] = str(new_access)
            except Exception:
                # Fail gracefully back to system defaults if DB lookup fails
                pass
                
        return data


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Injects role + permissions into the JWT Access Token payload.
    
    This allows the React frontend to decode the token synchronously
    via jwt-decode, eliminating network dependency on /api/users/me/.
    Supports offline-first PWA architecture.
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Inject basic user info
        token['username'] = user.username
        token['is_staff'] = user.is_staff
        token['is_superuser'] = user.is_superuser

        # Inject RBAC claims (multi-role aggregation)
        try:
            from settings_app.models import Role, RolePermission
            user_roles = Role.objects.filter(role_users__user=user)

            if user_roles.exists():
                # Use primary role name for display, aggregate all permissions
                token['role'] = user_roles.first().name
                token['roles'] = list(user_roles.values_list('name', flat=True))

                # Collect ALL permission codenames across ALL roles
                permissions = list(
                    RolePermission.objects.filter(
                        role__in=user_roles
                    ).values_list(
                        'permission__codename', flat=True
                    ).distinct()
                )
                token['permissions'] = permissions
            else:
                token['role'] = None
                token['roles'] = []
                token['permissions'] = []
        except Exception:
            token['role'] = None
            token['roles'] = []
            token['permissions'] = []

        return token

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the Custom User model.
    Includes profile fields which are now part of the User model.
    """
    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)
    profile_picture_url = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'phone', 'profile_picture', 'profile_picture_url',
            'role', 'full_name', 'initials', 'date_joined', 'last_login'
        ]
        read_only_fields = ['id', 'role', 'date_joined', 'last_login']
    
    def get_profile_picture_url(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None


class LoginSerializer(serializers.Serializer):
    """Login request serializer"""
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, max_length=128)
    remember_me = serializers.BooleanField(default=False, required=False)


class ChangePasswordSerializer(serializers.Serializer):
    """Password change serializer"""
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({
                'confirm_password': 'New passwords do not match.'
            })
        return data
    
    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value


class ActivityLogSerializer(serializers.ModelSerializer):
    """Activity log serializer"""
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    
    class Meta:
        model = ActivityLog
        fields = [
            'id', 'action', 'action_display', 'description', 
            'created_at', 'ip_address', 'metadata'
        ]
        read_only_fields = [
            'id', 'action', 'action_display', 'description',
            'created_at', 'ip_address', 'metadata'
        ]


class ProfilePictureSerializer(serializers.Serializer):
    """Profile picture upload serializer"""
    profile_picture = serializers.ImageField()
    
    ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    
    def validate_profile_picture(self, value):
        import os
        # Limit file size to 5MB
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Image file too large (max 5MB).')
        
        # SEC-10: Validate MIME type
        if hasattr(value, 'content_type') and value.content_type not in self.ALLOWED_TYPES:
            raise serializers.ValidationError(
                f'Invalid file type: {value.content_type}. Allowed: JPEG, PNG, GIF, WebP.'
            )
        
        # SEC-10: Validate file extension
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f'Invalid file extension: {ext}. Allowed: .jpg, .png, .gif, .webp.'
            )
        
        return value


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for user notifications"""
    time_ago = serializers.SerializerMethodField()

    class Meta:
        model = None  # Set below after import
        fields = ['id', 'type', 'title', 'message', 'link', 'is_read', 'created_at', 'time_ago']
        read_only_fields = ['id', 'type', 'title', 'message', 'link', 'created_at', 'time_ago']

    def get_time_ago(self, obj):
        from django.utils import timezone
        delta = timezone.now() - obj.created_at
        seconds = int(delta.total_seconds())
        if seconds < 60:
            return 'just now'
        if seconds < 3600:
            mins = seconds // 60
            return f'{mins}m ago'
        if seconds < 86400:
            hours = seconds // 3600
            return f'{hours}h ago'
        days = seconds // 86400
        if days == 1:
            return 'yesterday'
        if days < 7:
            return f'{days}d ago'
        return obj.created_at.strftime('%b %d')


# Deferred model assignment to avoid circular import
from .models import Notification
NotificationSerializer.Meta.model = Notification


class OTPVerifySerializer(serializers.Serializer):
    """OTP verification request serializer"""
    otp_session = serializers.UUIDField()
    code = serializers.CharField(max_length=6, min_length=6)


class ResendOTPSerializer(serializers.Serializer):
    """OTP resend request serializer"""
    otp_session = serializers.UUIDField()
