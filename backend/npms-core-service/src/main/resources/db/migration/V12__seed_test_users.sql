-- ============================================================
-- NICSI NPMS — Seed Test Users and Emails
-- Migration: V12__seed_test_users.sql
-- ============================================================

CREATE SCHEMA IF NOT EXISTS nicsi_erp;

CREATE TABLE IF NOT EXISTS nicsi_erp.app_user (
    username      VARCHAR(80) PRIMARY KEY,
    password      VARCHAR(255) NOT NULL,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL,
    prj_mgr_id    BIGINT,
    designation   TEXT,
    zone          TEXT,
    created_by    VARCHAR(80),
    is_active     BOOLEAN DEFAULT TRUE,
    managed_by    VARCHAR(80),
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Insert MDs
INSERT INTO nicsi_erp.app_user (username, password, full_name, email, role, created_by, is_active, managed_by)
VALUES 
    ('md.alok_tiwari', 'Abhi1234#', 'Alok Tiwari', 'amanchoor0@gmail.com', 'MD', 'superadmin', TRUE, NULL),
    ('md1', 'admin123', 'Alok Tiwari (MD)', 'md1@nicsi.gov.in', 'MD', 'superadmin', TRUE, NULL)
ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password;

-- Insert PMs (linked to prj_mgr_id 1626 for Atul Rastogi, 1627 for test PM)
INSERT INTO nicsi_erp.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by)
VALUES 
    ('pm_atul_rastogi', 'Abhi1234#', 'Atul Rastogi', 'satyamjai7088@gmail.com', 'PM', 1626, 'md.alok_tiwari', TRUE, 'md.alok_tiwari'),
    ('pm1', 'admin123', 'Atul Rastogi (PM)', 'pm1@nicsi.gov.in', 'PM', 1627, 'md.alok_tiwari', TRUE, 'md.alok_tiwari')
ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, prj_mgr_id = EXCLUDED.prj_mgr_id;

-- Update Superadmin email
UPDATE nicsi_erp.app_user SET email = 'sixer3080@gmail.com' WHERE username = 'superadmin';

-- Now sync to auth.users for all accounts
INSERT INTO auth.users (id, username, email, password_hash, full_name, is_active, is_locked, failed_login_count, mfa_enabled, requires_password_change, is_deleted, version)
SELECT
    gen_random_uuid(), a.username, lower(a.email),
    crypt(a.password, gen_salt('bf', 12)),
    a.full_name, COALESCE(a.is_active, TRUE), FALSE, 0, FALSE, FALSE, FALSE, 0
FROM nicsi_erp.app_user a
WHERE a.username IN ('md.alok_tiwari', 'md1', 'pm_atul_rastogi', 'pm1')
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    mfa_enabled = FALSE,
    requires_password_change = FALSE;

-- Ensure roles in auth
INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM auth.users u
JOIN nicsi_erp.app_user a ON a.username = u.username
JOIN auth.roles r ON r.code = a.role
WHERE a.username IN ('md.alok_tiwari', 'md1', 'pm_atul_rastogi', 'pm1')
ON CONFLICT DO NOTHING;

-- Also update superadmin email and mfa in auth.users
UPDATE auth.users 
SET email = 'sixer3080@gmail.com', mfa_enabled = FALSE, requires_password_change = FALSE, password_hash = crypt('Abhi1234#', gen_salt('bf', 12)) 
WHERE username = 'superadmin';
