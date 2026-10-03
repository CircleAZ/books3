"""
Analytics Models for Books3 Data Intelligence Platform.
Defines persistent workspaces, saved analytical query parameters,
operational cohorts, and pipeline transfer logs.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from core.models import SoftDeleteModel


class AnalysisFolder(SoftDeleteModel):
    """
    Hierarchical folder structure for organizing analytical investigations.
    Supports nesting with loop detection and max-depth guards.
    """
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent folder for hierarchical organization"
    )
    name = models.CharField(
        max_length=150,
        help_text="Human-readable folder title"
    )
    display_order = models.PositiveIntegerField(
        default=0,
        db_index=True,
        help_text="Sorting rank within sibling folders"
    )
    is_pinned = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Pinned folders appear in quick-access cockpit shelves"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='analysis_folders',
        help_text="User who initialized this workspace"
    )

    class Meta:
        ordering = ['display_order', 'name']
        verbose_name = 'Analysis Folder'
        verbose_name_plural = 'Analysis Folders'

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.parent_id and self.id and self.parent_id == self.id:
            raise ValidationError({'parent': "A folder cannot be its own parent."})
        
        # Traverse up parent hierarchy to detect cycles and depth bounds
        curr = self.parent
        depth = 0
        while curr is not None:
            depth += 1
            if depth > 10:
                raise ValidationError({'parent': "Folder hierarchy depth exceeds limit of 10 levels."})
            if curr.id == self.id:
                raise ValidationError({'parent': "Circular reference detected in folder hierarchy."})
            curr = curr.parent

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class SavedAnalysis(SoftDeleteModel):
    """
    Persistent snapshot of an analytical investigation session.
    Stores input parameters and cached analytical insights for instant retrieval.
    """
    ENGINE_CROSS_SELL = 'cross_sell'
    ENGINE_DEMAND = 'demand'
    ENGINE_VILLAGE = 'village'
    ENGINE_PRICING = 'pricing'
    ENGINE_DEFECTS = 'defects'
    ENGINE_DEFECT_RADAR = 'defect_radar'
    ENGINE_KHATA = 'khata'
    ENGINE_ANDON = 'andon'
    ENGINE_ADHOC = 'adhoc'

    ENGINE_CHOICES = [
        (ENGINE_CROSS_SELL, 'Market Basket & Cross-Selling'),
        (ENGINE_DEMAND, 'Seasonal Demand & Replenishment Forecasting'),
        (ENGINE_VILLAGE, 'Geographic Village Penetration Matrix'),
        (ENGINE_PRICING, 'Dynamic Pricing & Margin Elasticity'),
        (ENGINE_DEFECTS, 'Quality Defect & Return Radar'),
        (ENGINE_DEFECT_RADAR, 'Quality Defect & Return Radar (Legacy)'),
        (ENGINE_KHATA, 'Khata Working Capital Gate'),
        (ENGINE_ANDON, 'TPS Andon Cord Latch'),
        (ENGINE_ADHOC, 'Ad-Hoc Relational Discovery & Query Workbench'),
    ]

    folder = models.ForeignKey(
        AnalysisFolder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saved_analyses',
        help_text="Folder containing this analysis"
    )
    name = models.CharField(
        max_length=200,
        help_text="Title of the analysis investigation"
    )
    engine_type = models.CharField(
        max_length=50,
        choices=ENGINE_CHOICES,
        db_index=True,
        help_text="Target analytical quantitative engine"
    )
    parameters = models.JSONField(
        default=dict,
        blank=True,
        help_text="JSON payload of filter parameters, thresholds, and engine inputs"
    )
    cached_insights = models.JSONField(
        default=dict,
        blank=True,
        help_text="Cached analytical output summary, statistical markers, and charts"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='saved_analyses',
        help_text="Analyst or operator who generated this investigation"
    )

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Saved Analysis'
        verbose_name_plural = 'Saved Analyses'

    def __str__(self):
        return f"{self.name} ({self.get_engine_type_display()})"


class DiscoverySegment(SoftDeleteModel):
    """
    Operational cohort of business entities (Customers, Products, or Villages)
    surfaced by an analytical engine and ready for operational downstream action.
    """
    TARGET_CUSTOMER = 'customer'
    TARGET_PRODUCT = 'product'
    TARGET_VILLAGE = 'village'

    TARGET_CHOICES = [
        (TARGET_CUSTOMER, 'Customer'),
        (TARGET_PRODUCT, 'Product'),
        (TARGET_VILLAGE, 'Village'),
    ]

    name = models.CharField(
        max_length=200,
        help_text="Operational segment label (e.g. 'Krushnapur Inactive High-LTV')"
    )
    target_entity = models.CharField(
        max_length=50,
        choices=TARGET_CHOICES,
        db_index=True,
        help_text="Type of business entity contained in this cohort"
    )
    entity_ids = models.JSONField(
        default=list,
        blank=True,
        help_text="List of stringified UUIDs representing entities in this cohort"
    )
    cohort_metrics = models.JSONField(
        default=dict,
        blank=True,
        help_text="Summary statistical markers (e.g. total_debt, total_orders, average_margin)"
    )
    source_engine = models.CharField(
        max_length=50,
        blank=True,
        default='',
        db_index=True,
        help_text="Engine identifier that generated this cohort"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discovery_segments',
        help_text="User who committed this segment"
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Discovery Segment'
        verbose_name_plural = 'Discovery Segments'

    def __str__(self):
        count = len(self.entity_ids) if isinstance(self.entity_ids, list) else 0
        return f"{self.name} [{self.get_target_entity_display()}: {count} entities]"


class PipelineTransferLog(SoftDeleteModel):
    """
    Audit ledger tracking operational handoffs from analytical discovery
    into transactional subsystems (PO creation, price overrides, route dispatch).
    """
    PIPELINE_PO = 'purchase_order'
    PIPELINE_PRICE = 'price_override'
    PIPELINE_ROUTE = 'route_plan'

    PIPELINE_CHOICES = [
        (PIPELINE_PO, 'Purchase Order Dispatch'),
        (PIPELINE_PRICE, 'Catalog Price Override'),
        (PIPELINE_ROUTE, 'Delivery Route Plan'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_TRANSFERRED = 'transferred'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Action'),
        (STATUS_TRANSFERRED, 'Successfully Transferred'),
        (STATUS_REJECTED, 'Rejected / Aborted'),
    ]

    target_pipeline = models.CharField(
        max_length=50,
        choices=PIPELINE_CHOICES,
        db_index=True,
        help_text="Destination transactional system"
    )
    payload_snapshot = models.JSONField(
        default=dict,
        help_text="Immutable snapshot of parameters handed over to the pipeline"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
        help_text="Execution state of the transfer"
    )
    source_segment = models.ForeignKey(
        DiscoverySegment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pipeline_transfers',
        help_text="Originating discovery segment if applicable"
    )
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Operational notes or rejection explanations"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pipeline_transfers',
        help_text="User who initiated this pipeline transfer"
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Pipeline Transfer Log'
        verbose_name_plural = 'Pipeline Transfer Logs'

    def __str__(self):
        created_str = self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else ''
        return f"{self.get_target_pipeline_display()} - {self.status} ({created_str})"
