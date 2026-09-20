"""
AZQL (AZBooks Query Language) Parsing and Translation Engine.
Provides lexing, parsing, and dynamic Django ORM compilation.
"""

import re
from datetime import datetime
from django.db.models import Q, F, Sum, Subquery, OuterRef, Exists
from django.db.models.functions import Coalesce
from django.apps import apps
from django.utils import timezone
from django.core.exceptions import ValidationError, FieldDoesNotExist

# Whitelisted models and their allowed query fields
SCHEMA_WHITELIST = {
    'order': {
        'model': 'orders.Order',
        'fields': {
            'display_id', 'provisional_id', 'is_guest', 'guest_name', 'guest_phone', 
            'guest_email', 'payment_status', 'delivery_status', 'order_status', 
            'return_status', 'refund_status', 'cancellation_status', 'overall_status', 
            'subtotal', 'discount_type', 'discount_value', 'discount_amount', 'total', 
            'notes', 'delivered_at', 'created_at', 'updated_at'
        }
    },
    'orderitem': {
        'model': 'orders.OrderItem',
        'fields': {
            'quantity', 'confirmed_quantity', 'unit_price', 'cost_price', 
            'discount_type', 'discount_value', 'discount_amount', 'line_total',
            'order__display_id', 'product__name', 'delivered_quantity', 'remaining_quantity',
            'returned_quantity', 'order__customer__addresses__region__name',
            'order__delivery_status', 'order__order_status'
        }
    },
    'payment': {
        'model': 'orders.Payment',
        'fields': {
            'method', 'amount', 'upi_reference', 'created_at'
        }
    },
    'delivery': {
        'model': 'orders.Delivery',
        'fields': {
            'notes', 'created_at'
        }
    },
    'deliveryitem': {
        'model': 'orders.DeliveryItem',
        'fields': {
            'quantity', 'created_at',
            'order_item__order__order_status', 'delivery__created_at'
        }
    },
    'refund': {
        'model': 'orders.Refund',
        'fields': {
            'amount', 'method', 'transaction_id', 'note', 'status', 'created_at'
        }
    },
    'return': {
        'model': 'orders.Return',
        'fields': {
            'display_id', 'provisional_id', 'status', 'notes', 'created_at', 'updated_at'
        }
    },
    'returnitem': {
        'model': 'orders.ReturnItem',
        'fields': {
            'quantity', 'stock_action', 'stock_restored', 'created_at'
        }
    },
    'creditnote': {
        'model': 'orders.CreditNote',
        'fields': {
            'display_id', 'provisional_id', 'created_at'
        }
    },
    'product': {
        'model': 'inventory.Product',
        'fields': {
            'display_id', 'provisional_id', 'name', 'description', 'is_additional', 
            'is_pack', 'pack_size', 'cost_price', 'selling_price', 'stock_quantity', 
            'physical_stock', 'low_stock_threshold', 'default_commission_type', 
            'default_commission_value', 'created_at', 'category__name', 'vendor__name'
        }
    },
    'category': {
        'model': 'inventory.Category',
        'fields': {
            'display_id', 'provisional_id', 'name', 'description'
        }
    },
    'vendor': {
        'model': 'inventory.Vendor',
        'fields': {
            'name', 'description', 'contact_name', 'contact_email', 'contact_phone', 
            'address', 'notes'
        }
    },
    'stockadjustment': {
        'model': 'inventory.StockAdjustment',
        'fields': {
            'adjustment_type', 'quantity', 'unit_cost', 'reason', 'notes', 'created_at'
        }
    },
    'stockhistory': {
        'model': 'inventory.StockHistory',
        'fields': {
            'quantity_change', 'quantity_after', 'cost_at_time', 'reason', 'notes', 'created_at'
        }
    },
    'customer': {
        'model': 'customers.Customer',
        'fields': {
            'display_id', 'provisional_id', 'first_name', 'middle_name', 'last_name', 
            'full_name', 'phone', 'email', 'notes', 'contact_preference', 
            'preferred_language', 'show_balance_in_messages', 'created_at', 'updated_at',
            'addresses__region__name', 'wallet__balance'
        }
    },
    'address': {
        'model': 'customers.Address',
        'fields': {
            'taluka', 'district', 'address_line', 'is_primary'
        }
    },
    'geographicregion': {
        'model': 'customers.GeographicRegion',
        'fields': {
            'name', 'color'
        }
    },
    'legacydebt': {
        'model': 'customers.LegacyDebt',
        'fields': {
            'principal_amount', 'recovered_amount'
        }
    },
    'wallet': {
        'model': 'customers.Wallet',
        'fields': {
            'balance'
        }
    },
    'wallettransaction': {
        'model': 'customers.WalletTransaction',
        'fields': {
            'amount', 'transaction_type', 'reason', 'created_at'
        }
    },
    'purchaseorder': {
        'model': 'procurement.PurchaseOrder',
        'fields': {
            'display_id', 'provisional_id', 'status', 'total_amount', 'notes', 'created_at', 'updated_at',
            'vendor__name'
        }
    },
    'purchasepayment': {
        'model': 'procurement.PurchasePayment',
        'fields': {
            'amount', 'payment_method', 'reference', 'notes', 'payment_date', 'created_at'
        }
    },
    'outlet': {
        'model': 'outlets.Outlet',
        'fields': {
            'display_id', 'provisional_id', 'name', 'contact_person', 'phone', 'email', 
            'address', 'is_active', 'created_at', 'status', 'location'
        }
    },
    'outletstock': {
        'model': 'outlets.OutletStock',
        'fields': {
            'available_quantity', 'created_at', 'updated_at', 'outlet__name', 'product__name'
        }
    },
    'bankaccount': {
        'model': 'finance.BankAccount',
        'fields': {
            'name', 'account_type', 'bank_name', 'account_number', 'ifsc_code', 
            'branch', 'opening_balance', 'current_balance', 'is_active', 'is_default', 'created_at'
        }
    },
    'cashwallet': {
        'model': 'finance.CashWallet',
        'fields': {
            'name', 'is_system', 'balance', 'is_active', 'created_at'
        }
    },
    'expense': {
        'model': 'finance.Expense',
        'fields': {
            'date', 'payee_type', 'payee_name', 'payee_id', 'description', 'amount', 
            'tax_amount', 'total_amount', 'payment_status', 'approval_status', 'approved_at', 
            'paid_amount', 'notes', 'created_at'
        }
    },
    'expensepayment': {
        'model': 'finance.ExpensePayment',
        'fields': {
            'payment_date', 'amount', 'payment_method', 'reference', 'notes', 'created_at'
        }
    }
}

