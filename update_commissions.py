import sys
import os
import django

from inventory.models import Product

data = """
1013	3
1027	5
1031	2
1007	7
1008	3
1029	3
1012	3
1006	7
1023	5
1024	1
1014	5
1025	2
1021	20
1018	5
1010	3
1034	8
1022	15
1017	2
1033	10
1019	16
1005	7
1028	3
1001	7
1030	15
1026	5
1020	18
1009	5
1004	4
1011	3
1015	0.5
1164	60
1016	12
1032	12
1003	10
1002	10
"""

with open("output.txt", "w", encoding="utf-8") as f:
    lines = data.strip().split('\n')
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            prod_id = parts[0]
            margin = parts[-1]
            
            # Try finding the product by display_id (string match)
            product = Product.objects.filter(display_id__icontains=prod_id).first()
            if product:
                product.default_commission_type = 'fixed'
                product.default_commission_value = margin
                product.save()
                f.write(f"Updated {product.name} (ID: {prod_id}) to fixed margin: {margin}\n")
            else:
                f.write(f"Product not found for ID: {prod_id}\n")
