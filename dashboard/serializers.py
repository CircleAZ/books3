from rest_framework import serializers

class DashboardStatsSerializer(serializers.Serializer):
    today_sales_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    today_sales_count = serializers.IntegerField()
    pending_orders_count = serializers.IntegerField()
    pending_orders_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    low_stock_count = serializers.IntegerField()
    recent_customers_count = serializers.IntegerField()

class TopProductSerializer(serializers.Serializer):
    name = serializers.CharField()
    quantity_sold = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=10, decimal_places=2)

class SalesTrendSerializer(serializers.Serializer):
    date = serializers.DateField()
    value = serializers.DecimalField(max_digits=10, decimal_places=2)

class RecentOrderSerializer(serializers.Serializer):
    id = serializers.CharField()
    customer_name = serializers.CharField()
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    status = serializers.CharField()
    created_at = serializers.DateTimeField()

class AlertSerializer(serializers.Serializer):
    type = serializers.CharField()
    message = serializers.CharField()
    severity = serializers.CharField()
    link = serializers.CharField()
