from rest_framework import viewsets, permissions, status
from core.permissions import HasRequiredPermission
from rest_framework.decorators import action
from core.db_routers import use_read_replica
from rest_framework.response import Response
from django.db.models import Sum, Count, Avg, F, Q, ExpressionWrapper, DecimalField, Max, Case, When, Value, CharField
from django.db.models.functions import TruncDate, Coalesce, Concat
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta
from decimal import Decimal
import logging
from django.core.exceptions import ValidationError as DjangoValidationError
from django.apps import apps
from core.azql import AZQLCompiler, VisualCompiler, SCHEMA_WHITELIST

logger = logging.getLogger(__name__)

from orders.models import Order, OrderItem
from orders.constants import VALID_SALE_STATUSES
from inventory.models import Product, StockHistory
from customers.models import Customer, Address
from .models import ActivityLog, SavedQuery, QueryStateHistory
from .serializers import ActivityLogSerializer, SavedQuerySerializer, QueryStateHistorySerializer
import csv
import re
from django.http import HttpResponse


class ReportBaseViewSet(viewsets.ViewSet):
    permission_classes = [HasRequiredPermission]

    def export_file(self, request, filename, header, rows):
        """Dispatch to CSV or Excel based on ?format= query param."""
        fmt = request.query_params.get('file_format', 'csv').lower()
        if fmt == 'xlsx':
            return self.export_excel(filename, header, rows)
        return self.export_csv(filename, header, rows)

    def export_csv(self, filename, header, rows):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
        
        writer = csv.writer(response)
        writer.writerow(header)
        for row in rows:
            writer.writerow([self._sanitize_csv_value(v) for v in row])
            
        return response

    def export_excel(self, filename, header, rows):
        """Generate a styled .xlsx file using openpyxl."""
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from io import BytesIO

        wb = Workbook()
        ws = wb.active
        ws.title = filename[:31]  # Excel sheet name max 31 chars

        # Header style
        header_font = Font(name='Calibri', bold=True, size=11, color='FFFFFF')
        header_fill = PatternFill(start_color='2B5797', end_color='2B5797', fill_type='solid')
        header_align = Alignment(horizontal='center', vertical='center')
        thin_border = Border(
            bottom=Side(style='thin', color='CCCCCC')
        )

        # Write header row
        for col_idx, col_name in enumerate(header, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align

        # Write data rows
        import uuid
        data_font = Font(name='Calibri', size=11)
        for row_idx, row in enumerate(rows, 2):
            for col_idx, value in enumerate(row, 1):
                if isinstance(value, uuid.UUID):
                    value = str(value)
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.font = data_font
                cell.border = thin_border

        # Auto-fit column widths
        for col_idx in range(1, len(header) + 1):
            max_length = len(str(header[col_idx - 1]))
            for row_idx in range(2, len(rows) + 2):
                cell_value = ws.cell(row=row_idx, column=col_idx).value
                if cell_value is not None:
                    max_length = max(max_length, len(str(cell_value)))
            ws.column_dimensions[get_column_letter(col_idx)].width = min(max_length + 3, 50)

        # Freeze header row
        ws.freeze_panes = 'A2'

        # Write to response
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}.xlsx"'
        return response
    
    @staticmethod
    def _sanitize_csv_value(value):
        """Prevent CSV formula injection by prefixing dangerous characters."""
        if isinstance(value, str) and value and value[0] in ('=', '+', '-', '@', '\t', '\r'):
            return f"'{value}"
        return value

    def get_date_range(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        period = request.query_params.get('period')
        
        today = timezone.now().date()
        
        if period:
            if period == 'today':
                return today, today
            elif period == 'week':
                return today - timedelta(days=7), today
            elif period == 'month':
                return today - timedelta(days=30), today
            elif period == 'year':
                return today - timedelta(days=365), today
            elif period == 'all':
                from datetime import date
                return date(2000, 1, 1), today

        if start_date_str:
            start_date = parse_date(start_date_str)
            if start_date is None:
                return None, None  # Signal invalid date
        else:
            start_date = today - timedelta(days=30)
            
        if end_date_str:
            end_date = parse_date(end_date_str)
            if end_date is None:
                return None, None  # Signal invalid date
        else:
            end_date = today
            
        return start_date, end_date

    def _validate_dates(self, request):
        """Returns (start_date, end_date) or a 400 Response."""
        start_date, end_date = self.get_date_range(request)
        if start_date is None or end_date is None:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return start_date, end_date


class SalesReportViewSet(ReportBaseViewSet):
    required_permission = 'reports.view_sales'
    
    @action(detail=False, methods=['get'])
    @use_read_replica
    def summary(self, request):
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        orders = Order.objects.filter(
            created_at__date__range=[start_date, end_date],
            order_status__in=VALID_SALE_STATUSES
        )
        
        summary = orders.aggregate(
            total_sales=Sum('total'),
            order_count=Count('id'),
            aov=Avg('total')
        )
        
        # Handle None values for empty results
        summary['total_sales'] = summary['total_sales'] or 0
        summary['average_order_value'] = summary.pop('aov', 0) or 0
        
        return Response(summary)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def top_products(self, request):
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        items = OrderItem.objects.filter(
            order__created_at__date__range=[start_date, end_date],
            order__order_status__in=VALID_SALE_STATUSES
        )
        
        top_products = items.values(
            'product__id', 'product__name'
        ).annotate(
            total_quantity=Sum('quantity'),
            total_value=Sum('line_total')
        ).order_by('-total_quantity')[:10]
        
        data = [{
            'id': p['product__id'],
            'name': p['product__name'],
            'quantity': p['total_quantity'],
            'revenue': p['total_value']
        } for p in top_products]
        
        return Response(data)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def by_customer(self, request):
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        orders = Order.objects.filter(
            created_at__date__range=[start_date, end_date],
            order_status__in=VALID_SALE_STATUSES
        ).exclude(customer__isnull=True)
        
        customer_sales = orders.values(
            'customer__id', 'customer__first_name', 'customer__last_name'
        ).annotate(
            total_sales=Sum('total'),
            order_count=Count('id')
        ).order_by('-total_sales')
        
        data = [{
            'id': c['customer__id'],
            'name': f"{c['customer__first_name']} {c['customer__last_name']}".strip(),
            'total': c['total_sales'],
            'order_count': c['order_count']
        } for c in customer_sales]
        
        return Response(data)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def trends(self, request):
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        trends = Order.objects.filter(
            created_at__date__range=[start_date, end_date],
            order_status__in=VALID_SALE_STATUSES
        ).annotate(
            date=TruncDate('created_at')
        ).values('date').annotate(
            total=Sum('total'),
            orders=Count('id')
        ).order_by('date')
        
        return Response(trends)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def export(self, request):
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        period = request.query_params.get('period', 'custom')
        
        orders_data = Order.objects.filter(
            created_at__date__range=[start_date, end_date],
            order_status__in=VALID_SALE_STATUSES
        ).annotate(
            item_count=Count('items'),
            cust_name=Case(
                When(is_guest=True, then=Coalesce('guest_name', Value('Guest'))),
                default=Coalesce(
                    Concat('customer__first_name', Value(' '), 'customer__last_name'),
                    Value('Unknown')
                ),
                output_field=CharField(),
            )
        ).values_list(
            'display_id', 'created_at', 'cust_name', 'order_status', 'item_count', 'total'
        )
        
        header = ['Order ID', 'Date', 'Customer', 'Status', 'Items', 'Total Amount']
        rows = []
        for row in orders_data:
            rows.append([
                row[0],
                row[1].strftime('%Y-%m-%d %H:%M'),
                row[2],
                row[3],
                row[4],
                row[5]
            ])
            
        return self.export_file(request, f'sales_report_{period}', header, rows)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def by_payment_method(self, request):
        """Sales grouped by payment method."""
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        from orders.models import Payment
        payments = Payment.objects.filter(
            created_at__date__range=[start_date, end_date],
            order__order_status__in=VALID_SALE_STATUSES
        ).values('method').annotate(
            total_amount=Sum('amount'),
            count=Count('id')
        ).order_by('-total_amount')
        
        return Response(payments)

class InventoryReportViewSet(ReportBaseViewSet):
    required_permission = 'reports.view_inventory'
    
    @action(detail=False, methods=['get'])
    @use_read_replica
    def valuation(self, request):
        valuation = Product.objects.aggregate(
            total_cost_value=Sum(F('stock_quantity') * F('cost_price'), output_field=DecimalField()),
            total_selling_value=Sum(F('stock_quantity') * F('selling_price'), output_field=DecimalField())
        )
        
        valuation['total_cost_value'] = valuation['total_cost_value'] or 0
        valuation['total_selling_value'] = valuation['total_selling_value'] or 0
        valuation['potential_profit'] = valuation['total_selling_value'] - valuation['total_cost_value']
        valuation['total_items'] = Product.objects.count()
        
        return Response(valuation)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def low_stock(self, request):
        low_stock_products = Product.objects.filter(
            stock_quantity__lt=F('low_stock_threshold')
        ).annotate(
            reorder_point=F('low_stock_threshold')
        ).values('id', 'name', 'stock_quantity', 'reorder_point')
        
        return Response(low_stock_products)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def dead_stock(self, request):
        try:
            days = int(request.query_params.get('days', 30))
        except (ValueError, TypeError):
            days = 30
        cutoff = timezone.now() - timedelta(days=days)
        today = timezone.now().date()
        
        # Products with 0 sales in N+ days (confirmed or completed orders)
        sold_product_ids = OrderItem.objects.filter(
            order__created_at__gte=cutoff,
            order__order_status__in=VALID_SALE_STATUSES
        ).values_list('product_id', flat=True).distinct()
        
        dead_stock_qs = Product.objects.exclude(
            id__in=sold_product_ids
        ).filter(stock_quantity__gt=0).annotate(
            last_order_date=Max(
                'order_items__order__created_at',
                filter=Q(order_items__order__order_status__in=VALID_SALE_STATUSES)
            )
        ).values('id', 'name', 'stock_quantity', 'cost_price', 'last_order_date')
        
        data = []
        for p in dead_stock_qs:
            last_sold = p['last_order_date'].date() if p['last_order_date'] else None
            days_since = (today - last_sold).days if last_sold else None
            data.append({
                'id': p['id'],
                'name': p['name'],
                'stock_quantity': p['stock_quantity'],
                'cost_price': p['cost_price'],
                'last_sold': last_sold.isoformat() if last_sold else None,
                'days_since_sale': days_since
            })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def movement(self, request):
        """Stock movement report: inflows, outflows, adjustments."""
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        history = StockHistory.objects.filter(
            created_at__date__range=[start_date, end_date]
        )
        
        summary = history.values('reason').annotate(
            total_quantity=Sum('quantity_change'),
            count=Count('id')
        ).order_by('reason')
        
        inflows = history.filter(quantity_change__gt=0).aggregate(
            total=Sum('quantity_change')
        )['total'] or 0
        outflows = history.filter(quantity_change__lt=0).aggregate(
            total=Sum('quantity_change')
        )['total'] or 0
        
        # Recent movements
        recent = history.select_related('product', 'created_by').order_by('-created_at')[:50]
        recent_data = [{
            'id': str(h.id),
            'product': h.product.name,
            'quantity_change': h.quantity_change,
            'quantity_after': h.quantity_after,
            'reason': h.reason,
            'notes': h.notes,
            'created_by': h.created_by.get_full_name() if h.created_by else 'System',
            'created_at': h.created_at.isoformat()
        } for h in recent]
        
        return Response({
            'summary_by_reason': list(summary),
            'total_inflows': inflows,
            'total_outflows': abs(outflows),
            'net_change': inflows + outflows,
            'recent_movements': recent_data
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def aging(self, request):
        """Aging stock report: products not sold in X configurable days."""
        try:
            days = int(request.query_params.get('days', 90))
        except (ValueError, TypeError):
            days = 90
        cutoff = timezone.now() - timedelta(days=days)
        
        sold_product_ids = OrderItem.objects.filter(
            order__created_at__gte=cutoff,
            order__order_status__in=VALID_SALE_STATUSES
        ).values_list('product_id', flat=True).distinct()
        
        aging_products = Product.objects.exclude(
            id__in=sold_product_ids
        ).filter(stock_quantity__gt=0).annotate(
            inventory_value=ExpressionWrapper(
                F('stock_quantity') * F('cost_price'),
                output_field=DecimalField()
            )
        ).values(
            'id', 'name', 'display_id', 'stock_quantity', 'cost_price', 'inventory_value'
        ).order_by('-inventory_value')
        
        total_value = sum(p['inventory_value'] or 0 for p in aging_products)
        
        return Response({
            'days_threshold': days,
            'product_count': len(aging_products),
            'total_value': total_value,
            'products': list(aging_products)
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def turnover(self, request):
        """Inventory turnover rate: COGS / Average Inventory Value."""
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        # COGS for the period
        cogs = OrderItem.objects.filter(
            order__created_at__date__range=[start_date, end_date],
            order__order_status__in=VALID_SALE_STATUSES
        ).aggregate(
            total=Sum(
                F('cost_price') * F('quantity'),
                output_field=DecimalField()
            )
        )['total'] or Decimal('0.00')
        
        # Current inventory value as proxy for average
        current_inventory = Product.objects.aggregate(
            total=Sum(
                F('stock_quantity') * F('cost_price'),
                output_field=DecimalField()
            )
        )['total'] or Decimal('0.01')  # Avoid division by zero
        
        turnover_rate = float(cogs) / float(current_inventory) if current_inventory else 0
        
        # Days in period for annualization
        period_days = max((end_date - start_date).days, 1)
        annualized_rate = turnover_rate * (365 / period_days)
        days_to_sell = round(period_days / turnover_rate, 1) if turnover_rate > 0 else None
        
        return Response({
            'cogs': cogs,
            'average_inventory': current_inventory,
            'turnover_rate': round(turnover_rate, 2),
            'annualized_rate': round(annualized_rate, 2),
            'days_to_sell': days_to_sell,
            'period_days': period_days
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def export(self, request):
        export_type = request.query_params.get('type', 'all')
        
        if export_type == 'low_stock':
            products = Product.objects.filter(stock_quantity__lt=F('low_stock_threshold'))
            filename = 'low_stock_inventory'
        elif export_type == 'dead_stock':
            thirty_days_ago = timezone.now() - timedelta(days=30)
            sold_ids = OrderItem.objects.filter(
                order__created_at__gte=thirty_days_ago,
                order__order_status__in=VALID_SALE_STATUSES
            ).values_list('product_id', flat=True)
            products = Product.objects.exclude(id__in=sold_ids)
            filename = 'dead_stock_inventory'
        else:
            products = Product.objects.all()
            filename = 'inventory_valuation'
            
        header = ['Product ID', 'Product Name', 'Stock', 'Cost Price', 'Selling Price', 'Cost Value', 'Selling Value']
        rows = []
        for p in products:
            cost_val = (p.stock_quantity * p.cost_price) if p.stock_quantity and p.cost_price else 0
            sell_val = (p.stock_quantity * p.selling_price) if p.stock_quantity and p.selling_price else 0
            rows.append([
                p.display_id,
                p.name,
                p.stock_quantity,
                p.cost_price,
                p.selling_price,
                cost_val,
                sell_val
            ])
            
        return self.export_file(request, filename, header, rows)

class CustomerReportViewSet(ReportBaseViewSet):
    required_permission = 'reports.view_customers'
    
    @action(detail=False, methods=['get'])
    @use_read_replica
    def summary(self, request):
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        total_customers = Customer.objects.count()
        new_customers = Customer.objects.filter(
            created_at__date__range=[start_date, end_date]
        ).count()
        
        active_customer_ids = Order.objects.filter(
            created_at__date__range=[start_date, end_date],
            order_status__in=VALID_SALE_STATUSES
        ).values_list('customer_id', flat=True).distinct()
        active_customers_count = len([id for id in active_customer_ids if id is not None])
        
        # Repeat customers: those who have more than 1 confirmed/completed order ever
        repeat_customers_count = Customer.objects.annotate(
            order_count=Count('orders', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False))
        ).filter(order_count__gt=1).count()
        
        # CLV metrics
        customer_stats = Customer.objects.annotate(
            total_spent=Sum('orders__total', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False)),
            order_count=Count('orders', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False))
        ).filter(order_count__gt=0)
        
        avg_order_value = customer_stats.aggregate(avg=Avg('total_spent'))['avg'] or 0
        avg_orders_per_customer = customer_stats.aggregate(avg=Avg('order_count'))['avg'] or 0
        # CLV = AOV × Frequency (simplified as we don't track lifespan)
        avg_clv = float(avg_order_value) * float(avg_orders_per_customer) if avg_order_value else 0
        
        return Response({
            'total_customers': total_customers,
            'new_customers': new_customers,
            'active_customers': active_customers_count,
            'repeat_customers': repeat_customers_count,
            'avg_clv': round(avg_clv, 2),
            'avg_order_value': round(float(avg_order_value), 2),
            'avg_orders_per_customer': round(float(avg_orders_per_customer), 1)
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def top(self, request):
        top_customers = Customer.objects.annotate(
            total_spent=Sum('orders__total', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False)),
            order_count=Count('orders', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False))
        ).filter(total_spent__gt=0).order_by('-total_spent')[:10]
        
        data = []
        for c in top_customers:
            aov = c.total_spent / c.order_count if c.order_count else 0
            clv = float(aov) * float(c.order_count)
            data.append({
                'id': c.id,
                'name': f"{c.first_name} {c.last_name}".strip(),
                'total_spent': c.total_spent,
                'order_count': c.order_count,
                'clv': round(clv, 2)
            })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def rfm(self, request):
        """RFM segmentation — returns segment counts for frontend."""
        from datetime import date, timedelta
        
        today = timezone.now().date()
        
        # Get raw lightweight dictionaries, avoiding slow Django model instantiation overhead
        customers = Customer.objects.annotate(
            last_order_date=Max('orders__created_at', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False)),
            frequency=Count('orders', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False), distinct=True),
            monetary=Sum('orders__total', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False))
        ).filter(frequency__gt=0).values('last_order_date', 'frequency', 'monetary')
        
        segments = {
            'Champions': 0,
            'Loyal': 0,
            'Potential Loyalists': 0,
            'At Risk': 0,
            'Lost': 0
        }
        
        for c in customers:
            last_order = c['last_order_date']
            recency = (today - last_order.date()).days if last_order else 999
            freq = c['frequency'] or 0
            monetary = float(c['monetary'] or 0)
            
            # Simple RFM scoring
            if recency <= 30 and freq >= 3 and monetary >= 5000:
                segments['Champions'] += 1
            elif recency <= 60 and freq >= 2 and monetary >= 2000:
                segments['Loyal'] += 1
            elif recency <= 30 and freq >= 1:
                segments['Potential Loyalists'] += 1
            elif recency <= 180:
                segments['At Risk'] += 1
            else:
                segments['Lost'] += 1
                
        data = [{'segment': k, 'count': v} for k, v in segments.items()]
        return Response(data)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def export(self, request):
        # Use annotations for performance instead of N+1 queries
        customers = Customer.objects.annotate(
            total_spent=Sum('orders__total', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False)),
            order_count=Count('orders', filter=Q(orders__order_status__in=VALID_SALE_STATUSES, orders__is_deleted=False))
        ).all()
        
        header = ['ID', 'Name', 'Email', 'Phone', 'Orders', 'Total Spent', 'Joined Date']
        rows = []
        for c in customers:
            rows.append([
                c.id,
                f"{c.first_name} {c.last_name}",
                c.email,
                c.phone,
                c.order_count or 0,
                c.total_spent or 0,
                c.created_at.strftime('%Y-%m-%d')
            ])
            
        return self.export_file(request, 'customer_report', header, rows)

    @action(detail=False, methods=['get'])
    @use_read_replica
    def locations(self, request):
        """Customer locations for map visualization."""
        tag = request.query_params.get('tag')
        pincode = request.query_params.get('pincode')
        village = request.query_params.get('village')
        
        addresses = Address.objects.filter(
            location__isnull=False,
        ).select_related('customer', 'region').prefetch_related('location_tags')
        
        if tag:
            addresses = addresses.filter(location_tags__name=tag)
        if pincode:
            addresses = addresses.filter(pincode=pincode)
        if village:
            addresses = addresses.filter(region__name__icontains=village)
        
        data = []
        for addr in addresses.distinct()[:500]:  # Limit for performance
            tags = addr.location_tags.all()
            first_tag = tags.first()
            data.append({
                'id': str(addr.id),
                'customer_id': str(addr.customer_id),
                'customer_name': addr.customer.full_name if addr.customer else '',
                'latitude': float(addr.location.y),
                'longitude': float(addr.location.x),
                'address': str(addr),
                'pincode': addr.pincode or '',
                'village': addr.region.name if addr.region else '',
                'tag': first_tag.name if first_tag else '',
                'tag_color': first_tag.color if first_tag else ''
            })
        
        # Summary by location tag
        tag_summary = Address.objects.filter(
            location__isnull=False
        ).values(
            'location_tags__name', 'location_tags__color'
        ).annotate(count=Count('id')).order_by('-count')
        
        return Response({
            'locations': data,
            'total': len(data),
            'by_tag': list(tag_summary)
        })

