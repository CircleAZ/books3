from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from decimal import Decimal
from django.db.models import Sum, Count, F
from django.utils import timezone
from datetime import timedelta

from inventory.models import Product
from orders.models import Order, OrderItem
from customers.models import Customer
from .serializers import (
    DashboardStatsSerializer,
    TopProductSerializer,
    SalesTrendSerializer,
    RecentOrderSerializer,
    AlertSerializer
)

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Today's Sales (Completed orders)
        today_orders = Order.objects.filter(
            created_at__gte=today_start,
            order_status='completed'
        ).aggregate(
            total_value=Sum('total'),
            count=Count('id')
        )
        
        # Pending Orders (Confirmed but not completed)
        pending_orders = Order.objects.filter(
            order_status='confirmed'
        ).aggregate(
            total_value=Sum('total'),
            count=Count('id')
        )
        
        # Low Stock
        low_stock_count = Product.objects.filter(stock_quantity__lte=F('low_stock_threshold')).count()
        
        # Recent Customers (Last 7 days)
        recent_customers_count = Customer.objects.filter(
            created_at__gte=now - timedelta(days=7)
        ).count()
        
        data = {
            "today_sales_value": today_orders['total_value'] or Decimal("0.00"),
            "today_sales_count": today_orders['count'] or 0,
            "pending_orders_count": pending_orders['count'] or 0,
            "pending_orders_value": pending_orders['total_value'] or Decimal("0.00"),
            "low_stock_count": low_stock_count,
            "recent_customers_count": recent_customers_count
        }
        serializer = DashboardStatsSerializer(data)
        return Response(serializer.data)

class TopProductsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Top 5 products by quantity sold (all time for now)
        top_products = OrderItem.objects.values(
            'product__name'
        ).annotate(
            quantity_sold=Sum('quantity'),
            revenue=Sum('line_total')
        ).order_by('-quantity_sold')[:5]
        
        data = [
            {
                "name": item['product__name'],
                "quantity_sold": item['quantity_sold'],
                "revenue": item['revenue']
            }
            for item in top_products
        ]
        
        serializer = TopProductSerializer(data, many=True)
        return Response(serializer.data)

class SalesTrendView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Last 7 days trend
        today = timezone.now().date()
        data = []
        
        for i in range(7):
            date = today - timedelta(days=6-i)
            # Filter for orders on this specific date
            day_total = Order.objects.filter(
                created_at__date=date,
                order_status='completed'
            ).aggregate(
                total=Sum('total')
            )['total'] or Decimal("0.00")
            
            data.append({
                "date": date,
                "value": day_total
            })
            
        serializer = SalesTrendSerializer(data, many=True)
        return Response(serializer.data)

class RecentOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.select_related('customer').all().order_by('-created_at')[:5]
        
        data = []
        for order in orders:
            customer_name = order.customer.full_name if order.customer else (order.guest_name or "Guest")
            data.append({
                "id": str(order.display_id),
                "customer_name": customer_name,
                "total": order.total,
                "status": order.order_status, # or derived_status if preferred
                "created_at": order.created_at
            })
            
        serializer = RecentOrderSerializer(data, many=True)
        return Response(serializer.data)

class AlertsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        alerts = []
        
        # 1. Low Stock Alerts
        low_stock_products = Product.objects.filter(stock_quantity__lte=F('low_stock_threshold'))[:5]
        for p in low_stock_products:
            alerts.append({
                "type": "stock",
                "message": f"Low stock: {p.name} ({p.stock_quantity} remaining)",
                "severity": "high",
                "link": f"/inventory/stock" 
            })
            
        # 2. Pending Orders Alerts (Older than 24h)
        yesterday = timezone.now() - timedelta(days=1)
        stale_orders = Order.objects.filter(
            order_status='confirmed',
            created_at__lte=yesterday
        )[:3]
        
        for o in stale_orders:
             alerts.append({
                "type": "order",
                "message": f"Order #{o.display_id} is still pending (>24h)",
                "severity": "medium",
                "link": f"/orders/{o.id}" 
            })

        serializer = AlertSerializer(alerts, many=True)
        return Response(serializer.data)