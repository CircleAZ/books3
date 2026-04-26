# Generated manually

from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0007_link_loans_to_transactions'),
    ]

    operations = [
        migrations.AddField(
            model_name='expensecategory',
            name='custom_icon',
            field=models.ImageField(blank=True, null=True, upload_to='category_icons/'),
        ),
    ]
