#!/usr/bin/env python3
"""
NICSI NPMS Universal Data Ingestion & Schema Consolidation Script
================================================================
This script unifies the database under the 'public' schema and ingests data from either:
 1. A PostgreSQL .sql file (e.g. npmc.sql) containing xx_nic_pm_* tables/inserts.
 2. The 6 Oracle ERP Excel files:
    - XX_NIC_PM_PRJ_LIST.xlsx
    - XX_NIC_PM_PO_LIST.xlsx
    - XX_NIC_PM_TAX_INV_LIST.xlsx
    - XX_NIC_PM_BILL_DSK_LIST.xlsx
    - XX_NIC_PMDB_PROJECT_LIST.xlsx
    - APPS.XX_NIC_PM_INVOICE_LIST.xlsx

It preserves existing app_user credentials, creates/refreshes base tables and views in 'public',
drops redundant schemas ('nicsi_erp', 'npms'), and auto-provisions project_manager profiles.
"""

import os
import sys
import argparse
import psycopg2
import pandas as pd
import math
import re
import json
import io

DEFAULT_DOCS_DIR = r"c:\knowledge\Confidential\NICSI\docs"

EXCEL_MAP = {
    'xx_nic_pm_prj_list': 'XX_NIC_PM_PRJ_LIST.xlsx',
    'xx_nic_pm_po_list': 'XX_NIC_PM_PO_LIST.xlsx',
    'xx_nic_pm_tax_inv_list': 'XX_NIC_PM_TAX_INV_LIST.xlsx',
    'xx_nic_pm_bill_dsk_list': 'XX_NIC_PM_BILL_DSK_LIST.xlsx',
    'xx_nic_pmdb_project_list': 'XX_NIC_PMDB_PROJECT_LIST.xlsx',
    'xx_nic_pm_invoice_list': 'APPS.XX_NIC_PM_INVOICE_LIST.xlsx'
}

DEFAULT_USERS = [
    {
        "username": "superadmin",
        "password": "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S",
        "full_name": "Super Administrator",
        "email": "superadmin@nicsi.gov.in",
        "role": "SUPER_ADMIN",
        "is_active": True,
        "managed_by": None
    },
    {
        "username": "admin",
        "password": "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S",
        "full_name": "Super Administrator",
        "email": "superadmin@nicsi.gov.in",
        "role": "SUPER_ADMIN",
        "is_active": True,
        "managed_by": None
    },
    {
        "username": "md.alok_tiwari",
        "password": "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S",
        "full_name": "Alok Tiwari",
        "email": "md.nicsi@gov.in",
        "role": "MD",
        "is_active": True,
        "managed_by": None
    },
    {
        "username": "md",
        "password": "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S",
        "full_name": "Alok Tiwari",
        "email": "md.nicsi@gov.in",
        "role": "MD",
        "is_active": True,
        "managed_by": None
    },
    {
        "username": "pm_atul_rastogi",
        "password": "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S",
        "full_name": "Atul Rastogi",
        "email": "atul.rastogi@nicsi.gov.in",
        "role": "PM",
        "prj_mgr_id": 1626,
        "is_active": True,
        "managed_by": "md.alok_tiwari",
        "zone": "North Zone",
        "designation": "Senior Project Manager"
    },
    {
        "username": "atul",
        "password": "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S",
        "full_name": "Atul Rastogi",
        "email": "atul.rastogi@nicsi.gov.in",
        "role": "PM",
        "prj_mgr_id": 1626,
        "is_active": True,
        "managed_by": "md.alok_tiwari",
        "zone": "North Zone",
        "designation": "Senior Project Manager"
    }
]

def format_val(val):
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    if isinstance(val, pd.Timestamp):
        return val.strftime('%Y-%m-%d %H:%M:%S')
    return str(val).strip()

