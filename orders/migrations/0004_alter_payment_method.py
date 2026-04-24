# Generated manually
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0003_historicalrefund_source_bank_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='method',
            field=models.CharField(blank=True, choices=[('cash', 'Cash'), ('upi', 'UPI'), ('Customer Wallet', 'Customer Wallet')], max_length=20, null=True),
        ),
    ]