class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ActivityLog.objects.select_related('user')
    serializer_class = ActivityLogSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'settings.view_audit_logs'
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user_id = self.request.query_params.get('user')
        action_type = self.request.query_params.get('action_type')
        exact_date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        if action_type:
            queryset = queryset.filter(action_type=action_type)
        if exact_date:
            queryset = queryset.filter(created_at__date=exact_date)
        else:
            if start_date:
                queryset = queryset.filter(created_at__date__gte=start_date)
            if end_date:
                queryset = queryset.filter(created_at__date__lte=end_date)
            
        return queryset


def get_field_choices(model_class, field_path):
    parts = field_path.split('__')
    current_model = model_class
    for part in parts[:-1]:
        try:
            field = current_model._meta.get_field(part)
            current_model = field.related_model
            if not current_model:
                return None
        except Exception:
            return None
    try:
        final_field = current_model._meta.get_field(parts[-1])
        if final_field.choices:
            return [{'value': val, 'label': label} for val, label in final_field.choices]
    except Exception:
        pass
    return None


def get_field_type(model_class, field_path):
    parts = field_path.split('__')
    current_model = model_class
    for part in parts[:-1]:
        try:
            field = current_model._meta.get_field(part)
            current_model = field.related_model
            if not current_model:
                return "string"
        except Exception:
            return "string"
    try:
        final_field = current_model._meta.get_field(parts[-1])
        internal_type = final_field.get_internal_type()
        if internal_type in ('IntegerField', 'PositiveIntegerField', 'PositiveSmallIntegerField', 'SmallIntegerField', 'BigIntegerField'):
            return "integer"
        elif internal_type in ('DecimalField', 'FloatField'):
            return "decimal"
        elif internal_type in ('DateTimeField', 'DateField'):
            return "datetime"
        elif internal_type == 'BooleanField':
            return "boolean"
    except Exception:
        pass
    return "string"


