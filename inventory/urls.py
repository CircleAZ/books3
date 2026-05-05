from rest_framework.routers import DefaultRouter
from .views import (
    ProductViewSet, CategoryViewSet, VendorViewSet, TagViewSet, 
    StockHistoryViewSet, StockAdjustmentViewSet
)


router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='product')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'stock-history', StockHistoryViewSet, basename='stock-history')
router.register(r'stock-adjustments', StockAdjustmentViewSet, basename='stock-adjustment')


urlpatterns = router.urls