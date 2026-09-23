import sys
import os
import re
import math
import struct
import unittest
from types import ModuleType
from decimal import Decimal

# Setup Django context with mocked GIS/GDAL/GEOS to run on Windows without native DLLs
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import django.db.models as dm

class Point:
    def __init__(self, x, y, srid=4326):
        self.x = float(x)
        self.y = float(y)
        self.srid = srid
    def __str__(self):
        return f"POINT ({self.x} {self.y})"

def parse_ewkb_hex(hex_str):
    try:
        data = bytes.fromhex(hex_str)
        endian = '<' if data[0] == 1 else '>'
        geom_type = struct.unpack(f'{endian}I', data[1:5])[0]
        has_srid = bool(geom_type & 0x20000000)
        offset = 5
        if has_srid:
            offset += 4
        x, y = struct.unpack(f'{endian}dd', data[offset:offset+16])
        return x, y
    except Exception:
        return None

# Use TextField for SQLite mapping of Spatial fields
class DF(dm.TextField):
    def __init__(self, *a, **kw):
        kw.pop('srid', None)
        super().__init__(*a, **kw)

    def parse_point(self, value):
        if value is None or isinstance(value, Point):
            return value
        if isinstance(value, str):
            value = value.strip()
            # 1. Try WKT format
            match = re.match(r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)', value, re.IGNORECASE)
            if match:
                return Point(match.group(1), match.group(2))
            # 2. Try EWKB hex format
            if len(value) >= 34 and all(c in '0123456789abcdefABCDEF' for c in value):
                coords = parse_ewkb_hex(value)
                if coords:
                    return Point(coords[0], coords[1])
        return value

    def get_prep_value(self, value):
        if isinstance(value, (tuple, list)):
            return value
        if value is None:
            return None
        if isinstance(value, Point) or hasattr(value, 'x'):
            return str(value)
        return super().get_prep_value(value)

    def from_db_value(self, value, expression, connection):
        return self.parse_point(value)

    def to_python(self, value):
        parsed = self.parse_point(value)
        if isinstance(parsed, Point):
            return parsed
        return super().to_python(value)

# Create dummy modules to simulate django.contrib.gis hierarchy
gis = ModuleType('django.contrib.gis')
gis_db = ModuleType('django.contrib.gis.db')
gis_db_models = ModuleType('django.contrib.gis.db.models')
gis_db_models_fields = ModuleType('django.contrib.gis.db.models.fields')
gis_geos = ModuleType('django.contrib.gis.geos')
gis_gdal = ModuleType('django.contrib.gis.gdal')

gis.db = gis_db
gis.geos = gis_geos
gis.gdal = gis_gdal
gis_db.models = gis_db_models
gis_db.models.fields = gis_db_models_fields

