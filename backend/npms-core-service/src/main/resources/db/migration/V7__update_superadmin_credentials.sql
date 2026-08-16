-- ============================================================
-- NICSI NPMS — Update the Super Admin bootstrap account
-- Migration: V7__update_superadmin_credentials.sql
--
-- Sets the real Super Admin identity + credentials. Idempotent:
-- updates the existing 'superadmin' row, or inserts it if absent
-- (e.g. on a fresh database where V6 has not seeded yet).
-- ============================================================

SET search_path = nicsi_erp;

INSERT INTO app_user (username, password, full_name, email, role, designation, created_by, is_active)
VALUES ('superadmin', 'Abhi1234#', 'Pranu Kumar', 'sixer3080@gmail.com',
        'SUPER_ADMIN', 'NIC System Administrator', 'SYSTEM', TRUE)
ON CONFLICT (username) DO UPDATE
    SET password  = EXCLUDED.password,
        full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        role      = EXCLUDED.role,
        is_active = TRUE;
