# NPMS RBAC, Dashboard & Project Lifecycle Governance Blueprint

## 1. Purpose

This document is the implementation contract for the next NPMS/NICSI governance pass. It aligns the five roles already present in the codebase — `SUPER_ADMIN`, `MD`, `PM`, `PMC`, and `OA` — around one consistent project, ticket, lifecycle, assignment, escalation, evidence and audit model.

The design principle is:

> **One project record, one authoritative lifecycle, one ticket trail, one permission model, one audit trail.**

The UI may differ by role, but the underlying project/ticket state must never fork by dashboard.

## 2. Role model

| Role | Primary responsibility | Scope | Main write powers |
|---|---|---|---|
| SUPER_ADMIN | System administration | Whole system | User provisioning, role/account administration, audit access; no routine project-operation authority unless explicitly delegated |
| MD | Executive control + accountability | All projects / all PMs | Assign/reassign PM, assign/override OA workflow where permitted, create/assign tickets, review/approve, reopen closed/resolved tickets with mandatory reason, escalate, hold/release where policy allows |
| PM | Project ownership + monitoring | Own PM portfolio | Monitor projects, create/assign operational tickets, assign OA, review OA submissions, advance/reject/reopen allowed workflow steps, escalate to PMC/MD, add remarks/evidence |
| PMC | Independent monitoring/control cell | Organisation-wide monitoring | Monitor lifecycle, inspect tickets, verify/reject work, raise/escalate tickets, place/release monitoring holds where policy allows, record compliance remarks/evidence; should not silently alter financial master data |
| OA | Operational execution | Only assigned tickets/tasks/projects | Accept task, work task, upload evidence, add remarks, submit for review, request clarification, respond to reopen; cannot assign/reassign, approve itself, reopen, or bypass review |

### Important distinction

`acting-as` is **delegation context**, not authentication and not a role elevation. An MD viewing a PM portfolio remains authenticated as MD. Every mutation must record both:

- `performedBy` = actual authenticated MD username
- `actingAs` = PM context, when present

The existing delegated-context header mechanism should be retained but the backend must validate that the selected PM belongs to the MD before accepting the header.

## 3. Dashboard model

### 3.1 SUPER_ADMIN dashboard

Keep this operationally light. It should answer:

- How many users exist by role?
- Which accounts are active/disabled/pending?
- Recent security/admin activity.
- Failed login/MFA/security events.
- Recent role/account changes.
- Audit-log shortcuts.

Do **not** turn Super Admin into a project-monitoring dashboard by default.

### 3.2 MD dashboard — executive command centre

The MD dashboard should be action-oriented, not a data dump.

Top strip:

- Active PMs
- Total projects
- Projects needing action
- Open critical/high tickets
- SLA-breached items
- Projects on hold
- Pending OA reviews

Primary sections:

1. **Attention Required** — highest priority queue across projects/tickets.
2. **PM portfolio table** — compact rows, not tall cards. Columns: PM ID, PM name, zone, projects, active tickets, overdue, on-hold, financial exposure, performance signal, last activity.
3. **Assignment Desk** — unassigned projects + PM workload + quick assign/reassign.
4. **Lifecycle health** — stage counts and ageing.
5. **Ticket control** — open, overdue, escalated, awaiting review, reopened.
6. **Financial watchlist** — PO expiry, vendor outstanding, payment bottlenecks.
7. **Recent governance activity** — who changed what and when.

Filters are hidden behind a `Filters` button. Search remains visible. Persist filter state in URL/query state so drill-down is reversible.

### 3.3 PM dashboard — portfolio command centre

Show only the PM's own scope:

- Portfolio KPIs
- Projects needing action
- OA tasks awaiting review
- Tickets by status/priority
- Lifecycle stage distribution
- PO/finance alerts
- Expiry alerts
- Recent activity

The PM must never need to leave the dashboard to understand what is blocked, what OA is working on, what needs review and what is overdue.

### 3.4 PMC dashboard — monitoring control tower

The current `PmcTowerPage` is a good starting point, but it must become a true monitoring queue rather than a collection of independent counts.

