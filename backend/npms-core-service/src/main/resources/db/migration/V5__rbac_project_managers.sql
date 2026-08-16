-- ============================================================
-- NICSI NPMS — RBAC: Project Manager master + zonal distribution
-- Migration: V5__rbac_project_managers.sql
--
-- The sample ERP export contains a single PM (1626, Atul Rastogi).
-- For a realistic MD-over-PMs oversight model, we introduce zonal
-- Project Managers and re-assign each record to a PM based on the
-- 2-letter state code embedded at the END of the project code
-- (e.g. S242317ZO'WB' -> WB -> East Zone).
-- ============================================================

SET search_path = nicsi_erp;

-- ── Project Manager master table ──────────────────────────────
CREATE TABLE IF NOT EXISTS project_manager (
    prj_mgr_id   BIGINT PRIMARY KEY,
    full_name    TEXT NOT NULL,
    designation  TEXT,
    zone         TEXT,
    email        TEXT,
    mobile       TEXT,
    is_active    BOOLEAN DEFAULT TRUE
);

INSERT INTO project_manager (prj_mgr_id, full_name, designation, zone, email, mobile, is_active) VALUES
    (1626, 'Atul Rastogi',    'Senior Project Manager', 'North Zone', 'atul.rastogi@nicsi.com',    '9810012601', TRUE),
    (2001, 'Rajib Sengupta',  'Project Manager',        'East Zone',  'rajib.sengupta@nicsi.com',  '9830020012', TRUE),
    (2002, 'Priya Deshmukh',  'Project Manager',        'West Zone',  'priya.deshmukh@nicsi.com',  '9820030023', TRUE),
    (2003, 'Karthik Menon',   'Project Manager',        'South Zone', 'karthik.menon@nicsi.com',   '9840040034', TRUE)
ON CONFLICT (prj_mgr_id) DO NOTHING;

-- ── Zone → PM resolver ────────────────────────────────────────
-- North (1626): DL, ND, HR, HP, PB, UK, UP, JK, CH
-- East  (2001): WB, ML, TR, JH, MN, AS, OR, BR
-- West  (2002): MH, MP, GJ, RJ
-- South (2003): AP, TS, KL, KA, TN
CREATE OR REPLACE FUNCTION nicsi_erp.resolve_pm_by_code(code TEXT)
RETURNS BIGINT AS $$
DECLARE
    st TEXT;
BEGIN
    IF code IS NULL OR length(code) < 2 THEN
        RETURN 1626;
    END IF;
    st := upper(right(code, 2));
    IF st IN ('WB','ML','TR','JH','MN','AS','OR','BR') THEN
        RETURN 2001;
    ELSIF st IN ('MH','MP','GJ','RJ') THEN
        RETURN 2002;
    ELSIF st IN ('AP','TS','KL','KA','TN') THEN
        RETURN 2003;
    ELSE
        RETURN 1626; -- North / national / default
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Re-assign prj_mgr_id across all transactional tables ──────
UPDATE project_list        SET prj_mgr_id = nicsi_erp.resolve_pm_by_code(project_cd);
UPDATE purchase_order_list SET prj_mgr_id = nicsi_erp.resolve_pm_by_code(project_no);
UPDATE bill_desk_list      SET prj_mgr_id = nicsi_erp.resolve_pm_by_code(project_no);
UPDATE tax_invoice_list    SET prj_mgr_id = nicsi_erp.resolve_pm_by_code(project_no);

-- Helpful indexes for PM-scoped queries
CREATE INDEX IF NOT EXISTS idx_project_list_pm        ON project_list(prj_mgr_id);
CREATE INDEX IF NOT EXISTS idx_po_list_pm             ON purchase_order_list(prj_mgr_id);
CREATE INDEX IF NOT EXISTS idx_bill_desk_pm           ON bill_desk_list(prj_mgr_id);
CREATE INDEX IF NOT EXISTS idx_tax_inv_pm             ON tax_invoice_list(prj_mgr_id);
