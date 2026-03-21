"""
Serializers for Customer app.
"""
import re
from rest_framework import serializers
from django.utils.html import strip_tags
from .models import Customer, Address, CustomerLink, Wallet, WalletTransaction
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
    
    class Meta:
        model = Address
        fields = [
            'id', 'village', 'faliya', 'address_line', 'landmark',
            'location_tags', 'location_tag_ids',
            'latitude', 'longitude', 'pincode', 'is_primary'
        ]
    
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


# ============ Customer Serializers ============

class CustomerListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    full_name = serializers.CharField(read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True, default=None)
    class_name = serializers.CharField(source='class_obj.name', read_only=True, default=None)
    group_name = serializers.CharField(source='customer_group.name', read_only=True, default=None)
    primary_address = serializers.SerializerMethodField()
    wallet_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    
    class Meta:
        model = Customer
        fields = [
            'id', 'display_id', 'full_name', 'first_name', 'last_name',
            'phone', 'email', 'school_name', 'class_name', 'group_name',
            'primary_address', 'wallet_balance', 'created_at'
        ]
    
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
    links = serializers.SerializerMethodField()
    wallet_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    
    # Related object details
    school = SchoolSerializer(read_only=True)
    class_obj = ClassSerializer(read_only=True)
    division = DivisionSerializer(read_only=True)
    subdivision = SubdivisionSerializer(read_only=True)
    customer_group = CustomerGroupSerializer(read_only=True)
    
    class Meta:
        model = Customer
        fields = [
            'id', 'display_id', 'full_name', 'first_name', 'middle_name', 'last_name',
            'phone', 'email', 'school', 'class_obj', 'division', 'subdivision',
            'customer_group', 'notes', 'addresses', 'links', 
            'wallet_balance', 'created_at', 'updated_at'
        ]
    
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
    
    class Meta:
        model = Customer
        fields = [
            'id', 'display_id', 'first_name', 'middle_name', 'last_name',
            'phone', 'email', 'school', 'class_obj', 'division', 'subdivision',
            'customer_group', 'notes', 'addresses'
        ]
        read_only_fields = ['id', 'display_id']
    
    def _sanitize_text(self, value):
        """Remove XSS and dangerous unicode control characters."""
        if not value:
            return value
        value = strip_tags(value)
        value = re.sub(r'[\u202a-\u202e\u2066-\u2069\u200b-\u200f]', '', value)
        return value.strip()
    
    def validate_first_name(self, value):
        return self._sanitize_text(value)
    
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
        """Check for duplicate phone numbers."""
        phone = data.get('phone')
        if phone:
            qs = Customer.objects.filter(phone=phone)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            existing = qs.first()
            if existing:
                raise serializers.ValidationError({
                    'phone': f'A customer with this phone already exists: {existing.full_name} (#{existing.display_id})'
                })
        return data
    
    def create(self, validated_data):
        addresses_data = validated_data.pop('addresses', [])
        customer = Customer.objects.create(**validated_data)
        
        # Create addresses
        for i, addr_data in enumerate(addresses_data):
            location_tags = addr_data.pop('location_tags', [])
            address = Address.objects.create(customer=customer, is_primary=(i == 0), **addr_data)
            address.location_tags.set(location_tags)
        
        # Create empty wallet
        Wallet.objects.create(customer=customer)
        
        return customer
    
    def update(self, instance, validated_data):
        addresses_data = validated_data.pop('addresses', None)
        
        # Update customer fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Safe address upsert: update existing, create new, delete removed
        if addresses_data is not None:
            existing_ids = set(instance.addresses.values_list('id', flat=True))
            incoming_ids = set()
            
            for i, addr_data in enumerate(addresses_data):
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
            
            # Delete addresses that were removed
            removed = existing_ids - incoming_ids
            if removed:
                instance.addresses.filter(pk__in=removed).delete()
        
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
