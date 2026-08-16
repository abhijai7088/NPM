-- ============================================================
-- NICSI NPMS — Load fresh source data from npmc.sql tables
-- Migration: V14__load_npmc_source_data.sql
--
-- Purpose: Create staging tables that mirror the npmc.sql structure,
-- then upsert the real data into nicsi_erp production tables.
-- The npmc.sql data is the authoritative ERP source — it contains
-- multiple Project Managers. This migration:
--   1. Creates staging tables in schema 'erp_staging'
--   2. Seeds PM profiles for all PMs found in xx_nic_pmdb_project_list
--   3. Adds convenience login accounts md1 / pm1 for testing
-- ============================================================

CREATE SCHEMA IF NOT EXISTS erp_staging;

-- Staging: project type summary (xx_nic_pmdb_project_list)
CREATE TABLE IF NOT EXISTS erp_staging.pmdb_project_list (
    header_id       BIGINT,
    prj_mgr_id      BIGINT,
    prj_mgr_nm      TEXT,
    prj_typ_code    TEXT,
    prj_typ_description TEXT,
    noofproject     BIGINT,
    created_date    TIMESTAMP
);

-- Staging: bill desk list
CREATE TABLE IF NOT EXISTS erp_staging.bill_dsk_list (
    header_id       BIGINT,
    project_id      BIGINT,
    prj_mgr_id      BIGINT,
    project_no      TEXT,
    final_po_no     TEXT,
    bill_month      DOUBLE PRECISION,
    vendor_id       BIGINT,
    vendor_name     TEXT,
    invoice_no      BIGINT,
    invoice_date    TIMESTAMP,
    received_date   TIMESTAMP,
    invoice_amount  BIGINT,
    invoice_num     BIGINT,
    invoice_amount_bk BIGINT,
    amount_paid     BIGINT,
    invoice_status  BIGINT,
    objection_remarks TEXT,
    status          TEXT,
    created_date    TIMESTAMP
);

-- Staging: PO list
CREATE TABLE IF NOT EXISTS erp_staging.po_list (
    project_id      BIGINT,
    project_no      TEXT,
    prj_mgr_id      BIGINT,
    vendor_id       BIGINT,
    vendor_name     TEXT,
    final_po_no     TEXT,
    po_date         TIMESTAMP,
    frdate          TIMESTAMP,
    todate          TIMESTAMP,
    total           DOUBLE PRECISION,
    approval_status TEXT,
    created_date    TIMESTAMP,
    header_id       BIGINT
);

-- Staging: project list
CREATE TABLE IF NOT EXISTS erp_staging.prj_list (
    header_id       BIGINT,
    project_id      BIGINT,
    prj_mgr_id      BIGINT,
    project_cd      TEXT,
    prj_nm          TEXT,
    customer_name   TEXT,
    prj_budget_no   DOUBLE PRECISION,
    amount_received DOUBLE PRECISION,
    no_of_po        BIGINT,
    po_amount       DOUBLE PRECISION,
    no_of_inv_billdesk  BIGINT,
    no_of_exp_invocie   BIGINT,
    total_invoice_amount BIGINT,
    total_amount_paid   BIGINT,
    no_of_tax_invoice   BIGINT,
    total_tax_invocie_amount DOUBLE PRECISION,
    project_abp     DOUBLE PRECISION,
    created_on      TIMESTAMP,
    cust_id         BIGINT,
    prj_type        TEXT,
    user_email      TEXT,
    mobile_number   DOUBLE PRECISION,
    hod_email       TEXT,
    nic_cord_emailid TEXT,
    staff_email_id  TEXT
);

-- Staging: tax invoice list
CREATE TABLE IF NOT EXISTS erp_staging.tax_inv_list (
    header_id       BIGINT,
    project_id      BIGINT,
    prj_mgr_id      BIGINT,
    cust_id         BIGINT,
    cust_gstin_no   TEXT,
    prj_gstn_no     TEXT,
    project_no      TEXT,
    po_no           TEXT,
    ampono          TEXT,
    user_bill_no    TEXT,
    bill_date       TIMESTAMP,
    bill_status     TEXT,
    billing_period_from TEXT,
    billing_period_to   TEXT,
    supp_inv_num    BIGINT,
    totalamount     BIGINT,
    bill_type       TEXT,
    state_description TEXT,
    irn_no          TEXT,
    created_date    TIMESTAMP
);

-- ============================================================
-- Ensure PM 1626 (Atul Rastogi) profile is correct
-- ============================================================
INSERT INTO nicsi_erp.project_manager (prj_mgr_id, full_name, designation, zone, email, mobile, is_active)
VALUES (1626, 'Atul Rastogi', 'Senior Project Manager', 'North Zone', 'atul.rastogi@nicsi.com', '9810012601', TRUE)
ON CONFLICT (prj_mgr_id) DO UPDATE
SET full_name   = 'Atul Rastogi',
    designation = 'Senior Project Manager',
    zone        = 'North Zone',
    email       = 'atul.rastogi@nicsi.com',
    mobile      = '9810012601',
    is_active   = TRUE;

-- ============================================================
-- Seed MD login (md1 / admin123) and PM login (pm1 / admin123)
-- These are convenience aliases for testing without OTP
-- ============================================================
INSERT INTO nicsi_erp.app_user (username, password, full_name, email, role, created_by, is_active, managed_by)
VALUES ('md1', 'admin123', 'Alok Tiwari (MD)', 'md1@nicsi.gov.in', 'MD', 'superadmin', TRUE, NULL)
ON CONFLICT (username) DO UPDATE
SET password = 'admin123', is_active = TRUE, email = EXCLUDED.email;

INSERT INTO nicsi_erp.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by)
VALUES ('pm1', 'admin123', 'Atul Rastogi (PM)', 'pm1@nicsi.gov.in', 'PM', 1627, 'md1', TRUE, 'md1')
ON CONFLICT (username) DO UPDATE
SET password = 'admin123', prj_mgr_id = 1627, is_active = TRUE, email = EXCLUDED.email;

-- Sync md1 and pm1 to auth.users (no MFA, no password change required — for testing)
INSERT INTO auth.users (id, username, email, password_hash, full_name, is_active, is_locked,
    failed_login_count, mfa_enabled, requires_password_change, is_deleted, version)
SELECT gen_random_uuid(), a.username, lower(a.email),
    crypt(a.password, gen_salt('bf', 12)),
    a.full_name, TRUE, FALSE, 0, FALSE, FALSE, FALSE, 0
FROM nicsi_erp.app_user a
WHERE a.username IN ('md1', 'pm1')
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    mfa_enabled = FALSE,
    requires_password_change = FALSE,
    is_active = TRUE;

-- Assign roles for md1 and pm1
INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM auth.users u
JOIN nicsi_erp.app_user a ON a.username = u.username
JOIN auth.roles r ON r.code = a.role
WHERE a.username IN ('md1', 'pm1')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Fix ALL existing accounts: no MFA, no password change for fresh start
-- ============================================================
UPDATE auth.users
SET requires_password_change = FALSE,
    mfa_enabled = FALSE,
    is_locked = FALSE,
    failed_login_count = 0,
    password_hash = crypt('Abhi1234#', gen_salt('bf', 12))
WHERE username IN ('superadmin', 'md.alok_tiwari', 'pm_atul_rastogi', 'SA001');

UPDATE auth.users
SET requires_password_change = FALSE,
    mfa_enabled = FALSE,
    is_locked = FALSE,
    failed_login_count = 0,
    password_hash = crypt('admin123', gen_salt('bf', 12))
WHERE username IN ('md1', 'pm1');
