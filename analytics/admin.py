from django.contrib import admin
from .models import AnalysisFolder, SavedAnalysis, DiscoverySegment, PipelineTransferLog


@admin.register(AnalysisFolder)
class AnalysisFolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'display_order', 'is_pinned', 'created_by', 'created_at')
    list_filter = ('is_pinned', 'created_at')
    search_fields = ('name',)
    ordering = ('display_order', 'name')


@admin.register(SavedAnalysis)
class SavedAnalysisAdmin(admin.ModelAdmin):
    list_display = ('name', 'engine_type', 'folder', 'created_by', 'created_at', 'updated_at')
    list_filter = ('engine_type', 'created_at')
    search_fields = ('name',)


@admin.register(DiscoverySegment)
class DiscoverySegmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'target_entity', 'source_engine', 'created_by', 'created_at')
    list_filter = ('target_entity', 'source_engine', 'created_at')
    search_fields = ('name',)


@admin.register(PipelineTransferLog)
class PipelineTransferLogAdmin(admin.ModelAdmin):
    list_display = ('target_pipeline', 'status', 'source_segment', 'created_by', 'created_at')
    list_filter = ('target_pipeline', 'status', 'created_at')
