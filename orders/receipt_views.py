"""Public receipt views (no auth required)."""
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.http import FileResponse
from django.utils import timezone

from .receipt_models import Receipt, ReceiptVerification
from .receipt_serializers import PublicReceiptSerializer, ReceiptVerificationSerializer


class PublicReceiptView(APIView):
    """Public receipt view - no authentication required."""
    permission_classes = [AllowAny]
    
    def get(self, request, public_uuid):
        """Get receipt data for public view."""
        receipt = get_object_or_404(
            Receipt.objects.select_related('order', 'order__customer')
            .prefetch_related('order__items', 'order__items__product'),
            public_uuid=public_uuid
        )
        
        serializer = PublicReceiptSerializer(receipt)
        
        # Add store info from settings
        from settings_app.models import StoreSettings, ReceiptSettings
        store = StoreSettings.get_instance()
        receipt_settings = ReceiptSettings.get_instance()
        
        data = serializer.data
        data['store'] = {
            'name': store.name,
            'address': store.address,
            'phone': store.phone,
            'email': store.email,
            'logo': store.logo.url if store.logo else None,
            'currency_symbol': store.currency_symbol,
        }
        data['receipt_header'] = receipt_settings.header_text
        data['receipt_footer'] = receipt_settings.footer_text
        
        return Response(data)


class ReceiptPDFView(APIView):
    """Download receipt PDF with phone verification."""
    permission_classes = [AllowAny]
    
    def post(self, request, public_uuid):
        """Verify phone and return PDF."""
        receipt = get_object_or_404(Receipt, public_uuid=public_uuid)
        
        serializer = ReceiptVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        phone_last4 = serializer.validated_data['phone_last4']
        
        # Brute force protection: block after 5 failed attempts
        failed_attempts = ReceiptVerification.objects.filter(
            receipt=receipt, verified=False
        ).count()
        if failed_attempts >= 5:
            return Response(
                {'error': 'Too many failed verification attempts. Access locked.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        
        # Check phone verification
        if receipt.order.customer:
            actual_last4 = receipt.order.customer.phone[-4:] if receipt.order.customer.phone else None
            
            if actual_last4 and phone_last4 != actual_last4:
                # Track failed attempt
                ReceiptVerification.objects.create(
                    receipt=receipt,
                    phone_last4=phone_last4,
                    verified=False
                )
                return Response(
                    {'error': 'Phone verification failed'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Verification successful
        ReceiptVerification.objects.create(
            receipt=receipt,
            phone_last4=phone_last4,
            verified=True
        )
        
        # Generate PDF if not exists
        if not receipt.pdf_file:
            from .receipt_utils import generate_receipt_pdf
            generate_receipt_pdf(receipt)
        
        # Update download count
        receipt.download_count += 1
        receipt.save(update_fields=['download_count'])
        
        # Return PDF
        if receipt.pdf_file:
            return FileResponse(
                receipt.pdf_file.open('rb'),
                as_attachment=True,
                filename=f"receipt_{receipt.order.display_id}.pdf"
            )
        
        return Response(
            {'error': 'PDF generation failed'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
