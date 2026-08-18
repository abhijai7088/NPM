-- ============================================================
-- V16 — NPMS Project Lifecycle & Ticket/Work-Item Governance
-- ============================================================
-- Canonical lifecycle stages:
--   DRAFT → SANCTION → RECEIPT → PO_ISSUED → BILL_SUBMITTED
--   → APPROVAL_PENDING → PAYMENT_DONE → CLOSED
--
-- Ticket statuses:
--   OPEN → IN_PROGRESS → AWAITING_REVIEW → RESOLVED → CLOSED
--   Closed tickets may be REOPENED by MD (mandatory remarks).
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. project_lifecycle
--    One row per project. Tracks current stage and SLA.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_lifecycle (
    id                   BIGSERIAL PRIMARY KEY,
    header_id            BIGINT       NOT NULL UNIQUE,
    current_stage        VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | SANCTION | RECEIPT | PO_ISSUED | BILL_SUBMITTED
    -- APPROVAL_PENDING | PAYMENT_DONE | CLOSED
    assigned_pm_id       BIGINT,
    assigned_oa_username VARCHAR(50),
    sla_deadline         TIMESTAMPTZ,
    hold_reason          TEXT,
    notes                TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pl_header_id      ON public.project_lifecycle(header_id);
CREATE INDEX IF NOT EXISTS idx_pl_current_stage  ON public.project_lifecycle(current_stage);
CREATE INDEX IF NOT EXISTS idx_pl_pm_id          ON public.project_lifecycle(assigned_pm_id);
CREATE INDEX IF NOT EXISTS idx_pl_sla_deadline   ON public.project_lifecycle(sla_deadline);

-- ──────────────────────────────────────────────────────────
-- 2. lifecycle_transition  (immutable — no UPDATE / DELETE)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_transition (
    id              BIGSERIAL    PRIMARY KEY,
    header_id       BIGINT       NOT NULL,
    from_stage      VARCHAR(30),
    to_stage        VARCHAR(30)  NOT NULL,
    performed_by    VARCHAR(50)  NOT NULL,
    acting_as       VARCHAR(50),
    remarks         TEXT         NOT NULL,
    evidence_url    TEXT,
    transition_type VARCHAR(20)  NOT NULL DEFAULT 'FORWARD',
    -- FORWARD | REOPEN | HOLD | RELEASE | HOLD_NOTE
    transitioned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lt_header_id       ON public.lifecycle_transition(header_id);
CREATE INDEX IF NOT EXISTS idx_lt_performed_by    ON public.lifecycle_transition(performed_by);
CREATE INDEX IF NOT EXISTS idx_lt_transitioned_at ON public.lifecycle_transition(transitioned_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_lifecycle_transition_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'lifecycle_transition rows are immutable. UPDATE and DELETE are not permitted.';
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_transition_immutable ON public.lifecycle_transition;
CREATE TRIGGER lifecycle_transition_immutable
    BEFORE UPDATE OR DELETE ON public.lifecycle_transition
    FOR EACH ROW EXECUTE FUNCTION public.prevent_lifecycle_transition_modification();

-- ──────────────────────────────────────────────────────────
-- 3. project_ticket  (work-item / ticket entity)
-- ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.ticket_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.project_ticket (
    id              BIGSERIAL    PRIMARY KEY,
    header_id       BIGINT       NOT NULL,
    ticket_code     VARCHAR(30)  NOT NULL UNIQUE,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    ticket_type     VARCHAR(40)  NOT NULL DEFAULT 'PO_FOLLOW_UP',
    -- PO_FOLLOW_UP | BILL_SUBMISSION | RECEIPT_PENDING | GST_INVOICE
    -- VENDOR_REMINDER | PENALTY_WAIVER | EXPIRY_RENEWAL | COMPLIANCE_AUDIT
    -- SITE_VISIT | CLIENT_COORDINATION | INTERNAL_APPROVAL | NICSI_HOLD_RELEASE | GENERAL
    priority        VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM',
    -- LOW | MEDIUM | HIGH | CRITICAL
    status          VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    -- OPEN | IN_PROGRESS | AWAITING_REVIEW | RESOLVED | CLOSED | REOPENED
    created_by      VARCHAR(50)  NOT NULL,
    assigned_to     VARCHAR(50),
    reviewed_by     VARCHAR(50),
    escalated_to    VARCHAR(50),
    sla_hours       INT          NOT NULL DEFAULT 48,
    sla_deadline    TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    reopen_reason   TEXT,
    stage_ref       VARCHAR(30),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_header_id    ON public.project_ticket(header_id);
CREATE INDEX IF NOT EXISTS idx_pt_status       ON public.project_ticket(status);
CREATE INDEX IF NOT EXISTS idx_pt_assigned_to  ON public.project_ticket(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pt_created_by   ON public.project_ticket(created_by);
CREATE INDEX IF NOT EXISTS idx_pt_priority     ON public.project_ticket(priority);
CREATE INDEX IF NOT EXISTS idx_pt_sla_deadline ON public.project_ticket(sla_deadline);

-- ──────────────────────────────────────────────────────────
-- 4. ticket_event  (immutable — no UPDATE / DELETE)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_event (
    id           BIGSERIAL    PRIMARY KEY,
    ticket_id    BIGINT       NOT NULL REFERENCES public.project_ticket(id) ON DELETE CASCADE,
    event_type   VARCHAR(30)  NOT NULL,
    -- CREATED | ASSIGNED | STATUS_CHANGED | ESCALATED | COMMENTED
    -- REOPENED | RESOLVED | CLOSED | EVIDENCE_UPLOADED
    from_status  VARCHAR(20),
    to_status    VARCHAR(20),
    performed_by VARCHAR(50)  NOT NULL,
    acting_as    VARCHAR(50),
    remarks      TEXT,
    evidence_url TEXT,
    event_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_ticket_id    ON public.ticket_event(ticket_id);
CREATE INDEX IF NOT EXISTS idx_te_performed_by ON public.ticket_event(performed_by);
CREATE INDEX IF NOT EXISTS idx_te_event_at     ON public.ticket_event(event_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_ticket_event_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'ticket_event rows are immutable. UPDATE and DELETE are not permitted.';
END;
$$;

DROP TRIGGER IF EXISTS ticket_event_immutable ON public.ticket_event;
CREATE TRIGGER ticket_event_immutable
    BEFORE UPDATE OR DELETE ON public.ticket_event
    FOR EACH ROW EXECUTE FUNCTION public.prevent_ticket_event_modification();

-- ──────────────────────────────────────────────────────────
-- 5. Demo PMC and OA accounts
--    password for both: Welcome@1234 (bcrypt $2a$12$...)
-- ──────────────────────────────────────────────────────────
INSERT INTO public.app_user (
    username, password, full_name, email, role,
    designation, zone, managed_by, is_active, is_deleted, created_at, created_by
)
VALUES
(
    'pmc_admin',
    '$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S',
    'PMC Monitor Admin',
    'pmc.admin@nicsi.in',
    'PMC',
    'Project Monitoring Cell',
    'HQ',
    NULL,
    TRUE, FALSE, NOW(), 'system'
),
(
    'oa_operator',
    '$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S',
    'OA Field Operator',
    'oa.operator@nicsi.in',
    'OA',
    'Operational Assistant',
    'North Zone',
    'md.alok_tiwari',
    TRUE, FALSE, NOW(), 'system'
)
ON CONFLICT (username) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 6. Backfill project_lifecycle for all existing projects
--    Starts every project at DRAFT with its assigned PM.
-- ──────────────────────────────────────────────────────────
INSERT INTO public.project_lifecycle (header_id, current_stage, assigned_pm_id, created_at, updated_at)
SELECT header_id, 'DRAFT', prj_mgr_id, NOW(), NOW()
FROM public.xx_nic_pm_prj_list
WHERE header_id NOT IN (SELECT header_id FROM public.project_lifecycle)
ON CONFLICT (header_id) DO NOTHING;