gis_measure = ModuleType('django.contrib.gis.measure')
class DummyD:
    def __init__(self, *args, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
        if not kwargs and args:
            self.m = args[0]
gis_measure.D = DummyD
gis.measure = gis_measure

gis_db_models_functions = ModuleType('django.contrib.gis.db.models.functions')
class DummyDistance:
    pass
gis_db_models_functions.Distance = DummyDistance
gis_db_models.functions = gis_db_models_functions

class DummyGEOS:
    def __init__(self, *args, **kwargs):
        pass

gis_geos.Point = Point
gis_geos.Polygon = DummyGEOS
gis_geos.MultiPolygon = DummyGEOS
gis_geos.GEOSGeometry = DummyGEOS

for m in (gis_db_models, gis_db_models_fields):
    m.PolygonField = DF
    m.PointField = DF
    m.MultiPolygonField = DF
    m.GeometryField = DF

sys.modules['django.contrib.gis'] = gis
sys.modules['django.contrib.gis.db'] = gis_db
sys.modules['django.contrib.gis.db.models'] = gis_db_models
sys.modules['django.contrib.gis.db.models.fields'] = gis_db_models_fields
sys.modules['django.contrib.gis.geos'] = gis_geos
sys.modules['django.contrib.gis.gdal'] = gis_gdal
sys.modules['django.contrib.gis.measure'] = gis_measure
sys.modules['django.contrib.gis.db.models.functions'] = gis_db_models_functions

import django.contrib
django.contrib.gis = gis

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
os.environ['IS_TESTING'] = 'True' # Force IS_TESTING to True before settings load

from django.conf import settings
_ = settings.INSTALLED_APPS
settings.INSTALLED_APPS = [app for app in settings.INSTALLED_APPS if app != 'django.contrib.gis']

# Configure SQLite in-memory engine
settings.DATABASES['default'] = {
    'ENGINE': 'django.db.backends.sqlite3',
    'NAME': ':memory:',
}
settings.DATABASES['reports'] = {
    'ENGINE': 'django.db.backends.sqlite3',
    'NAME': ':memory:',
}

# Bypass migrations during local runs
class DisableMigrations:
    def __contains__(self, item):
        return True
    def __getitem__(self, item):
        return None

settings.MIGRATION_MODULES = DisableMigrations()

# Disable logging clutter during test runs
import logging
logging.disable(logging.CRITICAL)

django.setup()

# Define and register custom SQLite connection functions
from django.db.backends.signals import connection_created
from django.dispatch import receiver

def sqlite_sqrt(x):
    return math.sqrt(float(x)) if x is not None else None

def sqlite_power(x, y):
    return math.pow(float(x), float(y)) if x is not None and y is not None else None

def sqlite_split_part(string, delim, index):
    if not string:
        return ""
    parts = string.split(delim)
    idx = int(index) - 1
    if 0 <= idx < len(parts):
        return parts[idx]
    return ""

@receiver(connection_created)
def extend_sqlite_functions(connection, **kwargs):
    if connection.vendor == 'sqlite':
        conn = connection.connection
        conn.create_function("sqrt", 1, sqlite_sqrt)
        conn.create_function("power", 2, sqlite_power)
        conn.create_function("split_part", 3, sqlite_split_part)

# Register custom lookups and functions compatible with SQLite SQL
from django.db.models import Lookup, Func

class DistanceLteLookup(Lookup):
    lookup_name = 'distance_lte'

    def as_sql(self, compiler, connection):
        lhs, lhs_params = self.process_lhs(compiler, connection)
        rhs_val = self.rhs
        if hasattr(rhs_val, 'value'):
            rhs_val = rhs_val.value
        
        try:
            point = rhs_val[0]
            if len(rhs_val) >= 3 and isinstance(rhs_val[1], str) and rhs_val[1] in ('<', '<=', '>', '>=', '='):
                distance_obj = rhs_val[2]
            else:
                distance_obj = rhs_val[1]
                
            if hasattr(point, 'value'):
                point = point.value
                
            if isinstance(point, str):
                match = re.match(r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)', point, re.IGNORECASE)
                if match:
                    lon = float(match.group(1))
                    lat = float(match.group(2))
                else:
                    lon, lat = 0.0, 0.0
            else:
                lon = point.x
                lat = point.y
                
            if hasattr(distance_obj, 'm'):
                radius = distance_obj.m
            elif hasattr(distance_obj, 'standard_value'):
                radius = distance_obj.standard_value
            else:
                radius = float(distance_obj)
        except Exception as e:
            raise ValueError(f"Failed to unpack rhs_val: {rhs_val}. Error: {e}")

        # SQLite does not support ::double precision casts
        if connection.vendor == 'sqlite':
            x_sql = f"split_part(split_part(nullif({lhs}, ''), '(', 2), ' ', 1)"
            y_sql = f"split_part(split_part(split_part(nullif({lhs}, ''), '(', 2), ' ', 2), ')', 1)"
        else:
            x_sql = f"NULLIF(split_part(split_part(nullif({lhs}, ''), '(', 2), ' ', 1), '')::double precision"
            y_sql = f"NULLIF(split_part(split_part(split_part(nullif({lhs}, ''), '(', 2), ' ', 2), ')', 1), '')::double precision"

        sql = f"""
        sqrt(
            power(({x_sql} - %s) * 103500, 2) +
            power(({y_sql} - %s) * 111000, 2)
        ) <= %s
        """
        params = list(lhs_params) + [lon, lat, radius]
        return sql, params

DF.register_lookup(DistanceLteLookup)

class DistanceValue:
    def __init__(self, value):
        self.m = float(value) if value is not None else 0.0

class MockDistanceField(dm.FloatField):
    def from_db_value(self, value, expression, connection):
        if value is None:
            return None
        return DistanceValue(value)

class Distance(Func):
    def __init__(self, field_name, ref_point, **extra):
        self.ref_point = ref_point
        extra.setdefault('output_field', MockDistanceField())
        super().__init__(field_name, **extra)

    def as_sql(self, compiler, connection, **extra_context):
        lhs_sql, lhs_params = compiler.compile(self.source_expressions[0])
        lon = self.ref_point.x
        lat = self.ref_point.y
        
        if connection.vendor == 'sqlite':
            x_sql = f"split_part(split_part(nullif({lhs_sql}, ''), '(', 2), ' ', 1)"
            y_sql = f"split_part(split_part(split_part(nullif({lhs_sql}, ''), '(', 2), ' ', 2), ')', 1)"
        else:
            x_sql = f"NULLIF(split_part(split_part(nullif({lhs_sql}, ''), '(', 2), ' ', 1), '')::double precision"
            y_sql = f"NULLIF(split_part(split_part(split_part(nullif({lhs_sql}, ''), '(', 2), ' ', 2), ')', 1), '')::double precision"
            
        sql = f"""
        sqrt(
            power(({x_sql} - %s) * 103500, 2) +
            power(({y_sql} - %s) * 111000, 2)
        )
        """
        params = list(lhs_params) + [lon, lat]
        return sql, params

# Re-wire Distance function back into the mocked GIS module
gis_db_models_functions.Distance = Distance

# Skip ConcurrencyTestCase
try:
    import procurement.tests
    procurement.tests.ConcurrencyTestCase = unittest.skip(
        "Skipping concurrency tests on in-memory SQLite"
    )(procurement.tests.ConcurrencyTestCase)
except Exception:
    pass

from django.test.utils import get_runner
TestRunner = get_runner(settings)
test_runner = TestRunner(interactive=False, keepdb=False)
failures = test_runner.run_tests([
    "finance", "orders", "outlets", "procurement",
    "customers", "settings_app", "reports", "messaging",
    "inventory"
])
sys.exit(bool(failures))

