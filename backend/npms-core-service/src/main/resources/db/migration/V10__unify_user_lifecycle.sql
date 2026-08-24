-- ============================================================
-- NICSI NPMS — Unify admin provisioning with authentication
-- Migration: V10__unify_user_lifecycle.sql
--
-- auth.users is the authoritative identity store. nicsi_erp.app_user
-- keeps NPMS-specific hierarchy and Project Manager metadata.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'nicsi_erp' AND tablename = 'app_user'
    ) THEN
        ALTER TABLE nicsi_erp.app_user ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_user'
    ) THEN
        ALTER TABLE public.app_user ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- MD and PM are first-class authentication roles, not aliases for unrelated roles.
INSERT INTO auth.roles (id, code, name, description) VALUES
    (gen_random_uuid(), 'MD', 'Managing Director', 'Organisation-wide project oversight and Project Manager provisioning'),
    (gen_random_uuid(), 'PM', 'Project Manager', 'Project Manager portfolio access')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;


-- Managing Directors can oversee business data and provision PM accounts.
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth.roles r
JOIN auth.permissions p ON p.code IN (
    'USER_MANAGE', 'MASTER_MANAGE', 'PROJECT_CREATE', 'PROJECT_VIEW', 'PROJECT_APPROVE',
    'PO_CREATE', 'PO_VIEW', 'PO_APPROVE', 'INVOICE_CREATE', 'INVOICE_VIEW',
    'INVOICE_APPROVE', 'PAYMENT_INITIATE', 'AUDIT_VIEW', 'DASHBOARD_VIEW'
)
WHERE r.code = 'MD'
ON CONFLICT DO NOTHING;

-- Project Managers receive operational access without user/role administration.
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth.roles r
JOIN auth.permissions p ON p.code IN (
    'PROJECT_CREATE', 'PROJECT_VIEW', 'PO_CREATE', 'PO_VIEW',
    'INVOICE_CREATE', 'INVOICE_VIEW', 'PAYMENT_INITIATE', 'DASHBOARD_VIEW'
)
WHERE r.code = 'PM'
ON CONFLICT DO NOTHING;

CREATE SCHEMA IF NOT EXISTS notification;
CREATE TABLE IF NOT EXISTS notification.notifications (
    id UUID PRIMARY KEY,
    user_id UUID
);

DELETE FROM notification.notifications n

USING auth.users u, nicsi_erp.app_user a
WHERE n.user_id = u.id
  AND u.username = a.username
  AND COALESCE(a.is_deleted, FALSE) = TRUE;

DELETE FROM auth.users u
USING nicsi_erp.app_user a
WHERE u.username = a.username
  AND COALESCE(a.is_deleted, FALSE) = TRUE;

DELETE FROM nicsi_erp.app_user
WHERE COALESCE(is_deleted, FALSE) = TRUE;

-- Existing active MD/PM rows from older installations are promoted into the
-- authoritative auth store with a BCrypt hash and mandatory first-login change.
INSERT INTO auth.users (
    id, username, email, password_hash, full_name, is_active, is_locked,
    failed_login_count, mfa_enabled, requires_password_change, is_deleted, version
)
SELECT
    gen_random_uuid(), a.username,
    CASE 
        WHEN EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email) AND u.username != a.username)
             OR COUNT(*) OVER (PARTITION BY lower(a.email)) > 1
        THEN lower(a.username) || '@nicsi.gov.in'
        ELSE lower(COALESCE(a.email, a.username || '@nicsi.gov.in'))
    END,
    CASE WHEN a.password LIKE '$2%' THEN a.password ELSE crypt(a.password, gen_salt('bf', 12)) END,
    a.full_name, COALESCE(a.is_active, TRUE), FALSE, 0, TRUE, TRUE, FALSE, 0
FROM nicsi_erp.app_user a
WHERE a.role IN ('MD', 'PM')
  AND COALESCE(a.is_deleted, FALSE) = FALSE
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    is_active = EXCLUDED.is_active,
    is_locked = FALSE,
    failed_login_count = 0,
    requires_password_change = TRUE,
    is_deleted = FALSE;

-- Ensure every synchronized account has exactly its NPMS role assignment.
DELETE FROM auth.user_roles ur
USING auth.users u, nicsi_erp.app_user a
WHERE ur.user_id = u.id
  AND a.username = u.username
  AND a.role IN ('MD', 'PM');

INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM auth.users u
JOIN nicsi_erp.app_user a ON a.username = u.username
JOIN auth.roles r ON r.code = a.role
WHERE a.role IN ('MD', 'PM')
ON CONFLICT DO NOTHING;

-- app_user passwords are retained only for schema compatibility; never leave
-- newly migrated installations with plaintext copies.
UPDATE nicsi_erp.app_user
SET password = crypt(password, gen_salt('bf', 12))
WHERE password NOT LIKE '$2%';
