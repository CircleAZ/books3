"""
Serializers for Customer app.
"""
import re
from rest_framework import serializers
from django.db import models
from django.utils.html import strip_tags
from .models import Customer, Student, Address, CustomerLink, Wallet, WalletTransaction, PotentialCustomer, GeographicRegion, LegacyDebt
from settings_app.models import (
    School, Class, Division, Subdivision, CustomerGroup, LinkType, LocationTag,
    ClassTemplate, DivisionTemplate, SubdivisionTemplate
)


# ============ Template Catalog Serializers ============

class ClassTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassTemplate
        fields = ['id', 'name']

    def validate_name(self, value):
        return strip_tags(value).strip() if value else value


class DivisionTemplateSerializer(serializers.ModelSerializer):
    applicable_class_names = serializers.SerializerMethodField()

    class Meta:
        model = DivisionTemplate
        fields = ['id', 'name', 'applicable_classes', 'applicable_class_names']

    def validate_name(self, value):
        return strip_tags(value).strip() if value else value

    def get_applicable_class_names(self, obj):
        return list(obj.applicable_classes.values_list('name', flat=True))


class SubdivisionTemplateSerializer(serializers.ModelSerializer):
    applicable_division_names = serializers.SerializerMethodField()

    class Meta:
        model = SubdivisionTemplate
        fields = ['id', 'name', 'applicable_divisions', 'applicable_division_names']

    def validate_name(self, value):
        return strip_tags(value).strip() if value else value

    def get_applicable_division_names(self, obj):
        return list(obj.applicable_divisions.values_list('name', flat=True))


# ============ Settings App Serializers (Nested) ============

class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ['id', 'name', 'address', 'is_active']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value
    
    def validate_address(self, value):
        return strip_tags(value).strip() if value else value


class ClassSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)
    
    class Meta:
        model = Class
        fields = ['id', 'name', 'school', 'school_name', 'order']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value


class DivisionSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='class_obj.name', read_only=True)
    
    class Meta:
        model = Division
        fields = ['id', 'name', 'class_obj', 'class_name']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value


class SubdivisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subdivision
        fields = ['id', 'name', 'division']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value


class CustomerGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerGroup
        fields = ['id', 'name', 'description', 'discount_percent']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value
    
    def validate_description(self, value):
        return strip_tags(value).strip() if value else value


class LinkTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LinkType
        fields = ['id', 'name', 'reverse_name']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value
    
    def validate_reverse_name(self, value):
        return strip_tags(value).strip() if value else value


class LocationTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationTag
        fields = ['id', 'name', 'color']
    
    def validate_name(self, value):
        return strip_tags(value).strip() if value else value


# ============ Address Serializers ============

class AddressSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    location_tags = LocationTagSerializer(many=True, read_only=True)
    location_tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=LocationTag.objects.all(),
        many=True,
        write_only=True,
        source='location_tags',
        required=False
    )
    # Expose region as writable FK + read-only name
    region_name = serializers.CharField(source='region.name', read_only=True, default=None)
    # Backward compat: accept 'village' text from frontend, auto-resolve to region FK
    village = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Accept lat/lng from frontend, convert to PointField internally
    latitude = serializers.FloatField(write_only=True, required=False, allow_null=True)
    longitude = serializers.FloatField(write_only=True, required=False, allow_null=True)
    
    class Meta:
        model = Address
        fields = [
            'id', 'region', 'region_name', 'village', 'faliya', 'address_line', 'landmark',
            'location_tags', 'location_tag_ids',
            'latitude', 'longitude', 'pincode', 'is_primary', 'home_photo'
        ]
        read_only_fields = ['home_photo']
    
    def validate_latitude(self, value):
        """Validate latitude is within valid range."""
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90")
        return value
    
    def validate_longitude(self, value):
        """Validate longitude is within valid range."""
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180")
        return value
    
    def _resolve_village_to_region(self, validated_data):
        """Bridge: convert 'village' text or spatial location coordinates to 'region' FK.
        Enforces internal boundary hierarchy using PostGIS coordinates first,
        falling back to village name matching if no spatial match is found.
        """
        # Always pop 'village' first since it's a write-only field not present on the model
        village_name = validated_data.pop('village', None)
        
        # If region is already explicitly provided, respect it
        if validated_data.get('region'):
            return

        region = None
        # 1. Try to resolve region from spatial intersection using Point location
        # Use location from validated_data (if populated) or fall back to instance's location if updating
        point = validated_data.get('location')
        if not point and self.instance and hasattr(self.instance, 'location'):
            point = self.instance.location

        if point and not (point.x == 0.0 and point.y == 0.0):
            from customers.models import GeographicRegion
            region = GeographicRegion.objects.filter(
                boundary__intersects=point,
                layer='village',
                is_deleted=False
            ).first()

        # 2. Fallback: resolve by village text name if no spatial region was found
        if not region and village_name:
            from customers.models import GeographicRegion
            region = GeographicRegion.objects.filter(
                name__iexact=village_name.strip(),
                layer='village',
                is_deleted=False
            ).first()

        # 3. If we tried to resolve but found nothing, set region to None to clear any legacy region assignments.
        # But only do this if coordinates or village were explicitly provided in the payload.
        if not region:
            initial = getattr(self, 'initial_data', {}) or {}
            has_coords_input = ('latitude' in initial or 'longitude' in initial)
            has_village_input = ('village' in initial)
            if (has_village_input and not village_name) or (has_coords_input and not point):
                validated_data['region'] = None
        else:
            validated_data['region'] = region

    def _resolve_location(self, validated_data):
        """Convert lat/lng to PostGIS PointField."""
        lat = validated_data.pop('latitude', None)
        lng = validated_data.pop('longitude', None)
        if lat is not None and lng is not None:
            from django.contrib.gis.geos import Point
            validated_data['location'] = Point(lng, lat, srid=4326)

    def create(self, validated_data):
        self._resolve_location(validated_data)
        self._resolve_village_to_region(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self._resolve_location(validated_data)
        self._resolve_village_to_region(validated_data)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Expose lat/lng from the PointField for frontend consumption
        if instance.location:
            rep['latitude'] = str(instance.location.y)
            rep['longitude'] = str(instance.location.x)
        else:
            rep['latitude'] = None
            rep['longitude'] = None
        # Expose village name for backward compat with frontend
        rep['village'] = instance.region.name if instance.region else ''
        return rep


# ============ Student Serializer ============

class StudentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False, allow_null=True)
    school_name = serializers.CharField(source='school.name', read_only=True)
    class_name_display = serializers.SerializerMethodField()
    division_name_display = serializers.SerializerMethodField()
    subdivision_name_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Student
        fields = [
            'id', 'name', 'school', 'school_name', 
            'class_obj', 'division', 'subdivision',
            'class_name', 'division_name', 'subdivision_name',
            'class_name_display', 'division_name_display', 'subdivision_name_display'
        ]

    def get_class_name_display(self, obj):
        if obj.class_obj:
            return obj.class_obj.name
        return obj.class_name or None

    def validate(self, data):
        school = data.get('school')
        class_name = data.get('class_name')
        
        if school and class_name:
            raise serializers.ValidationError(
                "A student cannot have both a foreign key school and an independent class_name."
            )
        return data

    def get_division_name_display(self, obj):
        if obj.division:
            return obj.division.name
        return obj.division_name or ''

    def get_subdivision_name_display(self, obj):
        if obj.subdivision:
            return obj.subdivision.name
        return obj.subdivision_name or ''


# ============ Customer Serializers ============

class CustomerListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    full_name = serializers.CharField(read_only=True)
    group_name = serializers.CharField(source='customer_group.name', read_only=True, default=None)
    primary_address = serializers.SerializerMethodField()
    wallet_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    students = StudentSerializer(many=True, read_only=True)
    has_legacy_debt = serializers.SerializerMethodField()
    legacy_debt_remaining = serializers.SerializerMethodField()
    legacy_debt_id = serializers.SerializerMethodField()
    
    class Meta:
        model = Customer
        fields = [
            'id', 'display_id', 'full_name', 'first_name', 'last_name',
            'phone', 'email', 'group_name', 'primary_address', 'wallet_balance', 
            'created_at', 'students', 'has_legacy_debt', 'legacy_debt_remaining', 'legacy_debt_id'
        ]
    
    def get_has_legacy_debt(self, obj):
        return hasattr(obj, 'legacy_debt')

    def get_legacy_debt_remaining(self, obj):
        if hasattr(obj, 'legacy_debt'):
            return obj.legacy_debt.principal_amount - obj.legacy_debt.recovered_amount
        return 0

    def get_legacy_debt_id(self, obj):
        if hasattr(obj, 'legacy_debt'):
            return str(obj.legacy_debt.id)
        return None
    
    def get_primary_address(self, obj):
        addresses = getattr(obj, '_prefetched_objects_cache', {}).get('addresses', None)
        if addresses is not None:
            primary = next((a for a in addresses if a.is_primary), None)
            if primary:
                return str(primary)
        else:
            primary = obj.addresses.filter(is_primary=True).first()
            if primary:
                return str(primary)
        return None


class CustomerDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for single customer view."""
    full_name = serializers.CharField(read_only=True)
    addresses = AddressSerializer(many=True, read_only=True)
    students = StudentSerializer(many=True, read_only=True)
    links = serializers.SerializerMethodField()
    wallet_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    has_legacy_debt = serializers.SerializerMethodField()
    legacy_debt_remaining = serializers.SerializerMethodField()
    legacy_debt_id = serializers.SerializerMethodField()
    
    # Related object details
    customer_group = CustomerGroupSerializer(read_only=True)
    
    class Meta:
        model = Customer
        fields = [
            'id', 'display_id', 'full_name', 'first_name', 'middle_name', 'last_name',
            'phone', 'email', 'students',
            'customer_group', 'notes', 'addresses', 'links', 
            'wallet_balance', 'has_legacy_debt', 'legacy_debt_remaining', 'legacy_debt_id', 'created_at', 'updated_at'
        ]
    
    def get_has_legacy_debt(self, obj):
        return hasattr(obj, 'legacy_debt')

    def get_legacy_debt_remaining(self, obj):
        if hasattr(obj, 'legacy_debt'):
            return obj.legacy_debt.principal_amount - obj.legacy_debt.recovered_amount
        return 0

    def get_legacy_debt_id(self, obj):
        if hasattr(obj, 'legacy_debt'):
            return str(obj.legacy_debt.id)
        return None
    
    def get_links(self, obj):
        links_data = CustomerLink.get_links_for_customer(obj)
        return [
            {
                'link_id': str(link['link_id']),
                'customer_id': str(link['linked_customer'].id),
                'customer_name': link['linked_customer'].full_name,
                'relationship': link['relationship']
            }
            for link in links_data
        ]


class CustomerCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating customers."""
    addresses = AddressSerializer(many=True, required=False)
    students = StudentSerializer(many=True, required=True, allow_empty=False)
    home_photo = serializers.ImageField(required=False, write_only=True)
    
    class Meta:
        model = Customer
        fields = [
            'id', 'display_id', 'first_name', 'middle_name', 'last_name',
            'phone', 'email', 'students',
            'customer_group', 'notes', 'addresses', 'home_photo'
        ]
        read_only_fields = ['id', 'display_id']
    
    # FK fields on the Customer model that accept null
    _NULLABLE_FK_FIELDS = {'customer_group'}
    # FK fields on nested Student objects that accept null
    _STUDENT_FK_FIELDS = {'school', 'class_obj', 'division', 'subdivision'}

    def _coerce_empty_to_none(self, data, fields):
        """Convert empty strings to None for nullable FK/numeric fields.

        Prevents DRF from attempting Model.objects.get(pk='') which causes
        instant 400 Bad Request errors. This is the backend's safety net —
        the frontend SHOULD send null, but if it sends '' we handle it.
        """
        for field in fields:
            if field in data and data[field] in ('', None):
                data[field] = None

    def to_internal_value(self, data):
        """Parse 'addresses' from JSON string if sent via multipart/form-data.

        CRITICAL: When data is a QueryDict (multipart/form-data), DRF's
        ListSerializer.get_value() detects it via html.is_html_input()
        (checks hasattr 'getlist') and calls html.parse_html_list(), which
        scans for bracket-indexed keys like 'addresses[0][village]'. Since
        we send addresses as a single JSON string, the regex matches nothing
        and the field is silently treated as empty. The fix is to convert
        the QueryDict to a plain dict after parsing, so DRF uses the
        standard dict.get() retrieval path for nested fields.
        """
        import json
        if hasattr(data, 'getlist'):
            # Convert QueryDict → plain dict, preserving all scalar values
            plain_data = {}
            for key in data:
                values = data.getlist(key)
                plain_data[key] = values[0] if len(values) == 1 else values
            # Parse JSON-encoded addresses and students string into actual list of dicts
            if 'addresses' in plain_data and isinstance(plain_data['addresses'], str):
                try:
                    plain_data['addresses'] = json.loads(plain_data['addresses'])
                except json.JSONDecodeError:
                    pass
            if 'students' in plain_data and isinstance(plain_data['students'], str):
                try:
                    plain_data['students'] = json.loads(plain_data['students'])
                except json.JSONDecodeError:
                    pass
            data = plain_data

        # Coerce empty FK strings → None on the top-level customer payload
        if isinstance(data, dict):
            self._coerce_empty_to_none(data, self._NULLABLE_FK_FIELDS)
            # Coerce inside nested students array
            students = data.get('students')
            if isinstance(students, list):
                for student in students:
                    if isinstance(student, dict):
                        self._coerce_empty_to_none(student, self._STUDENT_FK_FIELDS)

        return super().to_internal_value(data)
    
    def _sanitize_text(self, value):
        """Remove XSS and dangerous unicode control characters."""
        if not value:
            return value
        value = strip_tags(value)
        value = re.sub(r'[\u202a-\u202e\u2066-\u2069\u200b-\u200f]', '', value)
        return value.strip()
    
    def validate_first_name(self, value):
        sanitized = self._sanitize_text(value)
        # Prevent database overflow if multiple student names are concatenated
        if sanitized and len(sanitized) > 100:
            return sanitized[:97] + '...'
        return sanitized
    
    def validate_middle_name(self, value):
        return self._sanitize_text(value)
    
    def validate_last_name(self, value):
        return self._sanitize_text(value)
    
    def validate_phone(self, value):
        """Enforce exactly 10 digits."""
        if value and not re.match(r'^\d{10}$', value):
            raise serializers.ValidationError("Phone must be exactly 10 digits")
        return value
    
    def validate_notes(self, value):
        # Only strip HTML for notes, allow unicode
        return strip_tags(value) if value else value
    
    def validate(self, data):
        """Check for duplicate phone numbers (allow up to 5 per family)."""
        phone = data.get('phone')
        if phone:
            qs = Customer.objects.filter(phone=phone)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            
            if qs.count() >= 5:
                raise serializers.ValidationError({
                    'phone': 'Maximum limit reached: 5 customers already share this phone number.'
                })
        return data
    
    def validate_students(self, value):
        """Cap the students array to prevent resource exhaustion DoS."""
        if value and len(value) > 20:
            raise serializers.ValidationError(
                "Maximum limit of 20 students per family exceeded."
            )
        return value
    
    def create(self, validated_data):
        import logging
        logger = logging.getLogger(__name__)
        
        addresses_data = validated_data.pop('addresses', [])
        students_data = validated_data.pop('students', [])
        home_photo = validated_data.pop('home_photo', None)
        customer = Customer.objects.create(**validated_data)
        
        # Create students
        for std_data in students_data:
            Student.objects.create(customer=customer, **std_data)
            
        # Create addresses
        addr_serializer = AddressSerializer()
        for i, addr_data in enumerate(addresses_data):
            addr_serializer._resolve_location(addr_data)
            addr_serializer._resolve_village_to_region(addr_data)
            location_tags = addr_data.pop('location_tags', [])
            
            address = Address.objects.create(
                customer=customer, is_primary=(i == 0), **addr_data
            )
            address.location_tags.set(location_tags)
            
            # Attach home_photo to the primary (first) address via explicit
            # field.save() to guarantee the storage backend (R2/S3) is used.
            # Using objects.create(home_photo=file) can silently fall back to
            # local FileSystemStorage if the file stream is in an unexpected state.
            if i == 0 and home_photo:
                try:
                    # Ensure file pointer is at start
                    if hasattr(home_photo, 'seek'):
                        home_photo.seek(0)
                    fname = getattr(home_photo, 'name', 'home.webp')
                    address.home_photo.save(fname, home_photo, save=True)
                    logger.info(
                        "Home photo saved: name=%s, storage=%s, url=%s",
                        fname,
                        type(address.home_photo.storage).__name__,
                        address.home_photo.url if address.home_photo else 'N/A'
                    )
                except Exception as e:
                    logger.error("Home photo upload FAILED: %s", e, exc_info=True)
        
        # Create empty wallet
        Wallet.objects.create(customer=customer)
        
        return customer
    
    def update(self, instance, validated_data):
        import logging
        logger = logging.getLogger(__name__)
        
        addresses_data = validated_data.pop('addresses', None)
        students_data = validated_data.pop('students', None)
        home_photo = validated_data.pop('home_photo', None)
        
        # Update customer fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Safe students upsert
        if students_data is not None:
            existing_stds = {std.id: std for std in instance.students.all()}
            existing_std_ids = set(existing_stds.keys())
            incoming_std_ids = set()
            for std_data in students_data:
                std_id = std_data.pop('id', None)
                if std_id and std_id in existing_std_ids:
                    student_instance = existing_stds[std_id]
                    # Update fields on instance
                    for attr, val in std_data.items():
                        setattr(student_instance, attr, val)
                    
                    # Validate mutual exclusion between school and class_name
                    school = getattr(student_instance, 'school', None)
                    class_name = getattr(student_instance, 'class_name', None)
                    if school and class_name:
                        raise serializers.ValidationError(
                            f"Student '{student_instance.name}' cannot have both a foreign key school and an independent class_name."
                        )
                    
                    student_instance.save()
                    incoming_std_ids.add(std_id)
                else:
                    new_student = Student(customer=instance, **std_data)
                    
                    # Validate mutual exclusion
                    school = getattr(new_student, 'school', None)
                    class_name = getattr(new_student, 'class_name', None)
                    if school and class_name:
                        raise serializers.ValidationError(
                            f"Student '{new_student.name}' cannot have both a foreign key school and an independent class_name."
                        )
                        
                    new_student.save()
                    incoming_std_ids.add(new_student.pk)
            
            removed_stds = existing_std_ids - incoming_std_ids
            if removed_stds:
                # Iterate and delete to trigger SoftDeleteModel.delete() rather than raw SQL hard delete
                for std in instance.students.filter(pk__in=removed_stds):
                    std.delete()
        
        # Safe address upsert: update existing, create new, delete removed
        if addresses_data is not None:
            existing_ids = set(instance.addresses.values_list('id', flat=True))
            incoming_ids = set()
            addr_serializer = AddressSerializer()
            
            for i, addr_data in enumerate(addresses_data):
                # Bind the correct Address instance to the serializer helper for fallback resolution
                addr_id = addr_data.get('id')
                if addr_id:
                    try:
                        addr_serializer.instance = Address.objects.get(pk=addr_id)
                    except Address.DoesNotExist:
                        addr_serializer.instance = None
                else:
                    addr_serializer.instance = None

                addr_serializer._resolve_location(addr_data)
                addr_serializer._resolve_village_to_region(addr_data)
                location_tags = addr_data.pop('location_tags', [])
                addr_id = addr_data.pop('id', None)
                
                if addr_id and addr_id in existing_ids:
                    # Update existing address in place
                    Address.objects.filter(pk=addr_id).update(
                        is_primary=(i == 0), **addr_data
                    )
                    address = Address.objects.get(pk=addr_id)
                    address.location_tags.set(location_tags)
                    incoming_ids.add(addr_id)
                else:
                    # Create new address
                    address = Address.objects.create(
                        customer=instance, is_primary=(i == 0), **addr_data
                    )
                    address.location_tags.set(location_tags)
                    incoming_ids.add(address.pk)
                
                # Attach home_photo to the primary (first) address via explicit
                # field.save() — QuerySet.update() bypasses the storage backend
                # entirely, writing only the filename without uploading to R2/S3.
                if i == 0 and home_photo:
                    try:
                        if hasattr(home_photo, 'seek'):
                            home_photo.seek(0)
                        fname = getattr(home_photo, 'name', 'home.webp')
                        address.home_photo.save(fname, home_photo, save=True)
                        logger.info(
                            "Home photo updated: name=%s, storage=%s",
                            fname, type(address.home_photo.storage).__name__
                        )
                    except Exception as e:
                        logger.error("Home photo upload FAILED: %s", e, exc_info=True)
            
            # Delete addresses that were removed
            removed = existing_ids - incoming_ids
            if removed:
                instance.addresses.filter(pk__in=removed).delete()
        elif home_photo:
            # If no addresses_data was sent but a home_photo was, attach it to the primary address
            primary_addr = instance.addresses.filter(is_primary=True).first()
            if primary_addr:
                try:
                    if hasattr(home_photo, 'seek'):
                        home_photo.seek(0)
                    fname = getattr(home_photo, 'name', 'home.webp')
                    primary_addr.home_photo.save(fname, home_photo, save=True)
                    logger.info(
                        "Home photo updated (standalone): name=%s, storage=%s",
                        fname, type(primary_addr.home_photo.storage).__name__
                    )
                except Exception as e:
                    logger.error("Home photo upload FAILED: %s", e, exc_info=True)
        
        return instance