# Relation configurations for Rich Conditional Aggregates
RELATION_MAP = {
    'product': {
        'order_items': {
            'model': 'orders.OrderItem',
            'outer_ref': 'product',
            'sum_expression': 'owed' # mapped to custom calculation
        },
        'order_items__delivery_items': {
            'model': 'orders.DeliveryItem',
            'outer_ref': 'order_item__product',
            'sum_expression': 'delivered'
        }
    },
    'customer': {
        'orders': {
            'model': 'orders.Order',
            'outer_ref': 'customer',
            'sum_expression': 'total'
        }
    },
    'order': {
        'items': {
            'model': 'orders.OrderItem',
            'outer_ref': 'order',
            'sum_expression': 'quantity'
        }
    }
}

def validate_relation_path(base_entity, field_path):
    """
    Recursively validates if field_path is a whitelisted relation traversal.
    """
    def get_entity_key(model):
        for k, config in SCHEMA_WHITELIST.items():
            try:
                if apps.get_model(config['model']) == model:
                    return k
            except Exception:
                pass
        return None

    current_entity = base_entity.lower()
    if current_entity not in SCHEMA_WHITELIST:
        return False
        
    try:
        current_model = apps.get_model(SCHEMA_WHITELIST[current_entity]['model'])
    except Exception:
        return False
        
    parts = field_path.split('__')
    
    for i in range(1, len(parts) + 1):
        prefix = '__'.join(parts[:i])
        suffix = '__'.join(parts[i:])
        
        if not suffix:
            if prefix in SCHEMA_WHITELIST[current_entity]['fields']:
                return True
            break
            
        temp_model = current_model
        relation_valid = True
        
        prefix_parts = parts[:i]
        for step in prefix_parts:
            try:
                field = temp_model._meta.get_field(step)
                if not field.is_relation:
                    relation_valid = False
                    break
                temp_model = field.related_model
            except Exception:
                relation_valid = False
                break
                
        if not relation_valid or not temp_model:
            continue
            
        relation_target_entity = get_entity_key(temp_model)
        if not relation_target_entity:
            continue
            
        if validate_relation_path(relation_target_entity, suffix):
            return True
            
    return False


