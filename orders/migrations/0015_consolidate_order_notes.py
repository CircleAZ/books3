# Generated manually to consolidate OrderNote comments into Order.notes

from django.db import migrations
import datetime

def consolidate_notes(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    OrderNote = apps.get_model('orders', 'OrderNote')

    for order in Order.objects.all():
        notes_qs = OrderNote.objects.filter(order=order).order_by('created_at')
        if not notes_qs.exists():
            continue

        formatted_notes = []
        for note in notes_qs:
            author = note.created_by.username if note.created_by else 'System'
            date_str = note.created_at.strftime('%Y-%m-%d')
            formatted_notes.append(f"[{author} - {date_str}]: {note.content}")

        consolidated_text = "\n\n".join(formatted_notes)
        
        if order.notes and order.notes.strip():
            order.notes = order.notes.strip() + "\n\n" + consolidated_text
        else:
            order.notes = consolidated_text
        
        order.save(update_fields=['notes'])

def reverse_consolidate_notes(apps, schema_editor):
    # Backward migration is a no-op since notes are safely stored in Order.notes.
    # We cannot cleanly split combined notes back to individual OrderNote objects.
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0014_historicalrefund_bank_transaction_and_more'),
    ]

    operations = [
        migrations.RunPython(consolidate_notes, reverse_code=reverse_consolidate_notes),
    ]
