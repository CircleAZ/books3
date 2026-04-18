"""
Product Set models — curated bundles of products tied to class/school hierarchy.
Scope resolution: most specific match wins (school+class+div+subdiv > school+class > class-only).
"""
from django.db import models
from django.conf import settings
from core.models import UUIDPrimaryKeyModel


class ProductSet(UUIDPrimaryKeyModel):
    """
    A curated bundle of products for a specific class/school scope.
    
    Scope fields use string names (not FKs) so sets match across schools:
    - class_name="7", school=NULL          → default for ALL Class 7 students
    - class_name="7", school=DPS           → override for DPS Class 7 students
    - class_name="7", school=DPS, division_name="A"  → even more specific
    """
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Scope: class_name is required, rest are optional (nullable = wider scope)
    class_name = models.CharField(
        max_length=100,
        help_text='Class/grade name from ClassTemplate (e.g. "7", "12")'
    )
    school = models.ForeignKey(
        'settings_app.School', on_delete=models.CASCADE,
        null=True, blank=True, related_name='product_sets',
        help_text='NULL = applies to all schools (default set)'
    )
    division_name = models.CharField(
        max_length=50, blank=True,
        help_text='Optional division scope (e.g. "A", "B")'
    )
    subdivision_name = models.CharField(
        max_length=50, blank=True,
        help_text='Optional subdivision scope (e.g. "Gujarati Medium")'
    )

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_product_sets'
    )

    class Meta:
        ordering = ['class_name', 'name']

    def __str__(self):
        scope = f"Class {self.class_name}"
        if self.school:
            scope += f" @ {self.school.name}"
        if self.division_name:
            scope += f" / {self.division_name}"
        if self.subdivision_name:
            scope += f" / {self.subdivision_name}"
        return f"{self.name} ({scope})"

    @property
    def item_count(self):
        return self.items.count()

    @property
    def total_value(self):
        return sum(
            item.product.selling_price * item.quantity
            for item in self.items.select_related('product').all()
        )

    @classmethod
    def resolve_for_customer(cls, class_name, school_id=None,
                              division_name='', subdivision_name=''):
        """
        Find the most specific active set matching the given scope.
        Priority ladder (first match wins):
          1. school + class + division + subdivision
          2. school + class + division
          3. school + class
          4. class only (school=NULL) — universal default
        """
        if not class_name:
            return None

        qs = cls.objects.filter(class_name=class_name, is_active=True)

        # Priority 1: full match
        if school_id and division_name and subdivision_name:
            match = qs.filter(
                school_id=school_id,
                division_name=division_name,
                subdivision_name=subdivision_name,
            ).first()
            if match:
                return match

        # Priority 2: school + class + division
        if school_id and division_name:
            match = qs.filter(
                school_id=school_id,
                division_name=division_name,
                subdivision_name='',
            ).first()
            if match:
                return match

        # Priority 3: school + class
        if school_id:
            match = qs.filter(
                school_id=school_id,
                division_name='',
                subdivision_name='',
            ).first()
            if match:
                return match

        # Priority 4: universal default + division + subdivision
        if division_name and subdivision_name:
            match = qs.filter(
                school__isnull=True,
                division_name=division_name,
                subdivision_name=subdivision_name,
            ).first()
            if match:
                return match

        # Priority 5: universal default + division
        if division_name:
            match = qs.filter(
                school__isnull=True,
                division_name=division_name,
                subdivision_name='',
            ).first()
            if match:
                return match

        # Priority 6: universal default (no school, no division)
        return qs.filter(
            school__isnull=True,
            division_name='',
            subdivision_name='',
        ).first()


class ProductSetItem(UUIDPrimaryKeyModel):
    """Line item in a product set — a product with a quantity."""
    product_set = models.ForeignKey(
        ProductSet, on_delete=models.CASCADE, related_name='items'
    )
    product = models.ForeignKey(
        'inventory.Product', on_delete=models.PROTECT, related_name='set_items'
    )
    quantity = models.PositiveIntegerField(default=1)
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ['product_set', 'product']
        ordering = ['product__name']

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"
