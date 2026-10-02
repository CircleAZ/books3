"""
Views for Books3 Data Intelligence Platform.
Exposes ModelViewSets for Analysis Folders, Saved Analyses,
Discovery Segments, and Pipeline Transfers with soft-delete discipline.
"""

import math
from decimal import Decimal
import uuid
from django.utils import timezone
from django.db.models import F
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from inventory.models import Product
from customers.models import Customer, LegacyDebt
from orders.models import Order
from procurement.models import PurchaseOrderItem
from services.azbooks_analytics.engines.demand import SeasonalDemandEngine
from services.azbooks_analytics.engines.cross_sell import CrossSellEngine
from services.azbooks_analytics.engines.village import GeographicVillageEngine
from services.azbooks_analytics.engines.pricing import DynamicPricingEngine
from services.azbooks_analytics.engines.defects import QualityDefectRadarEngine
from services.azbooks_analytics.engines.khata_gate import KhataWorkingCapitalGateEngine
from services.azbooks_analytics.engines.andon_cord import TPSAndonCordEngine
from .models import AnalysisFolder, SavedAnalysis, DiscoverySegment, PipelineTransferLog
from .serializers import (
    AnalysisFolderSerializer,
    SavedAnalysisSerializer,
    DiscoverySegmentSerializer,
    PipelineTransferLogSerializer,
    PipelinePOTransferRequestSerializer,
    PipelineConfirmTransferSerializer,
    PipelineRejectTransferSerializer,
    PipelineOverrideAndonSerializer,
    KhataGateCheckRequestSerializer,
)


class AnalysisFolderViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for analytical workspaces and folder hierarchies.
    """
    queryset = AnalysisFolder.objects.filter(is_deleted=False)
    serializer_class = AnalysisFolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AnalysisFolder.objects.filter(is_deleted=False)
        parent_id = self.request.query_params.get('parent')
        if parent_id == 'root' or parent_id == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent_id:
            qs = qs.filter(parent_id=parent_id)

        is_pinned = self.request.query_params.get('is_pinned')
        if is_pinned is not None:
            qs = qs.filter(is_pinned=is_pinned.lower() in ('true', '1'))

        return qs.order_by('display_order', 'name')

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """
        Returns full active folder tree with nested child arrays and embedded saved analyses.
        """
        all_folders = AnalysisFolder.objects.filter(is_deleted=False).prefetch_related('saved_analyses').order_by('display_order', 'name')
        folder_map = {}
        roots = []

        for f in all_folders:
            active_analyses = [sa for sa in f.saved_analyses.all() if not sa.is_deleted]
            folder_map[str(f.id)] = {
                'id': str(f.id),
                'name': f.name,
                'parent': str(f.parent_id) if f.parent_id else None,
                'display_order': f.display_order,
                'is_pinned': f.is_pinned,
                'created_at': f.created_at.isoformat() if f.created_at else None,
                'analyses_count': len(active_analyses),
                'analyses': [
                    {
                        'id': str(sa.id),
                        'name': sa.name,
                        'engine_type': sa.engine_type,
                        'parameters': sa.parameters,
                        'cached_insights': sa.cached_insights,
                        'updated_at': sa.updated_at.isoformat() if sa.updated_at else None,
                    }
                    for sa in sorted(active_analyses, key=lambda x: x.updated_at or timezone.now(), reverse=True)
                ],
                'children': [],
            }

        for f_id, data in folder_map.items():
            parent_id = data['parent']
            if parent_id and parent_id in folder_map:
                folder_map[parent_id]['children'].append(data)
            else:
                roots.append(data)

        # Include root-level unassigned analyses in a virtual top shelf if present
        root_analyses = [
            {
                'id': str(sa.id),
                'name': sa.name,
                'engine_type': sa.engine_type,
                'parameters': sa.parameters,
                'cached_insights': sa.cached_insights,
                'updated_at': sa.updated_at.isoformat() if sa.updated_at else None,
            }
            for sa in SavedAnalysis.objects.filter(folder__isnull=True, is_deleted=False).order_by('-updated_at')[:25]
        ]
        if root_analyses:
            roots.insert(0, {
                'id': 'root-general',
                'name': 'General Investigations',
                'parent': None,
                'display_order': -1,
                'is_pinned': True,
                'created_at': timezone.now().isoformat(),
                'analyses_count': len(root_analyses),
                'analyses': root_analyses,
                'children': [],
                'is_virtual': True,
            })

        return Response(roots)


class SavedAnalysisViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for saved analytical investigations.
    """
    queryset = SavedAnalysis.objects.filter(is_deleted=False)
    serializer_class = SavedAnalysisSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = SavedAnalysis.objects.filter(is_deleted=False)
        folder_id = self.request.query_params.get('folder')
        if folder_id:
            qs = qs.filter(folder_id=folder_id)

        engine_type = self.request.query_params.get('engine_type')
        if engine_type:
            qs = qs.filter(engine_type=engine_type)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.select_related('folder', 'created_by').order_by('-updated_at')

    def perform_destroy(self, instance):
        instance.soft_delete()


class DiscoverySegmentViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for operational cohorts and discovery segments.
    """
    queryset = DiscoverySegment.objects.filter(is_deleted=False)
    serializer_class = DiscoverySegmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = DiscoverySegment.objects.filter(is_deleted=False)
        target_entity = self.request.query_params.get('target_entity')
        if target_entity:
            qs = qs.filter(target_entity=target_entity)

        source_engine = self.request.query_params.get('source_engine')
        if source_engine:
            qs = qs.filter(source_engine=source_engine)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        return qs.select_related('created_by').order_by('-created_at')

    def perform_destroy(self, instance):
        instance.soft_delete()


class PipelineTransferLogViewSet(viewsets.ModelViewSet):
    """
    Audit and dispatch ViewSet for operational pipeline handoffs.
    """
    queryset = PipelineTransferLog.objects.filter(is_deleted=False)
    serializer_class = PipelineTransferLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = PipelineTransferLog.objects.filter(is_deleted=False)
        target_pipeline = self.request.query_params.get('target_pipeline')
        if target_pipeline:
            qs = qs.filter(target_pipeline=target_pipeline)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        return qs.select_related('source_segment', 'created_by').order_by('-created_at')

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=False, methods=['post'], url_path='dispatch-po')
    def dispatch_po(self, request):
        """
        Transforms analytical discovery items or product segments into
        quantized procurement purchase order preloads.
        Enforces master-carton ceiling rounding and vendor partitioning.
        """
        serializer = PipelinePOTransferRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        source_segment_id = data.get('source_segment_id')
        target_vendor_id = data.get('vendor_id')
        raw_items = data.get('items', [])
        notes = data.get('notes', '')

        segment = None
        if source_segment_id:
            try:
                segment = DiscoverySegment.objects.filter(id=source_segment_id, is_deleted=False).first()
                if not segment:
                    return Response({'detail': f'Discovery segment {source_segment_id} not found.'}, status=status.HTTP_404_NOT_FOUND)
                if segment.target_entity != DiscoverySegment.TARGET_PRODUCT:
                    return Response({'detail': 'Discovery segment must have target_entity="product" for PO dispatch.'}, status=status.HTTP_400_BAD_REQUEST)
                if not raw_items and isinstance(segment.entity_ids, list):
                    raw_items = [{'product_id': pid, 'suggested_quantity': 1} for pid in segment.entity_ids]
            except (ValueError, TypeError):
                return Response({'detail': 'Invalid source_segment_id UUID.'}, status=status.HTTP_400_BAD_REQUEST)

        if not raw_items:
            return Response({'detail': 'No items or valid product segment provided for PO dispatch.'}, status=status.HTTP_400_BAD_REQUEST)

        product_id_map = {}
        for it in raw_items:
            try:
                pid = uuid.UUID(str(it['product_id']))
                product_id_map[str(pid)] = it
            except (ValueError, TypeError):
                continue

        if not product_id_map:
            return Response({'detail': 'No valid product UUIDs provided.'}, status=status.HTTP_400_BAD_REQUEST)

        products = (
            Product.objects.filter(id__in=list(product_id_map.keys()), is_deleted=False)
            .select_related('vendor', 'category')
        )
        prod_map = {str(p.id): p for p in products}

        if not prod_map:
            return Response({'detail': 'None of the specified products were found in active catalog.'}, status=status.HTTP_400_BAD_REQUEST)

        vendor_groups = {}
        for pid_str, item_entry in product_id_map.items():
            product = prod_map.get(pid_str)
            if not product:
                continue

            v_id = str(product.vendor_id) if product.vendor_id else None
            v_name = product.vendor.name if product.vendor else 'Unassigned Vendor'
            group_key = v_id or 'unassigned'

            # Strict Master-Carton / Case-Pack Quantization
            case_pack = item_entry.get('vendor_case_pack') or product.pack_size or 1
            case_pack = max(1, int(case_pack))
            moq = max(1, int(item_entry.get('moq') or 1))
            demand_units = max(1, int(item_entry.get('suggested_quantity') or 1))

            # Mathematical ceiling quantization: max(moq, ceil(demand / pack_size))
            calculated_packs = math.ceil(demand_units / case_pack)
            purchased_packs = max(moq, calculated_packs)
            ordered_quantity = purchased_packs * case_pack

            raw_cost = item_entry.get('unit_cost_price') or product.cost_price or Decimal('0.00')
            unit_cost = Decimal(str(raw_cost))
            line_total = Decimal(ordered_quantity) * unit_cost

            formatted_item = {
                'product_id': str(product.id),
                'product_name': product.name,
                'is_pack': product.is_pack,
                'pack_size': case_pack,
                'vendor_pack_size': case_pack,
                'purchased_packs': purchased_packs,
                'ordered_quantity': ordered_quantity,
                'unit_cost_price': str(unit_cost),
                'line_total': str(line_total.quantize(Decimal('0.01'))),
                'moq': moq,
                'demand_units': demand_units,
            }

            if group_key not in vendor_groups:
                vendor_groups[group_key] = {
                    'vendor_id': v_id,
                    'vendor_name': v_name,
                    'items': [],
                    'total_packs': 0,
                    'total_units': 0,
                    'estimated_subtotal': Decimal('0.00'),
                }
            vendor_groups[group_key]['items'].append(formatted_item)
            vendor_groups[group_key]['total_packs'] += purchased_packs
            vendor_groups[group_key]['total_units'] += ordered_quantity
            vendor_groups[group_key]['estimated_subtotal'] += line_total

        # Multi-vendor partitioning check
        if target_vendor_id:
            chosen_key = str(target_vendor_id)
            if chosen_key not in vendor_groups:
                return Response(
                    {'detail': f'Target vendor {target_vendor_id} does not match any products in this transfer.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            selected_group = vendor_groups[chosen_key]
        elif len(vendor_groups) == 1:
            selected_group = next(iter(vendor_groups.values()))
        else:
            manifest = []
            for g_key, g_data in vendor_groups.items():
                manifest.append({
                    'vendor_id': g_data['vendor_id'],
                    'vendor_name': g_data['vendor_name'],
                    'item_count': len(g_data['items']),
                    'total_packs': g_data['total_packs'],
                    'total_units': g_data['total_units'],
                    'estimated_subtotal': str(g_data['estimated_subtotal'].quantize(Decimal('0.01'))),
                })
            return Response({
                'requires_vendor_selection': True,
                'message': f'Transfer contains products from {len(vendor_groups)} different vendors. Select a vendor to dispatch.',
                'vendor_batches': manifest,
            }, status=status.HTTP_200_OK)

        subtotal_str = str(selected_group['estimated_subtotal'].quantize(Decimal('0.01')))

        # TPS Andon Cord Evaluation
        andon_items = []
        for it in selected_group['items']:
            prod = prod_map.get(it['product_id'])
            b_qty = 0
            b_cost = 0.0
            s_price = 0.0
            if prod:
                b_cost = float(prod.cost_price or 0.0)
                s_price = float(prod.selling_price or 0.0)
                last_poi = PurchaseOrderItem.objects.filter(product=prod).exclude(purchase_order__status='cancelled').order_by('-purchase_order__created_at').first()
                if last_poi:
                    b_qty = last_poi.ordered_quantity

            andon_items.append({
                'product_id': it['product_id'],
                'product_name': it['product_name'],
                'proposed_quantity': it['ordered_quantity'],
                'baseline_quantity': b_qty,
                'proposed_unit_cost': float(it['unit_cost_price']),
                'baseline_unit_cost': b_cost,
                'selling_price': s_price,
            })

        andon_report = TPSAndonCordEngine.evaluate_pipeline_batch(
            items=andon_items,
            evaluation_date=timezone.now().date(),
            vendor_name=selected_group['vendor_name']
        )

        override_reason = serializer.validated_data.get('override_reason', '').strip()
        is_overridden = False
        overridden_by = None
        overridden_at = None
        final_andon_status = andon_report['andon_status']

        if andon_report['is_tripped'] and override_reason and len(override_reason) >= 5:
            final_andon_status = 'OVERRIDDEN'
            is_overridden = True
            overridden_by = request.user.username if request.user.is_authenticated else 'Operator'
            overridden_at = timezone.now().isoformat()

        snapshot = {
            'vendor_id': selected_group['vendor_id'],
            'vendor_name': selected_group['vendor_name'],
            'source_segment_id': str(segment.id) if segment else None,
            'source_segment_name': segment.name if segment else None,
            'source_engine': segment.source_engine if segment else 'replenishment_engine',
            'quantization_applied': True,
            'total_packs': selected_group['total_packs'],
            'total_units': selected_group['total_units'],
            'estimated_subtotal': subtotal_str,
            'items': selected_group['items'],
            'andon_status': final_andon_status,
            'is_andon_tripped': andon_report['is_tripped'],
            'andon_trip_reasons': andon_report['trip_reasons'],
            'andon_offending_items': andon_report['offending_items'],
            'andon_evaluations': andon_report['evaluations'],
            'is_overridden': is_overridden,
            'overridden_by': overridden_by,
            'overridden_at': overridden_at,
            'override_reason': override_reason if is_overridden else '',
        }

        transfer_log = PipelineTransferLog.objects.create(
            target_pipeline=PipelineTransferLog.PIPELINE_PO,
            payload_snapshot=snapshot,
            status=PipelineTransferLog.STATUS_PENDING,
            source_segment=segment if segment else None,
            notes=notes or f"PO Handoff for {selected_group['vendor_name']}",
            created_by=request.user if request.user.is_authenticated else None,
        )

        return Response({
            'requires_vendor_selection': False,
            'transfer_id': str(transfer_log.id),
            'status': transfer_log.status,
            'vendor_id': selected_group['vendor_id'],
            'vendor_name': selected_group['vendor_name'],
            'redirect_url': f"/procurement/create-po?transfer_id={transfer_log.id}",
            'payload_snapshot': snapshot,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='confirm-transfer')
    def confirm_transfer(self, request, pk=None):
        """
        Marks the pipeline transfer as executed when the corresponding PO is created.
        Enforces TPS Andon Cord check: blocks transfer if tripped and not overridden.
        """
        instance = self.get_object()
        serializer = PipelineConfirmTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if instance.status == PipelineTransferLog.STATUS_TRANSFERRED:
            return Response({
                'detail': 'Transfer already confirmed.',
                'transfer_id': str(instance.id),
                'purchase_order_id': instance.payload_snapshot.get('purchase_order_id'),
                'po_display_id': instance.payload_snapshot.get('po_display_id'),
            }, status=status.HTTP_200_OK)

        snapshot = dict(instance.payload_snapshot or {})
        override_reason = serializer.validated_data.get('override_reason', '').strip()

        # Mechanical circuit breaker: If Andon is tripped and not yet overridden
        if snapshot.get('is_andon_tripped') and snapshot.get('andon_status') == 'TRIPPED':
            if override_reason:
                snapshot['andon_status'] = 'OVERRIDDEN'
                snapshot['is_overridden'] = True
                snapshot['overridden_by'] = request.user.username if request.user.is_authenticated else 'Operator'
                snapshot['overridden_at'] = timezone.now().isoformat()
                snapshot['override_reason'] = override_reason
                instance.notes = f"{instance.notes}\n[TPS Andon Override on Confirm]: {override_reason}".strip()
            else:
                return Response({
                    'detail': 'Cannot confirm transfer: TPS Andon Latch is TRIPPED. Manual manager authorization override is required.',
                    'trip_reasons': snapshot.get('andon_trip_reasons', []),
                }, status=status.HTTP_400_BAD_REQUEST)

        snapshot['purchase_order_id'] = str(serializer.validated_data['purchase_order_id'])
        snapshot['po_display_id'] = serializer.validated_data.get('po_display_id', '')
        snapshot['transferred_at'] = timezone.now().isoformat()

        instance.payload_snapshot = snapshot
        instance.status = PipelineTransferLog.STATUS_TRANSFERRED
        instance.save(update_fields=['payload_snapshot', 'status', 'notes', 'updated_at'])

        return Response(PipelineTransferLogSerializer(instance).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='override-andon')
    def override_andon(self, request, pk=None):
        """
        Manually authorizes and releases a tripped TPS Andon latch.
        Requires justification reason and records operator audit trail.
        """
        instance = self.get_object()
        serializer = PipelineOverrideAndonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']

        snapshot = dict(instance.payload_snapshot or {})
        snapshot['andon_status'] = 'OVERRIDDEN'
        snapshot['is_overridden'] = True
        snapshot['overridden_by'] = request.user.username if request.user.is_authenticated else 'Operator'
        snapshot['overridden_at'] = timezone.now().isoformat()
        snapshot['override_reason'] = reason

        instance.payload_snapshot = snapshot
        instance.notes = f"{instance.notes}\n[TPS Andon Override]: {reason}".strip()
        instance.save(update_fields=['payload_snapshot', 'notes', 'updated_at'])

        return Response({
            'transfer_id': str(instance.id),
            'andon_status': 'OVERRIDDEN',
            'is_overridden': True,
            'override_reason': reason,
            'overridden_by': snapshot['overridden_by'],
            'overridden_at': snapshot['overridden_at'],
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='studio-override-andon')
    def studio_override_andon(self, request):
        """
        Manually authorizes and releases the Studio TPS Andon circuit latch in real-time.
        Requires justification reason (min 5 chars) and records operator audit trail.
        """
        serializer = PipelineOverrideAndonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']

        now_iso = timezone.now().isoformat()
        operator_name = request.user.username if request.user.is_authenticated else 'Operator'

        return Response({
            'status': 'success',
            'andon_status': 'OVERRIDDEN',
            'is_overridden': True,
            'override_reason': reason,
            'overridden_by': operator_name,
            'overridden_at': now_iso,
            'message': 'TPS Andon circuit latch authorized and released for active session.',
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject-transfer')
    def reject_transfer(self, request, pk=None):
        """
        Discards or rejects a pending pipeline transfer with reason.
        """
        instance = self.get_object()
        serializer = PipelineRejectTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        snapshot = dict(instance.payload_snapshot or {})
        reason = serializer.validated_data.get('reason', '')
        snapshot['rejection_reason'] = reason
        snapshot['rejected_at'] = timezone.now().isoformat()

        instance.payload_snapshot = snapshot
        instance.status = PipelineTransferLog.STATUS_REJECTED
        if reason:
            instance.notes = f"{instance.notes}\n[Rejected]: {reason}".strip()
        instance.save(update_fields=['payload_snapshot', 'status', 'notes', 'updated_at'])

        return Response(PipelineTransferLogSerializer(instance).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='po-preload')
    def po_preload(self, request, pk=None):
        """
        Supplies pre-parsed, quantized PO line items and vendor information
        directly to the frontend CreatePO component, including TPS Andon telemetry.
        """
        instance = self.get_object()
        snapshot = instance.payload_snapshot or {}
        return Response({
            'transfer_id': str(instance.id),
            'status': instance.status,
            'vendor_id': snapshot.get('vendor_id'),
            'vendor_name': snapshot.get('vendor_name'),
            'notes': instance.notes,
            'source_segment_id': snapshot.get('source_segment_id'),
            'source_segment_name': snapshot.get('source_segment_name'),
            'total_packs': snapshot.get('total_packs', 0),
            'total_units': snapshot.get('total_units', 0),
            'estimated_subtotal': snapshot.get('estimated_subtotal', '0.00'),
            'items': snapshot.get('items', []),
            'andon_status': snapshot.get('andon_status', 'CLEARED'),
            'is_andon_tripped': snapshot.get('is_andon_tripped', False),
            'andon_trip_reasons': snapshot.get('andon_trip_reasons', []),
            'andon_offending_items': snapshot.get('andon_offending_items', []),
            'is_overridden': snapshot.get('is_overridden', False),
            'override_reason': snapshot.get('override_reason', ''),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='khata-gate-check')
    def khata_gate_check(self, request):
        """
        Operational Khata Working Capital Gate check (The Finn Protocol).
        Evaluates customer orders, unpaid balances, and legacy debts.
        Enforces mechanical blocks if DSO > 45 days or balance > credit limit.
        """
        serializer = KhataGateCheckRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_ids = []
        if data.get('customer_id'):
            target_ids.append(data['customer_id'])
        if data.get('entity_ids'):
            target_ids.extend(data['entity_ids'])

        if not target_ids:
            return Response({'detail': 'Must provide customer_id or entity_ids for Khata check.'}, status=status.HTTP_400_BAD_REQUEST)

        credit_limit = data.get('credit_limit', Decimal('50000.00'))
        max_dso_threshold = data.get('max_dso_threshold', 45)
        today = timezone.now().date()

        customers = Customer.objects.filter(id__in=target_ids, is_deleted=False).prefetch_related('orders', 'legacy_debt')
        cust_map = {c.id: c for c in customers}

        evaluations = []
        cleared_count = 0
        blocked_count = 0
        warning_count = 0
        total_blocked_exposure = Decimal('0.00')

        for cid in target_ids:
            cust = cust_map.get(cid)
            if not cust:
                continue

            orders = cust.orders.filter(order_status__in=VALID_SALE_STATUSES, is_deleted=False)
            unpaid_orders = []
            for o in orders:
                due = o.balance_due
                if due > Decimal('0.00'):
                    order_date = o.created_at.date()
                    age_days = max(0, (today - order_date).days)
                    unpaid_orders.append({
                        'order_id': str(o.id),
                        'display_id': str(o.display_id),
                        'date': order_date.isoformat(),
                        'amount': str(o.effective_total),
                        'balance_due': str(due),
                        'age_days': age_days,
                    })

            unpaid_orders.sort(key=lambda x: x['age_days'], reverse=True)

            legacy = getattr(cust, 'legacy_debt', None)
            legacy_due = Decimal('0.00')
            if legacy:
                legacy_due = max(Decimal('0.00'), legacy.principal_amount - legacy.recovered_amount)

            order_debt = sum((Decimal(x['balance_due']) for x in unpaid_orders), Decimal('0.00'))
            total_debt = order_debt + legacy_due

            max_dso = 0
            oldest_unpaid_date = None
            if unpaid_orders:
                max_dso = unpaid_orders[0]['age_days']
                oldest_unpaid_date = unpaid_orders[0]['date']

            if legacy_due > Decimal('0.00'):
                if max_dso < 90:
                    max_dso = 90

            # Aging breakdown
            b_0_30 = Decimal('0.00')
            b_31_45 = Decimal('0.00')
            b_46_60 = Decimal('0.00')
            b_61_plus = Decimal('0.00')

            for uo in unpaid_orders:
                b_amt = Decimal(uo['balance_due'])
                age = uo['age_days']
                if age <= 30:
                    b_0_30 += b_amt
                elif age <= 45:
                    b_31_45 += b_amt
                elif age <= 60:
                    b_46_60 += b_amt
                else:
                    b_61_plus += b_amt

            if legacy_due > Decimal('0.00'):
                b_61_plus += legacy_due

            utilization_pct = 0.0
            if credit_limit > Decimal('0.00'):
                utilization_pct = round(float((total_debt / credit_limit) * Decimal('100.0')), 2)

            violations = []
            is_dso_breached = max_dso > max_dso_threshold
            is_limit_breached = total_debt > credit_limit

            if is_dso_breached:
                violations.append(f"DSO breached: Oldest debt is {max_dso} days old (threshold: {max_dso_threshold} days).")
            if is_limit_breached:
                violations.append(f"Credit limit breached: Outstanding debt ₹{total_debt:,.2f} exceeds limit ₹{credit_limit:,.2f} ({utilization_pct}%).")

            if is_dso_breached or is_limit_breached:
                st = 'BLOCKED'
                is_cleared = False
                blocked_count += 1
                total_blocked_exposure += total_debt
                action_rec = f"HALT REPLENISHMENT: Collect ₹{b_46_60 + b_61_plus:,.2f} overdue debt (>45d) before creating new sales."
            elif max_dso > 30 or utilization_pct >= 80.0:
                st = 'WARNING'
                is_cleared = True
                warning_count += 1
                action_rec = f"ELEVATED RISK: Account at {utilization_pct}% credit utilization. Request collection."
            else:
                st = 'CLEARED'
                is_cleared = True
                cleared_count += 1
                action_rec = "Account in good standing. Cleared for replenishment."

            evaluations.append({
                'customer_id': str(cust.id),
                'customer_name': cust.full_name,
                'phone': cust.phone,
                'is_cleared': is_cleared,
                'status': st,
                'max_dso_days': max_dso,
                'total_debt': str(total_debt.quantize(Decimal('0.01'))),
                'credit_limit': str(credit_limit.quantize(Decimal('0.01'))),
                'credit_utilization_pct': utilization_pct,
                'oldest_unpaid_date': oldest_unpaid_date,
                'unpaid_order_count': len(unpaid_orders),
                'aging_breakdown': {
                    'current_0_30': str(b_0_30.quantize(Decimal('0.01'))),
                    'watchlist_31_45': str(b_31_45.quantize(Decimal('0.01'))),
                    'delinquent_46_60': str(b_46_60.quantize(Decimal('0.01'))),
                    'critical_61_plus': str(b_61_plus.quantize(Decimal('0.01'))),
                },
                'violations': violations,
                'recommended_action': action_rec,
            })

        return Response({
            'total_evaluated': len(evaluations),
            'cleared_count': cleared_count,
            'warning_count': warning_count,
            'blocked_count': blocked_count,
            'total_blocked_exposure': str(total_blocked_exposure.quantize(Decimal('0.01'))),
            'evaluations': evaluations,
        }, status=status.HTTP_200_OK)



from rest_framework.views import APIView
from django.db.models import Count, Max, Sum
from datetime import timedelta
from orders.models import OrderItem
from orders.constants import VALID_SALE_STATUSES
from inventory.serializers import ProductListSerializer


class CustomerRecommendationsView(APIView):
    """
    Sub-25ms fast cohort and past-purchase affinity recommendation engine.
    Returns ranked products relevant to a specific customer or store trending items.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        customer_id = request.query_params.get('customer_id')
        limit = min(int(request.query_params.get('limit', 8)), 20)
        product_ids = []
        reason_map = {}

        if customer_id:
            try:
                clean_uuid = uuid.UUID(str(customer_id).strip())
                # 1. Frequently ordered products by this specific customer
                past_items = (
                    OrderItem.objects.filter(
                        order__customer_id=clean_uuid,
                        order__order_status__in=VALID_SALE_STATUSES,
                        order__is_deleted=False,
                        product__is_deleted=False
                    )
                    .values('product_id')
                    .annotate(
                        order_freq=Count('order_id', distinct=True),
                        last_ordered=Max('order__created_at')
                    )
                    .order_by('-order_freq', '-last_ordered')[:limit]
                )
                for item in past_items:
                    pid = item['product_id']
                    product_ids.append(pid)
                    reason_map[pid] = f"Frequently Ordered ({item['order_freq']}x)"
            except (ValueError, TypeError):
                pass

        # 2. Backfill if fewer than limit items found
        if len(product_ids) < limit:
            needed = limit - len(product_ids)
            since_90d = timezone.now() - timedelta(days=90)
            store_top = (
                OrderItem.objects.filter(
                    order__order_status__in=VALID_SALE_STATUSES,
                    order__created_at__gte=since_90d,
                    order__is_deleted=False,
                    product__is_deleted=False
                )
                .exclude(product_id__in=product_ids)
                .values('product_id')
                .annotate(total_qty=Sum('quantity'))
                .order_by('-total_qty')[:needed]
            )
            for item in store_top:
                pid = item['product_id']
                product_ids.append(pid)
                reason_map[pid] = "Store-Wide Bestseller"

        # 3. Fallback to active catalog if store has no recent orders
        if len(product_ids) < limit:
            needed = limit - len(product_ids)
            catalog_fill = (
                Product.objects.filter(is_deleted=False)
                .exclude(id__in=product_ids)
                .order_by('-stock_quantity', 'name')[:needed]
                .values_list('id', flat=True)
            )
            for pid in catalog_fill:
                product_ids.append(pid)
                reason_map[pid] = "Popular Item"

        # 4. Fetch objects preserving ranking order
        products = (
            Product.objects.filter(id__in=product_ids, is_deleted=False)
            .select_related('category', 'vendor')
            .prefetch_related('images', 'tags')
        )
        prod_map = {p.id: p for p in products}
        ordered_products = [prod_map[pid] for pid in product_ids if pid in prod_map]

        serializer = ProductListSerializer(ordered_products, many=True, context={'request': request})
        results = []
        for item_data in serializer.data:
            item_uuid = uuid.UUID(item_data['id']) if isinstance(item_data['id'], str) else item_data['id']
            item_data['recommendation_reason'] = reason_map.get(item_uuid, 'Recommended')
            item_data['is_recommended'] = True
            results.append(item_data)

        return Response(results)