def connect_db(args):
    ports_to_try = [args.port] if args.port else [5432, 5433]
    users_to_try = [args.user] if args.user else ['postgres', 'npms_user']
    passwords_to_try = [args.password] if args.password else ['postgres', 'npms_local_pass_2026']

    for port in ports_to_try:
        for user in users_to_try:
            for pwd in passwords_to_try:
                try:
                    conn = psycopg2.connect(
                        host=args.host,
                        port=port,
                        dbname=args.dbname,
                        user=user,
                        password=pwd,
                        connect_timeout=3
                    )
                    print(f"[+] Connected to Postgres on host={args.host}, port={port}, user={user}, db={args.dbname}")
                    return conn
                except Exception:
                    continue
    raise Exception("Could not connect to PostgreSQL. Please verify host, port, credentials.")

def backup_existing_users(conn):
    cur = conn.cursor()
    backed_up_users = []
    for schema in ['public', 'nicsi_erp', 'npms']:
        try:
            cur.execute(f"SELECT username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation FROM {schema}.app_user;")
            cols = [d[0] for d in cur.description]
            for row in cur.fetchall():
                u_dict = dict(zip(cols, row))
                backed_up_users.append(u_dict)
                print(f"   [Backup User] Found user: {u_dict['username']} ({u_dict['role']})")
        except Exception:
            conn.rollback()
    return backed_up_users

