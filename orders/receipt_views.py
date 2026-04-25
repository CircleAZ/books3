"""Public receipt views — no authentication required.

Receipt UUID acts as a capability token. Anyone with the UUID can view the receipt.
This is intentional: customers receive the link via WhatsApp and should be able to
view their receipt without logging in.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404

from .models import Order
from .receipt_serializers import LivingReceiptSerializer, BalanceSerializer


class PublicReceiptView(APIView):
    """
    Living receipt — items + payment history + balance.
    
    GET /api/orders/receipts/{receipt_uuid}/
    
    Returns the full receipt data. Cached at CF Worker level (5-min SWR).
    """
    permission_classes = [AllowAny]

    def get(self, request, receipt_uuid):
        order = get_object_or_404(
            Order.objects
            .select_related('customer')
            .prefetch_related('items__product', 'payments'),
            receipt_uuid=receipt_uuid
        )
        serializer = LivingReceiptSerializer(order)

        # Add store info for receipt header
        from settings_app.models import StoreSettings, UPIAccount
        store = StoreSettings.get_instance()
        
        # Get active UPI VPA for Pay Now button
        upi_vpa = None
        try:
            upi = UPIAccount.objects.filter(is_active=True).first()
            if upi:
                upi_vpa = upi.upi_id
        except Exception:
            pass
        
        logo_url = request.build_absolute_uri(store.logo.url) if store.logo else None
        data = serializer.data
        data['store'] = {
            'name': store.name,
            'phone': store.phone,
            'currency_symbol': store.currency_symbol,
            'upi_vpa': upi_vpa,
            'logo': logo_url,
        }
        return Response(data)


class ReceiptBalanceView(APIView):
    """
    Live balance endpoint for UPI Pay Now button.
    
    GET /api/orders/receipts/{receipt_uuid}/balance/
    
    This endpoint MUST NEVER be cached — the balance amount must be
    accurate at the moment the customer clicks "Pay Now" to prevent
    overpayment/underpayment via UPI deep link.
    """
    permission_classes = [AllowAny]

    def get(self, request, receipt_uuid):
        order = get_object_or_404(Order, receipt_uuid=receipt_uuid)
        serializer = BalanceSerializer(order)
        response = Response(serializer.data)
        # Explicitly prevent caching
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        return response
