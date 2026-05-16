from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.throttling import UserRateThrottle
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Q, Count, Subquery, OuterRef
from django.db.models import Prefetch
from django.db import transaction
from orders.constants import VALID_SALE_STATUSES

from core.permissions import HasRequiredPermission
from .models import Customer, Address, CustomerLink, Wallet, WalletTransaction, TargetVillage, PotentialCustomer, GeographicRegion, LegacyDebt
from .serializers import (
    CustomerListSerializer, CustomerDetailSerializer, CustomerCreateUpdateSerializer,
    AddressSerializer, CustomerLinkSerializer, WalletSerializer, WalletTransactionSerializer,
    SchoolSerializer, ClassSerializer, DivisionSerializer, SubdivisionSerializer,
    CustomerGroupSerializer, LinkTypeSerializer, LocationTagSerializer,
    ClassTemplateSerializer, DivisionTemplateSerializer, SubdivisionTemplateSerializer,
    PotentialCustomerSerializer, GeographicRegionSerializer, LegacyDebtSerializer
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
    required_permission = 'customers.manage_customers'
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
    # Base queryset for router model detection
    queryset = Customer.objects.all()
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['first_name', 'middle_name', 'last_name', 'phone', 'email', 'display_id']
    ordering_fields = ['created_at', 'first_name', 'last_name', 'display_id']
    filterset_fields = ['customer_group']
    
    def get_queryset(self):
        # ── Lean path: list view — no address prefetch ──
        if self.action == 'list':
            return Customer.objects.select_related(
                'customer_group', 'wallet', 'legacy_debt'
            ).prefetch_related('students')
        # ── Fat path: retrieve/update — full address data ──
        return Customer.objects.select_related(
            'customer_group', 'wallet', 'legacy_debt'
        ).prefetch_related('addresses', 'addresses__location_tags', 'students', 'students__school', 'students__class_obj', 'students__division', 'students__subdivision')

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

    @action(detail=False, methods=['get'], url_path='map_data')
    def map_data(self, request):
        """
        Returns customer geo data with order stats for the Customer Map View.
        Season = Dec 1 → Nov 30. Filters out NULL/0,0 coordinates.
        Uses primary address only. RBAC-gated.
        """
        from django.db.models import Max, F, Value, CharField, DecimalField
        from django.db.models.functions import Coalesce
        from orders.models import Order as OrderModel
        from django.utils.html import strip_tags
        from django.utils import timezone
        from settings_app.models import Permission, RolePermission, Role, CustomerGroup
        import datetime

        # RBAC check: customers.view_map
        if not request.user.is_superuser:
            user_roles = Role.objects.filter(role_users__user=request.user)
            has_perm = RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename='customers.view_map'
            ).exists()
            if not has_perm:
                return Response(
                    {'detail': 'You do not have permission to view the customer map.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Season logic: Dec 1 → Nov 30
        today = timezone.now().date()
        season_year_param = request.query_params.get('season')

        if season_year_param:
            try:
                sy = int(season_year_param)
                season_start = datetime.date(sy, 12, 1)
                season_end = datetime.date(sy + 1, 11, 30)
            except (ValueError, TypeError):
                season_start = None
                season_end = None
        else:
            season_start = None
            season_end = None

        if not season_start:
            if today.month >= 12:
                season_start = datetime.date(today.year, 12, 1)
                season_end = datetime.date(today.year + 1, 11, 30)
            else:
                season_start = datetime.date(today.year - 1, 12, 1)
                season_end = datetime.date(today.year, 11, 30)

        # Previous season
        prev_season_start = datetime.date(season_start.year - 1, 12, 1)
        prev_season_end = datetime.date(season_start.year, 11, 30)

        # ── Phase 2 filter params ──
        filter_village = request.query_params.get('village', '').strip()
        filter_status = request.query_params.get('status', '').strip()  # comma-separated
        filter_group = request.query_params.get('group', '').strip()
        status_set = set(filter_status.split(',')) if filter_status else set()

        # Confirmed/completed orders only
        valid_statuses = VALID_SALE_STATUSES

        # Query: customers with valid primary address coordinates
        customers = Customer.objects.filter(
            addresses__is_primary=True,
            addresses__location__isnull=False,
        )

        # ORM-level group filter
        if filter_group:
            customers = customers.filter(customer_group__name__iexact=filter_group)

        # Subquery: last order display_id (kills N+1 — was 1 query per customer)
        last_order_subquery = Subquery(
            OrderModel.objects.filter(
                customer=OuterRef('pk'),
                order_status__in=valid_statuses,
            ).order_by('-created_at').values('display_id')[:1]
        )

        # Prefetch addresses WITH region join (kills N+1 on addr.region)
        address_prefetch = Prefetch(
            'addresses',
            queryset=Address.objects.select_related('region').prefetch_related('location_tags')
        )

        customers = customers.select_related(
            'customer_group'
        ).prefetch_related(
            address_prefetch
        ).annotate(
            last_order_date=Max(
                'orders__created_at',
                filter=Q(orders__order_status__in=valid_statuses)
            ),
            total_order_count=Count(
                'orders',
                filter=Q(orders__order_status__in=valid_statuses)
            ),
            total_amount_spent=Coalesce(
                Sum('orders__total', filter=Q(orders__order_status__in=valid_statuses)),
                Value(0, output_field=DecimalField()),
                output_field=DecimalField()
            ),
            season_order_count=Count(
                'orders',
                filter=Q(
                    orders__created_at__date__gte=season_start,
                    orders__created_at__date__lte=season_end,
                    orders__order_status__in=valid_statuses
                )
            ),
            season_delivered_count=Count(
                'orders',
                filter=Q(
                    orders__created_at__date__gte=season_start,
                    orders__created_at__date__lte=season_end,
                    orders__order_status__in=valid_statuses,
                    orders__delivery_status='delivered'
                )
            ),
            season_partial_count=Count(
                'orders',
                filter=Q(
                    orders__created_at__date__gte=season_start,
                    orders__created_at__date__lte=season_end,
                    orders__order_status__in=valid_statuses,
                    orders__delivery_status='partial'
                )
            ),
            prev_season_order_count=Count(
                'orders',
                filter=Q(
                    orders__created_at__date__gte=prev_season_start,
                    orders__created_at__date__lte=prev_season_end,
                    orders__order_status__in=valid_statuses
                )
            ),
            last_order_display_id=last_order_subquery,
        ).distinct()

        # Build response
        customer_list = []
        stats = {'total_mapped': 0, 'active': 0, 'fully_delivered': 0, 'partially_delivered': 0, 'followup': 0, 'lapsed': 0, 'prospect': 0}
        villages = {}

        for c in customers:
            # Get primary address
            primary_addr = None
            for addr in c.addresses.all():
                if addr.is_primary and addr.location:
                    primary_addr = addr
                    break

            if not primary_addr:
                continue

            # Phase 2: village filter (post-query, region name match)
            addr_region_name = (primary_addr.region.name if primary_addr.region else '').strip().lower()
            if filter_village and addr_region_name != filter_village.lower():
                continue

            # Marker status (delivery-aware split for season orders)
            if c.season_order_count > 0:
                if c.season_delivered_count == c.season_order_count:
                    marker_status = 'fully_delivered'
                    stats['fully_delivered'] += 1
                elif c.season_delivered_count == 0 and c.season_partial_count == 0:
                    # All orders are pending — nothing shipped yet
                    marker_status = 'active'
                    stats['active'] += 1
                else:
                    # Mix of delivered/partial/pending
                    marker_status = 'partially_delivered'
                    stats['partially_delivered'] += 1
            elif c.prev_season_order_count > 0:
                marker_status = 'followup'
                stats['followup'] += 1
            elif c.total_order_count > 0:
                marker_status = 'lapsed'
                stats['lapsed'] += 1
            else:
                marker_status = 'prospect'
                stats['prospect'] += 1

            # Phase 2: status filter
            if status_set and marker_status not in status_set:
                continue


            stats['total_mapped'] += 1

            # Village tracking (region-based)
            village_key = (primary_addr.region.name if primary_addr.region else '').strip().lower()
            if village_key:
                if village_key not in villages:
                    villages[village_key] = {
                        'name': primary_addr.region.name.strip(),
                        'total': 0, 'active': 0
                    }
                villages[village_key]['total'] += 1
                if marker_status in ('active', 'fully_delivered', 'partially_delivered'):
                    villages[village_key]['active'] += 1

            # Location tags (already prefetched via address_prefetch)
            loc_tags = [
                strip_tags(lt.name) for lt in primary_addr.location_tags.all()
            ]

            customer_list.append({
                'id': str(c.id),
                'display_id': c.display_id,
                'full_name': strip_tags(c.full_name),
                'phone': c.phone,
                'village': strip_tags(primary_addr.region.name if primary_addr.region else ''),
                'faliya': strip_tags(primary_addr.faliya or ''),
                'landmark': strip_tags(primary_addr.landmark or ''),
                'latitude': str(primary_addr.location.y),
                'longitude': str(primary_addr.location.x),
                'customer_group': strip_tags(c.customer_group.name) if c.customer_group else None,
                'location_tags': loc_tags,
                'total_orders': c.total_order_count,
                'total_spent': str(c.total_amount_spent or 0),
                'last_order_date': c.last_order_date.strftime('%Y-%m-%d') if c.last_order_date else None,
                'last_order_id': c.last_order_display_id,
                'season_orders': c.season_order_count,
                'marker_status': marker_status,
            })

        # Build village summary
        village_list = []
        for vk, vdata in sorted(villages.items()):
            pct = round((vdata['active'] / vdata['total'] * 100)) if vdata['total'] > 0 else 0
            village_list.append({
                'name': vdata['name'],
                'total_customers': vdata['total'],
                'ordered_this_season': vdata['active'],
                'coverage_pct': pct,
            })

        # ── Phase 2: filter_options for frontend dropdowns ──
        all_village_names = sorted(set(
            Address.objects.filter(
                is_primary=True, customer__isnull=False,
                location__isnull=False,
                region__isnull=False,
            ).values_list('region__name', flat=True)
        ), key=str.lower)

        all_groups = list(
            CustomerGroup.objects.all()
            .order_by('name')
            .values_list('name', flat=True)
        )

        # Available seasons: current + 2 previous
        current_sy = season_start.year
        available_seasons = [
            {'value': str(current_sy - i),
             'label': f"Dec {current_sy - i} – Nov {current_sy - i + 1}"}
            for i in range(3)
        ]

        # Coverage stats for enhanced stats bar
        total_mapped = stats['total_mapped']
        covered = stats['active'] + stats['fully_delivered'] + stats['partially_delivered']
        coverage_pct = round((covered / total_mapped * 100)) if total_mapped > 0 else 0

        # ── Phase 3: Target villages ──
        target_qs = TargetVillage.objects.select_related('created_by').all()
        target_village_list = [
            {
                'id': str(tv.id),
                'name': tv.name,
                'latitude': str(tv.location.y),
                'longitude': str(tv.location.x),
                'target_season': tv.target_season,
                'season_label': f"Dec {tv.target_season} \u2013 Nov {int(tv.target_season) + 1}",
                'notes': tv.notes,
                'created_by_name': tv.created_by.get_full_name() if tv.created_by else '',
            }
            for tv in target_qs
        ]

        # ── Potential customers for map display ──
        # DB-level filter: active pins + dissolved-within-current-season (M11)
        # Avoids loading stale dissolved pins from previous seasons into memory.
        potential_qs = PotentialCustomer.objects.filter(
            location__isnull=False
        ).filter(
            Q(is_dissolved=False) |
            Q(is_dissolved=True, dissolved_at__date__gte=season_start, dissolved_at__date__lte=season_end)
        ).select_related('created_by', 'dissolved_into')

        potential_list = []
        for pc in potential_qs:
            potential_list.append({
                'id': str(pc.id),
                'latitude': str(pc.location.y),
                'longitude': str(pc.location.x),
                'notes': pc.notes,
                'created_by_name': (pc.created_by.get_full_name() or pc.created_by.username) if pc.created_by else '',
                'created_by_id': str(pc.created_by.id) if pc.created_by else None,
                'created_at': pc.created_at.isoformat() if pc.created_at else None,
                'is_dissolved': pc.is_dissolved,
                'dissolved_into_name': pc.dissolved_into.full_name if pc.dissolved_into else None,
                'dissolved_at': pc.dissolved_at.isoformat() if pc.dissolved_at else None,
            })

        return Response({
            'season': {
                'start': season_start.isoformat(),
                'end': season_end.isoformat(),
                'label': f"Dec {season_start.year} \u2013 Nov {season_end.year}",
            },
            'stats': {
                **stats,
                'coverage_pct': coverage_pct,
                'total_villages': len(village_list),
                'total_targets': len(target_village_list),
            },
            'villages': village_list,
            'customers': customer_list,
            'target_villages': target_village_list,
            'potential_customers': potential_list,
            'filter_options': {
                'villages': all_village_names,
                'customer_groups': all_groups,
                'seasons': available_seasons,
            },
        })

    # ═══════════════════════════════════════════════════
    # Phase 3: Season Summary Report
    # ═══════════════════════════════════════════════════

    @action(detail=False, methods=['get'], url_path='season_report')
    def season_report(self, request):
        """Year-over-year season comparison report."""
        from django.db.models import Max, F, Value, CharField, DecimalField
        from django.db.models.functions import Coalesce
        from django.utils.html import strip_tags
        from django.utils import timezone
        from orders.models import Order
        from settings_app.models import Permission, RolePermission, Role
        import datetime

        # RBAC: same as map
        if not request.user.is_superuser:
            user_roles = Role.objects.filter(role_users__user=request.user)
            has_perm = RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename='customers.view_map'
            ).exists()
            if not has_perm:
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.now().date()
        season_year_param = request.query_params.get('season')

        def get_season_bounds(year):
            return datetime.date(year, 12, 1), datetime.date(year + 1, 11, 30)

        if season_year_param:
            try:
                sy = int(season_year_param)
            except (ValueError, TypeError):
                sy = today.year - 1 if today.month < 12 else today.year
        else:
            sy = today.year - 1 if today.month < 12 else today.year

        current_start, current_end = get_season_bounds(sy)
        prev_start, prev_end = get_season_bounds(sy - 1)

        valid_statuses = VALID_SALE_STATUSES

        def compute_season_data(s_start, s_end):
            """Compute coverage stats for a given season."""
            customers = Customer.objects.filter(
                addresses__is_primary=True,
                addresses__location__isnull=False,
            ).prefetch_related('addresses', 'addresses__region').annotate(
                season_orders=Count(
                    'orders',
                    filter=Q(
                        orders__created_at__date__gte=s_start,
                        orders__created_at__date__lte=s_end,
                        orders__order_status__in=valid_statuses
                    )
                ),
                season_revenue=Coalesce(
                    Sum('orders__total', filter=Q(
                        orders__created_at__date__gte=s_start,
                        orders__created_at__date__lte=s_end,
                        orders__order_status__in=valid_statuses
                    )),
                    Value(0, output_field=DecimalField()),
                    output_field=DecimalField()
                ),
            ).distinct()

            total = 0
            covered = 0
            total_revenue = 0
            villages = {}

            for c in customers:
                primary_addr = None
                for addr in c.addresses.all():
                    if addr.is_primary and addr.location:
                        primary_addr = addr
                        break
                if not primary_addr:
                    continue

                total += 1
                is_covered = c.season_orders > 0
                if is_covered:
                    covered += 1
                total_revenue += float(c.season_revenue or 0)

                vk = (primary_addr.region.name if primary_addr.region else '').strip().lower()
                if vk:
                    if vk not in villages:
                        villages[vk] = {'name': primary_addr.region.name.strip(), 'total': 0, 'covered': 0, 'revenue': 0}
                    villages[vk]['total'] += 1
                    if is_covered:
                        villages[vk]['covered'] += 1
                    villages[vk]['revenue'] += float(c.season_revenue or 0)

            village_list = []
            for vk, vd in sorted(villages.items()):
                pct = round((vd['covered'] / vd['total'] * 100)) if vd['total'] > 0 else 0
                village_list.append({
                    'name': vd['name'],
                    'total': vd['total'],
                    'covered': vd['covered'],
                    'pct': pct,
                    'revenue': f"{vd['revenue']:.2f}",
                })

            return {
                'season_label': f"Dec {s_start.year} \u2013 Nov {s_end.year}",
                'total_villages': len(village_list),
                'total_customers': total,
                'covered': covered,
                'coverage_pct': round((covered / total * 100), 1) if total > 0 else 0,
                'total_revenue': f"{total_revenue:.2f}",
                'villages': village_list,
            }

        current_data = compute_season_data(current_start, current_end)
        prev_data = compute_season_data(prev_start, prev_end)

        # YoY deltas
        def delta_str(curr, prev, is_pct=False):
            diff = curr - prev
            sign = '+' if diff >= 0 else ''
            if is_pct:
                return f"{sign}{diff:.1f}%"
            return f"{sign}{diff}"

        yoy = {
            'villages_delta': delta_str(current_data['total_villages'], prev_data['total_villages']),
            'customers_delta': delta_str(current_data['total_customers'], prev_data['total_customers']),
            'coverage_delta': delta_str(current_data['coverage_pct'], prev_data['coverage_pct'], True),
            'revenue_delta': delta_str(
                float(current_data['total_revenue']),
                float(prev_data['total_revenue']) if float(prev_data['total_revenue']) > 0 else 1,
            ),
        }

        return Response({
            'current': current_data,
            'previous': prev_data,
            'yoy': yoy,
        })

    # ═══════════════════════════════════════════════════
    # Phase 3: Coverage PDF Export
    # ═══════════════════════════════════════════════════

    @action(detail=False, methods=['get'], url_path='coverage_pdf')
    def coverage_pdf(self, request):
        """Generate printable door-to-door checklist PDF."""
        from django.utils.html import strip_tags
        from django.utils import timezone
        from django.template.loader import render_to_string
        from django.http import HttpResponse
        from orders.models import Order
        from settings_app.models import Permission, RolePermission, Role
        import datetime
        import io

        # RBAC
        if not request.user.is_superuser:
            user_roles = Role.objects.filter(role_users__user=request.user)
            has_perm = RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename='customers.view_map'
            ).exists()
            if not has_perm:
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        village_filter = request.query_params.get('village', '').strip()
        season_param = request.query_params.get('season', '').strip()

        today = timezone.now().date()
        if season_param:
            try:
                sy = int(season_param)
            except (ValueError, TypeError):
                sy = today.year - 1 if today.month < 12 else today.year
        else:
            sy = today.year - 1 if today.month < 12 else today.year

        season_start = datetime.date(sy, 12, 1)
        season_end = datetime.date(sy + 1, 11, 30)
        season_label = f"Dec {sy} \u2013 Nov {sy + 1}"

        valid_statuses = VALID_SALE_STATUSES

        customers = Customer.objects.filter(
            addresses__is_primary=True,
            addresses__location__isnull=False,
        ).prefetch_related('addresses', 'addresses__region').annotate(
            season_orders=Count(
                'orders',
                filter=Q(
                    orders__created_at__date__gte=season_start,
                    orders__created_at__date__lte=season_end,
                    orders__order_status__in=valid_statuses
                )
            ),
        ).distinct()

        rows = []
        for c in customers:
            primary_addr = None
            for addr in c.addresses.all():
                if addr.is_primary and addr.location:
                    primary_addr = addr
                    break
            if not primary_addr:
                continue

            v = (primary_addr.region.name if primary_addr.region else '').strip()
            if village_filter and v.lower() != village_filter.lower():
                continue

            if c.season_orders > 0:
                status_label = '✓ Covered'
            else:
                status_label = '★ Not yet'

            rows.append({
                'village': strip_tags(v),
                'faliya': strip_tags(primary_addr.faliya or ''),
                'name': strip_tags(c.full_name),
                'phone': c.phone or '',
                'status': status_label,
            })

        rows.sort(key=lambda r: (r['village'].lower(), r['faliya'].lower(), r['name'].lower()))

        # Build HTML for PDF
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
        <style>
            body {{ font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }}
            h1 {{ font-size: 16px; margin-bottom: 4px; }}
            h2 {{ font-size: 12px; color: #666; margin-top: 0; margin-bottom: 16px; }}
            table {{ width: 100%; border-collapse: collapse; }}
            th {{ background: #333; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }}
            td {{ padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }}
            tr:nth-child(even) {{ background: #f9f9f9; }}
            .footer {{ margin-top: 20px; font-size: 9px; color: #999; text-align: center; }}
        </style>
        </head>
        <body>
            <h1>AZ Books \u2014 Door-to-Door Checklist</h1>
            <h2>{village_filter or 'All Villages'} | {season_label} | {len(rows)} customers</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Village</th>
                        <th>Faliya</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
        """
        for i, row in enumerate(rows, 1):
            html += f"""
                    <tr>
                        <td>{i}</td>
                        <td>{row['village']}</td>
                        <td>{row['faliya']}</td>
                        <td>{row['name']}</td>
                        <td>{row['phone']}</td>
                        <td>{row['status']}</td>
                        <td></td>
                    </tr>
            """
        html += """
                </tbody>
            </table>
            <div class="footer">Generated by AZ Books &bull; Confidential</div>
        </body>
        </html>
        """

        # Generate PDF
        try:
            from xhtml2pdf import pisa
            result = io.BytesIO()
            pisa_status = pisa.CreatePDF(io.StringIO(html), dest=result)
            if pisa_status.err:
                return Response({'detail': 'PDF generation failed.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            response = HttpResponse(result.getvalue(), content_type='application/pdf')
            filename = f"checklist_{village_filter or 'all'}_{sy}.pdf"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except ImportError:
            return Response({'detail': 'PDF library not installed.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ═══════════════════════════════════════════════════
    # Phase 3: Target Village CRUD
    # ═══════════════════════════════════════════════════

    @action(detail=False, methods=['get', 'post'], url_path='target-villages')
    def target_villages(self, request):
        """List or create target villages."""
        from django.utils.html import strip_tags
        from settings_app.models import Permission, RolePermission, Role

        if request.method == 'GET':
            targets = TargetVillage.objects.select_related('created_by')
            data = [
                {
                    'id': str(t.id),
                    'name': t.name,
                    'latitude': str(t.location.y),
                    'longitude': str(t.location.x),
                    'target_season': t.target_season,
                    'season_label': f"Dec {t.target_season} \u2013 Nov {int(t.target_season) + 1}",
                    'notes': t.notes,
                    'created_by_name': t.created_by.get_full_name() if t.created_by else '',
                    'created_at': t.created_at.isoformat() if t.created_at else None,
                }
                for t in targets
            ]
            return Response(data)

        # POST — create
        if not request.user.is_superuser:
            user_roles = Role.objects.filter(role_users__user=request.user)
            has_perm = RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename='customers.manage_targets'
            ).exists()
            if not has_perm:
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        name = strip_tags(request.data.get('name', '')).strip()
        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        target_season = request.data.get('target_season', '').strip()
        notes = strip_tags(request.data.get('notes', '')).strip()

        if not name or not lat or not lng or not target_season:
            return Response({'detail': 'name, latitude, longitude, target_season are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            from django.contrib.gis.geos import Point
            tv = TargetVillage.objects.create(
                name=name,
                location=Point(float(lng), float(lat), srid=4326),
                target_season=target_season,
                notes=notes,
                created_by=request.user,
            )
            return Response({
                'id': str(tv.id),
                'name': tv.name,
                'latitude': str(tv.location.y),
                'longitude': str(tv.location.x),
                'target_season': tv.target_season,
                'season_label': f"Dec {tv.target_season} \u2013 Nov {int(tv.target_season) + 1}",
                'notes': tv.notes,
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['delete'], url_path='target-villages/(?P<target_id>[^/.]+)')
    def target_village_delete(self, request, target_id=None):
        """Delete a target village pin."""
        from settings_app.models import Permission, RolePermission, Role

        if not request.user.is_superuser:
            user_roles = Role.objects.filter(role_users__user=request.user)
            has_perm = RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename='customers.manage_targets'
            ).exists()
            if not has_perm:
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            tv = TargetVillage.objects.get(id=target_id)
            tv.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except TargetVillage.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'])
    def wallet(self, request, pk=None):
        """Get customer's wallet details."""
        customer = self.get_object()
        wallet, _ = Wallet.objects.get_or_create(customer=customer)
        serializer = WalletSerializer(wallet)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='withdraw_wallet')
    def withdraw_wallet(self, request, pk=None):
        """Manually withdraw cash from a customer's wallet (return physical cash)."""
        from finance.services import LedgerService
        from decimal import Decimal, InvalidOperation
        from django.utils import timezone

        customer = self.get_object()
        wallet, _ = Wallet.objects.get_or_create(customer=customer)
        
        amount = request.data.get('amount')
        destination_wallet = request.data.get('destination_wallet')

        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                return Response({'error': 'Amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
        except (TypeError, ValueError, InvalidOperation):
            return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)

        if wallet.balance < amount:
            return Response({'error': 'Insufficient wallet balance.'}, status=status.HTTP_400_BAD_REQUEST)
            
        if not destination_wallet:
            return Response({'error': 'A source physical cash wallet must be selected.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # 1. Deduct from customer's logical wallet
            wallet.debit(amount, reason="Manual withdrawal to physical cash", user=request.user)
            
            # 2. Deduct physical cash from business ledger
            LedgerService.process_withdrawal(
                amount=amount,
                source_bank=None,
                source_wallet=destination_wallet,
                reference=f"CWWITHDRAW-{customer.display_id}-{timezone.now().timestamp()}",
                description=f"Wallet withdrawal for customer {customer.full_name}",
                user=request.user
            )

        return Response({'message': 'Withdrawal successful', 'new_balance': wallet.balance}, status=status.HTTP_200_OK)
    
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
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_addresses'
    permission_map = {
        'list': 'customers.view_addresses',
        'retrieve': 'customers.view_addresses',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['customer', 'is_primary']


class CustomerLinkViewSet(viewsets.ModelViewSet):
    """CRUD for customer links (relationships)."""
    queryset = CustomerLink.objects.all().select_related('customer_a', 'customer_b', 'link_type')
    serializer_class = CustomerLinkSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
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
    queryset = Wallet.objects.all()
    serializer_class = WalletSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.view_customers'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['customer']

    def get_queryset(self):
        if self.action == 'list':
            return Wallet.objects.select_related('customer')
        return Wallet.objects.select_related('customer').prefetch_related('transactions')


# ============ Settings App ViewSets ============

class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def perform_destroy(self, instance):
        """
        Standard DRF delete: migrate customers to independent class names
        before cascading the school delete, same as delete_with_structure.
        """
        affected = Customer.objects.filter(school=instance).select_related(
            'class_obj', 'division', 'subdivision'
        )
        for customer in affected:
            if customer.class_obj and not customer.class_name:
                customer.class_name = customer.class_obj.name
            if customer.division and not customer.division_name:
                customer.division_name = customer.division.name
            if customer.subdivision and not customer.subdivision_name:
                customer.subdivision_name = customer.subdivision.name
            customer.school = None
            customer.class_obj = None
            customer.division = None
            customer.subdivision = None
            customer.save(update_fields=[
                'school', 'class_obj', 'division', 'subdivision',
                'class_name', 'division_name', 'subdivision_name',
                'updated_at'
            ])
        instance.delete()

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
        """Return full nested tree for a school (Hyper-Optimized 3-Query Execution)."""
        school = self.get_object()
        classes = Class.objects.filter(school=school).prefetch_related(
            Prefetch('divisions', queryset=Division.objects.prefetch_related(
                Prefetch('subdivisions', queryset=Subdivision.objects.order_by('name'))
            ).order_by('name'))
        ).order_by('order', 'name')
        
        tree = []
        for cls in classes:
            div_list = []
            for div in cls.divisions.all():
                div_list.append({
                    'id': str(div.id), 'name': div.name,
                    'subdivisions': [{'id': str(s.id), 'name': s.name} for s in div.subdivisions.all()]
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
        """
        Delete school and all its classes/divisions/subdivisions (CASCADE).
        Before deletion, migrate all customers assigned to this school to
        independent class/division/subdivision name fields so their
        education data is preserved.
        """
        school = self.get_object()
        name = school.name

        with transaction.atomic():
            # Migrate customers to independent class names before cascade
            affected_customers = Customer.objects.filter(school=school)
            migrated_count = 0

            for customer in affected_customers.select_related('class_obj', 'division', 'subdivision'):
                # Copy FK names to independent text fields
                if customer.class_obj and not customer.class_name:
                    customer.class_name = customer.class_obj.name
                if customer.division and not customer.division_name:
                    customer.division_name = customer.division.name
                if customer.subdivision and not customer.subdivision_name:
                    customer.subdivision_name = customer.subdivision.name

                # Clear FKs (they'd become invalid after cascade anyway)
                customer.school = None
                customer.class_obj = None
                customer.division = None
                customer.subdivision = None
                customer.save(update_fields=[
                    'school', 'class_obj', 'division', 'subdivision',
                    'class_name', 'division_name', 'subdivision_name',
                    'updated_at'
                ])
                migrated_count += 1

            # Now safe to delete — no customer data will be lost
            school.delete()

        return Response({
            'message': f"Deleted '{name}' and all its structure",
            'migrated_customers': migrated_count
        })


class ClassViewSet(viewsets.ModelViewSet):
    queryset = Class.objects.all().select_related('school')
    serializer_class = ClassSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['school']


class DivisionViewSet(viewsets.ModelViewSet):
    queryset = Division.objects.all().select_related('class_obj')
    serializer_class = DivisionSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['class_obj']


class SubdivisionViewSet(viewsets.ModelViewSet):
    queryset = Subdivision.objects.all().select_related('division')
    serializer_class = SubdivisionSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['division']


# ============ Template Catalog ViewSets ============

class ClassTemplateViewSet(viewsets.ModelViewSet):
    queryset = ClassTemplate.objects.all()
    serializer_class = ClassTemplateSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class DivisionTemplateViewSet(viewsets.ModelViewSet):
    queryset = DivisionTemplate.objects.all()
    serializer_class = DivisionTemplateSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class SubdivisionTemplateViewSet(viewsets.ModelViewSet):
    queryset = SubdivisionTemplate.objects.all()
    serializer_class = SubdivisionTemplateSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_schools'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class CustomerGroupViewSet(viewsets.ModelViewSet):
    queryset = CustomerGroup.objects.all()
    serializer_class = CustomerGroupSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class LinkTypeViewSet(viewsets.ModelViewSet):
    queryset = LinkType.objects.all()
    serializer_class = LinkTypeSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }


class LocationTagViewSet(viewsets.ModelViewSet):
    queryset = LocationTag.objects.all()
    serializer_class = LocationTagSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
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


# ═══════════════════════════════════════════════════════
# Phase 4: GeoJSON Boundary API
# ═══════════════════════════════════════════════════════

class GeoBoundaryView(APIView):
    """
    Serves GeographicRegion boundaries as GeoJSON FeatureCollection.
    
    GET /api/customers/geo/boundaries/?layer=district
    GET /api/customers/geo/boundaries/?layer=taluka
    GET /api/customers/geo/boundaries/?layer=village
    GET /api/customers/geo/boundaries/  (all layers)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import json

        layer = request.query_params.get('layer', '').strip().lower()
        qs = GeographicRegion.objects.all()
        if layer in ('district', 'taluka', 'village'):
            qs = qs.filter(layer=layer)

        features = []
        for region in qs.select_related('parent'):
            if not region.boundary:
                continue
            feature = {
                'type': 'Feature',
                'geometry': json.loads(region.boundary.geojson),
                'properties': {
                    'id': str(region.id),
                    'name': region.name,
                    'layer': region.layer,
                    'parent_name': region.parent.name if region.parent else None,
                }
            }
            features.append(feature)

        return Response({
            'type': 'FeatureCollection',
            'features': features,
        })


class GeoRegionListView(APIView):
    """
    Lightweight list of regions for dropdowns / autocomplete.
    
    GET /api/customers/geo/regions/?layer=village
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from customers.models import GeographicRegion

        layer = request.query_params.get('layer', '').strip().lower()
        qs = GeographicRegion.objects.all()
        if layer in ('district', 'taluka', 'village'):
            qs = qs.filter(layer=layer)

        data = list(qs.values('id', 'name', 'layer').order_by('name'))
        return Response(data)

class GeographicRegionViewSet(viewsets.ModelViewSet):
    """
    CRUD for GeographicRegion. Requires settings.manage_store permission.
    """
    queryset = GeographicRegion.objects.all().order_by('layer', 'name')
    serializer_class = GeographicRegionSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'settings.manage_store'
    pagination_class = None

    def get_queryset(self):
        # Exclude soft-deleted implicitly via manager, or explicitly if needed
        # SoftDeleteModel manager already excludes deleted_at is not null
        qs = GeographicRegion.objects.all().order_by('layer', 'name')
        layer = self.request.query_params.get('layer', '').strip().lower()
        if layer in ('district', 'taluka', 'village'):
            qs = qs.filter(layer=layer)
        return qs

    def perform_destroy(self, instance):
        # The region is soft-deleted, but Address.region has SET_NULL on_delete.
        # SET_NULL only triggers on hard SQL deletes. We must manually nullify the references
        # so they don't point to a ghost record, which causes RelatedObjectDoesNotExist crashes.
        from customers.models import Address
        Address.objects.filter(region=instance).update(region=None)
        
        # Soft delete is handled by the model's delete() method
        instance.delete()

    @action(detail=False, methods=['get'])
    def reverse_geocode(self, request):
        """
        Takes lat/lng and returns the authoritative PostGIS matching region data.
        Bypasses OSM Nominatim to enforce internal boundary hierarchy.
        """
        from django.contrib.gis.geos import Point
        from rest_framework.response import Response
        
        lat_str = request.query_params.get('lat')
        lng_str = request.query_params.get('lng')
        
        if not lat_str or not lng_str:
            return Response({"error": "lat and lng parameters are required"}, status=400)
            
        try:
            lat = float(lat_str)
            lng = float(lng_str)
        except ValueError:
            return Response({"error": "Invalid lat or lng"}, status=400)
            
        # 1. Create strict WGS84 point
        point = Point(lng, lat, srid=4326)
        
        # 2. Query against all active bounds, ordered by smallest layer first (village)
        # Note: If there are overlaps within a layer, order by -id picks latest created.
        qs = GeographicRegion.objects.filter(
            boundary__intersects=point,
            is_deleted=False
        ).order_by(
            models.Case(
                models.When(layer='village', then=1),
                models.When(layer='taluka', then=2),
                models.When(layer='district', then=3),
                default=4,
                output_field=models.IntegerField(),
            ),
            '-id'
        )
        
        result = {
            "village": "",
            "taluka": "",
            "district": "",
            "pincode": ""
        }
        
        # We might hit multiple overlapping layers (e.g., a village is inside a taluka).
        # We extract names for each layer found.
        for region in qs:
            if region.layer == 'village' and not result["village"]:
                result["village"] = region.name
                if region.pincode and not result["pincode"]:
                    result["pincode"] = region.pincode
            elif region.layer == 'taluka' and not result["taluka"]:
                result["taluka"] = region.name
                if region.pincode and not result["pincode"]:
                    result["pincode"] = region.pincode
            elif region.layer == 'district' and not result["district"]:
                result["district"] = region.name
                
        return Response(result)

    @action(detail=False, methods=['post'])
    def sync_customers(self, request):
        """
        Manually trigger the reassignment of customers to regions based on their GPS coordinates.
        Runs in a background thread to prevent timeouts.
        """
        import threading
        from django.db import transaction
        from customers.models import Address

        def run_sync():
            from django.db import connection
            try:
                # Use raw SQL to bulk update addresses using PostGIS ST_Contains.
                # This solves both the N+1 query problem and the O(N*M) Python geometry evaluation bottleneck.
                with connection.cursor() as cursor:
                    cursor.execute("""
                        UPDATE customers_address a
                        SET region_id = r.id
                        FROM customers_geographicregion r
                        WHERE r.layer = 'village'
                          AND r.is_deleted = False
                          AND r.boundary IS NOT NULL
                          AND a.location IS NOT NULL
                          AND ST_Contains(r.boundary, a.location)
                          AND (a.region_id IS NULL OR a.region_id != r.id)
                    """)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Error in background sync_customers: {e}")
            finally:
                # CRITICAL: Since this is a detached thread, Django will NOT automatically close
                # the database connection when the thread exits. We must explicitly close it
                # to prevent exhausting the PostgreSQL connection pool.
                connection.close()

        # Spawn thread to avoid blocking Gunicorn/Nginx
        thread = threading.Thread(target=run_sync)
        thread.daemon = True
        thread.start()

        return Response({"status": "Sync started in background. It may take a minute or two to reflect."})


# ═══════════════════════════════════════════════════════
# Potential Customer CRUD + Dissolution + Proximity
# ═══════════════════════════════════════════════════════

class PotentialCustomerViewSet(viewsets.ModelViewSet):
    """
    CRUD for potential customer pins on the map.
    Additional actions: dissolve, nearby, bulk-purge.
    """
    queryset = PotentialCustomer.objects.filter(
        is_dissolved=False
    ).select_related('created_by', 'dissolved_into')
    serializer_class = PotentialCustomerSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        # M10: Filter by salesman
        created_by = self.request.query_params.get('created_by')
        if created_by:
            qs = qs.filter(created_by_id=created_by)
        # M10: Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    def _check_gap(self, point, exclude_id=None):
        """
        M1/M5: Enforce 3m minimum gap between potential customer pins.
        Uses PostGIS ST_DWithin for efficient spatial query.
        Returns True if too close to another pin.
        """
        from django.contrib.gis.measure import D
        nearby = PotentialCustomer.objects.filter(
            is_dissolved=False,
            location__distance_lte=(point, D(m=3))
        )
        if exclude_id:
            nearby = nearby.exclude(pk=exclude_id)
        return nearby.exists()

    def perform_create(self, serializer):
        from django.contrib.gis.geos import Point
        lat = self.request.data.get('latitude')
        lng = self.request.data.get('longitude')
        if lat is not None and lng is not None:
            point = Point(float(lng), float(lat), srid=4326)
            if self._check_gap(point):
                from rest_framework.exceptions import ValidationError
                raise ValidationError(
                    {'location': 'Too close to an existing pin (must be 3m+ apart).'}
                )
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        from django.contrib.gis.geos import Point
        from django.utils import timezone
        lat = self.request.data.get('latitude')
        lng = self.request.data.get('longitude')
        if lat is not None and lng is not None:
            point = Point(float(lng), float(lat), srid=4326)
            # M5: Exclude self from gap check
            if self._check_gap(point, exclude_id=serializer.instance.pk):
                from rest_framework.exceptions import ValidationError
                raise ValidationError(
                    {'location': 'Too close to an existing pin (must be 3m+ apart).'}
                )
        # M2: Manual modified_at update, not auto_now
        serializer.save(
            modified_by=self.request.user,
            modified_at=timezone.now()
        )

    @action(detail=True, methods=['post'])
    def dissolve(self, request, pk=None):
        """
        Dissolve a potential customer pin into a real customer.
        M3: Uses select_for_update to prevent double-dissolve race condition.
        M4: Returns 404 gracefully if pin was already deleted.
        """
        from django.utils import timezone

        customer_id = request.data.get('customer_id')
        if not customer_id:
            return Response(
                {'detail': 'customer_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            customer = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            return Response(
                {'detail': 'Customer not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        with transaction.atomic():
            try:
                # M3: Row-level lock to prevent concurrent dissolution
                pin = PotentialCustomer.objects.select_for_update().get(pk=pk)
            except PotentialCustomer.DoesNotExist:
                # M4: Pin was deleted by another user
                return Response(
                    {'detail': 'This pin was already removed.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            if pin.is_dissolved:
                # M3: Already dissolved by another user
                return Response(
                    {'detail': 'This pin was already linked to another customer.'},
                    status=status.HTTP_409_CONFLICT
                )

            # Mark as dissolved
            pin.is_dissolved = True
            pin.dissolved_by = request.user
            pin.dissolved_at = timezone.now()
            pin.dissolved_into = customer
            pin.save(update_fields=[
                'is_dissolved', 'dissolved_by', 'dissolved_at', 'dissolved_into'
            ])

            # Append potential customer's notes to real customer's notes
            if pin.notes and pin.notes.strip():
                separator = '\n' if customer.notes else ''
                customer.notes = (
                    customer.notes + separator +
                    f'[From marked location] {pin.notes.strip()}'
                )
                customer.save(update_fields=['notes', 'updated_at'])

        return Response({'detail': 'Pin successfully linked to customer.'})

    @action(detail=False, methods=['get'])
    def nearby(self, request):
        """
        Find non-dissolved potential customers within a radius of given coords.
        M6: Server-side radius cap at 50m.
        """
        from django.contrib.gis.geos import Point
        from django.contrib.gis.measure import D
        from django.contrib.gis.db.models.functions import Distance

        lat = request.query_params.get('lat')
        lng = request.query_params.get('lng')
        radius = request.query_params.get('radius', '5')

        if not lat or not lng:
            return Response(
                {'detail': 'lat and lng are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            lat = float(lat)
            lng = float(lng)
            radius = max(0, min(float(radius), 50))  # M6: Clamp to [0, 50]m
        except (TypeError, ValueError):
            return Response(
                {'detail': 'Invalid lat, lng, or radius.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ref_point = Point(lng, lat, srid=4326)

        nearby_pins = PotentialCustomer.objects.filter(
            is_dissolved=False,
            location__distance_lte=(ref_point, D(m=radius))
        ).annotate(
            distance=Distance('location', ref_point)
        ).select_related('created_by').order_by('distance')

        results = []
        for pin in nearby_pins:
            results.append({
                'id': str(pin.id),
                'latitude': str(pin.location.y),
                'longitude': str(pin.location.x),
                'notes': pin.notes,
                'distance_m': round(pin.distance.m, 1) if pin.distance else None,
                'created_by_name': (
                    pin.created_by.get_full_name() or pin.created_by.username
                ) if pin.created_by else '',
                'created_at': pin.created_at.isoformat() if pin.created_at else None,
            })

        return Response(results)

    @action(detail=False, methods=['post'], url_path='bulk-purge')
    def bulk_purge(self, request):
        """
        Delete all non-dissolved potential customer pins from the previous season.
        M8: Requires {"confirm": "PURGE"} in request body. Superuser only.
        """
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Only superusers can bulk-purge pins.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if request.data.get('confirm') != 'PURGE':
            return Response(
                {'detail': 'Request body must contain {"confirm": "PURGE"}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        import datetime
        from django.utils import timezone

        today = timezone.now().date()
        # Previous season: Dec (Y-2) → Nov (Y-1)
        if today.month >= 12:
            prev_start = datetime.date(today.year - 1, 12, 1)
            prev_end = datetime.date(today.year, 11, 30)
        else:
            prev_start = datetime.date(today.year - 2, 12, 1)
            prev_end = datetime.date(today.year - 1, 11, 30)

        deleted_count, _ = PotentialCustomer.objects.filter(
            is_dissolved=False,
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end,
        ).delete()

        return Response({
            'detail': f'Purged {deleted_count} pins from Dec {prev_start.year} – Nov {prev_end.year}.',
            'deleted': deleted_count,
            'season': f'Dec {prev_start.year} – Nov {prev_end.year}',
        })

    @action(detail=True, methods=['post'])
    def undissolve(self, request, pk=None):
        """
        Resurrect a dissolved potential customer pin (used when the linked
        customer is being deleted and the user chooses to restore the pin).
        """
        try:
            pin = PotentialCustomer.objects.get(pk=pk)
        except PotentialCustomer.DoesNotExist:
            return Response(
                {'detail': 'Pin not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not pin.is_dissolved:
            return Response(
                {'detail': 'Pin is not dissolved.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        pin.is_dissolved = False
        pin.dissolved_by = None
        pin.dissolved_at = None
        pin.dissolved_into = None
        pin.save(update_fields=[
            'is_dissolved', 'dissolved_by', 'dissolved_at', 'dissolved_into'
        ])

        return Response({'detail': 'Pin restored successfully.'})


class LegacyDebtViewSet(viewsets.ModelViewSet):
    """
    ViewSet for tracking and settling Legacy Debt (from old notebooks).
    """
    queryset = LegacyDebt.objects.all().select_related('customer')
    serializer_class = LegacyDebtSerializer
    permission_classes = [IsAuthenticated, HasRequiredPermission]

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def bulk_create_debts(self, request):
        """
        Rapid Entry: Accepts an array of {customer: id, principal_amount: X}.
        Creates LegacyDebt and debits the customer's wallet.
        """
        data = request.data
        if not isinstance(data, list):
            return Response({"detail": "Expected a list of objects."}, status=400)

        results = []
        for item in data:
            customer_id = item.get('customer')
            principal = item.get('principal_amount')
            
            try:
                customer = Customer.objects.get(id=customer_id)
                # Ensure no existing debt
                if hasattr(customer, 'legacy_debt'):
                    results.append({"customer": customer_id, "status": "failed", "reason": "Already has legacy debt"})
                    continue
                
                # Check constraints logically
                if float(principal) <= 0:
                    results.append({"customer": customer_id, "status": "failed", "reason": "Amount must be positive"})
                    continue
                    
                debt = LegacyDebt.objects.create(
                    customer=customer,
                    principal_amount=principal
                )
                
                # Debit wallet
                wallet, _ = Wallet.objects.get_or_create(customer=customer)
                wallet.balance -= debt.principal_amount
                wallet.save()
                
                # Create locked transaction
                WalletTransaction.objects.create(
                    wallet=wallet,
                    amount=debt.principal_amount,
                    transaction_type='debit',
                    reason='Legacy Debt',
                    created_by=request.user
                )
                results.append({"customer": customer_id, "status": "success", "id": debt.id})
                
            except Exception as e:
                results.append({"customer": customer_id, "status": "failed", "reason": str(e)})

        return Response({"results": results})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def allocate_payment(self, request, pk=None):
        """
        Record a payment against legacy debt.
        Uses select_for_update to prevent double-tap race conditions.
        """
        amount = request.data.get('amount')
        is_fresh_cash = request.data.get('is_fresh_cash', False)
        destination_wallet_id = request.data.get('destination_wallet_id')
        destination_bank_id = request.data.get('destination_bank_id')

        if not amount or float(amount) <= 0:
            return Response({"detail": "Amount must be positive."}, status=400)
            
        if not is_fresh_cash:
            # Prevent hijacking of store credits
            return Response({"detail": "Legacy debt must be paid with fresh cash/bank transfers, not existing store credit."}, status=400)

        # Enforce destination selection for standalone API calls to prevent Ledger Bypass
        # (Note: When called via Order split, LedgerService handles it there, but here we require it)
        if not destination_wallet_id and not destination_bank_id:
            # If the request specifically bypassed destination (e.g., from order split),
            # the serializer should be bypassing this endpoint entirely.
            # But just in case:
            if not request.data.get('bypass_ledger_deposit'):
                return Response({"detail": "A destination Cash Wallet or Bank Account is required."}, status=400)

        amount = float(amount)

        # Lock the rows for update to prevent race conditions
        try:
            debt = LegacyDebt.objects.select_for_update().get(pk=pk)
        except LegacyDebt.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        remaining = float(debt.principal_amount) - float(debt.recovered_amount)
        if amount > remaining:
            return Response({"detail": f"Cannot overpay legacy debt. Maximum allowed is {remaining}."}, status=400)

        # Update Debt
        debt.recovered_amount += amount
        debt.save()

        # Update Wallet (Credit it back atomically)
        wallet, _ = Wallet.objects.get_or_create(customer=debt.customer)
        from django.db.models import F
        Wallet.objects.filter(id=wallet.id).update(balance=F('balance') + amount)
        wallet.refresh_from_db()

        WalletTransaction.objects.create(
            wallet=wallet,
            amount=amount,
            transaction_type='credit',
            reason='Legacy Debt Payment',
            created_by=request.user
        )

        # Process Ledger Deposit
        if not request.data.get('bypass_ledger_deposit') and (destination_bank_id or destination_wallet_id):
            from finance.services import LedgerService
            from finance.models import BankAccount, CashWallet
            try:
                dest_bank = BankAccount.objects.get(id=destination_bank_id) if destination_bank_id else None
                dest_wallet = CashWallet.objects.get(id=destination_wallet_id) if destination_wallet_id else None
                
                LedgerService.process_deposit(
                    amount=amount,
                    destination_bank=dest_bank,
                    destination_wallet=dest_wallet,
                    reference=f"legacy_debt_{debt.id}",
                    description=f"Legacy Debt Settlement for {debt.customer.full_name}",
                    user=request.user
                )
            except Exception as e:
                return Response({"detail": f"Ledger deposit failed: {str(e)}"}, status=400)

        return Response({
            "detail": "Payment allocated successfully.",
            "recovered_amount": debt.recovered_amount,
            "wallet_balance": wallet.balance
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Dashboard Summary: Returns aggregate metrics for Legacy Debt.
        """
        from django.db.models import Sum
        
        aggregates = LegacyDebt.objects.aggregate(
            total_principal=Sum('principal_amount'),
            total_recovered=Sum('recovered_amount')
        )
        
        total_principal = aggregates['total_principal'] or 0
        total_recovered = aggregates['total_recovered'] or 0
        total_remaining = total_principal - total_recovered
        
        collection_rate = (total_recovered / total_principal * 100) if total_principal > 0 else 0
        
        return Response({
            "total_imported": total_principal,
            "total_recovered": total_recovered,
            "total_remaining": total_remaining,
            "collection_rate_pct": round(collection_rate, 2)
        })


