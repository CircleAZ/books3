"""
Views for Customer app.
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Q

from .models import Customer, Address, CustomerLink, Wallet, WalletTransaction
from .serializers import (
    CustomerListSerializer, CustomerDetailSerializer, CustomerCreateUpdateSerializer,
    AddressSerializer, CustomerLinkSerializer, WalletSerializer, WalletTransactionSerializer,
    SchoolSerializer, ClassSerializer, DivisionSerializer, SubdivisionSerializer,
    CustomerGroupSerializer, LinkTypeSerializer, LocationTagSerializer
)
from settings_app.models import School, Class, Division, Subdivision, CustomerGroup, LinkType, LocationTag


class CustomerViewSet(viewsets.ModelViewSet):
    """
    CRUD operations for customers.
    """
    queryset = Customer.objects.all().select_related(
        'school', 'class_obj', 'division', 'subdivision', 'customer_group', 'wallet'
    ).prefetch_related('addresses', 'addresses__location_tags')
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['first_name', 'middle_name', 'last_name', 'phone', 'email', 'display_id']
    ordering_fields = ['created_at', 'first_name', 'last_name', 'display_id']
    filterset_fields = ['school', 'class_obj', 'division', 'customer_group']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return CustomerCreateUpdateSerializer
        return CustomerDetailSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def purchase_history(self, request, pk=None):
        """Get customer's order history (stub - requires Orders module)."""
        customer = self.get_object()
        # TODO: Implement when Orders module is ready
        return Response({'orders': [], 'total_spent': 0})
    
    @action(detail=True, methods=['get'])
    def wallet(self, request, pk=None):
        """Get customer's wallet details."""
        customer = self.get_object()
        wallet, _ = Wallet.objects.get_or_create(customer=customer)
        serializer = WalletSerializer(wallet)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def wallet_credit(self, request, pk=None):
        """Add credit to customer wallet."""
        from decimal import Decimal, InvalidOperation
        customer = self.get_object()
        wallet, _ = Wallet.objects.get_or_create(customer=customer)
        
        amount = request.data.get('amount')
        reason = request.data.get('reason', 'Manual credit')
        
        try:
            amount_decimal = Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Valid amount required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if amount_decimal <= 0:
            return Response({'error': 'Amount must be positive'}, status=status.HTTP_400_BAD_REQUEST)
        
        wallet.credit(amount_decimal, reason, request.user)
        return Response({'balance': float(wallet.balance)})
    
    @action(detail=True, methods=['post'])
    def wallet_debit(self, request, pk=None):
        """Deduct from customer wallet."""
        from decimal import Decimal, InvalidOperation
        customer = self.get_object()
        wallet, _ = Wallet.objects.get_or_create(customer=customer)
        
        amount = request.data.get('amount')
        reason = request.data.get('reason', 'Manual debit')
        
        try:
            amount_decimal = Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Valid amount required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if amount_decimal <= 0:
            return Response({'error': 'Amount must be positive'}, status=status.HTTP_400_BAD_REQUEST)
        
        if wallet.debit(amount_decimal, reason, request.user):
            return Response({'balance': float(wallet.balance)})
        return Response({'error': 'Insufficient balance'}, status=status.HTTP_400_BAD_REQUEST)


class AddressViewSet(viewsets.ModelViewSet):
    """CRUD for customer addresses."""
    queryset = Address.objects.all().prefetch_related('location_tags')
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['customer', 'is_primary']


class CustomerLinkViewSet(viewsets.ModelViewSet):
    """CRUD for customer links (relationships)."""
    queryset = CustomerLink.objects.all().select_related('customer_a', 'customer_b', 'link_type')
    serializer_class = CustomerLinkSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['customer_a', 'customer_b', 'link_type']
    
    def get_queryset(self):
        """Filter by customer if provided in query params."""
        qs = super().get_queryset()
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            qs = qs.filter(Q(customer_a_id=customer_id) | Q(customer_b_id=customer_id))
        return qs


class WalletViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only view for wallets. Use Customer actions for credit/debit."""
    queryset = Wallet.objects.all().select_related('customer').prefetch_related('transactions')
    serializer_class = WalletSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['customer']


# ============ Settings App ViewSets ============

class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class ClassViewSet(viewsets.ModelViewSet):
    queryset = Class.objects.all().select_related('school')
    serializer_class = ClassSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['school']


class DivisionViewSet(viewsets.ModelViewSet):
    queryset = Division.objects.all().select_related('class_obj')
    serializer_class = DivisionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['class_obj']


class SubdivisionViewSet(viewsets.ModelViewSet):
    queryset = Subdivision.objects.all().select_related('division')
    serializer_class = SubdivisionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['division']


class CustomerGroupViewSet(viewsets.ModelViewSet):
    queryset = CustomerGroup.objects.all()
    serializer_class = CustomerGroupSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class LinkTypeViewSet(viewsets.ModelViewSet):
    queryset = LinkType.objects.all()
    serializer_class = LinkTypeSerializer
    permission_classes = [IsAuthenticated]


class LocationTagViewSet(viewsets.ModelViewSet):
    queryset = LocationTag.objects.all()
    serializer_class = LocationTagSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']
    
    @action(detail=True, methods=['post'])
    def merge(self, request, pk=None):
        """Merge this tag into another tag. All addresses using this tag will be reassigned."""
        from django.db import transaction as db_transaction
        
        source_tag = self.get_object()
        target_tag_id = request.data.get('target_tag_id')
        
        if not target_tag_id:
            return Response({'error': 'target_tag_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            target_tag = LocationTag.objects.get(pk=target_tag_id)
        except LocationTag.DoesNotExist:
            return Response({'error': 'Target tag not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if source_tag.pk == target_tag.pk:
            return Response({'error': 'Cannot merge a tag into itself'}, status=status.HTTP_400_BAD_REQUEST)
        
        with db_transaction.atomic():
            # Reassign all addresses from source to target
            from .models import Address
            for address in Address.objects.filter(location_tags=source_tag):
                address.location_tags.add(target_tag)
                address.location_tags.remove(source_tag)
            
            source_name = source_tag.name
            source_tag.delete()
        
        return Response({
            'status': f'Tag "{source_name}" merged into "{target_tag.name}"',
            'target_tag': LocationTagSerializer(target_tag).data
        })