Top KPIs:

- Projects under monitoring
- Critical/high tickets
- SLA breaches
- Awaiting PMC verification
- Reopened items
- On-hold projects
- Unresolved escalations

Main work queues:

1. **Verification queue** — OA/PM submissions waiting for PMC review.
2. **Escalation queue** — tickets escalated to PMC.
3. **SLA breach queue** — oldest breach first.
4. **On-hold queue** — reason, owner, ageing and next action.
5. **Lifecycle exceptions** — projects stuck beyond configured stage SLA.
6. **Monitored project register** — compact table with PM, OA, stage, ticket status and last action.

Every row opens Project 360 with the lifecycle timeline and ticket timeline already visible.

### 3.5 OA dashboard — execution desk

The current `OaTaskDashboard` should become a real task inbox.

Top KPIs:

- New tasks
- In progress
- Due today
- Overdue
- Awaiting review
- Reopened
- Completed

Task table/card must show:

- Ticket code
- Project code/name
- PM
- PMC involvement, if any
- Task type
- Priority
- SLA countdown
- Current status
- Last remark
- Required evidence
- Next allowed action

OA should not see organisation-wide financial/project data unless explicitly required for the assigned task.

## 4. Project 360 — single source of truth

Project 360 should contain these tabs/sections:

1. **Overview** — project identity, PM, OA, client, current stage, health.
2. **Lifecycle** — current stage + complete immutable transition timeline.
3. **Tickets** — all project tickets, filters, status and SLA.
4. **Assignment** — PM/OA assignment history.
5. **Finance** — PO, bills, GST/tax data and financial status.
6. **Documents/Evidence** — evidence linked to lifecycle/ticket events.
7. **Audit** — complete project-level activity history.

The current lifecycle API already exposes current lifecycle + transition history; Project 360 should make that the dominant workflow view rather than treating lifecycle as a secondary widget.

## 5. Project assignment lifecycle

A project assignment must itself be auditable.

### States

`UNASSIGNED -> ASSIGNED_TO_PM -> ACCEPTED_BY_PM -> IN_EXECUTION -> COMPLETED/CLOSED`

A PM reassignment is not an overwrite. It creates an assignment history record.

Minimum assignment record:

- project/header ID
- from PM
- to PM
- assigned by
- assigned at
- reason/remarks
- effective from/to
- acting-as context, if any

### MD assignment desk

MD should see:

- Unassigned projects
- PM current workload
- PM active-ticket workload
- PM overdue count
- PM portfolio value
- PM capacity indicator

Recommended assignment guardrail: show a workload warning before assigning to a heavily loaded PM, but do not block unless NICSI policy explicitly requires it.

## 6. Ticket model

A ticket is the operational work unit attached to a project and optionally to a lifecycle stage.

Existing ticket types are retained; they should become configurable master data later.

### Ticket states

`OPEN -> IN_PROGRESS -> AWAITING_REVIEW -> RESOLVED -> CLOSED`

Exception:

`RESOLVED/CLOSED -> REOPENED -> IN_PROGRESS`

Reopen is a controlled exception, never a generic status edit.

### Ownership model

- Creator: creates the accountability origin.
- PM: operational owner for project-level work.
- OA: execution owner for assigned task.
- PMC: monitoring/review/escalation owner when the ticket enters PMC scope.
- MD: governance authority and final escalation/reopen authority according to policy.

### Mandatory evidence/remarks

For any action that changes an accountable state, store:

- actor
- action
- previous state
- new state
- timestamp
- remarks
- evidence/document reference where required
- acting-as context
- SLA before/after if applicable

Do not permit a UI to submit a state transition without required fields.

## 7. Ticket review and rejection model

The current `AWAITING_REVIEW` state needs an explicit reviewer action.

### OA submission

`OA IN_PROGRESS -> AWAITING_REVIEW`

OA must provide:

- completion remarks
- evidence where the ticket type requires it
- optional supporting document

### PM/PMC review

Reviewer chooses:

