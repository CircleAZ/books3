from rest_framework import serializers
from .models import ActivityLog
from django.contrib.auth import get_user_model

User = get_user_model()

class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ActivityLog
        fields = ['id', 'user', 'user_name', 'action_type', 'description', 'details', 'entity_type', 'entity_id', 'ip_address', 'created_at']
        read_only_fields = ['created_at']

    def get_user_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return "System"
