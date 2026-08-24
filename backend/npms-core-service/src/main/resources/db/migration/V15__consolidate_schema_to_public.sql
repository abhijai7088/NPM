-- ============================================================
-- NICSI NPMS Migration: V15__consolidate_schema_to_public.sql
-- Consolidates all tables & views under single 'public' schema
-- Creates compatibility views in 'nicsi_erp' for seamless operation
-- ============================================================

-- 1. Ensure all core tables exist in public schema
CREATE TABLE IF NOT EXISTS public.app_user (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    email VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    prj_mgr_id BIGINT,
    created_by VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    managed_by VARCHAR(100),
    zone VARCHAR(100),
    designation VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.project_manager (
    prj_mgr_id BIGINT PRIMARY KEY,
    full_name VARCHAR(255),
    designation VARCHAR(255),
    zone VARCHAR(100),
    email VARCHAR(255),
    mobile VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    username VARCHAR(100),
    user_role VARCHAR(50),
    action VARCHAR(255),
    details TEXT,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Copy existing users from nicsi_erp.app_user if table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'nicsi_erp' AND table_name = 'app_user'
    ) THEN
        INSERT INTO public.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation)
        SELECT username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation
        FROM nicsi_erp.app_user
        ON CONFLICT (username) DO UPDATE SET
            password = EXCLUDED.password,
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            prj_mgr_id = EXCLUDED.prj_mgr_id,
            is_active = EXCLUDED.is_active,
            managed_by = EXCLUDED.managed_by;
    END IF;
END $$;

-- Ensure default users exist with correct prj_mgr_id 1626 for PM
INSERT INTO public.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation)
VALUES
    ('superadmin', '$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S', 'Super Administrator', 'superadmin@nicsi.gov.in', 'SUPER_ADMIN', NULL, 'system', TRUE, NULL, 'North Zone', 'Administrator'),
    ('md.alok_tiwari', '$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S', 'Alok Tiwari', 'md.nicsi@gov.in', 'MD', NULL, 'superadmin', TRUE, NULL, 'North Zone', 'Managing Director'),
    ('pm_atul_rastogi', '$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S', 'Atul Rastogi', 'atul.rastogi@nicsi.gov.in', 'PM', 1626, 'md.alok_tiwari', TRUE, 'md.alok_tiwari', 'North Zone', 'Senior Project Manager')
ON CONFLICT (username) DO UPDATE SET
    prj_mgr_id = EXCLUDED.prj_mgr_id,
    role = EXCLUDED.role,
    managed_by = EXCLUDED.managed_by;

-- Ensure PM 1626 profile exists in project_manager
INSERT INTO public.project_manager (prj_mgr_id, full_name, designation, zone, email, mobile, is_active)
VALUES (1626, 'Atul Rastogi', 'Senior Project Manager', 'North Zone', 'atul.rastogi@nicsi.gov.in', '9810012601', TRUE)
ON CONFLICT (prj_mgr_id) DO UPDATE SET
    full_name = 'Atul Rastogi',
    email = 'atul.rastogi@nicsi.gov.in',
    is_active = TRUE;

-- 2. Drop legacy npms schema if exists
DROP SCHEMA IF EXISTS npms CASCADE;

-- 3. Re-create standard views over public.xx_nic_pm_* tables in public schema
DROP VIEW IF EXISTS public.project_list CASCADE;
DROP VIEW IF EXISTS public.purchase_order_list CASCADE;
DROP VIEW IF EXISTS public.tax_invoice_list CASCADE;
DROP VIEW IF EXISTS public.bill_desk_list CASCADE;
DROP VIEW IF EXISTS public.project_type_summary CASCADE;
DROP VIEW IF EXISTS public.invoice_list CASCADE;

CREATE OR REPLACE VIEW public.project_list AS
SELECT 
    p.header_id,
    p.project_id,
    p.prj_mgr_id,
    p.project_cd,
    p.project_cd AS project_code,
    p.prj_nm,
    p.prj_nm AS project_name,
    p.customer_name,
    p.prj_budget_no,
    COALESCE(p.amount_received, 0) AS amount_received,
    p.no_of_po,
    COALESCE(p.po_amount, 0) AS po_amount,
    p.no_of_inv_billdesk,
    p.no_of_exp_invocie,
    p.total_invoice_amount,
    COALESCE(p.total_amount_paid, 0) AS total_amount_paid,
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
    NULL::text AS ministry,
    NULL::text AS department,
    COALESCE(pmdb.prj_typ_description, p.prj_type, 'General Service') AS project_category,
    COALESCE(inv.pen_amt, 0) AS total_penalty_amt,
    GREATEST(0, COALESCE(p.amount_received, 0) - (COALESCE(p.po_amount, 0) - COALESCE(inv.pen_amt, 0))) AS nicsi_commission,
    RIGHT(p.project_cd, 2) AS state_code
FROM public.xx_nic_pm_prj_list p
LEFT JOIN (
    SELECT project_id, SUM(pen_amt) AS pen_amt 
    FROM public.xx_nic_pm_invoice_list 
    GROUP BY project_id
) inv ON p.project_id = inv.project_id
LEFT JOIN (
    SELECT DISTINCT prj_mgr_id, prj_typ_code, prj_typ_description 
    FROM public.xx_nic_pmdb_project_list
) pmdb ON (p.prj_mgr_id = pmdb.prj_mgr_id AND p.prj_type = pmdb.prj_typ_code);

CREATE OR REPLACE VIEW public.purchase_order_list AS
SELECT * FROM public.xx_nic_pm_po_list;

CREATE OR REPLACE VIEW public.tax_invoice_list AS
SELECT * FROM public.xx_nic_pm_tax_inv_list;

CREATE OR REPLACE VIEW public.bill_desk_list AS
SELECT * FROM public.xx_nic_pm_bill_dsk_list;

CREATE OR REPLACE VIEW public.project_type_summary AS
SELECT * FROM public.xx_nic_pmdb_project_list;

CREATE OR REPLACE VIEW public.invoice_list AS
SELECT * FROM public.xx_nic_pm_invoice_list;

-- 4. Create compatibility views in nicsi_erp schema pointing to public schema
CREATE SCHEMA IF NOT EXISTS nicsi_erp;

DO $$
BEGIN
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.app_user CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.app_user CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.project_manager CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.project_manager CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.project_list CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.project_list CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.purchase_order_list CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.purchase_order_list CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.tax_invoice_list CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.tax_invoice_list CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.bill_desk_list CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.bill_desk_list CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.project_type_summary CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.project_type_summary CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.invoice_list CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.invoice_list CASCADE';
    EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.customer_master_list CASCADE';
    EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.customer_master_list CASCADE';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE OR REPLACE VIEW nicsi_erp.app_user AS SELECT * FROM public.app_user;
CREATE OR REPLACE VIEW nicsi_erp.project_manager AS SELECT * FROM public.project_manager;
CREATE OR REPLACE VIEW nicsi_erp.project_list AS SELECT * FROM public.project_list;
CREATE OR REPLACE VIEW nicsi_erp.purchase_order_list AS SELECT * FROM public.purchase_order_list;
CREATE OR REPLACE VIEW nicsi_erp.tax_invoice_list AS SELECT * FROM public.tax_invoice_list;
CREATE OR REPLACE VIEW nicsi_erp.bill_desk_list AS SELECT * FROM public.bill_desk_list;
CREATE OR REPLACE VIEW nicsi_erp.project_type_summary AS SELECT * FROM public.project_type_summary;
CREATE OR REPLACE VIEW nicsi_erp.invoice_list AS SELECT * FROM public.invoice_list;

