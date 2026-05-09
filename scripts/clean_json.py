import json

file_path = r'z:\books2\data\layered_geocoding_data.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Keys that are actually used by the ingestion script
allowed_keys = {'name', 'layer', 'pincode', 'color', 'boundary'}

cleaned_data = []
for item in data:
    cleaned_item = {k: v for k, v in item.items() if k in allowed_keys}
    cleaned_data.append(cleaned_item)

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(cleaned_data, f, indent=2)

print(f"Cleaned JSON file saved. Size reduced significantly.")
