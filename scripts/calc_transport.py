import pandas as pd
import numpy as np

def calculate_transport():
    extracted_path = r'Z:\books2\Plan\Delivery_transport\Machhiwad_Extraction.xlsx'
    combined_path = r'Z:\books2\Plan\Delivery_transport\Village_Transport_Manifest_Combined.xlsx'
    output_path = r'Z:\books2\Plan\Delivery_transport\Machhiwad_Daily_Transport.xlsx'

    # Read the extracted data
    df_ext = pd.read_excel(extracted_path, sheet_name='Machhiwad')
    
    # Read the previously transported data
    try:
        df_trans = pd.read_excel(combined_path, sheet_name='Machhiwad')
        # We only need Product and Transported on 09/05/2026
        df_trans = df_trans[['Product', 'Transported on 09/05/2026']].copy()
    except Exception as e:
        print(f"Error reading {combined_path}: {e}")
        return

    # Merge data on Product
    df = pd.merge(df_ext, df_trans, on='Product', how='left')
    
    # Fill NaN with 0 for numerical columns
    df['Transported on 09/05/2026'] = df['Transported on 09/05/2026'].fillna(0)
    df['Recently Delivered'] = df['Recently Delivered'].fillna(0)
    df['Owed Quantity'] = df['Owed Quantity'].fillna(0)
    
    # Calculate Godown Current Stock
    df['Godown Current Stock'] = df['Transported on 09/05/2026'] - df['Recently Delivered']
    # If it's negative, it means we delivered more than we recorded transporting (data mismatch), but we'll cap at 0 just in case.
    # Actually, let's not cap it to expose data issues, or cap it? Let's not cap Godown Current Stock.
    
    # Calculate Need to Transport Today
    df['Need to Transport Today'] = df['Owed Quantity'] - df['Godown Current Stock']
    
    # Cap negative needs to 0
    df['Need to Transport Today'] = df['Need to Transport Today'].apply(lambda x: max(x, 0))
    
    # Sort or filter? Let's only keep rows where Need to Transport Today > 0, or keep all?
    # Let's keep all, but sort by Need to Transport Today descending
    df = df.sort_values(by='Need to Transport Today', ascending=False)
    
    # Save to Excel
    df.to_excel(output_path, index=False, sheet_name='Machhiwad Transport')
    print(f"Daily transport calculation complete. Saved to: {output_path}")

if __name__ == '__main__':
    calculate_transport()
