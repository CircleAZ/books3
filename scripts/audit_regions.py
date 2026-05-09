from customers.models import GeographicRegion
import json

r = GeographicRegion.objects.filter(name='Krushnapur').first()
if r and r.boundary:
    geojson = json.loads(r.boundary.geojson)
    coords = geojson['coordinates'][0]
    print(f"Name: {r.name}")
    print(f"First coord from DB (geojson): {coords[0]}")
    print(f"  -> [lng, lat] = [{coords[0][0]}, {coords[0][1]}]")
    print()
    print("DB stores standard GeoJSON [lng, lat]")
    print(f"Full GeoJSON type: {geojson['type']}")
    print(f"Number of points: {len(coords)}")
else:
    print("Krushnapur not found or no boundary")