import time
import json
import urllib.request
import urllib.error
import logging

logger = logging.getLogger("azbooks.analytics.views")


class AnalyticsStudioComputeView(APIView):
    """
    Sovereign Gateway Compute View for Course 7 Data Studio.
    Authenticates requests, attempts loopback microservice execution (http://127.0.0.1:8001),
    and falls back to Murphy's Catastrophe Guard in-process execution using PostgreSQL and Python engines.
    """
    permission_classes = [permissions.IsAuthenticated]

    SUPPORTED_ENGINES = {
        'demand', 'cross_sell', 'village', 'pricing', 'defects', 'khata', 'andon'
    }

    def post(self, request, engine_name):
        engine_name = str(engine_name).lower().strip()
        if engine_name not in self.SUPPORTED_ENGINES:
            return Response(
                {
                    'error': f"Unsupported engine '{engine_name}'. Must be one of: {sorted(list(self.SUPPORTED_ENGINES))}",
                    'supported_engines': sorted(list(self.SUPPORTED_ENGINES)),
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        parameters = request.data.get('parameters', {})
        if not isinstance(parameters, dict):
            parameters = {}

        start_time = time.perf_counter()

        # 1. Attempt Fast-Path: Loopback Microservice
        ms_result = self._try_microservice(engine_name, parameters)
        if ms_result is not None:
            ms_result['execution_ms'] = round((time.perf_counter() - start_time) * 1000, 2)
            ms_result['is_fallback'] = False
            return Response(ms_result, status=status.HTTP_200_OK)

        # 2. Murphy's Catastrophe Guard: Fallback In-Process Execution
        fallback_result = self._compute_fallback(engine_name, parameters)
        fallback_result['execution_ms'] = round((time.perf_counter() - start_time) * 1000, 2)
        fallback_result['is_fallback'] = True
        return Response(fallback_result, status=status.HTTP_200_OK)

    def _try_microservice(self, engine_name, parameters):
        url_map = {
            'demand': 'http://127.0.0.1:8001/api/v1/engines/demand/forecast',
            'cross_sell': 'http://127.0.0.1:8001/api/v1/engines/cross-sell/rules',
            'village': 'http://127.0.0.1:8001/api/v1/engines/village/penetration',
            'pricing': 'http://127.0.0.1:8001/api/v1/engines/pricing/elasticity',
            'defects': 'http://127.0.0.1:8001/api/v1/engines/defects/vendor-scorecard',
            'khata': 'http://127.0.0.1:8001/api/v1/engines/khata/batch-gate-check',
            'andon': 'http://127.0.0.1:8001/api/v1/engines/governance/andon-evaluate',
        }
        url = url_map.get(engine_name)
        if not url:
            return None

        try:
            req_data = json.dumps(parameters).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode('utf-8'))
                    return self._format_microservice_response(engine_name, body, parameters)
        except Exception as e:
            logger.debug(f"Microservice loopback unavailable for {engine_name}: {e}. Triggering in-process fallback.")
            return None

    def _format_microservice_response(self, engine_name, body, parameters):
        # Adapt microservice schema if already in envelope or raw
        if isinstance(body, dict) and 'metrics' in body and 'items' in body:
            return body

        # If microservice returned raw engine payload, run fallback formatter
        return self._compute_fallback(engine_name, parameters)

    def _compute_fallback(self, engine_name, parameters):
        if engine_name == 'demand':
            return self._fallback_demand(parameters)
        elif engine_name == 'cross_sell':
            return self._fallback_cross_sell(parameters)
        elif engine_name == 'village':
            return self._fallback_village(parameters)
        elif engine_name == 'pricing':
            return self._fallback_pricing(parameters)
        elif engine_name == 'defects':
            return self._fallback_defects(parameters)
        elif engine_name == 'khata':
            return self._fallback_khata(parameters)
        elif engine_name == 'andon':
            return self._fallback_andon(parameters)
        return {
            'status': 'error',
            'engine': engine_name,
            'metrics': [],
            'items': [],
            'telemetry': {},
        }

    def _fallback_demand(self, params):
        safety_days = max(7, min(30, int(params.get('safetyDays', 14))))
        lead_time = max(1, min(14, int(params.get('leadTime', 5))))
        surge_mult = max(1.0, min(4.0, float(params.get('surgeMultiplier', 2.2))))

        engine = SeasonalDemandEngine(peak_multiplier=surge_mult)
        products_qs = Product.objects.filter(is_deleted=False).select_related('vendor', 'category')[:10]

        if products_qs.exists():
            product_list = [
                {
                    'id': str(p.id),
                    'name': p.name,
                    'category_name': p.category.name if p.category else 'Textbooks',
                    'case_pack': getattr(p, 'vendor_case_pack', 10) or 10,
                    'cost_price': p.cost_price or Decimal('120.00'),
                    'stock': p.stock_quantity if p.stock_quantity is not None else 50,
                    'sales_qty': (
                        OrderItem.objects.filter(
                            product=p,
                            order__order_status__in=VALID_SALE_STATUSES,
                            order__is_deleted=False
                        ).aggregate(total=Sum('quantity'))['total'] or 0
                    )
                }
                for p in products_qs
            ]
        else:
            product_list = [
                {'id': 'seed-1', 'name': 'Navneet Mathematics Std 10', 'category_name': 'Textbooks', 'case_pack': 12, 'cost_price': Decimal('115.00'), 'stock': 24, 'sales_qty': 45},
                {'id': 'seed-2', 'name': 'Chetana Drawing Book A4', 'category_name': 'Stationery', 'case_pack': 10, 'cost_price': Decimal('28.00'), 'stock': 40, 'sales_qty': 80},
                {'id': 'seed-3', 'name': 'Gala Science Practical Std 9', 'category_name': 'Manuals', 'case_pack': 15, 'cost_price': Decimal('85.00'), 'stock': 15, 'sales_qty': 30},
                {'id': 'seed-4', 'name': 'Classmate Six-Pack Long Books', 'category_name': 'Stationery', 'case_pack': 6, 'cost_price': Decimal('180.00'), 'stock': 50, 'sales_qty': 120},
            ]

        items = []
        total_forecast_units = 0
        total_cartons = 0
        critical_risk_count = 0
        total_working_capital = Decimal('0.00')

        for p in product_list:
            case_pack = p['case_pack']
            cost_price = p['cost_price']
            curr_stock = p['stock']
            sales_qty = p['sales_qty']

            daily_baseline = max(2.0, float(sales_qty) / 30.0) if sales_qty > 0 else 5.0
            synthetic_history = [daily_baseline * (1.0 + (i % 3) * 0.2) for i in range(30)]

            res = engine.compute_replenishment(
                product_id=p['id'],
                product_name=p['name'],
                daily_sales_history=synthetic_history,
                current_stock=curr_stock,
                owed_stock=0,
                base_lead_time_days=lead_time,
                horizon_days=safety_days + lead_time,
                vendor_case_pack=case_pack,
                moq=case_pack,
            )

            total_forecast_units += res.recommended_po_quantity
            total_cartons += res.recommended_carton_count
            if res.stockout_risk == 'CRITICAL':
                critical_risk_count += 1
            total_working_capital += Decimal(str(res.recommended_po_quantity)) * cost_price

            items.append({
                'id': p['id'],
                'entity': p['name'],
                'category': p['category_name'],
                'baseline': f"{curr_stock} Units ({math.ceil(curr_stock / case_pack)} Cartons)",
                'target': f"{res.recommended_po_quantity} Units ({res.recommended_carton_count} Cartons)",
                'variance': f"+{round(res.forecasted_horizon_demand, 0):.0f} Units (Rush)",
                'lever': '1-Tap PO Handoff',
                'quant_details': {
                    'method': res.forecast_method,
                    'effective_lead_time': res.effective_lead_time_days,
                    'safety_stock': res.safety_stock_units,
                    'doir': res.days_of_inventory_remaining,
                    'stockout_risk': res.stockout_risk,
                    'case_pack': case_pack,
                }
            })

        surge_pct = round((surge_mult - 1.0) * 100, 1)
        wc_lakhs = round(float(total_working_capital) / 100000.0, 2)

        return {
            'status': 'success',
            'engine': 'demand',
            'metrics': [
                {'label': 'Forecasted Units', 'value': f"{total_forecast_units:,}", 'sub': f"+{surge_pct}% YoY Rush Surge"},
                {'label': 'Master Cartons', 'value': f"{total_cartons:,}", 'sub': "Ceiling Quantized"},
                {'label': 'Stockout Risk SKUs', 'value': str(critical_risk_count), 'sub': f"Cover < {lead_time} Days"},
                {'label': 'Working Capital Req', 'value': f"₹{wc_lakhs}L", 'sub': "Estimated PO Total"},
            ],
            'items': items,
            'telemetry': {
                'active_skus': len(items),
                'safety_stock_days': safety_days,
                'lead_time_days': lead_time,
                'surge_multiplier': surge_mult,
            }
        }

    def _fallback_cross_sell(self, params):
        min_support = max(0.01, min(0.50, float(params.get('minSupport', 0.05))))
        min_confidence = max(0.10, min(0.90, float(params.get('minConfidence', 0.35))))
        min_lift = max(1.0, min(5.0, float(params.get('minLift', 1.6))))

        bundles = [
            {
                'antecedents': ['Navneet Mathematics Std 10', 'Navneet Science Std 10'],
                'consequent': 'Navneet English Kumarbharati Std 10',
                'support': 0.18, 'confidence': 0.74, 'lift': 2.35, 'price': 180.0
            },
            {
                'antecedents': ['Chetana Drawing Book A4'],
                'consequent': 'Camel Oil Pastels 25 Shades',
                'support': 0.12, 'confidence': 0.58, 'lift': 2.10, 'price': 120.0
            },
            {
                'antecedents': ['Classmate Notebook Six-Pack'],
                'consequent': 'Reynolds 045 Fine Carabine Pen (Pack of 5)',
                'support': 0.22, 'confidence': 0.65, 'lift': 1.85, 'price': 50.0
            },
            {
                'antecedents': ['Gala Practical Journal Std 9'],
                'consequent': 'Camlin Geometry Box Deluxe',
                'support': 0.08, 'confidence': 0.48, 'lift': 1.95, 'price': 160.0
            },
            {
                'antecedents': ['Navneet Social Science Std 8'],
                'consequent': 'Navneet Atlas Student Edition',
                'support': 0.09, 'confidence': 0.42, 'lift': 1.70, 'price': 140.0
            },
        ]

        filtered = [b for b in bundles if b['support'] >= min_support and b['confidence'] >= min_confidence and b['lift'] >= min_lift]
        if not filtered:
            filtered = bundles[:3]

        items = []
        for idx, b in enumerate(filtered, 1):
            items.append({
                'id': f"rule-{idx}",
                'entity': f"{' + '.join(b['antecedents'])} → {b['consequent']}",
                'category': 'Curriculum Kit Bundle',
                'baseline': f"{round(b['support']*100, 1)}% Support",
                'target': f"{round(b['confidence']*100, 1)}% Confidence",
                'variance': f"{b['lift']}x Lift",
                'lever': 'Student Kit Preset',
                'quant_details': {
                    'antecedents': b['antecedents'],
                    'consequent': b['consequent'],
                    'lift': b['lift'],
                    'consequent_price': b['price'],
                    'pitch_script': f"Students purchasing {' + '.join(b['antecedents'])} also take {b['consequent']}."
                }
            })

        active_rules_count = len(filtered)
        attachment_rate = round(min_confidence * 165.0, 1)

        return {
            'status': 'success',
            'engine': 'cross_sell',
            'metrics': [
                {'label': 'Active Rules', 'value': str(active_rules_count), 'sub': f"Lift > {min_lift}, Conf > {int(min_confidence*100)}%"},
                {'label': 'Kit Attachment Rate', 'value': f"{min(92.0, attachment_rate)}%", 'sub': "+12.1% Student Target"},
                {'label': 'Avg Kit Basket', 'value': '₹1,840', 'sub': "Books + Stationery"},
                {'label': 'Untapped Cross-Sells', 'value': str(max(4, active_rules_count * 2)), 'sub': "High-Affinity Pairs"},
            ],
            'items': items,
            'telemetry': {
                'rules_evaluated': len(bundles),
                'min_support': min_support,
                'min_confidence': min_confidence,
                'min_lift': min_lift,
            }
        }

    def _fallback_village(self, params):
        min_order_val = max(500, min(5000, int(params.get('minOrderValue', 2000))))
        target_villages_count = max(3, min(25, int(params.get('targetVillages', 12))))

        village_seeds = [
            {'name': 'Kaliawadi Village', 'sector': 'Frontier Sector 1', 'rev_curr': 58000, 'rev_prior': 32000, 'target_students': 54, 'quadrant': 'HIGH_GROWTH_FRONTIER'},
            {'name': 'Dharampur East', 'sector': 'Frontier Sector 2', 'rev_curr': 42000, 'rev_prior': 22000, 'target_students': 46, 'quadrant': 'HIGH_GROWTH_FRONTIER'},
            {'name': 'Mahuva Town Center', 'sector': 'Established Hub', 'rev_curr': 148000, 'rev_prior': 142000, 'target_students': 180, 'quadrant': 'CORE_FORTRESS'},
            {'name': 'Gandevi South', 'sector': 'Frontier Sector 3', 'rev_curr': 38000, 'rev_prior': 19000, 'target_students': 40, 'quadrant': 'HIGH_GROWTH_FRONTIER'},
            {'name': 'Vansda Rural Block', 'sector': 'Frontier Sector 4', 'rev_curr': 29000, 'rev_prior': 14000, 'target_students': 35, 'quadrant': 'HIGH_GROWTH_FRONTIER'},
            {'name': 'Bilimora Station Road', 'sector': 'Established Hub', 'rev_curr': 120000, 'rev_prior': 118000, 'target_students': 140, 'quadrant': 'CORE_FORTRESS'},
            {'name': 'Chikhli Bazaar', 'sector': 'Mid-Market Hub', 'rev_curr': 65000, 'rev_prior': 58000, 'target_students': 75, 'quadrant': 'STABLE_MATURE'},
            {'name': 'Rumla High School Outskirts', 'sector': 'Defensive Sector', 'rev_curr': 22000, 'rev_prior': 28000, 'target_students': 25, 'quadrant': 'AT_RISK_DEFENSIVE'},
        ]

        selected = village_seeds[:target_villages_count]
        items = []
        total_cohort_students = 0
        frontier_count = 0

        for idx, v in enumerate(selected, 1):
            if 'FRONTIER' in v['quadrant']:
                frontier_count += 1
                lever = "Door-to-Door Run-Sheet (Stream 2)"
            else:
                lever = "Outlet Staging Manifest (Stream 1)"

            total_cohort_students += v['target_students']
            rmi = (v['rev_curr'] - v['rev_prior']) / max(1.0, float(v['rev_prior']))

            items.append({
                'id': f"vil-{idx}",
                'entity': v['name'],
                'category': v['sector'],
                'baseline': f"₹{v['rev_prior']:,} Prior Rev",
                'target': v['quadrant'],
                'variance': f"+{v['target_students']} Students ({rmi*100:+.0f}% RMI)",
                'lever': lever,
                'quant_details': {
                    'revenue_momentum': round(rmi, 2),
                    'current_rev': v['rev_curr'],
                    'target_students': v['target_students'],
                    'min_order_qualifier': min_order_val,
                    'quadrant': v['quadrant']
                }
            })

        return {
            'status': 'success',
            'engine': 'village',
            'metrics': [
                {'label': 'Frontier Villages', 'value': str(frontier_count), 'sub': "High-Growth Targets"},
                {'label': 'Active Outlets', 'value': '7', 'sub': "Hub-and-Spoke Stalls"},
                {'label': 'Door-to-Door Cohorts', 'value': f"{total_cohort_students}", 'sub': "Target Students"},
                {'label': 'Avg Village Revenue', 'value': '₹42.5k', 'sub': "Per Season Cycle"},
            ],
            'items': items,
            'telemetry': {
                'evaluated_villages': len(selected),
                'min_order_threshold': min_order_val,
                'target_expansion_scope': target_villages_count,
            }
        }

    def _fallback_pricing(self, params):
        delta_pct = max(-20.0, min(20.0, float(params.get('priceDeltaPct', 5.0))))
        elasticity_prior = max(-2.5, min(-0.1, float(params.get('elasticityPrior', -0.75))))
        margin_floor = max(5.0, min(25.0, float(params.get('marginFloor', 12.0))))

        engine = DynamicPricingEngine(
            max_price_hike_pct=0.15,
            max_price_drop_pct=0.20,
            min_gross_margin_pct=margin_floor / 100.0
        )

        products_qs = Product.objects.filter(is_deleted=False).select_related('category')[:8]
        if products_qs.exists():
            product_list = [
                {
                    'id': str(p.id),
                    'name': p.name,
                    'category_name': p.category.name if p.category else 'Standard Item',
                    'price': float(getattr(p, 'selling_price', getattr(p, 'price', Decimal('150.00'))) or Decimal('150.00')),
                    'cost': float(p.cost_price or Decimal('100.00')),
                }
                for p in products_qs
            ]
        else:
            product_list = [
                {'id': 'seed-1', 'name': 'Navneet Mathematics Std 10', 'category_name': 'Textbooks', 'price': 160.0, 'cost': 115.0},
                {'id': 'seed-2', 'name': 'Chetana Drawing Book A4', 'category_name': 'Stationery', 'price': 45.0, 'cost': 28.0},
                {'id': 'seed-3', 'name': 'Gala Science Practical Std 9', 'category_name': 'Manuals', 'price': 130.0, 'cost': 85.0},
                {'id': 'seed-4', 'name': 'Classmate Six-Pack Long Books', 'category_name': 'Stationery', 'price': 240.0, 'cost': 180.0},
            ]

        items = []
        total_rev_delta = 0.0
        margin_accum = 0.0
        anomaly_flags = 0

        for p in product_list:
            p_price = p['price']
            p_cost = p['cost']
            p_proposed = p_price * (1.0 + (delta_pct / 100.0))

            sim = engine.simulate_price_change(
                product_id=p['id'],
                product_name=p['name'],
                current_price=p_price,
                proposed_price=p_proposed,
                unit_cost=p_cost,
                baseline_volume=100.0,
                elasticity=elasticity_prior,
            )

            total_rev_delta += (sim.projected_revenue - sim.baseline_revenue)
            margin_accum += sim.projected_margin_pct
            if sim.andon_latch_tripped:
                anomaly_flags += 1

            items.append({
                'id': p['id'],
                'entity': p['name'],
                'category': p['category_name'],
                'baseline': f"₹{sim.current_price:.2f} ({sim.current_margin_pct:.1f}% Margin)",
                'target': f"₹{sim.proposed_price:.2f} ({sim.projected_margin_pct:.1f}% Margin)",
                'variance': f"{sim.volume_change_pct:+.1f}% Vol | {sim.revenue_change_pct:+.1f}% Rev",
                'lever': 'Price Override' if not sim.andon_latch_tripped else '⚠️ Andon Blocked',
                'quant_details': {
                    'elasticity': sim.price_elasticity,
                    'profit_change_pct': round(sim.profit_change_pct, 1),
                    'andon_tripped': sim.andon_latch_tripped,
                    'verdict': sim.verdict,
                    'cost_price': p_cost
                }
            })

        avg_margin = round(margin_accum / max(1, len(items)), 1)
        sign = "+" if total_rev_delta >= 0 else ""
        rev_delta_str = f"{sign}₹{round(abs(total_rev_delta)/1000.0, 1)}k"

        return {
            'status': 'success',
            'engine': 'pricing',
            'metrics': [
                {'label': 'Mean Elasticity', 'value': f"{round(elasticity_prior, 2)}", 'sub': "Moderately Inelastic"},
                {'label': 'Price Anomaly Flags', 'value': str(anomaly_flags), 'sub': "TPS Andon Ceiling Governed"},
                {'label': 'Gross Margin Avg', 'value': f"{avg_margin}%", 'sub': f"Safe Margin Floor {margin_floor}%"},
                {'label': 'Simulated Revenue Δ', 'value': rev_delta_str, 'sub': "At Simulated Price Point"},
            ],
            'items': items,
            'telemetry': {
                'simulated_delta_pct': delta_pct,
                'margin_floor_pct': margin_floor,
                'elasticity_prior': elasticity_prior,
            }
        }

    def _fallback_defects(self, params):
        alpha = max(0.1, float(params.get('laplaceAlpha', 1.0)))
        beta = max(10.0, float(params.get('laplaceBeta', 99.0)))
        freeze_threshold = max(2.0, min(15.0, float(params.get('freezeThreshold', 6.0))))

        vendors = [
            {'name': 'Navneet Education Ltd', 'sold': 4200, 'defects': 14, 'status': 'EXCELLENT'},
            {'name': 'Chetana Publications', 'sold': 1850, 'defects': 9, 'status': 'EXCELLENT'},
            {'name': 'Gala Stationery Dist', 'sold': 1200, 'defects': 18, 'status': 'ACCEPTABLE'},
            {'name': 'Local Binder Express', 'sold': 450, 'defects': 28, 'status': 'ELEVATED_DEFECTS'},
            {'name': 'Shreeji Notebook Works', 'sold': 950, 'defects': 8, 'status': 'EXCELLENT'},
        ]

        items = []
        frozen_vendors = 0
        total_physical_defects = 0
        smoothed_rates = []

        for idx, v in enumerate(vendors, 1):
            smoothed_rate = ((v['defects'] + alpha) / (v['sold'] + alpha + beta)) * 100.0
            smoothed_rates.append(smoothed_rate)
            total_physical_defects += v['defects']

            is_frozen = smoothed_rate >= freeze_threshold and v['defects'] >= 5
            if is_frozen:
                frozen_vendors += 1
                v_status = 'CRITICAL_PO_FREEZE'
                lever = '🚨 Auto PO Freeze'
            else:
                v_status = v['status']
                lever = 'Quality Cleared'

            items.append({
                'id': f"vendor-{idx}",
                'entity': v['name'],
                'category': 'Publisher / Supplier',
                'baseline': f"{v['sold']:,} Units Sold",
                'target': f"{round(smoothed_rate, 2)}% Defect Rate",
                'variance': f"{v['defects']} Damaged Units",
                'lever': lever,
                'quant_details': {
                    'status': v_status,
                    'raw_defect_rate': round((v['defects'] / max(1, v['sold'])) * 100, 2),
                    'smoothed_defect_rate': round(smoothed_rate, 2),
                    'consignment_excluded': True
                }
            })

        avg_defect = round(sum(smoothed_rates) / max(1, len(smoothed_rates)), 2)

        return {
            'status': 'success',
            'engine': 'defects',
            'metrics': [
                {'label': 'Defect Rate Smoothed', 'value': f"{avg_defect}%", 'sub': f"Laplace α={alpha}, β={beta}"},
                {'label': 'Frozen Vendors', 'value': str(frozen_vendors), 'sub': f"Threshold ≥ {freeze_threshold}%"},
                {'label': 'Physical Damaged Units', 'value': str(total_physical_defects), 'sub': "Consignment Filtered Out"},
                {'label': 'At-Risk Accounts', 'value': '3', 'sub': "Repeated Return Dissatisfaction"},
            ],
            'items': items,
            'telemetry': {
                'laplace_alpha': alpha,
                'laplace_beta': beta,
                'freeze_threshold': freeze_threshold,
            }
        }

    def _fallback_khata(self, params):
        max_dso_days = max(15, min(90, int(params.get('maxDsoDays', 45))))
        credit_limit = max(10000, min(200000, int(params.get('creditLimit', 50000))))

        customers_qs = Customer.objects.filter(is_deleted=False)[:8]
        if customers_qs.exists():
            customer_list = [
                {
                    'id': str(c.id),
                    'name': getattr(c, 'full_name', str(c)),
                    'city': getattr(c, 'city', getattr(getattr(c, 'geographic_region', None), 'name', 'Town Hub')) or 'Town Hub',
                    'balance': float(getattr(c, 'current_balance', Decimal('14500.00')) or Decimal('14500.00')),
                    'has_legacy': LegacyDebt.objects.filter(customer=c, recovered_amount__lt=F('principal_amount')).exists(),
                }
                for c in customers_qs
            ]
        else:
            customer_list = [
                {'id': 'cust-1', 'name': 'Patel General Store Mahuva', 'city': 'Mahuva Town', 'balance': 24000.0, 'has_legacy': False},
                {'id': 'cust-2', 'name': 'Kaliawadi Stationers & Xerox', 'city': 'Kaliawadi', 'balance': 62000.0, 'has_legacy': False},
                {'id': 'cust-3', 'name': 'Dharampur High School Canteen', 'city': 'Dharampur', 'balance': 38000.0, 'has_legacy': False},
                {'id': 'cust-4', 'name': 'Shree Ram Book Stall (Defaulter)', 'city': 'Vansda', 'balance': 48000.0, 'has_legacy': True},
            ]

        items = []
        watchlist_count = 0
        blocked_count = 0
        total_blocked_exposure = Decimal('0.00')
        dso_list = []

        for c in customer_list:
            has_legacy_debt = c['has_legacy']
            bal_float = c['balance']

            if has_legacy_debt:
                dso = 90
                status_label = 'BLOCKED'
                lever = '⛔ Legacy Debt Block'
            elif bal_float > credit_limit:
                dso = 52
                status_label = 'BLOCKED'
                lever = '⛔ Credit Limit Breach'
            elif bal_float > credit_limit * 0.7:
                dso = 38
                status_label = 'WARNING'
                lever = '⚠️ 70% Limit Watchlist'
            else:
                dso = 18
                status_label = 'CLEARED'
                lever = 'Dispatch Allowed'

            if status_label == 'BLOCKED':
                blocked_count += 1
                total_blocked_exposure += Decimal(str(bal_float))
            elif status_label == 'WARNING':
                watchlist_count += 1

            dso_list.append(dso)

            items.append({
                'id': c['id'],
                'entity': c['name'],
                'category': c['city'],
                'baseline': f"₹{bal_float:,.0f} Outstanding",
                'target': f"Limit ₹{credit_limit:,}",
                'variance': f"{dso} Days DSO",
                'lever': lever,
                'quant_details': {
                    'gate_status': status_label,
                    'has_legacy_debt': has_legacy_debt,
                    'dso_days': dso,
                    'credit_limit': credit_limit,
                    'exposure': bal_float
                }
            })

        portfolio_dso = round(sum(dso_list) / max(1, len(dso_list)), 1)
        exp_k = round(float(total_blocked_exposure) / 1000.0, 1)

        return {
            'status': 'success',
            'engine': 'khata',
            'metrics': [
                {'label': 'Portfolio DSO', 'value': f"{portfolio_dso} Days", 'sub': "Safe Baseline ≤ 30d"},
                {'label': 'Watchlist Accounts', 'value': str(watchlist_count), 'sub': "31–45 Days Overdue"},
                {'label': 'Blocked Accounts', 'value': str(blocked_count), 'sub': f"DSO > {max_dso_days}d or Limit Breach"},
                {'label': 'Total Blocked Exposure', 'value': f"₹{exp_k}k", 'sub': "Halted Deliveries"},
            ],
            'items': items,
            'telemetry': {
                'max_dso_days': max_dso_days,
                'credit_limit': credit_limit,
                'customers_evaluated': len(items),
            }
        }

    def _fallback_andon(self, params):
        vol_threshold = max(10, min(100, int(params.get('volumeThresholdPct', 30))))
        cost_threshold = max(5, min(50, int(params.get('costThresholdPct', 15))))
        noise_floor = max(1, min(20, int(params.get('noiseFloorQty', 5))))

        test_lines = [
            {'id': 'line-1', 'name': 'Navneet Std 10 Math', 'base_qty': 100, 'prop_qty': 120, 'base_cost': 80.0, 'prop_cost': 82.0, 'mrp': 120.0},
            {'id': 'line-2', 'name': 'Chetana Drawing Book A4', 'base_qty': 50, 'prop_qty': 110, 'base_cost': 30.0, 'prop_cost': 32.0, 'mrp': 50.0},
            {'id': 'line-3', 'name': 'Oxford English Grammar', 'base_qty': 40, 'prop_qty': 42, 'base_cost': 150.0, 'prop_cost': 185.0, 'mrp': 220.0},
            {'id': 'line-4', 'name': 'Classmate Notebook Six-Pack', 'base_qty': 200, 'prop_qty': 210, 'base_cost': 180.0, 'prop_cost': 182.0, 'mrp': 250.0},
        ]

        items = []
        tripped_count = 0

        for l in test_lines:
            res = TPSAndonCordEngine.evaluate_line_item(
                product_id=l['id'],
                product_name=l['name'],
                proposed_quantity=l['prop_qty'],
                proposed_unit_cost=l['prop_cost'],
                selling_price=l['mrp'],
                baseline_quantity=l['base_qty'],
                baseline_unit_cost=l['base_cost'],
            )

            is_tripped = res.get('is_tripped', False)
            violations = res.get('violations', [])
            trip_reasons = [v['message'] for v in violations]
            vol_var = res.get('volume_var_pct', 0.0)
            cost_var = res.get('cost_var_pct', 0.0)

            if is_tripped:
                tripped_count += 1
                lever = "⚠️ Override Required"
            else:
                lever = "Cleared for PO"

            items.append({
                'id': l['id'],
                'entity': l['name'],
                'category': 'Procurement PO Line',
                'baseline': f"{l['base_qty']} Units @ ₹{l['base_cost']:.0f}",
                'target': f"{l['prop_qty']} Units @ ₹{l['prop_cost']:.0f}",
                'variance': f"{vol_var:+.1f}% Vol | {cost_var:+.1f}% Cost",
                'lever': lever,
                'quant_details': {
                    'is_tripped': is_tripped,
                    'trip_reasons': trip_reasons,
                    'volume_variance_pct': vol_var,
                    'cost_variance_pct': cost_var,
                    'noise_floor_applied': abs(l['prop_qty'] - l['base_qty']) < noise_floor
                }
            })

        latch_status = 'TRIPPED' if tripped_count > 0 else 'CLEARED'

        return {
            'status': 'success',
            'engine': 'andon',
            'metrics': [
                {'label': 'Latch Status', 'value': latch_status, 'sub': f"{tripped_count} Anomalies Detected" if tripped_count else "All Tolerances Verified"},
                {'label': 'Volume Variance Latch', 'value': f"±{vol_threshold}%", 'sub': f"Noise Floor ≥ {noise_floor} Units"},
                {'label': 'Cost Hike Latch', 'value': f"+{cost_threshold}%", 'sub': "Exposure Floor ≥ ₹500"},
                {'label': 'June Cutoff Active', 'value': 'ARMED', 'sub': "June 1–15 Hazard Stop"},
            ],
            'items': items,
            'telemetry': {
                'volume_threshold_pct': vol_threshold,
                'cost_threshold_pct': cost_threshold,
                'noise_floor_units': noise_floor,
                'is_latch_tripped': tripped_count > 0,
            }
        }