def setup_public_schema(conn, users_to_restore):
    cur = conn.cursor()
    print("[+] Creating & ensuring core tables and schemas (public, auth, master, audit, notification)...")

    cur.execute("""
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS master;
    CREATE SCHEMA IF NOT EXISTS audit;
    CREATE SCHEMA IF NOT EXISTS notification;

    -- ── Auth schema tables ──
    CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        mobile VARCHAR(15),
        department_id UUID,
        ministry_id UUID,
        is_active BOOLEAN DEFAULT true,
        is_locked BOOLEAN DEFAULT false,
        failed_login_count INT DEFAULT 0,
        last_login_at TIMESTAMPTZ,
        locked_until TIMESTAMPTZ,
        mfa_enabled BOOLEAN DEFAULT false,
        mfa_secret VARCHAR(255),
        requires_password_change BOOLEAN DEFAULT false NOT NULL,
        is_deleted BOOLEAN DEFAULT false NOT NULL,
        version BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID
    );

    CREATE TABLE IF NOT EXISTS auth.roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth.permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        module VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth.role_permissions (
        role_id UUID REFERENCES auth.roles(id) ON DELETE CASCADE,
        permission_id UUID REFERENCES auth.permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS auth.user_roles (
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        role_id UUID REFERENCES auth.roles(id) ON DELETE CASCADE,
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        granted_by UUID,
        PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        ip_address INET,
        user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS auth.password_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        is_used BOOLEAN DEFAULT false,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Seed Auth Roles
    INSERT INTO auth.roles (code, name, description) VALUES
    ('SUPER_ADMIN','Super Administrator','Full system access'),
    ('MD','Managing Director','Organisation-wide project oversight and Project Manager provisioning'),
    ('PM','Project Manager','Project Manager portfolio access'),
    ('PMC','Project Monitoring Cell','HQ project governance and SLA oversight'),
    ('OA','Operational Assistant','Operational assistant for tasks and follow-up'),
    ('MINISTRY_ADMIN','Ministry Administrator','Full ministry access'),
    ('PROJECT_OFFICER','Project Officer','Project management'),
    ('FINANCE_OFFICER','Finance Officer','Financial operations'),
    ('AUDITOR','Auditor','Read-only audit access'),
    ('VIEWER','Viewer','Read-only dashboard')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

    -- Seed Auth Permissions
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

    INSERT INTO auth.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM auth.roles r
    CROSS JOIN auth.permissions p
    WHERE r.code = 'SUPER_ADMIN'
    ON CONFLICT DO NOTHING;

    INSERT INTO auth.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM auth.roles r
    JOIN auth.permissions p ON p.code IN (
        'USER_MANAGE', 'MASTER_MANAGE', 'PROJECT_CREATE', 'PROJECT_VIEW', 'PROJECT_APPROVE',
        'PO_CREATE', 'PO_VIEW', 'PO_APPROVE', 'INVOICE_CREATE', 'INVOICE_VIEW',
        'INVOICE_APPROVE', 'PAYMENT_INITIATE', 'AUDIT_VIEW', 'DASHBOARD_VIEW'
    )
    WHERE r.code IN ('MD', 'PMC')
    ON CONFLICT DO NOTHING;

    INSERT INTO auth.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM auth.roles r
    JOIN auth.permissions p ON p.code IN (
        'PROJECT_CREATE', 'PROJECT_VIEW', 'PO_CREATE', 'PO_VIEW',
        'INVOICE_CREATE', 'INVOICE_VIEW', 'PAYMENT_INITIATE', 'DASHBOARD_VIEW'
    )
    WHERE r.code IN ('PM', 'OA')
    ON CONFLICT DO NOTHING;

    -- ── Master schema tables ──
    CREATE TABLE IF NOT EXISTS master.ministries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS master.departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ministry_id UUID REFERENCES master.ministries(id),
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS master.states (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS master.districts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        state_id UUID REFERENCES master.states(id),
        code VARCHAR(10) NOT NULL,
        name VARCHAR(100) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS master.project_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS master.financial_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) UNIQUE NOT NULL,
        description VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true
    );

    -- ── Audit tables ──
    CREATE TABLE IF NOT EXISTS audit.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        correlation_id UUID,
        user_id UUID,
        username VARCHAR(50),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id UUID,
        old_value JSONB,
        new_value JSONB,
        ip_address INET,
        user_agent TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Notification tables ──
    CREATE TABLE IF NOT EXISTS notification.notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        type VARCHAR(100),
        title VARCHAR(500),
        message TEXT,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMPTZ,
        entity_type VARCHAR(100),
        entity_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification.email_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        to_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        attempts INT DEFAULT 0,
        sent_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Public application tables ──
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

    ALTER TABLE public.app_user ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.app_user ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS public.project_manager (
        prj_mgr_id BIGINT PRIMARY KEY,
        full_name VARCHAR(255),
        designation VARCHAR(255),
        zone VARCHAR(100),
        email VARCHAR(255),
        mobile VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public.audit_log (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        username VARCHAR(100),
        user_role VARCHAR(50),
        action VARCHAR(255),
        details TEXT,
        ip_address VARCHAR(50),
        timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Workflow & Governance tables ──
    CREATE TABLE IF NOT EXISTS public.project_lifecycle (
        id                   BIGSERIAL PRIMARY KEY,
        header_id            BIGINT NOT NULL UNIQUE,
        current_stage        VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        assigned_pm_id       BIGINT,
        assigned_oa_username VARCHAR(50),
        sla_deadline         TIMESTAMPTZ,
        hold_reason          TEXT,
        notes                TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.lifecycle_transition (
        id              BIGSERIAL PRIMARY KEY,
        header_id       BIGINT NOT NULL,
        from_stage      VARCHAR(30),
        to_stage        VARCHAR(30) NOT NULL,
        performed_by    VARCHAR(50) NOT NULL,
        acting_as       VARCHAR(50),
        remarks         TEXT NOT NULL,
        evidence_url    TEXT,
        transition_type VARCHAR(20) NOT NULL DEFAULT 'FORWARD',
        transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE SEQUENCE IF NOT EXISTS public.ticket_code_seq START 1;

    CREATE TABLE IF NOT EXISTS public.project_ticket (
        id                  BIGSERIAL PRIMARY KEY,
        header_id           BIGINT NOT NULL,
        ticket_code         VARCHAR(30) NOT NULL UNIQUE
                            DEFAULT ('TKT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('public.ticket_code_seq')::TEXT, 6, '0')),
        title               VARCHAR(500) NOT NULL,
        description         TEXT,
        ticket_type         VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
        priority            VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
        status              VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        created_by          VARCHAR(50) NOT NULL,
        assigned_to         VARCHAR(50),
        reviewed_by         VARCHAR(50),
        escalated_to        VARCHAR(50),
        sla_hours           INT NOT NULL DEFAULT 48,
        sla_deadline        TIMESTAMPTZ,
        resolved_at         TIMESTAMPTZ,
        closed_at           TIMESTAMPTZ,
        reopen_reason       TEXT,
        stage_ref           VARCHAR(30),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.ticket_event (
        id              BIGSERIAL PRIMARY KEY,
        ticket_id       BIGINT NOT NULL REFERENCES public.project_ticket(id) ON DELETE CASCADE,
        event_type      VARCHAR(30) NOT NULL,
        from_status     VARCHAR(20),
        to_status       VARCHAR(20),
        performed_by    VARCHAR(50) NOT NULL,
        acting_as       VARCHAR(50),
        remarks         TEXT,
        evidence_url    TEXT,
        event_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.xx_nic_pm_bill_dsk_list (
        header_id bigint PRIMARY KEY,
        project_id bigint,
        prj_mgr_id bigint,
        project_no text,
        final_po_no text,
        bill_month double precision,
        vendor_id bigint,
        vendor_name text,
        invoice_no text,
        invoice_date timestamp without time zone,
        received_date timestamp without time zone,
        invoice_amount bigint,
        invoice_num bigint,
        invoice_amount_bk bigint,
        amount_paid bigint,
        invoice_status bigint,
        objection_remarks text,
        status text,
        created_date timestamp without time zone
    );

    CREATE TABLE IF NOT EXISTS public.xx_nic_pm_invoice_list (
        header_id bigint PRIMARY KEY,
        project_id bigint,
        project_no text,
        prj_mgr_id bigint,
        managername text,
        pono text,
        vendor_id bigint,
        vendor_name text,
        invoice_num bigint,
        invoice_date timestamp without time zone,
        gl_date timestamp without time zone,
        invoice_amount bigint,
        amount_paid bigint,
        unpaid bigint,
        pen_amt bigint,
        objection double precision,
        finalunpaid bigint,
        invoice_type text,
        project_abp double precision,
        gem_flag double precision,
        msmeven_name double precision,
        created_date timestamp without time zone
    );

    CREATE TABLE IF NOT EXISTS public.xx_nic_pm_po_list (
        header_id bigint PRIMARY KEY,
        project_id bigint,
        project_no text,
        prj_mgr_id bigint,
        vendor_id bigint,
        vendor_name text,
        final_po_no text,
        po_date timestamp without time zone,
        frdate timestamp without time zone,
        todate timestamp without time zone,
        total double precision,
        approval_status text,
        created_date timestamp without time zone
    );

    CREATE TABLE IF NOT EXISTS public.xx_nic_pm_prj_list (
        header_id bigint PRIMARY KEY,
        project_id bigint,
        prj_mgr_id bigint,
        project_cd text,
        prj_nm text,
        customer_name text,
        prj_budget_no double precision,
        amount_received double precision,
        no_of_po bigint,
        po_amount double precision,
        no_of_inv_billdesk bigint,
        no_of_exp_invocie bigint,
        total_invoice_amount bigint,
        total_amount_paid bigint,
        no_of_tax_invoice bigint,
        total_tax_invocie_amount double precision,
        project_abp double precision,
        created_on timestamp without time zone,
        cust_id bigint,
        prj_type text,
        user_email text,
        mobile_number double precision,
        hod_email text,
        nic_cord_emailid text,
        staff_email_id text
    );

    CREATE TABLE IF NOT EXISTS public.xx_nic_pm_tax_inv_list (
        header_id bigint PRIMARY KEY,
        project_id bigint,
        prj_mgr_id bigint,
        cust_id bigint,
        cust_gstin_no text,
        prj_gstn_no text,
        project_no text,
        po_no text,
        ampono text,
        user_bill_no text,
        bill_date timestamp without time zone,
        bill_status text,
        billing_period_from text,
        billing_period_to text,
        supp_inv_num bigint,
        totalamount bigint,
        bill_type text,
        state_description text,
        irn_no text,
        created_date timestamp without time zone
    );

    CREATE TABLE IF NOT EXISTS public.xx_nic_pmdb_project_list (
        header_id bigint PRIMARY KEY,
        prj_mgr_id bigint,
        prj_mgr_nm text,
        prj_typ_code text,
        prj_typ_description text,
        noofproject bigint,
        created_date timestamp without time zone
    );
    """)
    conn.commit()

    # Restore users
    all_users = {u['username']: u for u in DEFAULT_USERS}
    for u in users_to_restore:
        if u.get('username'):
            all_users[u['username']] = u

    print(f"[+] Restoring {len(all_users)} user accounts into public.app_user and auth.users...")
    seen_emails = {}
    for u in all_users.values():
        username = u.get('username')
        raw_pwd = u.get('password', 'Abhi1234#')
        # If password is raw, let's keep bcrypt hash
        if raw_pwd.startswith('$2'):
            pwd_hash = raw_pwd
        else:
            cur.execute("SELECT crypt(%s, gen_salt('bf', 12));", (raw_pwd,))
            pwd_hash = cur.fetchone()[0]

        full_name = u.get('full_name', username)
        email = u.get('email') or f"{username}@nicsi.gov.in"
        if email in seen_emails and seen_emails[email] != username:
            email = f"{username}@nicsi.gov.in"
        seen_emails[email] = username

        role = u.get('role', 'PM')
        prj_mgr_id = u.get('prj_mgr_id')
        managed_by = u.get('managed_by')
        zone = u.get('zone', 'North Zone')
        designation = u.get('designation', 'Project Manager')

        cur.execute("""
        INSERT INTO public.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation, is_deleted)
        VALUES (%s, %s, %s, %s, %s, %s, 'system', TRUE, %s, %s, %s, FALSE)
        ON CONFLICT (username) DO UPDATE SET
            password = EXCLUDED.password,
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            prj_mgr_id = EXCLUDED.prj_mgr_id,
            is_active = TRUE,
            managed_by = EXCLUDED.managed_by;
        """, (username, pwd_hash, full_name, email, role, prj_mgr_id, managed_by, zone, designation))

        # Insert/Sync to auth.users
        cur.execute("""
        INSERT INTO auth.users (id, username, email, password_hash, full_name, is_active, is_locked, failed_login_count, mfa_enabled, requires_password_change, is_deleted, version)
        VALUES (gen_random_uuid(), %s, %s, %s, %s, TRUE, FALSE, 0, FALSE, FALSE, FALSE, 1)
        ON CONFLICT (username) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            is_active = TRUE,
            is_locked = FALSE,
            failed_login_count = 0,
            mfa_enabled = FALSE,
            requires_password_change = FALSE;
        """, (username, email, pwd_hash, full_name))

        # Ensure role assignment in auth.user_roles
        cur.execute("""
        INSERT INTO auth.user_roles (user_id, role_id)
        SELECT u.id, r.id
        FROM auth.users u
        CROSS JOIN auth.roles r
        WHERE u.username = %s AND r.code = %s
        ON CONFLICT DO NOTHING;
        """, (username, role))
    conn.commit()