- **Accept** -> `RESOLVED` or next governed state
- **Return for correction** -> `IN_PROGRESS`
- **Escalate** -> PMC/MD queue

A rejection/return MUST require a remark explaining what is incorrect or missing.

### Closure

`RESOLVED -> CLOSED` should be a distinct acceptance/closure action, not simply another arbitrary status dropdown option.

## 8. MD reopen policy

MD can reopen a `RESOLVED` or `CLOSED` ticket only with a mandatory reason.

The event must show:

`MD USER -> REOPENED -> reason -> previous state -> new SLA deadline`

The existing reopen endpoint is the correct pattern, but authorization must be scope-checked and the reason must be validated server-side.

## 9. SLA model

SLA must be configurable by ticket type + priority, not hard-coded permanently in the service.

Recommended master:

| Priority | Default starting SLA | Escalation |
|---|---:|---|
| Critical | 8h | immediate PMC/MD visibility |
| High | 24h | PMC visibility on breach |
| Medium | 48h | PM/PMC visibility on breach |
| Low | 72h | PM visibility on breach |

These are implementation defaults; final NICSI SLA policy must be confirmed before production sign-off.

Store SLA snapshot on ticket creation so later master-data changes do not rewrite historical SLAs.

## 10. Authorization rules that must be enforced server-side

### Critical security fixes

1. `GET /tickets/{id}` must verify project/ticket scope before returning the ticket.
2. `GET /tickets/{id}/events` must verify the same scope.
3. `GET /tickets?headerId=` must not allow a PM to fetch another PM's ticket by guessing a header ID.
4. `PUT /tickets/{id}/status` must explicitly enforce role + ownership + legal transition.
5. `PUT /tickets/{id}/assign` must verify the caller may operate on that project and the target is a valid OA.
6. `PUT /tickets/{id}/escalate` must enforce who may escalate and to which role.
7. `GET /tickets/priority-summary` must return the caller's permitted scope, not blindly global counts for every role.
8. `/tickets/my-tasks` must be explicitly OA/assigned-work semantics; PM should have a separate `my-review-queue` if needed.
9. MD delegated PM context must be validated against the MD's managed PM relationship.
10. `prjMgrId` query parameters must narrow scope only; they must never widen a caller's server-side scope.
11. The PM scope resolver must never contain a production fallback such as a fixed PM ID.

## 11. Current repository findings that must be corrected

The current repository already contains the major building blocks: role-aware routing, `ScopeResolver`, delegated PM context, Project 360, lifecycle APIs, ticket APIs, PMC tower and OA task dashboard. fileciteturn17file0L2-L2

However, the current implementation has several important inconsistencies:

- `AppShell` does not expose Dashboard to PMC/OA even though the router accepts all five roles for `/dashboard`. fileciteturn36file0L2-L2 fileciteturn37file0L1-L2
- The generic dashboard currently branches specifically for Super Admin, MD and PM; PMC/OA therefore need dedicated role dashboards instead of falling into the PM-style view. fileciteturn20file0L2-L2
- The current PMC page is already wired to overdue/escalated ticket and lifecycle APIs, but its monitored-project desk should become the verification/control queue described above. fileciteturn18file0L2-L2
- The OA page currently focuses on assigned tasks and quick status changes, but needs an explicit execution/review contract and stronger evidence/return semantics. fileciteturn19file0L2-L2
- The ticket frontend already exposes assignment, status, escalation, reopen, comments and full event history, which should be preserved and hardened rather than replaced. fileciteturn28file0L2-L2
- The ticket modal currently exposes actions based on role, but backend authorization must be authoritative and must not depend on the UI hiding buttons. fileciteturn29file0L2-L2
- The ticket controller currently has broad read paths and does not consistently scope individual-ticket reads/actions to the caller's project ownership. This must be fixed before production. fileciteturn33file0L2-L2
- The ticket service currently hard-codes priority SLAs and generates ticket codes from an in-memory counter; production should use persistent, collision-safe numbering and configurable SLA masters. fileciteturn34file0L2-L2
- `ScopeResolver` currently contains a fixed PM fallback ID (`1626L`). This must be removed; missing PM scope should fail closed. fileciteturn35file0L2-L2
- Project Manager filtering supports search by PM ID, zone, project type and account/dues status and already hides filters behind a button; keep this interaction pattern but reduce vertical card height and move the roster to a dense table/compact row design. fileciteturn38file0L2-L2
- The PM roster already has delegated context and a back-to-roster flow; this should be retained and expanded so the MD's drill-down is a reversible **MD Override Mode**, not a fake login. fileciteturn39file0L2-L2
- Project Registry already supports MD/Super Admin project reassignment. This should become the central Assignment Desk and write immutable assignment history. fileciteturn41file0L2-L2
- Project search has server-side PM scoping and explicit drill-down parameters, but the MD/Super Admin distinction and managed-by semantics should be made consistent across all endpoints. fileciteturn42file0L2-L2

