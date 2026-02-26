"""
Account app serializers for AZ Books
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import ActivityLog

User = get_user_model()

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
        read_only_fields = ['__all__']


class ProfilePictureSerializer(serializers.Serializer):
    """Profile picture upload serializer"""
    profile_picture = serializers.ImageField()
    
    def validate_profile_picture(self, value):
        # Limit file size to 5MB
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Image file too large (max 5MB).')
        return value
