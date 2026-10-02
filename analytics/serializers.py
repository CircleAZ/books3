"""
Serializers for Books3 Data Intelligence Platform.
Validates hierarchical folder trees, analytical session states,
operational cohorts, and pipeline transfer logs.
"""

from decimal import Decimal
from rest_framework import serializers
from .models import AnalysisFolder, SavedAnalysis, DiscoverySegment, PipelineTransferLog


class AnalysisFolderSerializer(serializers.ModelSerializer):
    children_count = serializers.SerializerMethodField()
    analyses_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisFolder
        fields = [
            'id',
            'name',
            'parent',
            'display_order',
            'is_pinned',
            'created_by',
            'created_by_name',
            'created_at',
            'updated_at',
            'children_count',
            'analyses_count',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
            'children_count',
            'analyses_count',
        ]

    def get_children_count(self, obj):
        # Only count active, non-deleted children
        return obj.children.filter(is_deleted=False).count()

    def get_analyses_count(self, obj):
        return obj.saved_analyses.filter(is_deleted=False).count()

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return getattr(obj.created_by, 'get_full_name', lambda: '')() or obj.created_by.username

    def validate(self, attrs):
        parent = attrs.get('parent')
        instance = self.instance

        if instance and parent and parent.id == instance.id:
            raise serializers.ValidationError({"parent": "A folder cannot be its own parent."})

        # Cycle detection and max depth check
        curr = parent
        depth = 0
        while curr is not None:
            depth += 1
            if depth > 10:
                raise serializers.ValidationError({"parent": "Folder hierarchy cannot exceed 10 levels of nesting."})
            if instance and curr.id == instance.id:
                raise serializers.ValidationError({"parent": "Circular hierarchy detected."})
            curr = curr.parent

        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class SavedAnalysisSerializer(serializers.ModelSerializer):
    engine_type_display = serializers.CharField(source='get_engine_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    folder_name = serializers.CharField(source='folder.name', read_only=True)

    class Meta:
        model = SavedAnalysis
        fields = [
            'id',
            'folder',
            'folder_name',
            'name',
            'engine_type',
            'engine_type_display',
            'parameters',
            'cached_insights',
            'created_by',
            'created_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
            'engine_type_display',
            'folder_name',
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return getattr(obj.created_by, 'get_full_name', lambda: '')() or obj.created_by.username

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class DiscoverySegmentSerializer(serializers.ModelSerializer):
    target_entity_display = serializers.CharField(source='get_target_entity_display', read_only=True)
    entity_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DiscoverySegment
        fields = [
            'id',
            'name',
            'target_entity',
            'target_entity_display',
            'entity_ids',
            'entity_count',
            'cohort_metrics',
            'source_engine',
            'created_by',
            'created_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
            'target_entity_display',
            'entity_count',
        ]

    def get_entity_count(self, obj):
        if isinstance(obj.entity_ids, list):
            return len(obj.entity_ids)
        return 0

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return getattr(obj.created_by, 'get_full_name', lambda: '')() or obj.created_by.username

    def validate_entity_ids(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("entity_ids must be a JSON array of entity identifiers.")
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class PipelineTransferLogSerializer(serializers.ModelSerializer):
    target_pipeline_display = serializers.CharField(source='get_target_pipeline_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    source_segment_name = serializers.CharField(source='source_segment.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PipelineTransferLog
        fields = [
            'id',
            'target_pipeline',
            'target_pipeline_display',
            'payload_snapshot',
            'status',
            'status_display',
            'source_segment',
            'source_segment_name',
            'notes',
            'created_by',
            'created_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
            'target_pipeline_display',
            'status_display',
            'source_segment_name',
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return getattr(obj.created_by, 'get_full_name', lambda: '')() or obj.created_by.username

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class PipelinePOItemInputSerializer(serializers.Serializer):
    """Candidate line item for procurement pipeline handoff."""
    product_id = serializers.UUIDField()
    suggested_quantity = serializers.IntegerField(min_value=1, default=1)
    vendor_case_pack = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    moq = serializers.IntegerField(min_value=1, default=1)
    unit_cost_price = serializers.DecimalField(max_digits=10, decimal_places=4, required=False, allow_null=True)


class PipelinePOTransferRequestSerializer(serializers.Serializer):
    """Request model for preparing and dispatching an analytical cohort to PO Creator."""
    source_segment_id = serializers.UUIDField(required=False, allow_null=True)
    vendor_id = serializers.UUIDField(required=False, allow_null=True)
    items = PipelinePOItemInputSerializer(many=True, required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    override_reason = serializers.CharField(required=False, allow_blank=True, default='')


class PipelineConfirmTransferSerializer(serializers.Serializer):
    """Payload sent when a purchase order is successfully saved in procurement."""
    purchase_order_id = serializers.UUIDField()
    po_display_id = serializers.CharField(required=False, allow_blank=True, default='')
    override_reason = serializers.CharField(required=False, allow_blank=True, default='')


class PipelineRejectTransferSerializer(serializers.Serializer):
    """Payload sent when a pipeline transfer is rejected or discarded."""
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class PipelineOverrideAndonSerializer(serializers.Serializer):
    """Payload sent to manually authorize and release a tripped TPS Andon latch."""
    reason = serializers.CharField(min_length=5, required=True, allow_blank=False)


class KhataGateCheckRequestSerializer(serializers.Serializer):
    """Request model for checking account working capital status against the Finn Protocol."""
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    entity_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    credit_limit = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal('50000.00'))
    max_dso_threshold = serializers.IntegerField(required=False, default=45, min_value=1, max_value=365)



