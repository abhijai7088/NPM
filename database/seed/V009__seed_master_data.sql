-- Requires pgcrypto for BCrypt password hashing (Spring BCryptPasswordEncoder compatible)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Roles (RBAC) ─────────────────────────────────────────────────────────────
INSERT INTO auth.roles (code, name, description) VALUES
('SUPER_ADMIN','Super Administrator','Full system access'),
('MD','Managing Director','Organisation-wide project oversight and Project Manager provisioning'),
('PM','Project Manager','Project Manager portfolio access'),
('MINISTRY_ADMIN','Ministry Administrator','Full ministry access'),
('PROJECT_OFFICER','Project Officer','Project management'),
('FINANCE_OFFICER','Finance Officer','Financial operations'),
('AUDITOR','Auditor','Read-only audit access'),
('VIEWER','Viewer','Read-only dashboard')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- ─── Permissions (fine-grained RBAC) ──────────────────────────────────────────
INSERT INTO auth.permissions (code, name, module) VALUES
('USER_MANAGE','Manage users','ADMIN'),
('ROLE_MANAGE','Manage roles','ADMIN'),
('MASTER_MANAGE','Manage master data','MASTER'),
('PROJECT_CREATE','Create projects','PROJECT'),
('PROJECT_VIEW','View projects','PROJECT'),
('PROJECT_APPROVE','Approve projects','PROJECT'),
('PO_CREATE','Create purchase orders','PO'),
('PO_VIEW','View purchase orders','PO'),
('PO_APPROVE','Approve purchase orders','PO'),
('INVOICE_CREATE','Create invoices','INVOICE'),
('INVOICE_VIEW','View invoices','INVOICE'),
('INVOICE_APPROVE','Approve invoices','INVOICE'),
('PAYMENT_INITIATE','Initiate payments','PAYMENT'),
('AUDIT_VIEW','View audit logs','AUDIT'),
('DASHBOARD_VIEW','View dashboard','DASHBOARD')
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN gets every permission
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth.roles r
CROSS JOIN auth.permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- ─── Master data ──────────────────────────────────────────────────────────────
INSERT INTO master.ministries (code, name) VALUES
('MOF','Ministry of Finance'),
('MORT','Ministry of Road Transport'),
('MOR','Ministry of Railways'),
('MOH','Ministry of Health'),
('MOE','Ministry of Education')
ON CONFLICT (code) DO NOTHING;

INSERT INTO master.departments (ministry_id, code, name)
SELECT id,'MOFT1','Budget Division' FROM master.ministries WHERE code='MOF'
UNION ALL
SELECT id,'MOFT2','Revenue Division' FROM master.ministries WHERE code='MOF'
UNION ALL
SELECT id,'MORTT1','National Highways' FROM master.ministries WHERE code='MORT'
UNION ALL
SELECT id,'MORTT2','State Highways' FROM master.ministries WHERE code='MORT'
UNION ALL
SELECT id,'MORT1','Zone North' FROM master.ministries WHERE code='MOR'
ON CONFLICT (code) DO NOTHING;

INSERT INTO master.states (code, name) VALUES
('AN', 'Andaman and Nicobar Islands'), ('AP', 'Andhra Pradesh'), ('AR', 'Arunachal Pradesh'), ('AS', 'Assam'), 
('BR', 'Bihar'), ('CH', 'Chandigarh'), ('CT', 'Chhattisgarh'), ('DN', 'Dadra and Nagar Haveli and Daman and Diu'), 
('DL', 'Delhi'), ('GA', 'Goa'), ('GJ', 'Gujarat'), ('HR', 'Haryana'), ('HP', 'Himachal Pradesh'), 
('JK', 'Jammu and Kashmir'), ('JH', 'Jharkhand'), ('KA', 'Karnataka'), ('KL', 'Kerala'), ('LA', 'Ladakh'), 
('LD', 'Lakshadweep'), ('MP', 'Madhya Pradesh'), ('MH', 'Maharashtra'), ('MN', 'Manipur'), ('ML', 'Meghalaya'), 
('MZ', 'Mizoram'), ('NL', 'Nagaland'), ('OR', 'Odisha'), ('PY', 'Puducherry'), ('PB', 'Punjab'), 
('RJ', 'Rajasthan'), ('SK', 'Sikkim'), ('TN', 'Tamil Nadu'), ('TG', 'Telangana'), ('TR', 'Tripura'), 
('UP', 'Uttar Pradesh'), ('UT', 'Uttarakhand'), ('WB', 'West Bengal')
ON CONFLICT (code) DO NOTHING;

INSERT INTO master.project_categories (code, name) VALUES
('ROAD','Road Infrastructure'),
('RAIL','Railway Infrastructure'),
('HEALTH','Healthcare'),
('EDUC','Education'),
('WATER','Water & Sanitation')
ON CONFLICT (code) DO NOTHING;

INSERT INTO master.financial_codes (code, description) VALUES
('CAP-01','Capital Expenditure - Infrastructure'),
('REV-01','Revenue Expenditure - Operations'),
('CAP-02','Capital Expenditure - Equipment')
ON CONFLICT (code) DO NOTHING;

-- ─── Default SUPER_ADMIN user (password: Abhi1234#) ───────────────────────────
INSERT INTO auth.users (username, email, password_hash, full_name, is_active, is_locked, failed_login_count, mfa_enabled)
VALUES ('superadmin','sixer3080@gmail.com',
        crypt('Abhi1234#', gen_salt('bf', 12)),
        'System Administrator', true, false, 0, true)
ON CONFLICT (username) DO UPDATE
    SET email = 'sixer3080@gmail.com',
        password_hash = crypt('Abhi1234#', gen_salt('bf', 12)),
        is_active = true,
        is_locked = false,
        failed_login_count = 0,
        mfa_enabled = true;

INSERT INTO auth.user_roles (user_id, role_id)
SELECT u.id, r.id FROM auth.users u, auth.roles r
WHERE u.username='superadmin' AND r.code='SUPER_ADMIN'
ON CONFLICT DO NOTHING;
