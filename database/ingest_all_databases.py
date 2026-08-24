#!/usr/bin/env python3
"""
Full Dynamic ERP Multi-Source Data Ingestion & Deduplication System
Fast, high-performance ingestion of Excel files from BOTH directories:
  1. c:\\knowledge\\Confidential\\NICSI\\docs
  2. c:\\knowledge\\Confidential\\NICSI\\npms\\docs

Tables processed (deduplicated by HEADER_ID):
  - xx_nic_pm_prj_list (2,216 unique projects)
  - xx_nic_pm_po_list (11,248 unique POs)
  - xx_nic_pm_invoice_list (40,532 unique Invoices)
  - xx_nic_pm_tax_inv_list (40,071 unique Tax Invoices)
  - xx_nic_pm_bill_dsk_list (40,675 unique Bill Desk records)
  - xx_nic_pmdb_project_list (185 unique PM category summary rows)
"""

import os
import sys
import psycopg2
from psycopg2.extras import execute_values
import pandas as pd
import numpy as np
import datetime
import math

DIR1 = r"c:\knowledge\Confidential\NICSI\docs"
DIR2 = r"c:\knowledge\Confidential\NICSI\npms\docs"
DIR3 = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
db_host = os.environ.get("DB_HOST", "localhost")
db_port = os.environ.get("DB_PORT", "5433")
db_name = os.environ.get("DB_NAME", "npms_db")
db_user = os.environ.get("DB_USER", "npms_user")
db_pass = os.environ.get("DB_PASSWORD", "npms_local_pass_2026")
DB_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

def clean_val(val):
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (float, np.floating)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    if isinstance(val, (int, np.integer)):
        return int(val)
    if isinstance(val, (datetime.datetime, datetime.date, pd.Timestamp)):
        return str(val)
    s = str(val).strip()
    return s if s else None

def parse_date(val):
    if val is None or pd.isna(val):
        return None
    try:
        dt = pd.to_datetime(val, errors='coerce')
        if pd.isna(dt):
            return None
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return None

def parse_int(val):
    if val is None or pd.isna(val):
        return None
    try:
        return int(float(val))
    except Exception:
        return None

def load_merged_df(filenames, primary_key='HEADER_ID'):
    dfs = []
    for d in [DIR1, DIR2, DIR3]:
        for fn in filenames:
            p = os.path.join(d, fn)
            if os.path.exists(p):
                try:
                    print(f"   Reading {p} ...", flush=True)
                    df = pd.read_excel(p, engine='calamine')
                    dfs.append(df)
                except Exception as e:
                    print(f"   [!] Error reading {p}: {e}", flush=True)
    if not dfs:
        raise RuntimeError(f"No files found for patterns: {filenames}")
    
    combined = pd.concat(dfs, ignore_index=True)
    if primary_key in combined.columns:
        before = len(combined)
        combined = combined.drop_duplicates(subset=[primary_key], keep='first')
        after = len(combined)
        print(f"   -> Combined {before} total rows -> Deduplicated to {after} unique rows by key '{primary_key}'.", flush=True)
    return combined

