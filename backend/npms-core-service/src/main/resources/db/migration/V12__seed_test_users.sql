-- ============================================================
-- NICSI NPMS — Seed Test Users and Emails
-- Migration: V12__seed_test_users.sql
-- ============================================================

CREATE SCHEMA IF NOT EXISTS nicsi_erp;

-- Ensure public.app_user exists
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

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'nicsi_erp' AND tablename = 'app_user'
    ) THEN
        INSERT INTO nicsi_erp.app_user (username, password, full_name, email, role, created_by, is_active, managed_by)
        VALUES 
            ('md.alok_tiwari', 'Abhi1234#', 'Alok Tiwari', 'amanchoor0@gmail.com', 'MD', 'superadmin', TRUE, NULL),
            ('md1', 'admin123', 'Alok Tiwari (MD)', 'md1@nicsi.gov.in', 'MD', 'superadmin', TRUE, NULL)
        ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password;

        INSERT INTO nicsi_erp.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by)
        VALUES 
            ('pm_atul_rastogi', 'Abhi1234#', 'Atul Rastogi', 'satyamjai7088@gmail.com', 'PM', 1626, 'md.alok_tiwari', TRUE, 'md.alok_tiwari'),
            ('pm1', 'admin123', 'Atul Rastogi (PM)', 'pm1@nicsi.gov.in', 'PM', 1627, 'md.alok_tiwari', TRUE, 'md.alok_tiwari')
        ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, prj_mgr_id = EXCLUDED.prj_mgr_id;

        UPDATE nicsi_erp.app_user SET email = 'sixer3080@gmail.com' WHERE username = 'superadmin';
    END IF;

    -- Always insert into public.app_user
    INSERT INTO public.app_user (username, password, full_name, email, role, created_by, is_active, managed_by)
    VALUES 
        ('md.alok_tiwari', 'Abhi1234#', 'Alok Tiwari', 'amanchoor0@gmail.com', 'MD', 'superadmin', TRUE, NULL),
        ('md1', 'admin123', 'Alok Tiwari (MD)', 'md1@nicsi.gov.in', 'MD', 'superadmin', TRUE, NULL)
    ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password;

    INSERT INTO public.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by)
    VALUES 
        ('pm_atul_rastogi', 'Abhi1234#', 'Atul Rastogi', 'satyamjai7088@gmail.com', 'PM', 1626, 'md.alok_tiwari', TRUE, 'md.alok_tiwari'),
        ('pm1', 'admin123', 'Atul Rastogi (PM)', 'pm1@nicsi.gov.in', 'PM', 1627, 'md.alok_tiwari', TRUE, 'md.alok_tiwari')
    ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, prj_mgr_id = EXCLUDED.prj_mgr_id;

    UPDATE public.app_user SET email = 'sixer3080@gmail.com' WHERE username = 'superadmin';
END $$;

-- Now sync to auth.users for all accounts
INSERT INTO auth.users (id, username, email, password_hash, full_name, is_active, is_locked, failed_login_count, mfa_enabled, requires_password_change, is_deleted, version)
SELECT
    gen_random_uuid(), a.username,
    CASE 
        WHEN EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email) AND u.username != a.username)
        THEN lower(a.username) || '@nicsi.gov.in'
        ELSE lower(COALESCE(a.email, a.username || '@nicsi.gov.in'))
    END,
    crypt(a.password, gen_salt('bf', 12)),
    a.full_name, COALESCE(a.is_active, TRUE), FALSE, 0, FALSE, FALSE, FALSE, 0
FROM public.app_user a
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
JOIN public.app_user a ON a.username = u.username
JOIN auth.roles r ON r.code = a.role
WHERE a.username IN ('md.alok_tiwari', 'md1', 'pm_atul_rastogi', 'pm1')
ON CONFLICT DO NOTHING;

-- Also update superadmin email and mfa in auth.users
UPDATE auth.users 
SET email = 'sixer3080@gmail.com', mfa_enabled = FALSE, requires_password_change = FALSE, password_hash = crypt('Abhi1234#', gen_salt('bf', 12)) 
WHERE username = 'superadmin';
