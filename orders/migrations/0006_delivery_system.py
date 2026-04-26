"""
Migration: Partial Delivery System

Schema changes:
1. Add confirmed_quantity to OrderItem
2. Create Delivery model
3. Create DeliveryItem model
4. Update delivery_status choices on Order (remove processing/ready, add partial)

Data migration:
1. Freeze confirmed_quantity for all confirmed/completed/delivered orders
2. Remap 'processing'/'ready' delivery statuses to 'pending'
3. Create synthetic Delivery records for orders already marked 'delivered'
"""

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


def freeze_and_migrate_delivery_data(apps, schema_editor):
    """Data migration for existing orders."""
    Order = apps.get_model('orders', 'Order')
    OrderItem = apps.get_model('orders', 'OrderItem')
    Delivery = apps.get_model('orders', 'Delivery')
    DeliveryItem = apps.get_model('orders', 'DeliveryItem')
    
    # Step 1: Freeze confirmed_quantity for all items in non-draft orders
    for item in OrderItem.objects.filter(
        order__order_status__in=['confirmed', 'completed', 'cancelled'],
        confirmed_quantity__isnull=True
    ):
        item.confirmed_quantity = item.quantity
        item.save(update_fields=['confirmed_quantity'])
    
    # Step 2: Remap legacy delivery statuses
    Order.objects.filter(delivery_status__in=['processing', 'ready']).update(
        delivery_status='pending'
    )
    
    # Step 3: Create synthetic Delivery records for already-delivered orders
    delivered_orders = Order.objects.filter(delivery_status='delivered')
    for order in delivered_orders:
        # Create a synthetic delivery backdated to delivered_at or updated_at
        delivery = Delivery.objects.create(
            id=uuid.uuid4(),
            order=order,
            notes='[System] Migrated from legacy delivery system',
            delivered_by=order.created_by,
        )
        
        # Create DeliveryItem for each OrderItem with full quantity
        for item in order.items.all():
            qty = item.confirmed_quantity if item.confirmed_quantity else item.quantity
            if qty > 0:
                DeliveryItem.objects.create(
                    id=uuid.uuid4(),
                    delivery=delivery,
                    order_item=item,
                    quantity=qty,
                )


def reverse_migration(apps, schema_editor):
    """Reverse: delete all Delivery/DeliveryItem records and unfreeze quantities."""
    Delivery = apps.get_model('orders', 'Delivery')
    OrderItem = apps.get_model('orders', 'OrderItem')
    
    Delivery.objects.all().delete()
    OrderItem.objects.all().update(confirmed_quantity=None)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('orders', '0005_alter_payment_method_dynamic'),
    ]

    operations = [
        # 1. Add confirmed_quantity to OrderItem
        migrations.AddField(
            model_name='orderitem',
            name='confirmed_quantity',
            field=models.PositiveIntegerField(
                blank=True,
                help_text='Frozen copy of quantity at order confirmation. Immutable after set.',
                null=True,
            ),
        ),
        
        # 2. Update delivery_status choices on Order
        migrations.AlterField(
            model_name='order',
            name='delivery_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('partial', 'Partially Delivered'),
                    ('delivered', 'Delivered'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
        
        # 3. Update delivery_status choices on HistoricalOrder
        migrations.AlterField(
            model_name='historicalorder',
            name='delivery_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('partial', 'Partially Delivered'),
                    ('delivered', 'Delivered'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
        
        # 4. Create Delivery model
        migrations.CreateModel(
            name='Delivery',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4,
                    editable=False,
                    help_text='Unique identifier for this record',
                    primary_key=True,
                    serialize=False,
                )),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='deliveries',
                    to='orders.order',
                )),
                ('delivered_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='deliveries_made',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
                'verbose_name_plural': 'Deliveries',
            },
        ),
        
        # 5. Create DeliveryItem model
        migrations.CreateModel(
            name='DeliveryItem',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4,
                    editable=False,
                    help_text='Unique identifier for this record',
                    primary_key=True,
                    serialize=False,
                )),
                ('quantity', models.PositiveIntegerField(
                    validators=[django.core.validators.MinValueValidator(1)],
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('delivery', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='items',
                    to='orders.delivery',
                )),
                ('order_item', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='delivery_items',
                    to='orders.orderitem',
                )),
            ],
            options={
                'abstract': False,
            },
        ),
        
        # 6. Data migration
        migrations.RunPython(
            freeze_and_migrate_delivery_data,
            reverse_migration,
        ),
    ]