# ============ Customer Link Serializers ============

class CustomerLinkSerializer(serializers.ModelSerializer):
    customer_a_name = serializers.CharField(source='customer_a.full_name', read_only=True)
    customer_b_name = serializers.CharField(source='customer_b.full_name', read_only=True)
    link_type_name = serializers.CharField(source='link_type.name', read_only=True)
    
    class Meta:
        model = CustomerLink
        fields = ['id', 'customer_a', 'customer_a_name', 'customer_b', 'customer_b_name', 
                  'link_type', 'link_type_name']
    
    def validate(self, data):
        a = data.get('customer_a')
        b = data.get('customer_b')
        
        if a and b and a == b:
            raise serializers.ValidationError("A customer cannot be linked to themselves.")
        
        if a and b:
            # Check both directions: A→B or B→A
            existing = CustomerLink.objects.filter(
                models.Q(customer_a=a, customer_b=b) |
                models.Q(customer_a=b, customer_b=a)
            )
            # Exclude current instance on update
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    "A relationship already exists between these two customers."
                )
        
        return data


# ============ Wallet Serializers ============

class WalletTransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    
    class Meta:
        model = WalletTransaction
        fields = ['id', 'amount', 'transaction_type', 'reason', 'created_by_name', 'created_at']


class WalletSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    transactions = WalletTransactionSerializer(many=True, read_only=True)
    
    class Meta:
        model = Wallet
        fields = ['id', 'customer', 'customer_name', 'balance', 'transactions']
        read_only_fields = ['balance']  # Balance modified via credit/debit methods only


