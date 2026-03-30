from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .product_set_models import ProductSet, ProductSetItem
from .product_set_serializers import (
    ProductSetSerializer,
    ProductSetCreateSerializer,
    ProductSetItemSerializer,
)


class ProductSetViewSet(viewsets.ModelViewSet):
    """
    CRUD for Product Sets + resolve endpoint for POS.
    
    Endpoints:
      GET    /api/inventory/product-sets/          — list all sets
      POST   /api/inventory/product-sets/          — create set (with inline items)
      GET    /api/inventory/product-sets/{id}/      — retrieve
      PUT    /api/inventory/product-sets/{id}/      — update (replaces items)
      DELETE /api/inventory/product-sets/{id}/      — delete
      POST   /api/inventory/product-sets/{id}/duplicate/  — clone set
      GET    /api/inventory/product-sets/resolve/   — find best set for customer scope
    """
    permission_classes = [IsAuthenticated]
    queryset = ProductSet.objects.all()

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductSetCreateSerializer
        return ProductSetSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related('school').prefetch_related(
            'items__product'
        )
        # Filters
        class_name = self.request.query_params.get('class_name')
        school_id = self.request.query_params.get('school')
        active_only = self.request.query_params.get('active_only')
        search = self.request.query_params.get('search')

        if class_name:
            qs = qs.filter(class_name=class_name)
        if school_id:
            qs = qs.filter(school_id=school_id)
        if active_only and active_only.lower() == 'true':
            qs = qs.filter(is_active=True)
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    @action(detail=False, methods=['get'])
    def resolve(self, request):
        """
        Resolve the best matching product set for a customer's scope.
        
        Query params:
          class_name (required) — e.g. "7"
          school_id (optional) — UUID of school
          division_name (optional)
          subdivision_name (optional)
        
        Returns the most specific matching active set, or 404 if none.
        """
        class_name = request.query_params.get('class_name', '')
        school_id = request.query_params.get('school_id')
        division_name = request.query_params.get('division_name', '')
        subdivision_name = request.query_params.get('subdivision_name', '')

        if not class_name:
            return Response(
                {'error': 'class_name is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        product_set = ProductSet.resolve_for_customer(
            class_name=class_name,
            school_id=school_id if school_id else None,
            division_name=division_name,
            subdivision_name=subdivision_name,
        )

        if not product_set:
            return Response(
                {'message': 'No matching product set found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Build scope label for UI
        scope_parts = [f"Class {class_name}"]
        if product_set.school:
            scope_parts.append(product_set.school.name)
        if product_set.division_name:
            scope_parts.append(f"Div {product_set.division_name}")
        if product_set.subdivision_name:
            scope_parts.append(product_set.subdivision_name)

        serializer = ProductSetSerializer(product_set)
        return Response({
            'product_set': serializer.data,
            'scope_label': ' › '.join(scope_parts),
        })

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Clone a product set. Optionally assign to a different school.
        Body: { school: <uuid|null>, name: "optional new name" }
        """
        original = self.get_object()

        new_name = request.data.get('name', f"{original.name} (Copy)")
        new_school = request.data.get('school', original.school_id)

        clone = ProductSet.objects.create(
            name=new_name,
            description=original.description,
            class_name=original.class_name,
            school_id=new_school if new_school else None,
            division_name=original.division_name,
            subdivision_name=original.subdivision_name,
            is_active=original.is_active,
            created_by=request.user,
        )

        # Clone items
        for item in original.items.all():
            ProductSetItem.objects.create(
                product_set=clone,
                product=item.product,
                quantity=item.quantity,
                notes=item.notes,
            )

        serializer = ProductSetSerializer(clone)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
