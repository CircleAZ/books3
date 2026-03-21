from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerViewSet, AddressViewSet, CustomerLinkViewSet, WalletViewSet,
    SchoolViewSet, ClassViewSet, DivisionViewSet, SubdivisionViewSet,
    CustomerGroupViewSet, LinkTypeViewSet, LocationTagViewSet,
    ClassTemplateViewSet, DivisionTemplateViewSet, SubdivisionTemplateViewSet,
    InlineSchoolCreateView
)

router = DefaultRouter()

# Customer resources
router.register(r'customers', CustomerViewSet)
router.register(r'addresses', AddressViewSet)
router.register(r'links', CustomerLinkViewSet)
router.register(r'wallets', WalletViewSet)

# Settings resources (for cascading dropdowns)
router.register(r'schools', SchoolViewSet)
router.register(r'classes', ClassViewSet)
router.register(r'divisions', DivisionViewSet)
router.register(r'subdivisions', SubdivisionViewSet)
router.register(r'customer-groups', CustomerGroupViewSet)
router.register(r'link-types', LinkTypeViewSet)
router.register(r'location-tags', LocationTagViewSet)

# Template catalogs (reusable name pools)
router.register(r'class-templates', ClassTemplateViewSet)
router.register(r'division-templates', DivisionTemplateViewSet)
router.register(r'subdivision-templates', SubdivisionTemplateViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('inline-school/', InlineSchoolCreateView.as_view(), name='inline-school-create'),
]

