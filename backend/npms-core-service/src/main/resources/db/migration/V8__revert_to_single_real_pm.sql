-- ============================================================
-- NICSI NPMS — Revert to the single real Project Manager
-- Migration: V8__revert_to_single_real_pm.sql
--
-- The source ERP export (all 5 Excel views) contains exactly ONE
-- Project Manager: ID 1626, "Atul Rastogi". V5 had fabricated three
-- additional zonal PMs and synthetically split the data across them
-- for a demo. This migration reverts that — all records are restored
-- to the single real PM, and the fabricated PM profiles are removed.
-- ============================================================

SET search_path = nicsi_erp;

-- 1. Restore every transactional record to the real PM (1626)
UPDATE project_list        SET prj_mgr_id = 1626;
UPDATE purchase_order_list SET prj_mgr_id = 1626;
UPDATE bill_desk_list      SET prj_mgr_id = 1626;
UPDATE tax_invoice_list    SET prj_mgr_id = 1626;

-- 2. Remove any PM login accounts that were linked to fabricated profiles
DELETE FROM app_user
 WHERE role = 'PM' AND prj_mgr_id IN (2001, 2002, 2003);

-- 3. Remove the fabricated PM profiles, keeping only the real one
DELETE FROM project_manager WHERE prj_mgr_id IN (2001, 2002, 2003);

-- 4. Ensure the real PM profile is accurate
UPDATE project_manager
   SET full_name   = 'Atul Rastogi',
       designation = 'Senior Project Manager',
       zone        = 'North Zone',
       email       = 'atul.rastogi@nicsi.com',
       mobile      = '9810012601',
       is_active   = TRUE
 WHERE prj_mgr_id = 1626;

-- 4a. Safety net: insert the real profile if it is somehow missing
INSERT INTO project_manager (prj_mgr_id, full_name, designation, zone, email, mobile, is_active)
VALUES (1626, 'Atul Rastogi', 'Senior Project Manager', 'North Zone', 'atul.rastogi@nicsi.com', '9810012601', TRUE)
ON CONFLICT (prj_mgr_id) DO NOTHING;

-- 5. Drop the now-unused zone resolver from V5
DROP FUNCTION IF EXISTS nicsi_erp.resolve_pm_by_code(TEXT);