# ============ Potential Customer Serializers ============

class PotentialCustomerSerializer(serializers.ModelSerializer):
    """Serializer for PotentialCustomer — location-only pins on the map."""
    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)
    created_by_name = serializers.SerializerMethodField()
    dissolved_into_name = serializers.SerializerMethodField()

    class Meta:
        model = PotentialCustomer
        fields = [
            'id', 'latitude', 'longitude', 'notes',
            'created_by', 'created_by_name', 'created_at',
            'modified_by', 'modified_at',
            'is_dissolved', 'dissolved_by', 'dissolved_at',
            'dissolved_into', 'dissolved_into_name',
        ]
        read_only_fields = [
            'id', 'created_by', 'created_by_name', 'created_at',
            'modified_by', 'modified_at',
            'is_dissolved', 'dissolved_by', 'dissolved_at',
            'dissolved_into', 'dissolved_into_name',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_dissolved_into_name(self, obj):
        if obj.dissolved_into:
            return obj.dissolved_into.full_name
        return None

    def validate_notes(self, value):
        """M7: Strip HTML tags to prevent XSS."""
        return strip_tags(value).strip() if value else ''

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value

    def create(self, validated_data):
        from django.contrib.gis.geos import Point
        lat = validated_data.pop('latitude')
        lng = validated_data.pop('longitude')
        validated_data['location'] = Point(lng, lat, srid=4326)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        from django.contrib.gis.geos import Point
        lat = validated_data.pop('latitude', None)
        lng = validated_data.pop('longitude', None)
        if lat is not None and lng is not None:
            validated_data['location'] = Point(lng, lat, srid=4326)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if instance.location:
            rep['latitude'] = str(instance.location.y)
            rep['longitude'] = str(instance.location.x)
        else:
            rep['latitude'] = None
            rep['longitude'] = None
        return rep


# ============ Geographic Region Serializers ============
import json
from django.contrib.gis.geos import GEOSGeometry

class GeographicRegionSerializer(serializers.ModelSerializer):
    """Serializer for GeographicRegion allowing GeoJSON read/write with overlap validation."""
    boundary = serializers.JSONField(required=True)

    class Meta:
        model = GeographicRegion
        fields = ['id', 'name', 'layer', 'pincode', 'color', 'boundary']

    def validate_boundary(self, value):
        """Convert GeoJSON dictionary to PostGIS Polygon and validate it."""
        try:
            # Convert dict back to JSON string for GEOSGeometry
            geojson_str = json.dumps(value)
            geom = GEOSGeometry(geojson_str)
            
            if geom.geom_type != 'Polygon':
                raise serializers.ValidationError("Boundary must be a Polygon.")
            
            if not geom.valid:
                raise serializers.ValidationError(f"Invalid geometry: {geom.valid_reason}")
                
            return geom
        except Exception as e:
            raise serializers.ValidationError(f"Invalid GeoJSON: {str(e)}")

    def validate(self, data):
        """Check for spatial overlaps within the same layer, excluding touches."""
        layer = data.get('layer') or (self.instance.layer if self.instance else None)
        boundary = data.get('boundary')
        
        if layer and boundary:
            # Check for intersections against active (non-deleted) regions in the same layer
            qs = GeographicRegion.objects.filter(layer=layer, boundary__isnull=False)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
                
            # Filter to intersecting geometries, then exclude pure topological touches
            intersecting_qs = qs.filter(boundary__intersects=boundary).exclude(boundary__touches=boundary)
            
            overlapping_names = []
            for region in intersecting_qs:
                # Calculate the actual area of the intersection
                # Due to Leaflet snapping imperfections, adjacent polygons might slightly overlap.
                # If the intersection area is practically zero (e.g., less than 1e-8 degrees squared),
                # we consider it a shared border artifact, not a true overlap.
                intersection = region.boundary.intersection(boundary)
                if intersection.area > 1e-8:
                    overlapping_names.append(region.name)
            
            if overlapping_names:
                overlap_names_str = ", ".join(overlapping_names)
                raise serializers.ValidationError({
                    'boundary': f"Boundary overlaps with existing region(s): {overlap_names_str}. Shared borders are allowed, but true overlaps are not."
                })
                
        return data

    def to_representation(self, instance):
        """Convert PostGIS geometry back to GeoJSON dict for frontend."""
        rep = super().to_representation(instance)
        if instance.boundary:
            rep['boundary'] = json.loads(instance.boundary.geojson)
        else:
            rep['boundary'] = None
        return rep


class LegacyDebtSerializer(serializers.ModelSerializer):
    """
    Serializer for Legacy Debt.
    Used for reading current status and bulk creation.
    """
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)

    class Meta:
        model = LegacyDebt
        fields = ['id', 'customer', 'customer_name', 'principal_amount', 'recovered_amount']
        read_only_fields = ['id', 'recovered_amount']

    def validate_principal_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Principal amount must be greater than zero.")
        return value

