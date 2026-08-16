-- ============================================================
-- NICSI NPMS — Complete Fix: Auth credentials & data seed
-- Run via: docker exec -i npms_postgres psql -U npms_user -d npms_db
-- ============================================================

-- ============================================================
-- STEP 1: Reset all account credentials to known passwords
-- ============================================================
UPDATE auth.users
SET 
    password_hash = crypt('Abhi1234#', gen_salt('bf', 12)),
    requires_password_change = FALSE,
    mfa_enabled = FALSE,
    is_active = TRUE,
    is_locked = FALSE,
    failed_login_count = 0
WHERE username IN ('superadmin', 'md.alok_tiwari', 'pm_atul_rastogi');

-- Fix SA001 too
UPDATE auth.users
SET 
    password_hash = crypt('Abhi1234#', gen_salt('bf', 12)),
    requires_password_change = FALSE,
    mfa_enabled = FALSE,
    is_active = TRUE,
    is_locked = FALSE,
    failed_login_count = 0
WHERE username = 'SA001';

-- ============================================================
-- STEP 2: Ensure project_manager profile for 1626 is correct
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
-- STEP 3: Ensure PM user is linked correctly to prj_mgr_id 1626
-- ============================================================
UPDATE nicsi_erp.app_user
SET prj_mgr_id = 1626,
    full_name  = 'Atul Rastogi',
    email      = 'satyamjai7088@gmail.com',
    password   = 'Abhi1234#',
    is_active  = TRUE
WHERE username = 'pm_atul_rastogi';

-- ============================================================
-- STEP 4: Ensure all data rows belong to prj_mgr_id 1626
-- ============================================================
UPDATE nicsi_erp.project_list        SET prj_mgr_id = 1626 WHERE prj_mgr_id IS NULL OR prj_mgr_id = 0;
UPDATE nicsi_erp.purchase_order_list SET prj_mgr_id = 1626 WHERE prj_mgr_id IS NULL OR prj_mgr_id = 0;
UPDATE nicsi_erp.bill_desk_list      SET prj_mgr_id = 1626 WHERE prj_mgr_id IS NULL OR prj_mgr_id = 0;
UPDATE nicsi_erp.tax_invoice_list    SET prj_mgr_id = 1626 WHERE prj_mgr_id IS NULL OR prj_mgr_id = 0;

-- ============================================================
-- STEP 5: Verify - print summary
-- ============================================================
SELECT 'auth.users' as tbl, username, email, requires_password_change, mfa_enabled, is_active,
       (password_hash = crypt('Abhi1234#', password_hash)) as password_matches
FROM auth.users
WHERE username IN ('superadmin', 'md.alok_tiwari', 'pm_atul_rastogi')
ORDER BY username;

SELECT 'app_user' as tbl, username, role, prj_mgr_id, is_active
FROM nicsi_erp.app_user ORDER BY role;

SELECT 'data counts' as tbl,
    (SELECT COUNT(*) FROM nicsi_erp.project_list WHERE prj_mgr_id=1626) as projects,
    (SELECT COUNT(*) FROM nicsi_erp.purchase_order_list WHERE prj_mgr_id=1626) as pos,
    (SELECT COUNT(*) FROM nicsi_erp.bill_desk_list WHERE prj_mgr_id=1626) as bills,
    (SELECT COUNT(*) FROM nicsi_erp.tax_invoice_list WHERE prj_mgr_id=1626) as tax_invoices;