## 12. Navigation contract

### SUPER_ADMIN

- Dashboard
- User Management
- Audit Log
- System health/security summary

### MD

- Dashboard
- Project Managers
- Projects / Assignment Desk
- Tickets
- PMC Tower (oversight)
- Finance
- Reports
- Notices

### PM

- Dashboard
- Projects
- Tickets
- My Review Queue
- Finance
- Reports
- Notices

### PMC

- Dashboard / PMC Tower
- Monitored Projects
- Tickets
- Verification Queue
- Escalations
- SLA Breaches
- On-Hold Projects
- Reports

### OA

- Dashboard / My Tasks
- My Tickets
- My Assigned Projects (only if policy requires)
- Notifications
- Profile

Do not expose organisation-wide Finance, PM roster or unrestricted Project Registry to OA.

## 13. UI rules

- Avoid tall PM cards. Prefer compact table rows.
- Search is always visible; advanced filters are hidden behind `Filters`.
- Use sticky table headers for large registers.
- Every KPI that represents actionable work is clickable.
- Every queue has an explicit `View all` action.
- Every detail view has a clear back path.
- Show role/scope context in a small banner, not a large card.
- Use consistent status chips across project, lifecycle and ticket modules.
- Use `Needs Action`, `Awaiting Review`, `Overdue`, `Escalated`, `On Hold`, `Completed` as the executive vocabulary.
- Avoid duplicate counts from multiple APIs; each dashboard KPI should identify its authoritative source.

## 14. API contract to converge toward

### Projects

- `GET /projects` — role-scoped list
- `GET /projects/:headerId` — role-scoped Project 360
- `POST /projects/:headerId/assign` — MD/Super Admin policy-gated assignment
- `GET /projects/:headerId/assignment-history`

### Lifecycle

- `GET /lifecycle/:headerId`
- `POST /lifecycle/:headerId/transition`
- `POST /lifecycle/:headerId/hold`
- `POST /lifecycle/:headerId/release`

### Tickets

- `GET /tickets`
- `GET /tickets/:id`
- `POST /tickets`
- `PUT /tickets/:id/assign`
- `PUT /tickets/:id/status`
- `PUT /tickets/:id/escalate`
- `POST /tickets/:id/reopen`
- `POST /tickets/:id/comment`
- `GET /tickets/:id/events`
- `GET /tickets/my-tasks`
- `GET /tickets/my-review-queue`
- `GET /tickets/overdue`
- `GET /tickets/escalated`
- `GET /tickets/verification-queue`
- `GET /tickets/summary`

All endpoints must apply server-side scope first, then filters.

## 15. Database model additions/reconciliation

Prefer immutable history tables over overwriting fields.

Required logical entities:

- `app_user`
- `project_assignment_history`
- `project_lifecycle`
- `lifecycle_transition`
- `project_ticket`
- `ticket_event`
- `ticket_assignment_history` (recommended)
- `ticket_review` (recommended)
- `sla_policy` / `ticket_sla_policy`
- `notification`
- `audit_log`

### Ticket review record

Recommended fields:

