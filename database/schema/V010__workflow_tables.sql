-- ============================================================
-- V010 — NPMS Project Lifecycle & Ticket/Work-Item Governance
-- ============================================================
-- Canonical lifecycle stages (state machine):
--   DRAFT → SANCTION → RECEIPT → PO_ISSUED → BILL_SUBMITTED
--           → APPROVAL_PENDING → PAYMENT_DONE → CLOSED
--
-- Ticket statuses:
--   OPEN → IN_PROGRESS → AWAITING_REVIEW → RESOLVED → CLOSED
--   Any closed ticket can be REOPENED (MD-only, mandatory remarks).
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. project_lifecycle
--    One row per project. Tracks current stage, SLA, hold.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_lifecycle (
    id                  BIGSERIAL PRIMARY KEY,
    header_id           BIGINT NOT NULL UNIQUE,   -- FK to public.project_list.header_id
    current_stage       VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | SANCTION | RECEIPT | PO_ISSUED | BILL_SUBMITTED
    -- APPROVAL_PENDING | PAYMENT_DONE | CLOSED
    assigned_pm_id      BIGINT,                   -- prj_mgr_id of responsible PM
    assigned_oa_username VARCHAR(50),             -- OA executing current stage
    sla_deadline        TIMESTAMPTZ,              -- when current stage SLA expires
    hold_reason         TEXT,                     -- non-null = project on financial hold
    notes               TEXT,                     -- MD / PMC internal notes
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pl_header_id     ON public.project_lifecycle(header_id);
CREATE INDEX IF NOT EXISTS idx_pl_current_stage ON public.project_lifecycle(current_stage);
CREATE INDEX IF NOT EXISTS idx_pl_pm_id         ON public.project_lifecycle(assigned_pm_id);
CREATE INDEX IF NOT EXISTS idx_pl_sla_deadline  ON public.project_lifecycle(sla_deadline);

-- ──────────────────────────────────────────────────────────
-- 2. lifecycle_transition
--    Append-only audit of every stage change.
--    UPDATE/DELETE are blocked by trigger.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_transition (
    id              BIGSERIAL PRIMARY KEY,
    header_id       BIGINT       NOT NULL,
    from_stage      VARCHAR(30),                  -- null for the initial DRAFT creation
    to_stage        VARCHAR(30)  NOT NULL,
    performed_by    VARCHAR(50)  NOT NULL,         -- actual username (JWT subject)
    acting_as       VARCHAR(50),                  -- non-null when MD delegates to PM
    remarks         TEXT         NOT NULL,         -- mandatory on every transition
    evidence_url    TEXT,                          -- optional file reference
    transition_type VARCHAR(20)  NOT NULL DEFAULT 'FORWARD',
    -- FORWARD | REOPEN | HOLD | RELEASE | HOLD_NOTE
    transitioned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lt_header_id      ON public.lifecycle_transition(header_id);
CREATE INDEX IF NOT EXISTS idx_lt_performed_by   ON public.lifecycle_transition(performed_by);
CREATE INDEX IF NOT EXISTS idx_lt_transitioned_at ON public.lifecycle_transition(transitioned_at DESC);

-- Immutability: no UPDATE or DELETE allowed on lifecycle_transition
CREATE OR REPLACE FUNCTION public.prevent_lifecycle_transition_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'lifecycle_transition rows are immutable. UPDATE and DELETE are not allowed.';
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_transition_immutable ON public.lifecycle_transition;
CREATE TRIGGER lifecycle_transition_immutable
    BEFORE UPDATE OR DELETE ON public.lifecycle_transition
    FOR EACH ROW EXECUTE FUNCTION public.prevent_lifecycle_transition_modification();

-- ──────────────────────────────────────────────────────────
-- 3. project_ticket
--    Work-item / ticket entity. One project can have many.
-- ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.ticket_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.project_ticket (
    id                  BIGSERIAL PRIMARY KEY,
    header_id           BIGINT       NOT NULL,
    ticket_code         VARCHAR(30)  NOT NULL UNIQUE
                            DEFAULT ('TKT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('public.ticket_code_seq')::TEXT, 6, '0')),
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    ticket_type         VARCHAR(40)  NOT NULL DEFAULT 'GENERAL',
    -- DOCUMENT_UPLOAD | FIELD_VISIT | CLIENT_FOLLOW_UP | APPROVAL_CHASE
    -- PAYMENT_FOLLOW_UP | COMPLIANCE | GENERAL
    priority            VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM',
    -- LOW | MEDIUM | HIGH | CRITICAL
    status              VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    -- OPEN | IN_PROGRESS | AWAITING_REVIEW | RESOLVED | CLOSED | REOPENED
    created_by          VARCHAR(50)  NOT NULL,
    assigned_to         VARCHAR(50),              -- OA username
    reviewed_by         VARCHAR(50),              -- PM username confirming resolution
    escalated_to        VARCHAR(50),              -- PMC or MD username if escalated
    sla_hours           INT          NOT NULL DEFAULT 48,
    sla_deadline        TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    reopen_reason       TEXT,                     -- mandatory when MD reopens a closed ticket
    stage_ref           VARCHAR(30),              -- which lifecycle stage this ticket relates to
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_header_id   ON public.project_ticket(header_id);
CREATE INDEX IF NOT EXISTS idx_pt_status      ON public.project_ticket(status);
CREATE INDEX IF NOT EXISTS idx_pt_assigned_to ON public.project_ticket(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pt_created_by  ON public.project_ticket(created_by);
CREATE INDEX IF NOT EXISTS idx_pt_priority    ON public.project_ticket(priority);
CREATE INDEX IF NOT EXISTS idx_pt_sla_deadline ON public.project_ticket(sla_deadline);

-- ──────────────────────────────────────────────────────────
-- 4. ticket_event
--    Immutable event log per ticket state change.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_event (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT       NOT NULL REFERENCES public.project_ticket(id) ON DELETE CASCADE,
    event_type      VARCHAR(30)  NOT NULL,
    -- CREATED | ASSIGNED | STATUS_CHANGED | ESCALATED | COMMENTED
    -- REOPENED | RESOLVED | CLOSED | EVIDENCE_UPLOADED
    from_status     VARCHAR(20),
    to_status       VARCHAR(20),
    performed_by    VARCHAR(50)  NOT NULL,
    acting_as       VARCHAR(50),                  -- delegated context
    remarks         TEXT,
    evidence_url    TEXT,
    event_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_ticket_id    ON public.ticket_event(ticket_id);
CREATE INDEX IF NOT EXISTS idx_te_performed_by ON public.ticket_event(performed_by);
CREATE INDEX IF NOT EXISTS idx_te_event_at     ON public.ticket_event(event_at DESC);

-- Immutability: no UPDATE or DELETE on ticket_event
CREATE OR REPLACE FUNCTION public.prevent_ticket_event_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'ticket_event rows are immutable. UPDATE and DELETE are not allowed.';
END;
$$;

DROP TRIGGER IF EXISTS ticket_event_immutable ON public.ticket_event;
CREATE TRIGGER ticket_event_immutable
    BEFORE UPDATE OR DELETE ON public.ticket_event
    FOR EACH ROW EXECUTE FUNCTION public.prevent_ticket_event_modification();

-- ──────────────────────────────────────────────────────────
-- 5. Seed demo accounts for PMC and OA roles
--    (password: 'Welcome@1234' — bcrypt hash)
-- ──────────────────────────────────────────────────────────
INSERT INTO public.app_user (
    username, password, full_name, email, role,
    designation, zone, managed_by, is_active, is_deleted, created_at, created_by
)
VALUES
(
    'pmc_admin',
    '$2a$12$P6SzDlJN.xBiqdCVjPqsyONW5M1RgqaSs5A8e3A4TkjQfJVbLDYKq',
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
    '$2a$12$P6SzDlJN.xBiqdCVjPqsyONW5M1RgqaSs5A8e3A4TkjQfJVbLDYKq',
    'OA Field Operator',
    'oa.operator@nicsi.in',
    'OA',
    'Operational Assistant',
    'North Zone',
    'pmc_admin',
    TRUE, FALSE, NOW(), 'system'
)
ON CONFLICT (username) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 6. Backfill project_lifecycle rows for all existing projects
--    (start them all at DRAFT stage with the current assigned PM)
-- ──────────────────────────────────────────────────────────
INSERT INTO public.project_lifecycle (header_id, current_stage, assigned_pm_id, created_at, updated_at)
SELECT header_id, 'DRAFT', prj_mgr_id, NOW(), NOW()
FROM public.project_list
WHERE header_id NOT IN (SELECT header_id FROM public.project_lifecycle)
ON CONFLICT (header_id) DO NOTHING;
