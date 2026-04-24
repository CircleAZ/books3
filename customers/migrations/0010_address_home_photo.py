# Generated manually

from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0009_load_osm_geodata'),
    ]

    operations = [
        migrations.AddField(
            model_name='address',
            name='home_photo',
            field=models.ImageField(blank=True, help_text="Visual confirmation of the customer's home", null=True, upload_to='customer_homes/'),
        ),
    ]
