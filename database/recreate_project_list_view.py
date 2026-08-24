import os
import psycopg2

db_host = os.environ.get("DB_HOST", "localhost")
db_port = os.environ.get("DB_PORT", "5433")
db_name = os.environ.get("DB_NAME", "npms_db")
db_user = os.environ.get("DB_USER", "npms_user")
db_pass = os.environ.get("DB_PASSWORD", "npms_local_pass_2026")
conn = psycopg2.connect(
    host=db_host,
    port=db_port,
    dbname=db_name,
    user=db_user,
    password=db_pass
)
cur = conn.cursor()

cur.execute("ALTER TABLE public.xx_nic_pm_prj_list ADD COLUMN IF NOT EXISTS is_pmc_monitored BOOLEAN DEFAULT FALSE;")
cur.execute("DROP VIEW IF EXISTS public.project_list CASCADE;")
cur.execute("""
CREATE VIEW public.project_list AS
 SELECT p.header_id,
    p.project_id,
    p.prj_mgr_id,
    p.project_cd,
    p.project_cd AS project_code,
    p.prj_nm,
    p.prj_nm AS project_name,
    p.customer_name,
    p.prj_budget_no,
    COALESCE(p.amount_received, (0)::double precision) AS amount_received,
    p.no_of_po,
    COALESCE(p.po_amount, (0)::double precision) AS po_amount,
    p.no_of_inv_billdesk,
    p.no_of_exp_invocie,
    p.total_invoice_amount,
    COALESCE(p.total_amount_paid, (0)::bigint) AS total_amount_paid,
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
    COALESCE(inv.pen_amt, (0)::numeric) AS total_penalty_amt,
    GREATEST((0)::double precision, (COALESCE(p.amount_received, (0)::double precision) - (COALESCE(p.po_amount, (0)::double precision) - (COALESCE(inv.pen_amt, (0)::numeric))::double precision))) AS nicsi_commission,
    "right"(p.project_cd, 2) AS state_code
   FROM (public.xx_nic_pm_prj_list p
     LEFT JOIN ( SELECT xx_nic_pm_invoice_list.project_id,
            sum(xx_nic_pm_invoice_list.pen_amt) AS pen_amt
           FROM public.xx_nic_pm_invoice_list
          GROUP BY xx_nic_pm_invoice_list.project_id) inv ON ((p.project_id = inv.project_id)));
""")

# Also update ingest_all_databases.py view creation step
conn.commit()
print("View public.project_list successfully recreated with all columns & is_pmc_monitored!")
cur.close()
conn.close()
