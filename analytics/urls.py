from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AnalysisFolderViewSet,
    SavedAnalysisViewSet,
    DiscoverySegmentViewSet,
    PipelineTransferLogViewSet,
    CustomerRecommendationsView,
    AnalyticsStudioComputeView,
    AdHocQueryView,
)

router = DefaultRouter()
router.register(r'folders', AnalysisFolderViewSet, basename='analysis-folder')
router.register(r'saved-analyses', SavedAnalysisViewSet, basename='saved-analysis')
router.register(r'segments', DiscoverySegmentViewSet, basename='discovery-segment')
router.register(r'pipeline-transfers', PipelineTransferLogViewSet, basename='pipeline-transfer')

urlpatterns = [
    path('recommendations/', CustomerRecommendationsView.as_view(), name='customer-recommendations'),
    path('adhoc-query/', AdHocQueryView.as_view(), name='adhoc-query'),
    path('compute/<str:engine_name>/', AnalyticsStudioComputeView.as_view(), name='studio-compute'),
    path('', include(router.urls)),
]
