from django.db import migrations, transaction

def migrate_wallets(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    Customer = apps.get_model('customers', 'Customer')
    Wallet = apps.get_model('customers', 'Wallet')
    WalletTransaction = apps.get_model('customers', 'WalletTransaction')
    Refund = apps.get_model('orders', 'Refund')
    Payment = apps.get_model('orders', 'Payment')
    User = apps.get_model('account', 'User')

    from django.db.models import Sum

    system_user = User.objects.filter(is_superuser=True).first()
    
    overpaid_orders = Order.objects.filter(payment_status='overpaid')
    
    with transaction.atomic():
        for order in overpaid_orders:
            # Calculate amount paid
            paid_agg = Payment.objects.filter(order=order).aggregate(total_paid=Sum('amount'))
            amount_paid = paid_agg['total_paid'] or 0
            
            # Calculate refunded amount (if any already exists)
            refund_agg = Refund.objects.filter(order=order).aggregate(total_refund=Sum('amount'))
            amount_refunded = refund_agg['total_refund'] or 0
            
            net_paid = amount_paid - amount_refunded
            change = net_paid - order.total
            
            if change > 0:
                if order.is_guest:
                    cust = Customer.objects.create(
                        first_name=order.guest_name or f"Guest {order.id}",
                        phone=order.guest_phone or f"0000000000{order.id}"[:15],
                        notes="Auto-converted from guest for wallet overpayment migration"
                    )
                    order.customer = cust
                    order.is_guest = False
                    order.save(update_fields=['customer', 'is_guest'])
                
                customer = order.customer
                wallet, _ = Wallet.objects.get_or_create(customer=customer)
                
                # Credit wallet
                wallet.balance += change
                wallet.save(update_fields=['balance'])
                
                WalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='credit',
                    amount=change,
                    reason=f"Swept overpayment from Order #{order.display_id}",
                    created_by=system_user
                )
                
                Refund.objects.create(
                    order=order,
                    amount=change,
                    method='Wallet Transfer',
                    status='completed',
                    created_by=system_user
                )
                
                # Update payment status
                order.payment_status = 'paid'
                order.save(update_fields=['payment_status'])

class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0010_address_home_photo'),
        ('orders', '0003_historicalrefund_source_bank_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_wallets, reverse_code=migrations.RunPython.noop),
    ]