def compile_subquery_relation_lookup(model, path_parts, op, val, active_user=None):
    """
    Recursively compiles relation paths containing one-to-many or many-to-many relations
    into correlation Exists subqueries to avoid duplicate Cartesian joins and support sibling conditions.
    """
    current_model = model
    for i, step in enumerate(path_parts):
        try:
            field = current_model._meta.get_field(step)
        except Exception:
            # Let Django's ORM raise standard FieldError on execution
            break
            
        is_one_to_many = getattr(field, 'one_to_many', False)
        is_many_to_many = getattr(field, 'many_to_many', False)
        
        if is_one_to_many or is_many_to_many:
            prefix = '__'.join(path_parts[:i])
            suffix = path_parts[i+1:]
            target_model = field.related_model
            
            # Recursively compile the suffix on the target model
            sub_q = compile_subquery_relation_lookup(target_model, suffix, op, val, active_user)
            
            # Correlate target model back to the current parent model
            if is_one_to_many:
                link_field = field.remote_field.name
            else:
                link_field = field.related_query_name()
                
            subquery_qs = target_model.objects.filter(**{link_field: OuterRef('pk')}).filter(sub_q)
            exists_q = Exists(subquery_qs)
            
            if prefix:
                return Q(**{f"{prefix}__in": Subquery(current_model.objects.filter(exists_q).values('pk'))})
            else:
                return exists_q
                
        if field.is_relation and field.related_model:
            current_model = field.related_model
        else:
            break
            
    # Default leaf compilation
    full_path = '__'.join(path_parts)
    if op == '=':
        return Q(**{full_path: val})
    elif op == '!=':
        return ~Q(**{full_path: val})
    elif op == '>':
        return Q(**{f"{full_path}__gt": val})
    elif op == '<':
        return Q(**{f"{full_path}__lt": val})
    elif op == '>=':
        return Q(**{f"{full_path}__gte": val})
    elif op == '<=':
        return Q(**{f"{full_path}__lte": val})
    elif op == 'LIKE' or op == 'CONTAINS':
        return Q(**{f"{full_path}__icontains": val})
    elif op == 'IN':
        if isinstance(val, str):
            vals = [v.strip() for v in val.split(',')]
            return Q(**{f"{full_path}__in": vals})
        return Q(**{f"{full_path}__in": val})
    raise ValidationError(f"Unsupported operator: {op}")

# Token specifications for the Lexer
TOKEN_SPECIFICATION = [
    ('LPAREN',    r'\('),
    ('RPAREN',    r'\)'),
    ('AND',       r'\bAND\b'),
    ('OR',        r'\bOR\b'),
    ('WAS_EVER',  r'\bWAS\s+EVER\b|\bEVER\b'),
    ('HAS_ANY',   r'\bHAS_ANY\b|\bHAS\s+ANY\b'),
    ('HAS_ALL',   r'\bHAS_ALL\b|\bHAS\s+ALL\b'),
    ('HAS_NONE',  r'\bHAS_NONE\b|\bHAS\s+NONE\b'),
    ('OPERATOR',  r'!=|<=|>=|=|<|>|\bLIKE\b|\bIN\b|\bCONTAINS\b'),
    ('MACRO',     r'@[a-zA-Z_]+(?:\s*[-\+]\s*\d+)?'),
    ('STRING',    r"'[^']*'"),
    ('NUMBER',    r'\d+(?:\.\d+)?'),
    ('BOOLEAN',   r'\bTRUE\b|\bFALSE\b'),
    ('FIELD',     r'\[~?[a-zA-Z_0-9\.]+\]|~?[a-zA-Z_0-9\_\.]+'),
    ('COMMA',     r','),
    ('SKIP',      r'\s+'),
    ('MISMATCH',  r'.'),
]


