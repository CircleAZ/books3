"""
Account app serializers for AZ Books
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .models import UserProfile, ActivityLog


class UserSerializer(serializers.ModelSerializer):
    """Basic user serializer"""
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id', 'username']


class ProfileSerializer(serializers.ModelSerializer):
    """User profile serializer with nested user data"""
    user = UserSerializer()
    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)
    profile_picture_url = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'phone', 'profile_picture', 'profile_picture_url',
            'role', 'full_name', 'initials', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'role', 'created_at', 'updated_at']
    
    def get_profile_picture_url(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None
    
    def update(self, instance, validated_data):
        # Handle nested user data
        user_data = validated_data.pop('user', None)
        if user_data:
            user = instance.user
            user.first_name = user_data.get('first_name', user.first_name)
            user.last_name = user_data.get('last_name', user.last_name)
            user.email = user_data.get('email', user.email)
            user.save()
        
        # Update profile fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        return instance


class LoginSerializer(serializers.Serializer):
    """Login request serializer"""
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
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
