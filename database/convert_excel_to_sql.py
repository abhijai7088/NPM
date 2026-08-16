import pandas as pd
import math
import re

# File Paths
file_prj = r'c:\knowledge\Confidential\NICSI\docs\XX_NIC_PM_PRJ_LIST.xlsx'
file_po = r'c:\knowledge\Confidential\NICSI\docs\XX_NIC_PM_PO_LIST.xlsx'
file_tax_inv = r'c:\knowledge\Confidential\NICSI\docs\XX_NIC_PM_TAX_INV_LIST.xlsx'
file_bill_desk = r'c:\knowledge\Confidential\NICSI\docs\XX_NIC_PM_BILL_DSK_LIST.xlsx'
file_db_prj = r'c:\knowledge\Confidential\NICSI\docs\XX_NIC_PMDB_PROJECT_LIST.xlsx'
file_invoice = r'c:\knowledge\Confidential\NICSI\docs\APPS.XX_NIC_PM_INVOICE_LIST.xlsx'

out_file = r'c:\knowledge\Confidential\NICSI\npms\backend\npms-core-service\src\main\resources\db\migration\V4__create_and_seed_real_erp_data.sql'

def format_value(val):
    if pd.isna(val) or val is None:
        return 'NULL'
    if isinstance(val, (int, float, complex)):
        # Handle nan/inf
        if math.isnan(val) or math.isinf(val):
            return 'NULL'
        return str(val)
    if isinstance(val, pd.Timestamp):
        return f"'{val.strftime('%Y-%m-%d')}'"
    
    val_str = str(val).replace("'", "''")
    return f"'{val_str}'"

def get_sql_type(col_name_orig, df):
    col_name = col_name_orig.lower()
    # Basic heuristic for SQL types
    if 'date' in col_name or col_name.endswith('_on') or col_name == 'frdate' or col_name == 'todate':
        return 'DATE'
    if 'email' in col_name:
        return 'TEXT'
    if df[col_name_orig].dtype == 'int64' or col_name.endswith('_id') or 'no_of' in col_name:
        return 'BIGINT'
    if df[col_name_orig].dtype == 'float64' or 'amount' in col_name or 'total' in col_name:
        return 'NUMERIC(20,2)'
    return 'TEXT'

with open(out_file, 'w', encoding='utf-8') as f:
    f.write("-- ============================================================\n")
    f.write("-- NICSI NPMS — Advanced Data Migration & Seed from Excels\n")
    f.write("-- Migration: V4__create_and_seed_real_erp_data.sql\n")
    f.write("-- ============================================================\n\n")
    
    f.write("CREATE SCHEMA IF NOT EXISTS nicsi_erp;\n")
    f.write("SET search_path = nicsi_erp;\n\n")

    # Function to create table dynamically
    def write_table_and_insert(table_name, df, extra_columns=""):
        if df.empty:
            return
        
        orig_cols = df.columns
        cols = [c.lower() for c in orig_cols]
        f.write(f"CREATE TABLE IF NOT EXISTS {table_name} (\n")
        f.write("    " + ",\n    ".join([f"{c_lower} {get_sql_type(c_orig, df)}" for c_orig, c_lower in zip(orig_cols, cols)]))
        
        if extra_columns:
            f.write(f",\n    {extra_columns}")
            
        f.write("\n);\n\n")
        
        if 'header_id' in cols:
            f.write(f"ALTER TABLE {table_name} ADD PRIMARY KEY (header_id);\n\n")
        
        f.write(f"INSERT INTO {table_name} ({','.join(cols)}) VALUES\n")
        values_list = []
        for index, row in df.iterrows():
            vals = ",".join([format_value(x) for x in row])
            values_list.append(f"({vals})")
        f.write(",\n".join(values_list))
        if 'header_id' in cols:
            f.write("\nON CONFLICT (header_id) DO NOTHING;\n\n")
        else:
            f.write(";\n\n")

    # 1. Project List
    df_prj = pd.read_excel(file_prj)
    
    # 6. Invoice List (Read early to extract penalty)
    df_invoice = pd.read_excel(file_invoice)
    
    # Calculate penalty
    if 'PEN_AMT' in df_invoice.columns:
        df_penalty = df_invoice.groupby('PROJECT_ID')['PEN_AMT'].sum().reset_index()
        df_prj = df_prj.merge(df_penalty, on='PROJECT_ID', how='left')
        df_prj['PEN_AMT'] = df_prj['PEN_AMT'].fillna(0)
        df_prj.rename(columns={'PEN_AMT': 'TOTAL_PENALTY_AMT'}, inplace=True)
    else:
        df_prj['TOTAL_PENALTY_AMT'] = 0

    # Add missing columns
    df_prj['MINISTRY'] = None
    df_prj['DEPARTMENT'] = None
    df_prj['PROJECT_CATEGORY'] = None
    # Extract state_code from the last 2 chars of PROJECT_CD (e.g. ZOWB -> WB)
    df_prj['STATE_CODE'] = df_prj['PROJECT_CD'].astype(str).str[-2:]
        
    # Extra column for commission (Total Amount Received - (Total PO Amount - Total Penalty))
    write_table_and_insert('project_list', df_prj, "nicsi_commission NUMERIC(20,2) GENERATED ALWAYS AS (GREATEST(0, amount_received - (po_amount - total_penalty_amt))) STORED")

    # 2. PO List
    df_po = pd.read_excel(file_po)
    write_table_and_insert('purchase_order_list', df_po)

    # 3. Tax Invoice List
    df_tax_inv = pd.read_excel(file_tax_inv)
    write_table_and_insert('tax_invoice_list', df_tax_inv)

    # 4. Bill Desk List
    df_bill_desk = pd.read_excel(file_bill_desk)
    write_table_and_insert('bill_desk_list', df_bill_desk)

    # 5. Project Type Summary
    df_db_prj = pd.read_excel(file_db_prj)
    write_table_and_insert('project_type_summary', df_db_prj)

    # 6. Invoice List (Write table)
    write_table_and_insert('invoice_list', df_invoice)

print("Conversion complete!")
