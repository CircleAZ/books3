from rest_framework import serializers
from .models import ActivityLog, SavedQuery, QueryStateHistory
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


class SavedQuerySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = SavedQuery
        fields = [
            'id', 'name', 'entity', 'query_type', 'rules', 'azql_text', 
            'columns', 'aggregates', 'is_shared', 'created_by', 'created_by_name', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
        
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ""
        
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class QueryStateHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = QueryStateHistory
        fields = [
            'id', 'saved_query', 'name', 'entity', 'query_type', 
            'rules', 'azql_text', 'columns', 'aggregates', 'is_safe', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
        
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