def ingest_sql_file(conn, sql_path):
    print(f"[+] Ingesting data from SQL file: {sql_path} ...")
    cur = conn.cursor()
    with open(sql_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    in_copy = False
    tbl_name = ""
    cols = []
    copy_lines = []

    for line in lines:
        if line.startswith("COPY public."):
            m = re.match(r"COPY public\.(\w+)\s*\((.*?)\)\s*FROM stdin;", line)
            if m:
                tbl_name = m.group(1)
                cols = [c.strip() for c in m.group(2).split(',')]
                in_copy = True
                copy_lines = []
                cur.execute(f"TRUNCATE TABLE public.{tbl_name} CASCADE;")
                print(f"   [Loading COPY] public.{tbl_name}...")
                continue
        if in_copy:
            if line.strip() == r"\.":
                in_copy = False
                query = f"COPY public.{tbl_name} ({', '.join(cols)}) FROM STDIN WITH (FORMAT text, NULL '\\N');"
                data_io = io.StringIO("".join(copy_lines))
                cur.copy_expert(query, data_io)
                conn.commit()
                print(f"   [Done] Table public.{tbl_name} loaded ({len(copy_lines)} rows).")
                copy_lines = []
            else:
                copy_lines.append(line)

    print("[+] SQL Ingestion completed successfully.")

def ingest_excel_files(conn, docs_dir):
    print(f"[+] Ingesting data from Excel files in: {docs_dir} ...")
    cur = conn.cursor()

    for table_name, excel_name in EXCEL_MAP.items():
        file_path = os.path.join(docs_dir, excel_name)
        if not os.path.exists(file_path):
            print(f"[-] Warning: Excel file not found: {file_path}")
            continue

        print(f"   [Reading] {excel_name} -> public.{table_name}...")
        df = pd.read_excel(file_path)
        if df.empty:
            continue

        df.columns = [c.lower() for c in df.columns]
        cur.execute(f"TRUNCATE TABLE public.{table_name} CASCADE;")
        
        cols = list(df.columns)
        placeholders = ", ".join(["%s"] * len(cols))
        col_names = ", ".join(cols)
        query = f"INSERT INTO public.{table_name} ({col_names}) VALUES ({placeholders});"

        rows_to_insert = []
        for _, row in df.iterrows():
            vals = [format_val(row[c]) for c in cols]
            rows_to_insert.append(vals)

        cur.executemany(query, rows_to_insert)
        conn.commit()
        print(f"   [Done] Inserted {len(rows_to_insert)} rows into public.{table_name}")

def sync_views_and_profiles(conn):
    cur = conn.cursor()
    print("[+] Re-creating application Views and PM profiles in 'public' schema...")

    cur.execute("""
    DROP VIEW IF EXISTS public.project_list CASCADE;
    DROP VIEW IF EXISTS public.purchase_order_list CASCADE;
    DROP VIEW IF EXISTS public.tax_invoice_list CASCADE;
    DROP VIEW IF EXISTS public.bill_desk_list CASCADE;
    DROP VIEW IF EXISTS public.project_type_summary CASCADE;
    DROP VIEW IF EXISTS public.invoice_list CASCADE;
    """)

    cur.execute("""
    CREATE OR REPLACE VIEW public.project_list AS
    SELECT 
        p.header_id,
        p.project_id,
        p.prj_mgr_id,
        p.project_cd,
        p.project_cd AS project_code,
        p.prj_nm,
        p.prj_nm AS project_name,
        p.customer_name,
        p.prj_budget_no,
        COALESCE(p.amount_received, 0) AS amount_received,
        p.no_of_po,
        COALESCE(p.po_amount, 0) AS po_amount,
        p.no_of_inv_billdesk,
        p.no_of_exp_invocie,
        p.total_invoice_amount,
        COALESCE(p.total_amount_paid, 0) AS total_amount_paid,
        p.no_of_tax_invoice,
        p.total_tax_invocie_amount,
        p.project_abp,
        p.created_on,
        p.cust_id,
        p.prj_type,
        p.user_email,
        p.mobile_number,
        p.hod_email,
        p.nic_cord_emailid,
        p.nic_cord_emailid AS nic_coord_email,
        p.staff_email_id,
        NULL::text AS ministry,
        NULL::text AS department,
        COALESCE(pmdb.prj_typ_description, p.prj_type, 'General Service') AS project_category,
        COALESCE(inv.pen_amt, 0) AS total_penalty_amt,
        GREATEST(0, COALESCE(p.amount_received, 0) - (COALESCE(p.po_amount, 0) - COALESCE(inv.pen_amt, 0))) AS nicsi_commission,
        RIGHT(p.project_cd, 2) AS state_code
    FROM public.xx_nic_pm_prj_list p
    LEFT JOIN (
        SELECT project_id, SUM(pen_amt) AS pen_amt 
        FROM public.xx_nic_pm_invoice_list 
        GROUP BY project_id
    ) inv ON p.project_id = inv.project_id
    LEFT JOIN (
        SELECT DISTINCT prj_mgr_id, prj_typ_code, prj_typ_description
        FROM public.xx_nic_pmdb_project_list
    ) pmdb ON p.prj_mgr_id = pmdb.prj_mgr_id AND p.prj_type = pmdb.prj_typ_code;

    CREATE OR REPLACE VIEW public.purchase_order_list AS
    SELECT * FROM public.xx_nic_pm_po_list;

    CREATE OR REPLACE VIEW public.tax_invoice_list AS
    SELECT * FROM public.xx_nic_pm_tax_inv_list;

    CREATE OR REPLACE VIEW public.bill_desk_list AS
    SELECT * FROM public.xx_nic_pm_bill_dsk_list;

    CREATE OR REPLACE VIEW public.project_type_summary AS
    SELECT * FROM public.xx_nic_pmdb_project_list;

    CREATE OR REPLACE VIEW public.invoice_list AS
    SELECT * FROM public.xx_nic_pm_invoice_list;
    """)

    # Auto-seed project_manager table from xx_nic_pmdb_project_list and xx_nic_pm_prj_list
    cur.execute("""
    INSERT INTO public.project_manager (prj_mgr_id, full_name, designation, zone, email, mobile, is_active)
    SELECT DISTINCT
        p.prj_mgr_id,
        COALESCE(NULLIF(p.prj_mgr_nm, ''), 'Project Manager ' || p.prj_mgr_id) AS full_name,
        'Project Manager' AS designation,
        CASE 
            WHEN p.prj_mgr_id % 4 = 0 THEN 'North Zone'
            WHEN p.prj_mgr_id % 4 = 1 THEN 'South Zone'
            WHEN p.prj_mgr_id % 4 = 2 THEN 'East Zone'
            ELSE 'West Zone'
        END AS zone,
        LOWER(REPLACE(COALESCE(NULLIF(p.prj_mgr_nm, ''), 'pm_' || p.prj_mgr_id), ' ', '.')) || '@nicsi.gov.in' AS email,
        '9876543210' AS mobile,
        TRUE AS is_active
    FROM public.xx_nic_pmdb_project_list p
    WHERE p.prj_mgr_id IS NOT NULL
    ON CONFLICT (prj_mgr_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email;

    INSERT INTO public.project_manager (prj_mgr_id, full_name, designation, zone, email, mobile, is_active)
    SELECT DISTINCT
        p.prj_mgr_id,
        COALESCE(SPLIT_PART(p.user_email, '@', 1), 'PM ' || p.prj_mgr_id) AS full_name,
        'Project Manager' AS designation,
        'North Zone' AS zone,
        COALESCE(p.user_email, 'pm' || p.prj_mgr_id || '@nicsi.gov.in') AS email,
        '9876543210' AS mobile,
        TRUE AS is_active
    FROM public.xx_nic_pm_prj_list p
    WHERE p.prj_mgr_id IS NOT NULL
    ON CONFLICT (prj_mgr_id) DO NOTHING;
    """)
    conn.commit()

    # Ensure projects are distributed across all PMs if concentrated in single PM
    cur.execute("SELECT COUNT(DISTINCT prj_mgr_id) FROM public.xx_nic_pm_prj_list;")
    unique_pm_count = cur.fetchone()[0]
    if unique_pm_count <= 1:
        cur.execute("SELECT prj_mgr_id FROM public.project_manager ORDER BY prj_mgr_id;")
        pm_ids = [r[0] for r in cur.fetchall()]
        if pm_ids:
            cur.execute("SELECT header_id FROM public.xx_nic_pm_prj_list ORDER BY header_id;")
            proj_headers = [r[0] for r in cur.fetchall()]
            for idx, hid in enumerate(proj_headers):
                assigned_pm = pm_ids[idx % len(pm_ids)]
                cur.execute("UPDATE public.xx_nic_pm_prj_list SET prj_mgr_id = %s WHERE header_id = %s;", (assigned_pm, hid))
            
            cur.execute("""
                UPDATE public.xx_nic_pm_po_list po SET prj_mgr_id = p.prj_mgr_id
                FROM public.xx_nic_pm_prj_list p WHERE po.project_id = p.project_id;
                UPDATE public.xx_nic_pm_invoice_list inv SET prj_mgr_id = p.prj_mgr_id
                FROM public.xx_nic_pm_prj_list p WHERE inv.project_id = p.project_id;
                UPDATE public.xx_nic_pm_bill_dsk_list bd SET prj_mgr_id = p.prj_mgr_id
                FROM public.xx_nic_pm_prj_list p WHERE bd.project_id = p.project_id;
                UPDATE public.xx_nic_pm_tax_inv_list tax SET prj_mgr_id = p.prj_mgr_id
                FROM public.xx_nic_pm_prj_list p WHERE tax.project_id = p.project_id;
            """)
            conn.commit()

    # Ensure all PMs are provisioned in app_user under MD Alok Tiwari
    pwd_hash = "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S"
    cur.execute("SELECT prj_mgr_id, full_name, email, zone, designation FROM public.project_manager;")
    all_pms = cur.fetchall()
    for pm in all_pms:
        pm_id, full_name, email, zone, desig = pm
        uname = email.split('@')[0].replace('.', '_').lower() if email else f"pm_{pm_id}"
        cur.execute("""
            INSERT INTO public.app_user (username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation, is_deleted)
            VALUES (%s, %s, %s, %s, 'PM', %s, 'system', TRUE, 'md.alok_tiwari', %s, %s, FALSE)
            ON CONFLICT (username) DO UPDATE SET
                prj_mgr_id = EXCLUDED.prj_mgr_id,
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                role = 'PM',
                is_active = TRUE,
                managed_by = 'md.alok_tiwari';
        """, (uname, pwd_hash, full_name, email, pm_id, zone, desig))
    conn.commit()

def cleanup_old_schemas(conn):
    cur = conn.cursor()
    print("[+] Creating compatibility views in 'nicsi_erp' schema pointing to 'public'...")
    cur.execute("CREATE SCHEMA IF NOT EXISTS nicsi_erp;")
    cur.execute("""
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN (
            SELECT relname, relkind 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = 'nicsi_erp'
        ) LOOP
            IF r.relkind = 'v' THEN
                EXECUTE 'DROP VIEW IF EXISTS nicsi_erp.' || quote_ident(r.relname) || ' CASCADE';
            ELSIF r.relkind = 'r' THEN
                EXECUTE 'DROP TABLE IF EXISTS nicsi_erp.' || quote_ident(r.relname) || ' CASCADE';
            END IF;
        END LOOP;
    END $$;
    """)
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.app_user AS SELECT * FROM public.app_user;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.project_manager AS SELECT * FROM public.project_manager;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.project_list AS SELECT * FROM public.project_list;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.purchase_order_list AS SELECT * FROM public.purchase_order_list;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.tax_invoice_list AS SELECT * FROM public.tax_invoice_list;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.bill_desk_list AS SELECT * FROM public.bill_desk_list;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.project_type_summary AS SELECT * FROM public.project_type_summary;")
    cur.execute("CREATE OR REPLACE VIEW nicsi_erp.invoice_list AS SELECT * FROM public.invoice_list;")
    cur.execute("DROP SCHEMA IF EXISTS npms CASCADE;")
    conn.commit()
    print("[+] Database compatibility views created and legacy schemas cleaned up.")

def main():
    parser = argparse.ArgumentParser(description="NICSI NPMS Ingestion & Schema Consolidation")
    parser.add_argument("--source", "-s", help="Path to sql file or docs directory with excels", default=DEFAULT_DOCS_DIR)
    parser.add_argument("--host", help="DB Host", default="localhost")
    parser.add_argument("--port", type=int, help="DB Port", default=None)
    parser.add_argument("--dbname", help="DB Name", default="npms_db")
    parser.add_argument("--user", help="DB User", default=None)
    parser.add_argument("--password", help="DB Password", default=None)
    args = parser.parse_args()

    conn = connect_db(args)
    users_to_restore = backup_existing_users(conn)
    setup_public_schema(conn, users_to_restore)

    source = args.source
    if os.path.isfile(source) and source.endswith('.sql'):
        ingest_sql_file(conn, source)
    elif os.path.isdir(source):
        sql_in_dir = os.path.join(source, 'npmc.sql')
        if os.path.exists(sql_in_dir):
            ingest_sql_file(conn, sql_in_dir)
        else:
            ingest_excel_files(conn, source)
    else:
        ingest_excel_files(conn, DEFAULT_DOCS_DIR)

    sync_views_and_profiles(conn)
    cleanup_old_schemas(conn)

    print("\n[OK] SUCCESS: NPMS Database successfully unified under 'public' schema!")
    conn.close()

if __name__ == '__main__':
    main()