class AZQLLexer:
    """Tokenizer for parsing AZQL WHERE clauses."""
    
    @staticmethod
    def tokenize(text):
        tokens = []
        # Build regex matching
        regex_parts = [f'(?P<{name}>{pattern})' for name, pattern in TOKEN_SPECIFICATION]
        master_regex = re.compile('|'.join(regex_parts), re.IGNORECASE)
        
        for match in master_regex.finditer(text):
            kind = match.lastgroup
            value = match.group(kind)
            if kind == 'SKIP':
                continue
            elif kind == 'MISMATCH':
                raise ValidationError(f"Syntax Error: Unexpected character '{value}' at index {match.start()}")
            tokens.append((kind, value))
        return tokens


class AZQLParser:
    """Parses token streams into Django Q objects and conditions."""
    
    def __init__(self, tokens, base_entity, active_user=None):
        self.tokens = tokens
        self.pos = 0
        self.base_entity = base_entity.lower()
        self.active_user = active_user

    def peek(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def consume(self, expected_type=None):
        token = self.peek()
        if not token:
            raise ValidationError("Syntax Error: Unexpected end of input")
        if expected_type and token[0] != expected_type:
            raise ValidationError(f"Syntax Error: Expected {expected_type}, got {token[0]} ('{token[1]}')")
        self.pos += 1
        return token

    def parse(self):
        if not self.tokens:
            return Q()
        q_obj = self.parse_or()
        if self.pos < len(self.tokens):
            raise ValidationError(f"Syntax Error: Unparsed tokens remaining starting at '{self.tokens[self.pos][1]}'")
        return q_obj

    def parse_or(self):
        left = self.parse_and()
        while self.peek() and self.peek()[0] == 'OR':
            self.consume('OR')
            right = self.parse_and()
            left = left | right
        return left

    def parse_and(self):
        left = self.parse_primary()
        while self.peek() and self.peek()[0] == 'AND':
            self.consume('AND')
            right = self.parse_primary()
            left = left & right
        return left

    def parse_primary(self):
        token = self.peek()
        if not token:
            raise ValidationError("Syntax Error: Expected expression")
            
        if token[0] == 'LPAREN':
            self.consume('LPAREN')
            expr = self.parse_or()
            self.consume('RPAREN')
            return expr
            
        # Standard lookup: FIELD OPERATOR VALUE or FIELD WAS_EVER VALUE
        field_token = self.consume('FIELD')
        field_path = field_token[1].strip('[]')
        
        # Security validation
        self.validate_field(field_path)
        
        op_token = self.peek()
        if not op_token:
            raise ValidationError(f"Syntax Error: Expected operator after field '{field_path}'")
            
        if op_token[0] in ('HAS_ANY', 'HAS_ALL', 'HAS_NONE'):
            if not field_path.startswith('~'):
                raise ValidationError(f"Syntax Error: Operator {op_token[0]} can only be used with relation subquery fields (e.g., [~orders])")
            
            self.consume(op_token[0]) # consume HAS_*
            self.consume('LPAREN')
            
            relation_name = field_path.lstrip('~')
            ModelClass = apps.get_model(SCHEMA_WHITELIST[self.base_entity]['model'])
            try:
                field_obj = ModelClass._meta.get_field(relation_name)
                target_model = field_obj.related_model
                target_entity = _get_entity_key(target_model)
                if not target_entity:
                    raise ValidationError("Target entity not whitelisted")
            except Exception:
                raise ValidationError(f"Invalid relation for subquery: {relation_name}")

            old_entity = self.base_entity
            self.base_entity = target_entity
            
            inner_q = self.parse_or()
            self.consume('RPAREN')
            
            self.base_entity = old_entity
            
            match_mode = {'HAS_ANY': 'some', 'HAS_ALL': 'all', 'HAS_NONE': 'none'}[op_token[0]]
            
            if getattr(field_obj, 'one_to_many', False):
                sub_qs = target_model.objects.filter(**{field_obj.remote_field.name: OuterRef('pk')})
            elif getattr(field_obj, 'many_to_many', False):
                sub_qs = target_model.objects.filter(**{field_obj.related_query_name(): OuterRef('pk')})
            elif field_obj.many_to_one or getattr(field_obj, 'one_to_one', False):
                sub_qs = target_model.objects.filter(pk=OuterRef(field_obj.name))
            else:
                raise ValidationError(f"Unsupported relation type for subquery: '{relation_name}'")
                
            if match_mode == 'none':
                return ~Exists(sub_qs.filter(inner_q))
            elif match_mode == 'all':
                anti_qs = sub_qs.exclude(inner_q)
                return ~Exists(anti_qs)
            else:
                return Exists(sub_qs.filter(inner_q))
            
        elif op_token[0] == 'WAS_EVER':
            self.consume('WAS_EVER')
            val_token = self.consume()
            val = self.parse_value(val_token)
            return self.compile_was_ever(field_path, val)
        else:
            op_token = self.consume('OPERATOR')
            op = op_token[1].upper()
            val_token = self.consume()
            val = self.parse_value(val_token)
            return self.compile_lookup(field_path, op, val)

    def validate_field(self, field_path):
        # Allow special property checks for Rich Conditional Aggregates
        if self.base_entity == 'product':
            if field_path.startswith('order_items__delivery_items__'):
                return
                
        if field_path.startswith('~'):
            relation_name = field_path.lstrip('~')
            try:
                ModelClass = apps.get_model(SCHEMA_WHITELIST[self.base_entity]['model'])
                ModelClass._meta.get_field(relation_name)
                return
            except Exception:
                raise ValidationError(f"Relation '{relation_name}' is not queryable on '{self.base_entity}' schema")
                
        if not validate_relation_path(self.base_entity, field_path):
            raise ValidationError(f"Field '{field_path}' is not queryable on '{self.base_entity}' schema")

    def parse_value(self, token):
        kind, value = token
        if kind == 'STRING':
            return value.strip("'")
        elif kind == 'NUMBER':
            if '.' in value:
                return float(value)
            return int(value)
        elif kind == 'BOOLEAN':
            return value.upper() == 'TRUE'
        elif kind == 'MACRO':
            return self.resolve_macro(value)
        elif kind == 'FIELD':
            # Support field-to-field comparisons
            return F(value.strip('[]'))
        raise ValidationError(f"Syntax Error: Invalid value token '{value}'")

    def resolve_macro(self, macro_str):
        # Check offsets like @Today - 7
        match = re.match(r'@([a-zA-Z_]+)\s*(?P<op>[-\+])\s*(?P<offset>\d+)', macro_str)
        macro_name = macro_str[1:] if not match else match.group(1)
        
        base_val = None
        if macro_name.lower() == 'me':
            if not self.active_user:
                raise ValidationError("Macro @Me requires an active logged-in user session context")
            return self.active_user
        elif macro_name.lower() == 'today':
            base_val = timezone.now()
        else:
            raise ValidationError(f"Unknown macro: @{macro_name}")
            
        if match:
            op = match.group('op')
            offset_days = int(match.group('offset'))
            delta = timezone.timedelta(days=offset_days)
            if op == '-':
                base_val = base_val - delta
            else:
                base_val = base_val + delta
                
        return base_val

    def compile_lookup(self, field_path, op, val):
        if op == 'WAS_EVER' or op == 'WAS EVER' or op == 'EVER':
            return self.compile_was_ever(field_path, val)
        path_parts = field_path.split('__')
        ModelClass = apps.get_model(SCHEMA_WHITELIST[self.base_entity]['model'])
        return compile_subquery_relation_lookup(ModelClass, path_parts, op, val, self.active_user)

    def compile_was_ever(self, field_path, val):
        # Resolve target model from relation paths
        relation_prefix = ""
        target_entity = self.base_entity
        clean_field = field_path
        
        if '__' in field_path:
            parts = field_path.split('__')
            clean_field = parts[-1]
            relation_prefix = '__'.join(parts[:-1])
            
            # Simple relation target mapping
            if relation_prefix == 'order':
                target_entity = 'order'
            elif relation_prefix == 'customer':
                target_entity = 'customer'
            elif relation_prefix == 'product':
                target_entity = 'product'
                
        if target_entity not in SCHEMA_WHITELIST:
            raise ValidationError(f"WAS EVER queries not supported on target relation: {relation_prefix}")
            
        ModelClass = apps.get_model(SCHEMA_WHITELIST[target_entity]['model'])
        if not hasattr(ModelClass, 'history'):
            raise ValidationError(f"Historical records are not enabled on model '{ModelClass.__name__}'")
            
        # Query history table strictly using default (swapped in runner/tests to reports replica)
        history_qs = ModelClass.history.filter(**{clean_field: val})
        matching_ids = list(history_qs.values_list('id', flat=True).distinct())
        
        lookup_path = f"{relation_prefix}__id__in" if relation_prefix else "id__in"
        return Q(**{lookup_path: matching_ids})


class AZQLCompiler:
    """Compiles complete AZQL queries into filtered/annotated Django querysets."""
    
    @staticmethod
    def compile(query_text, active_user=None):
        # Parse clauses
        from_idx_match = re.search(r'(?i)\bFROM\b', query_text)
        if not from_idx_match:
            raise ValidationError("Invalid query syntax: Missing FROM clause")
            
        from_start_pos = from_idx_match.start()
        post_from_text = query_text[from_start_pos:]
        
        select_match = re.search(r'(?i)\bSELECT\s+(?P<select>.*?)\bFROM\b', query_text)
        from_match = re.search(r'(?i)\bFROM\s+(?P<from>[a-zA-Z_0-9]+)', post_from_text)
        where_match = re.search(r'(?i)\bWHERE\s+(?P<where>.*?)(?=\bORDER\s+BY\b|\bASOF\b|$)', post_from_text)
        orderby_match = re.search(r'(?i)\bORDER\s+BY\s+(?P<orderby>.*?)(?=\bASOF\b|$)', post_from_text)
        asof_match = re.search(r'(?i)\bASOF\s+\'(?P<asof>[^\'\s]+.*?)\'', post_from_text)
        
        if not from_match:
            raise ValidationError("Invalid query syntax: Missing FROM clause")
            
        entity = from_match.group('from').lower()
        if entity not in SCHEMA_WHITELIST:
            raise ValidationError(f"FROM entity '{entity}' is not queryable")
            
        ModelClass = apps.get_model(SCHEMA_WHITELIST[entity]['model'])
        
        # Build initial queryset (or historical queryset if ASOF is present)
        asof_dt = None
        if asof_match:
            asof_str = asof_match.group('asof')
            try:
                asof_dt = datetime.fromisoformat(asof_str.replace('Z', '+00:00'))
            except Exception:
                # Try fallback format
                try:
                    asof_dt = datetime.strptime(asof_str, "%Y-%m-%d %H:%M:%S")
                except Exception:
                    raise ValidationError(f"Invalid ASOF date format: '{asof_str}'")
                    
            if not hasattr(ModelClass, 'history'):
                raise ValidationError(f"Model '{ModelClass.__name__}' does not have history tracking enabled")
            qs = ModelClass.history.as_of(asof_dt)
        else:
            qs = ModelClass.objects.all()
            
        # Parse WHERE clause
        if where_match:
            where_text = where_match.group('where').strip()
            lexer = AZQLLexer()
            tokens = lexer.tokenize(where_text)
            parser = AZQLParser(tokens, entity, active_user)
            q_object = parser.parse()
            qs = qs.filter(q_object)
            
        # Parse SELECT clause & Rich Aggregates
        selected_columns = []
        rich_annotations = {}
        
        if select_match:
            select_text = select_match.group('select').strip()
            
            # Standard columns parsing without legacy regex
            columns = [c.strip() for c in select_text.split(',') if c.strip()]
            for col in columns:
                clean_col = col.strip('[]')
                if not validate_relation_path(entity, clean_col):
                    raise ValidationError(f"Field '{clean_col}' is not whitelisted in SELECT clause")
                selected_columns.append(clean_col)
                
        # Apply Annotations and Column Options values slice
        if rich_annotations:
            qs = qs.annotate(**rich_annotations)
            
        # Apply ORDER BY clause
        if orderby_match:
            orderby_text = orderby_match.group('orderby').strip()
            # Clean brackets
            clean_order = []
            for col in orderby_text.split(','):
                direction = ""
                col_name = col.strip()
                if col_name.upper().endswith(' DESC'):
                    direction = "-"
                    col_name = col_name[:-5].strip()
                elif col_name.upper().endswith(' ASC'):
                    col_name = col_name[:-4].strip()
                col_name = col_name.strip('[]')
                if col_name not in selected_columns and not validate_relation_path(entity, col_name):
                    raise ValidationError(f"Cannot order by un-selected field '{col_name}'")
                clean_order.append(f"{direction}{col_name}")
            qs = qs.order_by(*clean_order)
            
        if selected_columns:
            qs = qs.values(*selected_columns)
            
        return qs, selected_columns

def _get_entity_key(model):
    """Reverse-lookup: given a Django model class, find its SCHEMA_WHITELIST key."""
    for k, config in SCHEMA_WHITELIST.items():
        try:
            if apps.get_model(config['model']) == model:
                return k
        except Exception:
            pass
    return None

class VisualCompiler:
    """Compiles React-QueryBuilder JSON AST payloads into querysets."""
    
    @classmethod
    def compile(cls, entity, rule_group, columns, aggregates=None, active_user=None):
        if aggregates is None:
            aggregates = []
            
        entity = entity.lower()
        if entity not in SCHEMA_WHITELIST:
            raise ValidationError(f"Entity '{entity}' is not queryable")
            
        ModelClass = apps.get_model(SCHEMA_WHITELIST[entity]['model'])
        qs = ModelClass.objects.all()
        
        # Compile visual rules into Q
        q_object = cls.parse_group(rule_group, entity, active_user)
        if q_object:
            qs = qs.filter(q_object)
            
        # Process Aggregates
        rich_annotations = {}
        selected_columns = []
        
        for agg in aggregates:
            alias = agg.get('alias')
            func = agg.get('function', 'SUM').upper()
            relation = agg.get('relation', '').lstrip('~')
            field = agg.get('field')
            filter_rules = agg.get('filter_rules', {})
            
            if not all([alias, func, relation, field]):
                raise ValidationError("Aggregate definition missing required fields")
                
            # Resolve target model dynamically using schema whitelist / ORM instead of RELATION_MAP
            try:
                current_model = ModelClass
                parts = relation.split('__')
                backward_steps = []
                for part in parts:
                    field_obj = current_model._meta.get_field(part)
                    if field_obj.one_to_many:
                        link_field = field_obj.remote_field.name
                    else:
                        link_field = field_obj.related_query_name()
                    backward_steps.insert(0, link_field)
                    current_model = field_obj.related_model
                TargetModel = current_model
                outer_ref = '__'.join(backward_steps)
                if not TargetModel:
                    raise ValidationError(f"Relation '{relation}' is not a valid relational field on '{entity}'")
            except Exception:
                raise ValidationError(f"Aggregate relation '{relation}' not supported on entity '{entity}'")

            target_key = _get_entity_key(TargetModel)
            
            # Subquery AST filter parsing
            inline_q = cls.parse_group(filter_rules, target_key, active_user) if filter_rules else None
            
            # Validate field exists on target model
            if not validate_relation_path(target_key, field):
                raise ValidationError(f"Field '{field}' is not queryable on '{target_key}' schema for aggregation")
                
            sub_q = TargetModel.objects.filter(**{outer_ref: OuterRef('pk')})
            if inline_q:
                sub_q = sub_q.filter(inline_q)
                
            from django.db.models import Sum, Count, Avg, Max, Min, IntegerField, DecimalField, FloatField, BooleanField, DateTimeField, DateField
            func_map = {'SUM': Sum, 'COUNT': Count, 'AVG': Avg, 'MAX': Max, 'MIN': Min}
            if func not in func_map:
                raise ValidationError(f"Unsupported aggregate function '{func}'")
                
            # Get field internal type to determine output_field
            target_field = TargetModel._meta.get_field(field)
            internal_type = target_field.get_internal_type()
            
            if func == 'COUNT':
                out_field = IntegerField()
            elif internal_type in ('DecimalField', 'FloatField'):
                out_field = DecimalField() if internal_type == 'DecimalField' else FloatField()
            else:
                out_field = IntegerField()
            sub_q = sub_q.values(outer_ref).annotate(total=func_map[func](field, output_field=out_field)).values('total')
            
            from django.db.models import Value
            default_val = Value(0, output_field=out_field)
            
            rich_annotations[alias] = Coalesce(Subquery(sub_q, output_field=out_field), default_val, output_field=out_field)
            selected_columns.append(alias)
            
        if rich_annotations:
            qs = qs.annotate(**rich_annotations)
            
        # Column selections
        for col in columns:
            clean_col = col.strip('[]')
            if not validate_relation_path(entity, clean_col):
                raise ValidationError(f"Field '{clean_col}' is not whitelisted")
            if clean_col not in selected_columns:
                selected_columns.append(clean_col)
            
        if selected_columns:
            qs = qs.values(*selected_columns)
            
        return qs, selected_columns

    @classmethod
    def parse_group(cls, group, entity, active_user):
        if not group or 'rules' not in group:
            return Q()
            
        combinator = group.get('combinator', 'and').lower()
        q_obj = Q()
        
        for rule in group['rules']:
            # Check if nested group
            if 'rules' in rule:
                sub_q = cls.parse_group(rule, entity, active_user)
                if combinator == 'or':
                    q_obj = q_obj | sub_q
                else:
                    q_obj = q_obj & sub_q
            else:
                field = rule.get('field', '')
                if field.startswith('~'):
                    rule_q = cls.compile_relation_filter(rule, entity, active_user)
                    if combinator == 'or':
                        q_obj = q_obj | rule_q
                    else:
                        q_obj = q_obj & rule_q
                else:
                    operator = rule['operator']
                    value = rule['value']
                    
                    # Basic security validation
                    clean_field = field.strip('[]')
                    if not validate_relation_path(entity, clean_field):
                        raise ValidationError(f"Field '{clean_field}' is not queryable on '{entity}' schema")
                        
                    # Compile lookup
                    rule_q = cls.compile_rule(clean_field, operator, value, entity, active_user)
                    if combinator == 'or':
                        q_obj = q_obj | rule_q
                    else:
                        q_obj = q_obj & rule_q
                    
        return q_obj

    @classmethod
    def compile_relation_filter(cls, rule, entity, active_user):
        relation_name = rule['field'].lstrip('~')
        match_mode = rule.get('matchMode', 'some')
        sub_rules = rule.get('value', {})
        
        ModelClass = apps.get_model(SCHEMA_WHITELIST[entity]['model'])
        try:
            field = ModelClass._meta.get_field(relation_name)
        except Exception:
            raise ValidationError(f"Relation '{relation_name}' not found on '{entity}'")
        
        target_model = field.related_model
        target_entity = _get_entity_key(target_model)
        if not target_entity:
            raise ValidationError(f"Relation target for '{relation_name}' is not whitelisted")
            
        inner_q = cls.parse_group(sub_rules, target_entity, active_user)
        
        if getattr(field, 'one_to_many', False):
            sub_qs = target_model.objects.filter(**{field.remote_field.name: OuterRef('pk')})
        elif getattr(field, 'many_to_many', False):
            sub_qs = target_model.objects.filter(**{field.related_query_name(): OuterRef('pk')})
        elif field.many_to_one or getattr(field, 'one_to_one', False):
            sub_qs = target_model.objects.filter(pk=OuterRef(field.name))
        else:
            raise ValidationError(f"Unsupported relation type for subquery: '{relation_name}'")
            
        if match_mode == 'none':
            return ~Exists(sub_qs.filter(inner_q))
        elif match_mode == 'all':
            anti_qs = sub_qs.exclude(inner_q)
            return ~Exists(anti_qs)
        else:
            return Exists(sub_qs.filter(inner_q))

    @classmethod
    def compile_rule(cls, field, operator, value, entity, active_user):
        # Resolve macros
        if isinstance(value, str) and value.startswith('@'):
            # Use parser macro resolver
            parser = AZQLParser([], entity, active_user)
            value = parser.resolve_macro(value)
            
        op = operator.upper()
        if op in ('WAS EVER', 'EVER'):
            # Leverage the parsed compiler's history evaluator
            parser = AZQLParser([], entity, active_user)
            return parser.compile_was_ever(field, value)
            
        path_parts = field.split('__')
        ModelClass = apps.get_model(SCHEMA_WHITELIST[entity]['model'])
        return compile_subquery_relation_lookup(ModelClass, path_parts, op, value, active_user)
