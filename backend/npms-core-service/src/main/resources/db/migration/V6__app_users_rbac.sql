-- ============================================================
-- NICSI NPMS — Application Users (RBAC provisioning hierarchy)
-- Migration: V6__app_users_rbac.sql
--
-- Government access model:
--   1. Only the SUPER_ADMIN is bootstrapped into the system.
--   2. The Super Admin provisions the Managing Director (MD).
--   3. The MD provisions Project Managers (PM), each linked to a
--      zonal project_manager profile that owns the project data.
-- ============================================================

SET search_path = nicsi_erp;

CREATE TABLE IF NOT EXISTS app_user (
    username      VARCHAR(80) PRIMARY KEY,
    password      VARCHAR(255) NOT NULL,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL,          -- SUPER_ADMIN | MD | PM
    prj_mgr_id    BIGINT,                         -- set only for PM; links to project_manager
    designation   TEXT,
    zone          TEXT,
    created_by    VARCHAR(80),                    -- username of the provisioning officer
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_user_role       ON app_user(role);
CREATE INDEX IF NOT EXISTS idx_app_user_created_by ON app_user(created_by);

-- Bootstrap the single Super Admin account. Everything else is
-- created through the application by the Super Admin / MD.
INSERT INTO app_user (username, password, full_name, email, role, designation, created_by, is_active)
VALUES ('superadmin', 'Admin@1234!', 'System Administrator', 'sysadmin@nic.in',
        'SUPER_ADMIN', 'NIC System Administrator', 'SYSTEM', TRUE)
ON CONFLICT (username) DO NOTHING;