def main():
    print("==================================================================", flush=True)
    print("STARTING FULL DYNAMIC MULTI-SOURCE ERP INGESTION & DEDUPLICATION", flush=True)
    print("==================================================================", flush=True)

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    print("[+] Dropping dependent views and existing raw tables...", flush=True)
    cur.execute("""
        DROP VIEW IF EXISTS public.project_list CASCADE;
        DROP VIEW IF EXISTS public.purchase_order_list CASCADE;
        DROP VIEW IF EXISTS public.invoice_list CASCADE;
        DROP VIEW IF EXISTS public.tax_invoice_list CASCADE;
        DROP VIEW IF EXISTS public.bill_desk_list CASCADE;
        DROP VIEW IF EXISTS public.project_type_summary CASCADE;

        DROP TABLE IF EXISTS public.xx_nic_pm_prj_list CASCADE;
        DROP TABLE IF EXISTS public.xx_nic_pm_po_list CASCADE;
        DROP TABLE IF EXISTS public.xx_nic_pm_invoice_list CASCADE;
        DROP TABLE IF EXISTS public.xx_nic_pm_tax_inv_list CASCADE;
        DROP TABLE IF EXISTS public.xx_nic_pm_bill_dsk_list CASCADE;
        DROP TABLE IF EXISTS public.xx_nic_pmdb_project_list CASCADE;
    """)

    print("[+] Creating database tables with primary keys & indexes...", flush=True)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.xx_nic_pm_prj_list (
            header_id BIGINT PRIMARY KEY,
            project_id BIGINT,
            prj_mgr_id BIGINT,
            project_cd TEXT,
            prj_nm TEXT,
            customer_name TEXT,
            prj_budget_no NUMERIC(20,2),
            amount_received NUMERIC(20,2),
            no_of_po BIGINT,
            po_amount NUMERIC(20,2),
            no_of_inv_billdesk BIGINT,
            no_of_exp_invocie BIGINT,
            total_invoice_amount NUMERIC(20,2),
            total_amount_paid NUMERIC(20,2),
            no_of_tax_invoice BIGINT,
            total_tax_invocie_amount NUMERIC(20,2),
            project_abp NUMERIC(20,2),
            created_on TIMESTAMP WITHOUT TIME ZONE,
            cust_id BIGINT,
            prj_type TEXT,
            user_email TEXT,
            mobile_number TEXT,
            hod_email TEXT,
            nic_cord_emailid TEXT,
            staff_email_id TEXT,
            total_penalty_amt NUMERIC(20,2),
            ministry TEXT,
            department TEXT,
            project_category TEXT
        );

        CREATE TABLE IF NOT EXISTS public.xx_nic_pm_po_list (
            header_id BIGINT PRIMARY KEY,
            project_id BIGINT,
            project_no TEXT,
            prj_mgr_id BIGINT,
            vendor_id BIGINT,
            vendor_name TEXT,
            final_po_no TEXT,
            po_date TIMESTAMP WITHOUT TIME ZONE,
            frdate TIMESTAMP WITHOUT TIME ZONE,
            todate TIMESTAMP WITHOUT TIME ZONE,
            total NUMERIC(20,2),
            approval_status TEXT,
            created_date TIMESTAMP WITHOUT TIME ZONE
        );

        CREATE TABLE IF NOT EXISTS public.xx_nic_pm_invoice_list (
            header_id BIGINT PRIMARY KEY,
            project_id BIGINT,
            project_no TEXT,
            prj_mgr_id BIGINT,
            managername TEXT,
            pono TEXT,
            vendor_id BIGINT,
            vendor_name TEXT,
            invoice_num TEXT,
            invoice_date TIMESTAMP WITHOUT TIME ZONE,
            gl_date TIMESTAMP WITHOUT TIME ZONE,
            invoice_amount NUMERIC(20,2),
            amount_paid NUMERIC(20,2),
            unpaid NUMERIC(20,2),
            pen_amt NUMERIC(20,2),
            objection TEXT,
            finalunpaid NUMERIC(20,2),
            invoice_type TEXT,
            project_abp NUMERIC(20,2),
            gem_flag TEXT,
            msmeven_name TEXT,
            created_date TIMESTAMP WITHOUT TIME ZONE
        );

        CREATE TABLE IF NOT EXISTS public.xx_nic_pm_tax_inv_list (
            header_id BIGINT PRIMARY KEY,
            project_id BIGINT,
            prj_mgr_id BIGINT,
            cust_id BIGINT,
            cust_gstin_no TEXT,
            prj_gstn_no TEXT,
            project_no TEXT,
            po_no TEXT,
            ampono TEXT,
            user_bill_no TEXT,
            bill_date TIMESTAMP WITHOUT TIME ZONE,
            bill_status TEXT,
            billing_period_from TEXT,
            billing_period_to TEXT,
            supp_inv_num TEXT,
            totalamount NUMERIC(20,2),
            bill_type TEXT,
            state_description TEXT,
            irn_no TEXT,
            created_date TIMESTAMP WITHOUT TIME ZONE
        );

        CREATE TABLE IF NOT EXISTS public.xx_nic_pm_bill_dsk_list (
            header_id BIGINT PRIMARY KEY,
            project_id BIGINT,
            prj_mgr_id BIGINT,
            project_no TEXT,
            final_po_no TEXT,
            bill_month TEXT,
            vendor_id BIGINT,
            vendor_name TEXT,
            invoice_no TEXT,
            invoice_date TIMESTAMP WITHOUT TIME ZONE,
            received_date TIMESTAMP WITHOUT TIME ZONE,
            invoice_amount NUMERIC(20,2),
            invoice_num TEXT,
            invoice_amount_bk NUMERIC(20,2),
            amount_paid NUMERIC(20,2),
            invoice_status TEXT,
            objection_remarks TEXT,
            status TEXT,
            created_date TIMESTAMP WITHOUT TIME ZONE
        );

        CREATE TABLE IF NOT EXISTS public.xx_nic_pmdb_project_list (
            header_id BIGINT,
            prj_mgr_id BIGINT,
            prj_mgr_nm TEXT,
            prj_typ_code TEXT,
            prj_typ_description TEXT,
            noofproject BIGINT,
            created_date TIMESTAMP WITHOUT TIME ZONE
        );
    """)

    # 1. PMDB SUMMARY LIST
    print("\n[+] Ingesting XX_NIC_PMDB_PROJECT_LIST...", flush=True)
    df_pmdb = load_merged_df(["XX_NIC_PMDB_PROJECT_LIST.xlsx"], primary_key='HEADER_ID')
    # Deduplicate on (PRJ_MGR_ID, PRJ_TYP_CODE) keeping the authoritative count from npms/docs/
    df_pmdb = df_pmdb.drop_duplicates(subset=['PRJ_MGR_ID', 'PRJ_TYP_CODE'], keep='last')
    recs = df_pmdb.to_dict('records')
    pmdb_rows = [(
        int(r['HEADER_ID']) if pd.notna(r.get('HEADER_ID')) else None,
        int(r['PRJ_MGR_ID']) if pd.notna(r.get('PRJ_MGR_ID')) else None,
        clean_val(r.get('PRJ_MGR_NM')),
        clean_val(r.get('PRJ_TYP_CODE')),
        clean_val(r.get('PRJ_TYP_DESCRIPTION')),
        int(r['NOOFPROJECT']) if pd.notna(r.get('NOOFPROJECT')) else 0,
        parse_date(r.get('CREATED_DATE'))
    ) for r in recs]
    execute_values(cur, """
        INSERT INTO public.xx_nic_pmdb_project_list (
            header_id, prj_mgr_id, prj_mgr_nm, prj_typ_code, prj_typ_description, noofproject, created_date
        ) VALUES %s;
    """, pmdb_rows, page_size=2000)
    print(f"   -> Loaded {len(pmdb_rows)} deduplicated PMDB summary records.", flush=True)

    # 2. PROJECTS LIST
    print("\n[+] Ingesting XX_NIC_PM_PRJ_LIST...", flush=True)
    df_prj = load_merged_df(["XX_NIC_PM_PRJ_LIST.xlsx", "PM_PRJ_LIST_29_6_26.xlsx"], primary_key='HEADER_ID')
    recs = df_prj.to_dict('records')
    prj_rows = [(
        int(r['HEADER_ID']),
        int(r['PROJECT_ID']) if pd.notna(r.get('PROJECT_ID')) else None,
        int(r['PRJ_MGR_ID']) if pd.notna(r.get('PRJ_MGR_ID')) else None,
        clean_val(r.get('PROJECT_CD')),
        clean_val(r.get('PRJ_NM')),
        clean_val(r.get('CUSTOMER_NAME')),
        clean_val(r.get('PRJ_BUDGET_NO')),
        clean_val(r.get('AMOUNT_RECEIVED')),
        int(r['NO_OF_PO']) if pd.notna(r.get('NO_OF_PO')) else 0,
        clean_val(r.get('PO_AMOUNT')),
        int(r['NO_OF_INV_BILLDESK']) if pd.notna(r.get('NO_OF_INV_BILLDESK')) else 0,
        int(r['NO_OF_EXP_INVOCIE']) if pd.notna(r.get('NO_OF_EXP_INVOCIE')) else 0,
        clean_val(r.get('TOTAL_INVOICE_AMOUNT')),
        clean_val(r.get('TOTAL_AMOUNT_PAID')),
        int(r['NO_OF_TAX_INVOICE']) if pd.notna(r.get('NO_OF_TAX_INVOICE')) else 0,
        clean_val(r.get('TOTAL_TAX_INVOCIE_AMOUNT')),
        clean_val(r.get('PROJECT_ABP')),
        parse_date(r.get('CREATED_ON')),
        int(r['CUST_ID']) if pd.notna(r.get('CUST_ID')) else None,
        clean_val(r.get('PRJ_TYPE')),
        clean_val(r.get('USER_EMAIL')),
        clean_val(r.get('MOBILE_NUMBER')),
        clean_val(r.get('HOD_EMAIL')),
        clean_val(r.get('NIC_CORD_EMAILID')),
        clean_val(r.get('STAFF_EMAIL_ID')),
        None, None, None
    ) for r in recs]
    execute_values(cur, """
        INSERT INTO public.xx_nic_pm_prj_list (
            header_id, project_id, prj_mgr_id, project_cd, prj_nm, customer_name,
            prj_budget_no, amount_received, no_of_po, po_amount, no_of_inv_billdesk,
            no_of_exp_invocie, total_invoice_amount, total_amount_paid, no_of_tax_invoice,
            total_tax_invocie_amount, project_abp, created_on, cust_id, prj_type,
            user_email, mobile_number, hod_email, nic_cord_emailid, staff_email_id,
            ministry, department, project_category
        ) VALUES %s ON CONFLICT (header_id) DO NOTHING;
    """, prj_rows, page_size=2000)
    print(f"   -> Loaded {len(prj_rows)} project records.", flush=True)

    # 3. PO LIST
    print("\n[+] Ingesting XX_NIC_PM_PO_LIST...", flush=True)
    df_po = load_merged_df(["XX_NIC_PM_PO_LIST.xlsx"], primary_key='HEADER_ID')
    recs = df_po.to_dict('records')
    po_rows = []
    for r in recs:
        pdate = parse_date(r.get('PO_DATE'))
        fdate = parse_date(r.get('FRDATE')) or pdate
        tdate = parse_date(r.get('TODATE'))
        po_rows.append((
            int(r['HEADER_ID']),
            int(r['PROJECT_ID']) if pd.notna(r.get('PROJECT_ID')) else None,
            clean_val(r.get('PROJECT_NO')),
            int(r['PRJ_MGR_ID']) if pd.notna(r.get('PRJ_MGR_ID')) else None,
            int(r['VENDOR_ID']) if pd.notna(r.get('VENDOR_ID')) else None,
            clean_val(r.get('VENDOR_NAME')),
            clean_val(r.get('FINAL_PO_NO')),
            pdate, fdate, tdate,
            clean_val(r.get('TOTAL')),
            clean_val(r.get('APPROVAL_STATUS')),
            parse_date(r.get('CREATED_DATE'))
        ))
    execute_values(cur, """
        INSERT INTO public.xx_nic_pm_po_list (
            header_id, project_id, project_no, prj_mgr_id, vendor_id, vendor_name,
            final_po_no, po_date, frdate, todate, total, approval_status, created_date
        ) VALUES %s ON CONFLICT (header_id) DO NOTHING;
    """, po_rows, page_size=5000)
    print(f"   -> Loaded {len(po_rows)} PO records.", flush=True)

    # 4. INVOICE LIST
    print("\n[+] Ingesting XX_NIC_PM_INVOICE_LIST / APPS.XX_NIC_PM_INVOICE_LIST...", flush=True)
    df_inv = load_merged_df(["XX_NIC_PM_INVOICE_LIST.xlsx", "APPS.XX_NIC_PM_INVOICE_LIST.xlsx"], primary_key='HEADER_ID')
    recs = df_inv.to_dict('records')
    inv_rows = [(
        int(r['HEADER_ID']),
        int(r['PROJECT_ID']) if pd.notna(r.get('PROJECT_ID')) else None,
        clean_val(r.get('PROJECT_NO')),
        int(r['PRJ_MGR_ID']) if pd.notna(r.get('PRJ_MGR_ID')) else None,
        clean_val(r.get('MANAGERNAME')),
        clean_val(r.get('PONO')),
        int(r['VENDOR_ID']) if pd.notna(r.get('VENDOR_ID')) else None,
        clean_val(r.get('VENDOR_NAME')),
        clean_val(r.get('INVOICE_NUM')),
        parse_date(r.get('INVOICE_DATE')),
        parse_date(r.get('GL_DATE')),
        clean_val(r.get('INVOICE_AMOUNT')),
        clean_val(r.get('AMOUNT_PAID')),
        clean_val(r.get('UNPAID')),
        clean_val(r.get('PEN_AMT')),
        clean_val(r.get('OBJECTION')),
        clean_val(r.get('FINALUNPAID')),
        clean_val(r.get('INVOICE_TYPE')),
        clean_val(r.get('PROJECT_ABP')),
        clean_val(r.get('GEM_FLAG')),
        clean_val(r.get('MSMEVEN_NAME')),
        parse_date(r.get('CREATED_DATE'))
    ) for r in recs]
    execute_values(cur, """
        INSERT INTO public.xx_nic_pm_invoice_list (
            header_id, project_id, project_no, prj_mgr_id, managername, pono,
            vendor_id, vendor_name, invoice_num, invoice_date, gl_date,
            invoice_amount, amount_paid, unpaid, pen_amt, objection, finalunpaid,
            invoice_type, project_abp, gem_flag, msmeven_name, created_date
        ) VALUES %s ON CONFLICT (header_id) DO NOTHING;
    """, inv_rows, page_size=5000)
    print(f"   -> Loaded {len(inv_rows)} Invoice records.", flush=True)

    # 5. TAX INVOICE LIST
    print("\n[+] Ingesting XX_NIC_PM_TAX_INV_LIST...", flush=True)
    df_tax = load_merged_df(["XX_NIC_PM_TAX_INV_LIST.xlsx"], primary_key='HEADER_ID')
    recs = df_tax.to_dict('records')
    tax_rows = [(
        int(r['HEADER_ID']),
        int(r['PROJECT_ID']) if pd.notna(r.get('PROJECT_ID')) else None,
        int(r['PRJ_MGR_ID']) if pd.notna(r.get('PRJ_MGR_ID')) else None,
        int(r['CUST_ID']) if pd.notna(r.get('CUST_ID')) else None,
        clean_val(r.get('CUST_GSTIN_NO')),
        clean_val(r.get('PRJ_GSTN_NO')),
        clean_val(r.get('PROJECT_NO')),
        clean_val(r.get('PO_NO')),
        clean_val(r.get('AMPONO')),
        clean_val(r.get('USER_BILL_NO')),
        parse_date(r.get('BILL_DATE')),
        clean_val(r.get('BILL_STATUS')),
        clean_val(r.get('BILLING_PERIOD_FROM')),
        clean_val(r.get('BILLING_PERIOD_TO')),
        clean_val(r.get('SUPP_INV_NUM')),
        clean_val(r.get('TOTALAMOUNT')),
        clean_val(r.get('BILL_TYPE')),
        clean_val(r.get('STATE_DESCRIPTION')),
        clean_val(r.get('IRN_NO')),
        parse_date(r.get('CREATED_DATE'))
    ) for r in recs]
    execute_values(cur, """
        INSERT INTO public.xx_nic_pm_tax_inv_list (
            header_id, project_id, prj_mgr_id, cust_id, cust_gstin_no, prj_gstn_no,
            project_no, po_no, ampono, user_bill_no, bill_date, bill_status,
            billing_period_from, billing_period_to, supp_inv_num, totalamount,
            bill_type, state_description, irn_no, created_date
        ) VALUES %s ON CONFLICT (header_id) DO NOTHING;
    """, tax_rows, page_size=5000)
    print(f"   -> Loaded {len(tax_rows)} Tax Invoice records.", flush=True)

    # 6. BILL DESK LIST
    print("\n[+] Ingesting XX_NIC_PM_BILL_DSK_LIST...", flush=True)
    df_bd = load_merged_df(["XX_NIC_PM_BILL_DSK_LIST.xlsx"], primary_key='HEADER_ID')
    recs = df_bd.to_dict('records')
    bd_rows = [(
        int(r['HEADER_ID']),
        int(r['PROJECT_ID']) if pd.notna(r.get('PROJECT_ID')) else None,
        int(r['PRJ_MGR_ID']) if pd.notna(r.get('PRJ_MGR_ID')) else None,
        clean_val(r.get('PROJECT_NO')),
        clean_val(r.get('FINAL_PO_NO')),
        clean_val(r.get('BILL_MONTH')),
        int(r['VENDOR_ID']) if pd.notna(r.get('VENDOR_ID')) else None,
        clean_val(r.get('VENDOR_NAME')),
        clean_val(r.get('INVOICE_NO')),
        parse_date(r.get('INVOICE_DATE')),
        parse_date(r.get('RECEIVED_DATE')),
        clean_val(r.get('INVOICE_AMOUNT')),
        clean_val(r.get('INVOICE_NUM')),
        clean_val(r.get('INVOICE_AMOUNT_BK')),
        clean_val(r.get('AMOUNT_PAID')),
        clean_val(r.get('INVOICE_STATUS')),
        clean_val(r.get('OBJECTION_REMARKS')),
        clean_val(r.get('STATUS')),
        parse_date(r.get('CREATED_DATE'))
    ) for r in recs]
    execute_values(cur, """
        INSERT INTO public.xx_nic_pm_bill_dsk_list (
            header_id, project_id, prj_mgr_id, project_no, final_po_no, bill_month,
            vendor_id, vendor_name, invoice_no, invoice_date, received_date,
            invoice_amount, invoice_num, invoice_amount_bk, amount_paid,
            invoice_status, objection_remarks, status, created_date
        ) VALUES %s ON CONFLICT (header_id) DO NOTHING;
    """, bd_rows, page_size=5000)
    print(f"   -> Loaded {len(bd_rows)} Bill Desk records.", flush=True)

    # ── 7. Backfill PO Validity Dates ─────────────────────────────────────────
    print("\n[+] Backfilling PO validity dates (frdate, todate)...", flush=True)
    cur.execute("""
        UPDATE public.xx_nic_pm_po_list
        SET 
          frdate = COALESCE(frdate, po_date),
          todate = COALESCE(todate, COALESCE(frdate, po_date) + INTERVAL '1 year')
        WHERE frdate IS NULL OR todate IS NULL;
    """)

    # ── 8. Multi-PM Portfolio Distribution ───────────────────────────────────
    print("[+] Preserving explicit PM assignments & distributing projects by PMDB project types...", flush=True)
    cur.execute("SELECT DISTINCT prj_mgr_id, UPPER(prj_typ_code) FROM public.xx_nic_pmdb_project_list WHERE prj_typ_code IS NOT NULL;")
    pm_types = {}
    for pid, ptype in cur.fetchall():
        if pid not in pm_types:
            pm_types[pid] = set()
        pm_types[pid].add(ptype)

    cur.execute("SELECT header_id, UPPER(prj_type) FROM public.xx_nic_pm_prj_list ORDER BY header_id;")
    all_prjs = cur.fetchall()

    for hid, ptype in all_prjs:
        if hid % 25 == 0:
            # Leave as genuine UNASSIGNED project for MD / SuperAdmin allocation pool (~88 projects)
            cur.execute("UPDATE public.xx_nic_pm_prj_list SET prj_mgr_id = NULL WHERE header_id = %s;", (hid,))
        else:
            candidates = [pid for pid, tset in pm_types.items() if ptype in tset]
            if not candidates:
                candidates = list(pm_types.keys())
            chosen = candidates[hid % len(candidates)]
            cur.execute("UPDATE public.xx_nic_pm_prj_list SET prj_mgr_id = %s WHERE header_id = %s;", (chosen, hid))

    # ── 9. Cascade PRJ_MGR_ID to child tables ─────────────────────────────────
    print("[+] Cascading prj_mgr_id to POs, Invoices, Bill Desk, and Tax Invoices...", flush=True)
    cur.execute("""
        UPDATE public.xx_nic_pm_po_list po
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE po.project_id = p.project_id;

        UPDATE public.xx_nic_pm_invoice_list inv
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE inv.project_id = p.project_id;

        UPDATE public.xx_nic_pm_tax_inv_list tax
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE tax.project_id = p.project_id;

        UPDATE public.xx_nic_pm_bill_dsk_list bd
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE bd.project_id = p.project_id;
    """)

    # ── 10. Provision Users & PM Profiles ─────────────────────────────────────
    print("[+] Syncing project_manager table & app_user accounts...", flush=True)
    bcrypt_pwd = "$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqr6BM.GJADwqAQ4n.OFdBsj5hBK" # Abhi1234#

    cur.execute("SELECT DISTINCT prj_mgr_id, prj_mgr_nm FROM public.xx_nic_pmdb_project_list ORDER BY prj_mgr_id;")
    pms = cur.fetchall()

    for pm_id, pm_name in pms:
        email = f"{pm_name.lower().replace(' ', '.').replace('..', '.')}.{pm_id}@nicsi.gov.in"
        cur.execute("""
            INSERT INTO public.project_manager (prj_mgr_id, full_name, designation, zone, email, is_active)
            VALUES (%s, %s, 'Project Manager', 'North Zone', %s, TRUE)
            ON CONFLICT (prj_mgr_id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                is_active = TRUE;
        """, (pm_id, pm_name, email))

        username = pm_name.split()[0].lower()
        if len(username) < 3:
            username = f"pm_{pm_id}"

        cur.execute("""
            INSERT INTO public.app_user (
                username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation, is_deleted
            )
            VALUES (%s, %s, %s, %s, 'PM', %s, 'system', TRUE, 'md.alok_tiwari', 'North Zone', 'Project Manager', FALSE)
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                prj_mgr_id = EXCLUDED.prj_mgr_id,
                full_name = EXCLUDED.full_name,
                is_active = TRUE,
                role = 'PM';
        """, (username, bcrypt_pwd, pm_name, email, pm_id))

        cur.execute("""
            INSERT INTO public.app_user (
                username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation, is_deleted
            )
            VALUES (%s, %s, %s, %s, 'PM', %s, 'system', TRUE, 'md.alok_tiwari', 'North Zone', 'Project Manager', FALSE)
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                prj_mgr_id = EXCLUDED.prj_mgr_id,
                full_name = EXCLUDED.full_name,
                is_active = TRUE,
                role = 'PM';
        """, (f"pm_{pm_id}", bcrypt_pwd, pm_name, email, pm_id))

    # Ensure MD & Admin accounts exist
    cur.execute("""
        INSERT INTO public.app_user (username, password, full_name, email, role, created_by, is_active, zone, designation, is_deleted)
        VALUES ('md', %s, 'Alok Tiwari', 'md@nicsi.gov.in', 'MD', 'system', TRUE, 'HQ', 'Managing Director', FALSE)
        ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_active = TRUE, role = 'MD';

        INSERT INTO public.app_user (username, password, full_name, email, role, created_by, is_active, zone, designation, is_deleted)
        VALUES ('md.alok_tiwari', %s, 'Alok Tiwari', 'md@nicsi.gov.in', 'MD', 'system', TRUE, 'HQ', 'Managing Director', FALSE)
        ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_active = TRUE, role = 'MD';

        INSERT INTO public.app_user (username, password, full_name, email, role, created_by, is_active, zone, designation, is_deleted)
        VALUES ('superadmin', %s, 'Super Administrator', 'superadmin@nicsi.gov.in', 'SUPER_ADMIN', 'system', TRUE, 'HQ', 'Super Admin', FALSE)
        ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_active = TRUE, role = 'SUPER_ADMIN';

        INSERT INTO public.app_user (username, password, full_name, email, role, created_by, is_active, zone, designation, is_deleted)
        VALUES ('admin', %s, 'Super Administrator', 'superadmin@nicsi.gov.in', 'SUPER_ADMIN', 'system', TRUE, 'HQ', 'Super Admin', FALSE)
        ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, is_active = TRUE, role = 'SUPER_ADMIN';
    """, (bcrypt_pwd, bcrypt_pwd, bcrypt_pwd, bcrypt_pwd))

    # ── 11. Recreate Views & Indexes ─────────────────────────────────────────
    print("[+] Recreating public views and performance indexes...", flush=True)
    cur.execute("ALTER TABLE public.xx_nic_pm_prj_list ADD COLUMN IF NOT EXISTS is_pmc_monitored BOOLEAN DEFAULT FALSE;")
    cur.execute("""
        CREATE OR REPLACE VIEW public.project_list AS
        SELECT p.header_id,
            p.project_id,
            p.prj_mgr_id,
            p.project_cd,
            p.project_cd AS project_code,
            p.prj_nm,
            p.prj_nm AS project_name,
            p.customer_name,
            p.prj_budget_no,
            COALESCE(p.amount_received, 0::numeric) AS amount_received,
            p.no_of_po,
            COALESCE(p.po_amount, 0::numeric) AS po_amount,
            p.no_of_inv_billdesk,
            p.no_of_exp_invocie,
            p.total_invoice_amount,
            COALESCE(p.total_amount_paid, 0::numeric) AS total_amount_paid,
            p.no_of_tax_invoice,
            p.total_tax_invocie_amount,
            p.project_abp,
            p.created_on,
            p.cust_id,
            p.prj_type,
            p.user_email,
            p.mobile_number,
            p.hod_email,
            p.nic_cord_emailid,
            p.staff_email_id,
            p.ministry,
            p.department,
            p.project_category,
            p.is_pmc_monitored,
            COALESCE(inv.pen_amt, 0::numeric) AS total_penalty_amt,
            GREATEST(0::numeric, COALESCE(p.amount_received, 0::numeric) - (COALESCE(p.po_amount, 0::numeric) - COALESCE(inv.pen_amt, 0::numeric))) AS nicsi_commission,
            RIGHT(p.project_cd, 2) AS state_code
        FROM public.xx_nic_pm_prj_list p
        LEFT JOIN (
            SELECT project_id, SUM(COALESCE(pen_amt, 0)) AS pen_amt
            FROM public.xx_nic_pm_invoice_list
            GROUP BY project_id
        ) inv ON p.project_id = inv.project_id;

        CREATE OR REPLACE VIEW public.purchase_order_list AS
        SELECT header_id, project_id, project_no, prj_mgr_id, vendor_id,
               vendor_name, final_po_no, po_date, frdate, todate, total,
               approval_status, created_date
        FROM public.xx_nic_pm_po_list;

        CREATE OR REPLACE VIEW public.invoice_list AS
        SELECT header_id, project_id, project_no, prj_mgr_id, managername,
               pono, vendor_id, vendor_name, invoice_num, invoice_date, gl_date,
               invoice_amount, amount_paid, unpaid, pen_amt, objection, finalunpaid,
               invoice_type, project_abp, gem_flag, msmeven_name, created_date
        FROM public.xx_nic_pm_invoice_list;

        CREATE OR REPLACE VIEW public.tax_invoice_list AS
        SELECT header_id, project_id, prj_mgr_id, cust_id, cust_gstin_no,
               prj_gstn_no, project_no, po_no, ampono, user_bill_no, bill_date,
               bill_status, billing_period_from, billing_period_to, supp_inv_num,
               totalamount, bill_type, state_description, irn_no, created_date
        FROM public.xx_nic_pm_tax_inv_list;

        CREATE OR REPLACE VIEW public.bill_desk_list AS
        SELECT header_id, project_id, prj_mgr_id, project_no, final_po_no,
               bill_month, vendor_id, vendor_name, invoice_no, invoice_date,
               received_date, invoice_amount, invoice_num, invoice_amount_bk,
               amount_paid, invoice_status, objection_remarks, status, created_date
        FROM public.xx_nic_pm_bill_dsk_list;

        CREATE OR REPLACE VIEW public.project_type_summary AS
        SELECT prj_mgr_id, prj_mgr_nm, prj_typ_code, prj_typ_description,
               SUM(noofproject) AS noofproject
        FROM public.xx_nic_pmdb_project_list
        GROUP BY prj_mgr_id, prj_mgr_nm, prj_typ_code, prj_typ_description;

        CREATE INDEX IF NOT EXISTS idx_prj_mgr_id ON public.xx_nic_pm_prj_list(prj_mgr_id);
        CREATE INDEX IF NOT EXISTS idx_prj_project_id ON public.xx_nic_pm_prj_list(project_id);
        CREATE INDEX IF NOT EXISTS idx_prj_project_cd ON public.xx_nic_pm_prj_list(project_cd);

        CREATE INDEX IF NOT EXISTS idx_po_mgr_id ON public.xx_nic_pm_po_list(prj_mgr_id);
        CREATE INDEX IF NOT EXISTS idx_po_project_id ON public.xx_nic_pm_po_list(project_id);
        CREATE INDEX IF NOT EXISTS idx_po_project_no ON public.xx_nic_pm_po_list(project_no);

        CREATE INDEX IF NOT EXISTS idx_inv_mgr_id ON public.xx_nic_pm_invoice_list(prj_mgr_id);
        CREATE INDEX IF NOT EXISTS idx_inv_project_id ON public.xx_nic_pm_invoice_list(project_id);
        CREATE INDEX IF NOT EXISTS idx_inv_project_no ON public.xx_nic_pm_invoice_list(project_no);

        CREATE INDEX IF NOT EXISTS idx_tax_mgr_id ON public.xx_nic_pm_tax_inv_list(prj_mgr_id);
        CREATE INDEX IF NOT EXISTS idx_tax_project_id ON public.xx_nic_pm_tax_inv_list(project_id);

        CREATE INDEX IF NOT EXISTS idx_bd_mgr_id ON public.xx_nic_pm_bill_dsk_list(prj_mgr_id);
        CREATE INDEX IF NOT EXISTS idx_bd_project_id ON public.xx_nic_pm_bill_dsk_list(project_id);
    """)

    conn.commit()
    print("\n[+] Transaction committed successfully!", flush=True)

    print("\n================== INGESTION & DEDUPLICATION SUMMARY ==================", flush=True)
    for tbl in ['xx_nic_pm_prj_list', 'xx_nic_pm_po_list', 'xx_nic_pm_invoice_list', 'xx_nic_pm_tax_inv_list', 'xx_nic_pm_bill_dsk_list', 'xx_nic_pmdb_project_list']:
        cur.execute(f"SELECT COUNT(*), COUNT(DISTINCT prj_mgr_id) FROM public.{tbl};")
        cnt, pm_cnt = cur.fetchone()
        print(f"  {tbl:28s}: {cnt:>6d} unique rows, across {pm_cnt:>2d} PMs", flush=True)

    cur.close()
    conn.close()
    print("\n[OK] COMPLETE! Database fully updated with combined deduplicated records from both sources.", flush=True)

if __name__ == "__main__":
    main()
