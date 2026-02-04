from rest_framework.routers import DefaultRouter
from .views import ProductViewSet, CategoryViewSet, VendorViewSet, TagViewSet

router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='product')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'tags', TagViewSet, basename='tag')

urlpatterns = router.urls