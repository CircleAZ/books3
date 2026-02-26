"""Receipt PDF generation utilities."""
import io
from django.core.files.base import ContentFile
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfgen import canvas


def generate_receipt_pdf(receipt):
    """
    Generate PDF receipt for an order.
    
    Args:
        receipt: Receipt model instance
        
    Returns:
        Boolean indicating success
    """
    from settings_app.models import StoreSettings, ReceiptSettings
    
    try:
        store = StoreSettings.get_instance()
        receipt_settings = ReceiptSettings.get_instance()
        order = receipt.order
        
        buffer = io.BytesIO()
        
        # Create PDF document
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=20*mm,
            bottomMargin=20*mm
        )
        
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=18,
            alignment=1,  # Center
            spaceAfter=10
        )
        
        normal_center = ParagraphStyle(
            'NormalCenter',
            parent=styles['Normal'],
            alignment=1
        )
        
        # Store header
        elements.append(Paragraph(store.name or "AZ Books", title_style))
        if store.address:
            elements.append(Paragraph(store.address, normal_center))
        if store.phone:
            elements.append(Paragraph(f"Phone: {store.phone}", normal_center))
        elements.append(Spacer(1, 10*mm))
        
        # Receipt header text
        if receipt_settings.header_text:
            elements.append(Paragraph(receipt_settings.header_text, normal_center))
            elements.append(Spacer(1, 5*mm))
        
        # Order info
        elements.append(Paragraph(f"<b>Receipt #{order.display_id}</b>", styles['Heading2']))
        elements.append(Paragraph(f"Date: {order.created_at.strftime('%d/%m/%Y %H:%M')}", styles['Normal']))
        
        # Customer info (masked)
        customer_name = receipt.get_masked_customer_name()
        customer_phone = receipt.get_masked_phone()
        elements.append(Paragraph(f"Customer: {customer_name} ({customer_phone})", styles['Normal']))
        elements.append(Spacer(1, 10*mm))
        
        # Items table
        table_data = [['Item', 'Qty', 'Price', 'Total']]
        
        for item in order.items.all():
            product_name = item.product.name if item.product else 'Unknown'
            table_data.append([
                product_name[:30],  # Truncate long names
                str(item.quantity),
                f"{store.currency_symbol}{item.unit_price:.2f}",
                f"{store.currency_symbol}{item.total_price:.2f}"
            ])
        
        # Create table
        col_widths = [90*mm, 20*mm, 30*mm, 30*mm]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 10*mm))
        
        # Totals
        totals_data = []
        
        if order.subtotal:
            totals_data.append(['Subtotal:', f"{store.currency_symbol}{order.subtotal:.2f}"])
        
        if order.discount_amount and order.discount_amount > 0:
            totals_data.append(['Discount:', f"-{store.currency_symbol}{order.discount_amount:.2f}"])
        
        if order.tax_amount and order.tax_amount > 0:
            totals_data.append(['Tax:', f"{store.currency_symbol}{order.tax_amount:.2f}"])
        
        totals_data.append(['<b>Total:</b>', f"<b>{store.currency_symbol}{order.total_amount:.2f}</b>"])
        totals_data.append(['Paid:', f"{store.currency_symbol}{order.paid_amount:.2f}"])
        
        balance = order.balance_amount or 0
        if balance > 0:
            totals_data.append(['Balance Due:', f"{store.currency_symbol}{balance:.2f}"])
        
        # Right-aligned totals table
        totals_table = Table(totals_data, colWidths=[120*mm, 50*mm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
        ]))
        elements.append(totals_table)
        elements.append(Spacer(1, 15*mm))
        
        # Payment status
        payment_status = order.payment_status or 'Pending'
        elements.append(Paragraph(f"Payment Status: <b>{payment_status.upper()}</b>", styles['Normal']))
        elements.append(Spacer(1, 10*mm))
        
        # Footer
        if receipt_settings.footer_text:
            elements.append(Paragraph(receipt_settings.footer_text, normal_center))
        
        elements.append(Spacer(1, 10*mm))
        elements.append(Paragraph(f"Generated: {timezone.now().strftime('%d/%m/%Y %H:%M')}", normal_center))
        
        # Build PDF
        doc.build(elements)
        
        # Save to receipt
        buffer.seek(0)
        filename = f"receipt_{order.display_id}_{timezone.now().strftime('%Y%m%d%H%M%S')}.pdf"
        receipt.pdf_file.save(filename, ContentFile(buffer.read()), save=True)
        
        return True
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"PDF generation failed for receipt {receipt.id}: {e}")
        return False


def mask_customer_name(name):
    """Mask customer name for privacy."""
    if not name:
        return "Guest"
    if len(name) <= 3:
        return name[0] + "***"
    return name[:3] + "***"


def mask_phone(phone):
    """Mask phone number for privacy."""
    if not phone or len(phone) < 6:
        return phone or "N/A"
    return phone[:2] + "****" + phone[-2:]
