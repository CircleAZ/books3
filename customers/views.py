from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.throttling import UserRateThrottle
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Q, Count
from django.db import transaction

from core.permissions import HasRequiredPermission
from .models import Customer, Address, CustomerLink, Wallet, WalletTransaction
from .serializers import (
    CustomerListSerializer, CustomerDetailSerializer, CustomerCreateUpdateSerializer,
    AddressSerializer, CustomerLinkSerializer, WalletSerializer, WalletTransactionSerializer,
    SchoolSerializer, ClassSerializer, DivisionSerializer, SubdivisionSerializer,
    CustomerGroupSerializer, LinkTypeSerializer, LocationTagSerializer,
    ClassTemplateSerializer, DivisionTemplateSerializer, SubdivisionTemplateSerializer
)
from settings_app.models import (
    School, Class, Division, Subdivision, CustomerGroup, LinkType, LocationTag,
    ClassTemplate, DivisionTemplate, SubdivisionTemplate
)


class InlineSchoolCreateView(APIView):
    """
    Lightweight endpoint for cashiers to create Schools/Classes/Divisions
    inline during customer creation/editing. Requires only the
    'customers.inline_create_taxonomy' permission, NOT the full
    'customers.manage_tags' permission needed for the settings page.

    POST /api/customers/inline-school/
    { "type": "school", "name": "New School Name" }
    { "type": "class", "name": "Class 5", "school_id": "uuid" }
    { "type": "division", "name": "Section A", "class_id": "uuid" }
    """
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.inline_create_taxonomy'
    throttle_classes = [UserRateThrottle]  # CA-07: 30/min default

    def post(self, request):
        entity_type = request.data.get('type', '').strip().lower()
        name = request.data.get('name', '').strip()

        if not name:
            return Response({'error': 'Name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if entity_type == 'school':
            # ICE-05: case-insensitive lookup to prevent duplicates
            obj, created = School.objects.get_or_create(
                name__iexact=name, defaults={'name': name}
            )
            return Response({
                'id': str(obj.id), 'name': obj.name, 'created': created
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

        elif entity_type == 'class':
            school_id = request.data.get('school_id')
            if not school_id:
                return Response({'error': 'school_id is required for class creation.'},
                                status=status.HTTP_400_BAD_REQUEST)
            try:
                school = School.objects.get(id=school_id)
            except School.DoesNotExist:
                return Response({'error': 'School not found.'}, status=status.HTTP_404_NOT_FOUND)
            obj, created = Class.objects.get_or_create(
                school=school, name__iexact=name, defaults={'name': name}
            )
            return Response({
                'id': str(obj.id), 'name': obj.name, 'school_id': str(school.id), 'created': created
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

        elif entity_type == 'division':
            class_id = request.data.get('class_id')
            if not class_id:
                return Response({'error': 'class_id is required for division creation.'},
                                status=status.HTTP_400_BAD_REQUEST)
            try:
                class_obj = Class.objects.get(id=class_id)
            except Class.DoesNotExist:
                return Response({'error': 'Class not found.'}, status=status.HTTP_404_NOT_FOUND)
            obj, created = Division.objects.get_or_create(
                class_obj=class_obj, name__iexact=name, defaults={'name': name}
            )
            return Response({
                'id': str(obj.id), 'name': obj.name, 'class_id': str(class_obj.id), 'created': created
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

        else:
            return Response({'error': 'Invalid type. Use: school, class, or division.'},
                            status=status.HTTP_400_BAD_REQUEST)


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

    def list(self, request, *args, **kwargs):
        """Override list to include structure counts on each school."""
        qs = self.filter_queryset(self.get_queryset()).annotate(
            class_count=Count('classes', distinct=True),
            division_count=Count('classes__divisions', distinct=True),
            subdivision_count=Count('classes__divisions__subdivisions', distinct=True)
        )
        serializer = self.get_serializer(qs, many=True)
        data = serializer.data
        # Merge counts into response
        counts_map = {str(s.id): {'class_count': s.class_count, 'division_count': s.division_count, 'subdivision_count': s.subdivision_count} for s in qs}
        for item in data:
            counts = counts_map.get(item['id'], {})
            item['class_count'] = counts.get('class_count', 0)
            item['division_count'] = counts.get('division_count', 0)
            item['subdivision_count'] = counts.get('subdivision_count', 0)
        return Response(data)

    @action(detail=True, methods=['get'], url_path='structure')
    def structure(self, request, pk=None):
        """Return full nested tree for a school."""
        school = self.get_object()
        classes = Class.objects.filter(school=school).order_by('order', 'name')
        tree = []
        for cls in classes:
            divisions = Division.objects.filter(class_obj=cls).order_by('name')
            div_list = []
            for div in divisions:
                subdivs = Subdivision.objects.filter(division=div).order_by('name')
                div_list.append({
                    'id': str(div.id), 'name': div.name,
                    'subdivisions': [{'id': str(s.id), 'name': s.name} for s in subdivs]
                })
            tree.append({
                'id': str(cls.id), 'name': cls.name, 'order': cls.order,
                'divisions': div_list
            })
        return Response({'school': str(school.id), 'name': school.name, 'tree': tree})

    @action(detail=True, methods=['post'], url_path='assign-structure')
    def assign_structure(self, request, pk=None):
        """Assign class/division/subdivision structure from catalog templates."""
        school = self.get_object()
        structure = request.data.get('structure', [])

        # Ironclad ICE-05: Limit max records per request
        total_items = 0
        for cls_data in structure:
            total_items += 1
            for div_data in cls_data.get('divisions', []):
                total_items += 1
                total_items += len(div_data.get('subdivisions', []))
        if total_items > 500:
            return Response(
                {'error': 'Too many items. Maximum 500 per request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        created = {'classes': 0, 'divisions': 0, 'subdivisions': 0}

        with transaction.atomic():
            for cls_data in structure:
                class_name = cls_data.get('class_name', '').strip()
                if not class_name:
                    continue
                class_obj, class_created = Class.objects.get_or_create(
                    school=school,
                    name=class_name,
                    defaults={'order': cls_data.get('order', 0)}
                )
                if class_created:
                    created['classes'] += 1

                for div_data in cls_data.get('divisions', []):
                    div_name = div_data.get('name', '').strip()
                    if not div_name:
                        continue
                    div_obj, div_created = Division.objects.get_or_create(
                        class_obj=class_obj,
                        name=div_name
                    )
                    if div_created:
                        created['divisions'] += 1

                    for subdiv_name in div_data.get('subdivisions', []):
                        subdiv_name = subdiv_name.strip() if isinstance(subdiv_name, str) else ''
                        if not subdiv_name:
                            continue
                        _, subdiv_created = Subdivision.objects.get_or_create(
                            division=div_obj,
                            name=subdiv_name
                        )
                        if subdiv_created:
                            created['subdivisions'] += 1

        return Response({
            'school': str(school.id),
            'created': created,
            'message': f"Created {created['classes']} classes, {created['divisions']} divisions, {created['subdivisions']} subdivisions"
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='delete-with-structure')
    def delete_with_structure(self, request, pk=None):
        """Delete school and all its classes/divisions/subdivisions (CASCADE)."""
        school = self.get_object()
        name = school.name
        with transaction.atomic():
            school.delete()
        return Response({'message': f"Deleted '{name}' and all its structure"})


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


# ============ Template Catalog ViewSets ============

class ClassTemplateViewSet(viewsets.ModelViewSet):
    queryset = ClassTemplate.objects.all()
    serializer_class = ClassTemplateSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class DivisionTemplateViewSet(viewsets.ModelViewSet):
    queryset = DivisionTemplate.objects.all()
    serializer_class = DivisionTemplateSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class SubdivisionTemplateViewSet(viewsets.ModelViewSet):
    queryset = SubdivisionTemplate.objects.all()
    serializer_class = SubdivisionTemplateSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


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
