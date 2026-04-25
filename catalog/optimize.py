import os
from PIL import Image

def optimize_images(directory):
    max_size = 1500
    for root, dirs, files in os.walk(directory):
        for file in files:
            ext = file.lower().split('.')[-1]
            if ext in ['png', 'jpg', 'jpeg']:
                file_path = os.path.join(root, file)
                try:
                    img = Image.open(file_path)
                    
                    if img.width > max_size or img.height > max_size:
                        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                        
                    new_file_path = os.path.splitext(file_path)[0] + '.webp'
                    
                    img.save(new_file_path, 'WEBP', quality=80)
                    
                    img.close()
                    os.remove(file_path)
                    print(f"Optimized: {file_path} -> {new_file_path}")
                except Exception as e:
                    print(f"Failed to optimize {file_path}: {e}")

if __name__ == "__main__":
    catalog_dir = r"z:\books2\catalog"
    scan_dir = os.path.join(catalog_dir, "scan")
    logo_dir = os.path.join(catalog_dir, "Logo")
    
    print("Optimizing scan directory...")
    optimize_images(scan_dir)
    print("Optimizing Logo directory...")
    optimize_images(logo_dir)
    print("Done.")
