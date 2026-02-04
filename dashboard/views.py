from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from decimal import Decimal
from datetime import datetime, timedelta
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
        data = {
            "today_sales_value": Decimal("24500.00"),
            "today_sales_count": 12,
            "pending_orders_count": 5,
            "pending_orders_value": Decimal("8750.00"),
            "low_stock_count": 8,
            "recent_customers_count": 5
        }
        serializer = DashboardStatsSerializer(data)
        return Response(serializer.data)

class TopProductsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = [
            {"name": "The Great Gatsby", "quantity_sold": 120, "revenue": Decimal("2400.00")},
            {"name": "1984", "quantity_sold": 95, "revenue": Decimal("1425.00")},
            {"name": "To Kill a Mockingbird", "quantity_sold": 85, "revenue": Decimal("1275.00")},
            {"name": "Pride and Prejudice", "quantity_sold": 70, "revenue": Decimal("1050.00")},
            {"name": "The Catcher in the Rye", "quantity_sold": 60, "revenue": Decimal("900.00")},
        ]
        serializer = TopProductSerializer(data, many=True)
        return Response(serializer.data)

class SalesTrendView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = datetime.now().date()
        data = []
        for i in range(7):
            date = today - timedelta(days=6-i)
            # Mocking values to look like a trend
            value = Decimal("2000.00") + (Decimal(i) * Decimal("150.00"))
            data.append({
                "date": date,
                "value": value
            })
        serializer = SalesTrendSerializer(data, many=True)
        return Response(serializer.data)

class RecentOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = datetime.now()
        data = [
            {
                "id": "ORD-001",
                "customer_name": "John Doe",
                "total": Decimal("150.00"),
                "status": "completed",
                "created_at": now - timedelta(minutes=30)
            },
            {
                "id": "ORD-002",
                "customer_name": "Jane Smith",
                "total": Decimal("85.50"),
                "status": "pending",
                "created_at": now - timedelta(hours=2)
            },
            {
                "id": "ORD-003",
                "customer_name": "Bob Johnson",
                "total": Decimal("320.00"),
                "status": "processing",
                "created_at": now - timedelta(hours=5)
            },
            {
                "id": "ORD-004",
                "customer_name": "Alice Brown",
                "total": Decimal("45.00"),
                "status": "completed",
                "created_at": now - timedelta(days=1)
            },
            {
                "id": "ORD-005",
                "customer_name": "Charlie Davis",
                "total": Decimal("210.25"),
                "status": "pending",
                "created_at": now - timedelta(days=1, hours=4)
            },
        ]
        serializer = RecentOrderSerializer(data, many=True)
        return Response(serializer.data)

class AlertsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = [
            {
                "type": "stock",
                "message": "Low stock alert: 'The Great Gatsby' (5 remaining)",
                "severity": "high",
                "link": "/inventory/1"
            },
            {
                "type": "order",
                "message": "New high-value order received ($320.00)",
                "severity": "medium",
                "link": "/orders/ORD-003"
            },
            {
                "type": "system",
                "message": "System backup completed successfully",
                "severity": "low",
                "link": "/settings/logs"
            }
        ]
        serializer = AlertSerializer(data, many=True)
        return Response(serializer.data)