from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    StoreSettings, Role, Permission, RolePermission, UserRole,
    TaxSettings, PaymentMethod, NotificationPreference, IntegrationSettings,
    ReceiptSettings, UPIAccount
)

User = get_user_model()

class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = '__all__'

class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'name', 'codename', 'category']

class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'is_default', 'is_system', 'permissions']
        
    def get_permissions(self, obj):
        return [rp.permission.codename for rp in obj.role_permissions.all()]

class RoleUpdateSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'permissions']
        
    def create(self, validated_data):
        permissions_codenames = validated_data.pop('permissions', [])
        role = Role.objects.create(**validated_data)
        self._set_permissions(role, permissions_codenames)
        return role
        
    def update(self, instance, validated_data):
        permissions_codenames = validated_data.pop('permissions', None)
        instance = super().update(instance, validated_data)
        if permissions_codenames is not None:
            self._set_permissions(instance, permissions_codenames)
        return instance
        
    def _set_permissions(self, role, codenames):
        role.role_permissions.all().delete()
        for codename in codenames:
            try:
                perm = Permission.objects.get(codename=codename)
                RolePermission.objects.create(role=role, permission=perm)
            except Permission.DoesNotExist:
                pass

class TaxSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSettings
        fields = '__all__'

class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = '__all__'

class ReceiptSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceiptSettings
        fields = '__all__'

class NotificationPreferenceSerializer(serializers.ModelSerializer):
    notification_type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    
    class Meta:
        model = NotificationPreference
        fields = ['id', 'notification_type', 'notification_type_display', 'is_enabled', 'recipients']


class UPIAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = UPIAccount
        fields = '__all__'


class IntegrationSettingsSerializer(serializers.ModelSerializer):
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    
    class Meta:
        model = IntegrationSettings
        fields = ['id', 'service_type', 'service_type_display', 'is_enabled', 'config']
        # Deliberately exclude api_key from read responses for security
        extra_kwargs = {'api_key': {'write_only': True}}

class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    role_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'password', 'roles', 'role_ids', 'date_joined']
        read_only_fields = ['date_joined']
        extra_kwargs = {'password': {'write_only': True, 'required': False}}
        
    def get_roles(self, obj):
        return RoleSerializer([ur.role for ur in obj.user_roles.all()], many=True).data
        
    def create(self, validated_data):
        role_ids = validated_data.pop('role_ids', [])
        password = validated_data.pop('password', None)
        
        user = User.objects.create_user(**validated_data)
        
        if password:
            user.set_password(password)
            user.save()
            
        if role_ids:
            for role_id in role_ids:
                try:
                    role = Role.objects.get(id=role_id)
                    UserRole.objects.create(user=user, role=role)
                except Role.DoesNotExist:
                    pass
        return user

    def update(self, instance, validated_data):
        role_ids = validated_data.pop('role_ids', None)
        password = validated_data.pop('password', None)
        
        instance = super().update(instance, validated_data)
        
        if password:
            instance.set_password(password)
            instance.save()
        
        if role_ids is not None:
            instance.user_roles.all().delete()
            for role_id in role_ids:
                try:
                    role = Role.objects.get(id=role_id)
                    UserRole.objects.create(user=instance, role=role)
                except Role.DoesNotExist:
                    pass
        return instance
