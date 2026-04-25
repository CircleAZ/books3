# Generated manually
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_alter_payment_method'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='method',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='refund',
            name='method',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='historicalrefund',
            name='method',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