- id
- ticket_id
- reviewer
- decision (`ACCEPT`, `RETURN`, `ESCALATE`)
- remarks
- evidence_url
- reviewed_at
- acting_as

## 16. End-to-end golden flow

### A. MD assigns project

1. Project appears in `Unassigned` queue.
2. MD opens Assignment Desk.
3. MD selects PM.
4. System displays workload warning + PM summary.
5. MD confirms with assignment remark.
6. Assignment history is written.
7. PM dashboard immediately shows the project.
8. PM receives notification.

### B. PM creates operational ticket

1. PM opens Project 360.
2. PM selects `Create Ticket`.
3. Project and lifecycle stage are pre-filled.
4. PM selects type/priority and describes required action.
5. System calculates SLA and creates ticket.
6. PM assigns OA.
7. OA receives task.

### C. OA executes

1. OA accepts task.
2. OA moves to `IN_PROGRESS`.
3. OA adds remarks/evidence.
4. OA submits `AWAITING_REVIEW`.
5. PM/PMC sees it in review queue.

### D. Review

If correct:

`AWAITING_REVIEW -> RESOLVED -> CLOSED`

If incorrect:

`AWAITING_REVIEW -> IN_PROGRESS`

with mandatory correction remark.

### E. Escalation

If SLA breaches or work is blocked:

`PM/OA -> PMC -> MD`

Each escalation creates an immutable event and notification.

### F. MD reopen

1. MD opens closed/resolved ticket.
2. MD selects `Reopen`.
3. Mandatory reason is entered.
4. System creates `REOPENED` event.
5. SLA is reset according to policy snapshot.
6. OA/PM receives notification.
7. Ticket continues through the same governed flow.

## 17. Implementation sequence

### Phase 1 — Security and data integrity (must happen first)

- Remove hard-coded PM fallback.
- Scope individual ticket reads/actions.
- Enforce ticket status transition permissions server-side.
- Validate assignment targets.
- Validate delegated MD->PM relationship.
- Make ticket numbering persistent/collision-safe.
- Add immutable assignment history.
- Add ticket review semantics.

### Phase 2 — RBAC navigation and role dashboards

- Dedicated PMC dashboard.
- Dedicated OA dashboard/task desk.
- Correct nav visibility for all five roles.
- Remove PM-style fallback for PMC/OA.
- Add role-specific dashboard summaries.

### Phase 3 — MD control centre

- Compact PM roster.
- Assignment Desk.
- Attention queue.
- Ticket/lifecycle health.
- MD Override Mode banner + back navigation.

### Phase 4 — Project 360 integration

- Lifecycle + ticket timeline in one view.
- Assignment history.
- Evidence/documents.
- Review actions.

### Phase 5 — Notifications and reporting

- SLA notifications.
- Assignment notifications.
- Review returned notifications.
- Escalation notifications.
- Reopen notifications.
- Role-scoped reports.

### Phase 6 — QA and audit

Test every role against every endpoint, including negative tests for guessed IDs, query parameter manipulation and delegated context spoofing.

## 18. Acceptance criteria

The implementation is complete only when all of these are true:

- A PM cannot access another PM's project/ticket by changing URL/query parameters.
- OA cannot assign, approve, reopen or escalate outside its permitted workflow.
- PMC can see its monitoring queues without receiving MD-only administrative powers.
- MD can manage PMs and assignments without changing identity or credentials.
- MD drill-down shows a clear `Viewing as PM / MD Override Mode` context and a reliable exit path.
- Every state-changing operation creates an immutable event.
- Every correction/rejection/reopen action has a mandatory reason.
- Project assignment history is retained.
- Ticket history is visible to all roles that are permitted to inspect the project.
- Lifecycle and ticket state never contradict each other silently.
- SLA calculations are deterministic and auditable.
- Dashboard KPIs are server-derived and role-scoped.
- No dashboard contains mock counts or hard-coded project/PM identifiers.
- Large PM portfolios remain usable with compact tables, server pagination and hidden advanced filters.
- Production build, backend tests, frontend tests and RBAC negative tests pass before merge.
