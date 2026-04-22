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
from .models import Customer, Address, CustomerLink, Wallet, WalletTransaction, TargetVillage
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
    queryset = Customer.objects.all().select_related(
        'school', 'class_obj', 'division', 'subdivision', 'customer_group', 'wallet'
    ).prefetch_related('addresses', 'addresses__location_tags')
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.manage_customers'
    permission_map = {
        'list': 'customers.view_customers',
        'retrieve': 'customers.view_customers',
    }
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

    @action(detail=False, methods=['get'], url_path='map_data')
    def map_data(self, request):
        """
        Returns customer geo data with order stats for the Customer Map View.
        Season = Dec 1 → Nov 30. Filters out NULL/0,0 coordinates.
        Uses primary address only. RBAC-gated.
        """
        from django.db.models import Max, F, Value, CharField, DecimalField
        from django.db.models.functions import Coalesce
        from django.utils.html import strip_tags
        from django.utils import timezone
        from orders.models import Order
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
        valid_statuses = ['confirmed', 'completed']

        # Query: customers with valid primary address coordinates
        customers = Customer.objects.filter(
            addresses__is_primary=True,
            addresses__location__isnull=False,
        )

        # ORM-level group filter
        if filter_group:
            customers = customers.filter(customer_group__name__iexact=filter_group)

        customers = customers.select_related(
            'customer_group'
        ).prefetch_related(
            'addresses', 'addresses__location_tags'
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
            prev_season_order_count=Count(
                'orders',
                filter=Q(
                    orders__created_at__date__gte=prev_season_start,
                    orders__created_at__date__lte=prev_season_end,
                    orders__order_status__in=valid_statuses
                )
            ),
        ).distinct()

        # Build response
        customer_list = []
        stats = {'total_mapped': 0, 'active': 0, 'followup': 0, 'lapsed': 0, 'prospect': 0}
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

            # Marker status
            if c.season_order_count > 0:
                marker_status = 'active'
                stats['active'] += 1
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
                if marker_status == 'active':
                    villages[village_key]['active'] += 1

            # Last order ID
            last_order = Order.objects.filter(
                customer=c, order_status__in=valid_statuses
            ).order_by('-created_at').values_list('display_id', flat=True).first()

            # Location tags
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
                'last_order_id': last_order,
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
        covered = stats['active']
        coverage_pct = round((covered / total_mapped * 100)) if total_mapped > 0 else 0

        # ── Phase 3: Target villages ──
        target_qs = TargetVillage.objects.all()
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

        valid_statuses = ['confirmed', 'completed']

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

        valid_statuses = ['confirmed', 'completed']

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
            targets = TargetVillage.objects.all()
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
    queryset = Wallet.objects.all().select_related('customer').prefetch_related('transactions')
    serializer_class = WalletSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'customers.view_customers'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['customer']


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
        from customers.models import GeographicRegion
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
                    'center_lat': region.center.y if region.center else None,
                    'center_lng': region.center.x if region.center else None,
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