def get_field_label(model_class, field_path):
    # Format the full path to preserve relationship context (e.g., 'product__name' -> 'Product Name')
    return field_path.replace('__', ' ').replace('_', ' ').title()


# get_reachable_fields has been deprecated in favor of dynamic client-side path crawling.


class QueryViewSet(viewsets.ModelViewSet):
    queryset = SavedQuery.objects.all()
    serializer_class = SavedQuerySerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'reports.manage_queries'

    def get_queryset(self):
        # Users can view their own queries or shared queries
        return SavedQuery.objects.filter(
            is_deleted=False
        ).filter(
            Q(created_by=self.request.user) | Q(is_shared=True)
        )

    def _is_owner_or_admin(self, instance):
        user = self.request.user
        if user.is_superuser:
            return True
        if instance.created_by == user:
            return True
        # Check if user has Admin role
        from settings_app.models import Role
        return Role.objects.filter(role_users__user=user, name='Admin').exists()

    def perform_update(self, serializer):
        from rest_framework.exceptions import PermissionDenied
        instance = self.get_object()
        if not self._is_owner_or_admin(instance):
            raise PermissionDenied(
                "You do not have permission to modify this saved query."
            )
        serializer.save()

    def perform_destroy(self, instance):
        from rest_framework.exceptions import PermissionDenied
        if not self._is_owner_or_admin(instance):
            raise PermissionDenied(
                "You do not have permission to delete this saved query."
            )
        instance.delete()

    @action(detail=False, methods=['post'])
    @use_read_replica
    def run(self, request):
        query_type = request.data.get('query_type')
        entity = request.data.get('entity')
        
        if not query_type:
            return Response({'error': 'Missing query_type'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            if query_type == 'azql':
                azql_text = request.data.get('azql_text')
                if not azql_text:
                    return Response({'error': 'Missing azql_text for azql query'}, status=status.HTTP_400_BAD_REQUEST)
                # Compile using the parsed compiler
                qs, selected_columns = AZQLCompiler.compile(azql_text, active_user=request.user)
            elif query_type == 'visual':
                if not entity:
                    return Response({'error': 'Missing entity for visual query'}, status=status.HTTP_400_BAD_REQUEST)
                rules = request.data.get('rules', {})
                columns = request.data.get('columns', [])
                aggregates = request.data.get('aggregates', [])
                if not columns:
                    # Default to all whitelisted fields for this entity if columns not specified
                    columns = list(SCHEMA_WHITELIST.get(entity, {}).get('fields', []))
                qs, selected_columns = VisualCompiler.compile(entity, rules, columns, aggregates, active_user=request.user)
            else:
                return Response({'error': f'Unsupported query_type: {query_type}'}, status=status.HTTP_400_BAD_REQUEST)
                
            # Limit rows to 100 and execute with a 5000ms timeout
            from django.conf import settings
            from django.db import transaction, connections, utils
            
            db_alias = 'reports' if not getattr(settings, 'IS_TESTING', False) else 'default'
            
            try:
                with transaction.atomic(using=db_alias):
                    if connections[db_alias].vendor == 'postgresql':
                        with connections[db_alias].cursor() as cursor:
                            cursor.execute("SET LOCAL statement_timeout = 7500")
                    results = list(qs.distinct()[:100])
            except utils.OperationalError as e:
                if "timeout" in str(e).lower() or "cancel" in str(e).lower():
                    return Response(
                        {"error": "Query execution timed out. Maximum limit is 7500ms."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                raise
                
            return Response({
                'results': results,
                'columns': selected_columns
            })
            
        except DjangoValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Error running query")
            return Response({'error': f"Internal compiler or execution error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def schema(self, request):
        schema_data = {}
        for entity_key, config in SCHEMA_WHITELIST.items():
            model_path = config['model']
            try:
                model_class = apps.get_model(model_path)
                entity_label = model_class._meta.verbose_name.title()
            except Exception:
                entity_label = entity_key.title()
                model_class = None
                
            fields_data = []
            relations_data = []
            
            if model_class:
                # 1. Direct fields
                for f_name in config['fields']:
                    # We whitelist these fields. If a field contains '__', it is a nested path.
                    if '__' in f_name:
                        fields_data.append({
                            'name': f_name,
                            'label': get_field_label(model_class, f_name),
                            'type': get_field_type(model_class, f_name),
                            'choices': get_field_choices(model_class, f_name)
                        })
                        continue
                    
                    try:
                        field = model_class._meta.get_field(f_name)
                        choices = None
                        if field.choices:
                            choices = [{'value': val, 'label': label} for val, label in field.choices]
                            
                        # Determine field type
                        internal_type = field.get_internal_type()
                        field_type = "string"
                        if internal_type in ('IntegerField', 'PositiveIntegerField', 'PositiveSmallIntegerField', 'SmallIntegerField', 'BigIntegerField'):
                            field_type = "integer"
                        elif internal_type in ('DecimalField', 'FloatField'):
                            field_type = "decimal"
                        elif internal_type in ('DateTimeField', 'DateField'):
                            field_type = "datetime"
                        elif internal_type == 'BooleanField':
                            field_type = "boolean"
                            
                        fields_data.append({
                            'name': f_name,
                            'label': str(field.verbose_name).title(),
                            'type': field_type,
                            'choices': choices
                        })
                    except Exception:
                        # Fallback for custom whitelisted properties
                        fields_data.append({
                            'name': f_name,
                            'label': f_name.replace('_', ' ').title(),
                            'type': "string",
                            'choices': None
                        })
                
                # Sort fields by label
                fields_data.sort(key=lambda x: x['label'])
                
                # 2. Direct relations to whitelisted models
                try:
                    all_fields = model_class._meta.get_fields()
                except Exception:
                    all_fields = []
                    
                for field in all_fields:
                    if field.is_relation and field.related_model:
                        rel_model = field.related_model
                        # Find whitelisted key for rel_model
                        rel_key = None
                        for k, cfg in SCHEMA_WHITELIST.items():
                            try:
                                if apps.get_model(cfg['model']) == rel_model:
                                    rel_key = k
                                    break
                            except Exception:
                                pass
                        if rel_key:
                            is_forward_fk = field.many_to_one or getattr(field, 'one_to_one', False)
                            relations_data.append({
                                'name': field.name,
                                'target': rel_key,
                                'label': field.name.replace('_', ' ').title(),
                                'is_forward_fk': bool(is_forward_fk)
                            })
                            
                # Sort relations by name
                relations_data.sort(key=lambda x: x['name'])
                
            schema_data[entity_key] = {
                'label': entity_label,
                'fields': fields_data,
                'relations': relations_data
            }
            
        def build_relation_fields(e_key, visited):
            if len(visited) > 2:
                return []
            rel_fields = []
            for rel in schema_data[e_key]['relations']:
                target = rel['target']
                if target in visited:
                    continue
                
                subprops = list(schema_data[target]['fields'])
                target_rel_fields = build_relation_fields(target, visited | {target})
                if target_rel_fields:
                    subprops.extend(target_rel_fields)
                
                match_modes = ['some', 'none'] if rel.get('is_forward_fk') else ['some', 'all', 'none']
                
                rel_fields.append({
                    'name': f"~{rel['name']}",
                    'label': f"📦 {rel['label']} (has any/all/none matching...)",
                    'type': 'relation_subquery',
                    'target_entity': target,
                    'relation_name': rel['name'],
                    'subproperties': subprops,
                    'matchModes': match_modes
                })
            return rel_fields
            
        for entity_key in schema_data:
            schema_data[entity_key]['relation_fields'] = build_relation_fields(entity_key, {entity_key})
            
        operators = [
            {'value': '=', 'label': '='},
            {'value': '!=', 'label': '!='},
            {'value': '>', 'label': '>'},
            {'value': '<', 'label': '<'},
            {'value': '>=', 'label': '>='},
            {'value': '<=', 'label': '<='},
            {'value': 'LIKE', 'label': 'LIKE'},
            {'value': 'CONTAINS', 'label': 'CONTAINS'},
            {'value': 'IN', 'label': 'IN'},
            {'value': 'WAS EVER', 'label': 'WAS EVER'},
            {'value': 'HAS_ANY', 'label': 'HAS ANY'},
            {'value': 'HAS_ALL', 'label': 'HAS ALL'},
            {'value': 'HAS_NONE', 'label': 'HAS NONE'}
        ]
        
        return Response({
            'entities': schema_data,
            'operators': operators
        })


class QueryStateHistoryViewSet(viewsets.ModelViewSet):
    queryset = QueryStateHistory.objects.all()
    serializer_class = QueryStateHistorySerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'reports.manage_queries'

    def get_queryset(self):
        # Users can only see and restore their own history
        return QueryStateHistory.objects.filter(user=self.request.user)


class FinanceReportViewSet(ReportBaseViewSet):
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.view_reports'
    
    @action(detail=False, methods=['get'])
    @use_read_replica
    def pnl(self, request):
        """
        Profit and Loss Statement (Phase 6.1 Rewrite).
        
        Revenue: Net Sales (Gross - Returns) + Other Income
        COGS: Net COGS (Gross COGS - Returned items' cost)
        Expenses: Operational Expenses (EXCLUDING Procurement) + Salaries + Loan Interest
        
        The Procurement category is excluded because inventory purchases are
        asset exchanges (Cash → Stock), not expenses. They only become expenses
        when sold (via COGS). Including them would double-count procurement spend.
        """
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        # 1. Revenue — Net of Returns
        from orders.models import Return as OrderReturn
        
        gross_sales = Order.objects.filter(
            created_at__date__range=[start_date, end_date],
            order_status__in=VALID_SALE_STATUSES
        ).aggregate(total=Sum('total'))['total'] or Decimal('0.00')
        
        # Calculate total returned value in the period - optimized with prefetching to avoid N+1 query loop
        completed_returns = OrderReturn.objects.filter(
            status='completed',
            updated_at__date__range=[start_date, end_date],
            order__order_status__in=VALID_SALE_STATUSES
        ).prefetch_related('items__order_item', 'order')
        returned_value = Decimal('0.00')
        for ret in completed_returns:
            returned_value += ret.total_refund_amount
        
        net_sales = gross_sales - returned_value
        
        from finance.models import OtherIncome
        other_income = OtherIncome.objects.filter(
            date__range=[start_date, end_date]
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_revenue = net_sales + other_income
        
        # 2. Cost of Goods Sold (COGS) — Net of Returns
        gross_cogs = OrderItem.objects.filter(
            order__created_at__date__range=[start_date, end_date],
            order__order_status__in=VALID_SALE_STATUSES
        ).aggregate(
            total_cost=Sum(F('cost_price') * F('quantity'), output_field=DecimalField())
        )['total_cost'] or Decimal('0.00')
        
        # Subtract cost of returned items - pushed entirely to SQL aggregation
        from orders.models import ReturnItem
        returned_cogs = ReturnItem.objects.filter(
            return_request__status='completed',
            return_request__updated_at__date__range=[start_date, end_date],
            return_request__order__order_status__in=VALID_SALE_STATUSES
        ).aggregate(
            total_returned_cost=Sum(F('order_item__cost_price') * F('quantity'), output_field=DecimalField())
        )['total_returned_cost'] or Decimal('0.00')
        
        net_cogs = gross_cogs - returned_cogs
        
        gross_profit = total_revenue - net_cogs
        
        # 3. Expenses — EXCLUDING Procurement (asset exchange, not expense)
        from finance.models import Expense, SalaryPayment, LoanRepayment
        
        # Operational Expenses (exclude Procurement category to prevent double-dip)
        op_expenses = Expense.objects.filter(
            date__range=[start_date, end_date]
        ).exclude(
            category__name='Procurement'
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        
        # Procurement expenses shown separately for transparency
        procurement_expenses = Expense.objects.filter(
            date__range=[start_date, end_date],
            category__name='Procurement'
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        
        # Salaries (Base + Bonuses = Cost to Company)
        salaries = SalaryPayment.objects.filter(
            payment_date__range=[start_date, end_date]
        ).aggregate(
            total=Sum(F('base_amount') + F('bonuses'), output_field=DecimalField())
        )['total'] or Decimal('0.00')
        
        # Loan Interest
        loan_interest = LoanRepayment.objects.filter(
            date__range=[start_date, end_date]
        ).aggregate(total=Sum('interest_portion'))['total'] or Decimal('0.00')
        
        total_expenses = op_expenses + salaries + loan_interest
        
        net_profit = gross_profit - total_expenses
        
        return Response({
            'start_date': start_date,
            'end_date': end_date,
            'revenue': {
                'gross_sales': gross_sales,
                'returns': returned_value,
                'net_sales': net_sales,
                'other_income': other_income,
                'total': total_revenue
            },
            'cogs': {
                'gross': gross_cogs,
                'returns': returned_cogs,
                'net': net_cogs,
            },
            'gross_profit': gross_profit,
            'expenses': {
                'operational': op_expenses,
                'salaries': salaries,
                'loan_interest': loan_interest,
                'procurement_excluded': procurement_expenses,
                'total': total_expenses
            },
            'net_profit': net_profit
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def liabilities(self, request):
        """
        Dashboard metrics: Accounts Payable, Salaries Payable, etc.
        """
        from finance.models import Expense, Lender
        
        # Accounts Payable: Unpaid Expenses
        accounts_payable = Expense.objects.filter(
            payment_status__in=['unpaid', 'partial']
        ).aggregate(
            total=Sum(F('total_amount') - F('paid_amount'), output_field=DecimalField())
        )['total'] or Decimal('0.00')
        
        # Loans Outstanding
        from finance.models import Loan
        loans_outstanding = Loan.objects.filter(
            is_active=True, is_deleted=False
        ).aggregate(
            total=Coalesce(Sum(F('principal_amount') - F('total_paid'), output_field=DecimalField()), Decimal('0.00'))
        )['total']
            
        return Response({
            'accounts_payable': accounts_payable,
            'loans_outstanding': loans_outstanding
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def cash_flow(self, request):
        """Cash Flow Statement."""
        from finance.models import (
            OtherIncome, ExpensePayment, SalaryPayment, 
            LoanRepayment, Loan, Lender, BankAccount, Expense
        )
        
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        # 1. Operating Activities
        try:
            from orders.models import Payment
            cash_from_sales = Payment.objects.filter(
                created_at__date__range=[start_date, end_date],
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        except Exception:
             cash_from_sales = Order.objects.filter(
                created_at__date__range=[start_date, end_date],
                order_status__in=VALID_SALE_STATUSES
            ).aggregate(total=Sum('total'))['total'] or Decimal('0.00')

        other_income = OtherIncome.objects.filter(
            date__range=[start_date, end_date]
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Cash Outflows
        cash_paid_expenses = ExpensePayment.objects.filter(
            payment_date__range=[start_date, end_date]
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Salaries Paid
        cash_paid_salaries = SalaryPayment.objects.filter(
            payment_date__range=[start_date, end_date]
        ).aggregate(total=Sum('net_amount'))['total'] or Decimal('0.00')
        
        net_cash_operating = (cash_from_sales + other_income) - (cash_paid_expenses + cash_paid_salaries)
        
        # 2. Investing Activities (Placeholder)
        net_cash_investing = Decimal('0.00')
        
        # 3. Financing Activities
        loans_received = Loan.objects.filter(
            start_date__range=[start_date, end_date]
        ).aggregate(total=Sum('principal_amount'))['total'] or Decimal('0.00')
        
        loan_repayments = LoanRepayment.objects.filter(
            date__range=[start_date, end_date]
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        net_cash_financing = loans_received - loan_repayments
        
        net_cash_change = net_cash_operating + net_cash_investing + net_cash_financing
        
        # Closing Balance
        current_cash_balance = BankAccount.objects.filter(is_active=True).aggregate(total=Sum('current_balance'))['total'] or Decimal('0.00')
        opening_balance = current_cash_balance - net_cash_change
        
        return Response({
            'operating': {
                'inflow': {
                    'sales': cash_from_sales,
                    'other': other_income
                },
                'outflow': {
                    'expenses': cash_paid_expenses,
                    'salaries': cash_paid_salaries
                },
                'net': net_cash_operating
            },
            'investing': {
                 'net': net_cash_investing
            },
            'financing': {
                'loans_received': loans_received,
                'repayments': loan_repayments,
                'net': net_cash_financing
            },
            'net_change': net_cash_change,
            'opening_balance': opening_balance,
            'closing_balance': current_cash_balance
        })

    @action(detail=False, methods=['get'])
    @use_read_replica
    def balance_sheet(self, request):
        """Snapshot of Assets, Liabilities, and Equity."""
        from finance.models import Expense, Lender, BankAccount
        
        today = timezone.now().date()
        
        # ASSETS
        # Cash & Bank
        cash_bank = BankAccount.objects.filter(is_active=True).aggregate(total=Sum('current_balance'))['total'] or Decimal('0.00')
        
        # Inventory
        inventory_value = Product.objects.aggregate(
            total=Sum(F('stock_quantity') * F('cost_price'), output_field=DecimalField())
        )['total'] or Decimal('0.00')
        
        # Accounts Receivable (Unpaid confirmed/delivered orders)
        try:
            accounts_receivable = Order.objects.filter(
                order_status__in=VALID_SALE_STATUSES,
                payment_status__in=['pending', 'partial']
            ).aggregate(total=Sum('total'))['total'] or Decimal('0.00')
        except Exception:
            accounts_receivable = Decimal('0.00')

        total_current_assets = cash_bank + inventory_value + accounts_receivable
        
        # Fixed Assets (Not implemented)
        fixed_assets = Decimal('0.00')
        
        total_assets = total_current_assets + fixed_assets
        
        # LIABILITIES
        # Accounts Payable
        payables = Expense.objects.filter(
            payment_status__in=['unpaid', 'partial']
        ).aggregate(total=Sum(F('total_amount') - F('paid_amount'), output_field=DecimalField()))['total'] or Decimal('0.00')
        
        # Loans Payable
        from finance.models import Loan
        loans_payable = Loan.objects.filter(
            is_active=True, is_deleted=False
        ).aggregate(
            total=Coalesce(Sum(F('principal_amount') - F('total_paid'), output_field=DecimalField()), Decimal('0.00'))
        )['total']

        total_liabilities = payables + loans_payable
        
        # EQUITY = Assets - Liabilities
        equity = total_assets - total_liabilities
        
        return Response({
            'date': today,
            'assets': {
                'cash_bank': cash_bank,
                'inventory': inventory_value,
                'receivables': accounts_receivable,
                'fixed_assets': fixed_assets,
                'total': total_assets
            },
            'liabilities': {
                'payables': payables,
                'loans': loans_payable,
                'total': total_liabilities
            },
            'equity': equity
        })
        
    @action(detail=False, methods=['get'])
    @use_read_replica
    def expense_report(self, request):
        """Detailed Expense Report with category and status breakdowns."""
        from finance.models import Expense, ExpenseCategory
        
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        expenses_qs = Expense.objects.filter(
            date__range=[start_date, end_date],
            is_deleted=False
        )
        
        # Summary
        summary = expenses_qs.aggregate(
            total_amount=Sum('total_amount'),
            total_paid=Sum('paid_amount'),
            total_tax=Sum('tax_amount'),
            count=Count('id')
        )
        total_amount = summary['total_amount'] or Decimal('0.00')
        total_paid = summary['total_paid'] or Decimal('0.00')
        
        # By Category
        by_category = list(
            expenses_qs.values('category__name')
            .annotate(
                total=Sum('total_amount'),
                count=Count('id')
            )
            .order_by('-total')
        )
        
        # By Payment Status
        by_payment = list(
            expenses_qs.values('payment_status')
            .annotate(
                total=Sum('total_amount'),
                count=Count('id')
            )
            .order_by('payment_status')
        )
        
        # By Approval Status
        by_approval = list(
            expenses_qs.values('approval_status')
            .annotate(
                total=Sum('total_amount'),
                count=Count('id')
            )
            .order_by('approval_status')
        )
        
        # Monthly trend (within the date range)
        from django.db.models.functions import TruncMonth
        monthly = list(
            expenses_qs.annotate(month=TruncMonth('date'))
            .values('month')
            .annotate(
                total=Sum('total_amount'),
                count=Count('id')
            )
            .order_by('month')
        )
        
        return Response({
            'start_date': start_date,
            'end_date': end_date,
            'summary': {
                'total_amount': total_amount,
                'total_paid': total_paid,
                'total_outstanding': total_amount - total_paid,
                'total_tax': summary['total_tax'] or Decimal('0.00'),
                'count': summary['count'] or 0
            },
            'by_category': by_category,
            'by_payment_status': by_payment,
            'by_approval_status': by_approval,
            'monthly_trend': monthly
        })
        
    def tax_report(self, request):
        """Simple Sales Tax Report."""
        from finance.models import Expense
        
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        # Output Tax (Sales)
        try:
             tax_collected = Order.objects.filter(
                created_at__date__range=[start_date, end_date],
                order_status__in=VALID_SALE_STATUSES
            ).aggregate(total=Sum('tax_amount'))['total'] or Decimal('0.00')
             
             taxable_sales = Order.objects.filter(
                created_at__date__range=[start_date, end_date],
                order_status__in=VALID_SALE_STATUSES
            ).aggregate(total=Sum('subtotal'))['total'] or Decimal('0.00')
        except Exception:
             tax_collected = Decimal('0.00')
             taxable_sales = Decimal('0.00')

        # Input Tax (Expenses)
        tax_paid_expenses = Expense.objects.filter(
            date__range=[start_date, end_date],
            payment_status='paid'
        ).aggregate(total=Sum('tax_amount'))['total'] or Decimal('0.00')
        
        net_tax_payable = tax_collected - tax_paid_expenses
        
        return Response({
            'taxable_sales': taxable_sales,
            'tax_collected': tax_collected,
            'tax_paid_expenses': tax_paid_expenses,
            'net_tax_payable': net_tax_payable
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        report_type = request.query_params.get('type', 'pnl')
        
        result = self._validate_dates(request)
        if isinstance(result, Response):
            return result
        start_date, end_date = result
        
        if report_type == 'pnl':
             data = self.pnl(request).data
             header = ['Revenue', 'COGS', 'Gross Profit', 'Op. Expenses', 'Salaries', 'Interest', 'Net Profit']
             rows = [[
                 data['revenue']['total'],
                 data['cogs'],
                 data['gross_profit'],
                 data['expenses']['operational'],
                 data['expenses']['salaries'],
                 data['expenses']['loan_interest'],
                 data['net_profit']
             ]]
             filename = 'profit_loss_statement'
             
        elif report_type == 'cash_flow':
             data = self.cash_flow(request).data
             header = ['Operating Cash Flow', 'Investing Cash Flow', 'Financing Cash Flow', 'Net Change', 'Closing Balance']
             rows = [[
                 data['operating']['net'],
                 data['investing']['net'],
                 data['financing']['net'],
                 data['net_change'],
                 data['closing_balance']
             ]]
             filename = 'cash_flow_statement'
             
        elif report_type == 'balance_sheet':
             data = self.balance_sheet(request).data
             header = ['Total Assets', 'Total Liabilities', 'Equity']
             rows = [[
                 data['assets']['total'],
                 data['liabilities']['total'],
                 data['equity']
             ]]
             filename = 'balance_sheet'
             
        elif report_type == 'tax_report':
             data = self.tax_report(request).data
             header = ['Taxable Sales', 'Tax Collected', 'ITC (Expenses)', 'Net Payable']
             rows = [[
                 data['taxable_sales'],
                 data['tax_collected'],
                 data['tax_paid_expenses'],
                 data['net_tax_payable']
             ]]
             filename = 'tax_report'
             
        else:
            return Response({'error': 'Invalid report type'}, status=400)
            
        return self.export_file(request, filename, header, rows)