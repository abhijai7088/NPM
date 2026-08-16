# NPMS RBAC Model — Super Admin / MD / PM

This document describes the **actual, implemented** role-based access
control model for NPMS. It supersedes the 6-role model (`SUPER_ADMIN`,
`MINISTRY_ADMIN`, `PROJECT_OFFICER`, `FINANCE_OFFICER`, `AUDITOR`, `VIEWER`)
described in the original phase-prompt documentation — that model was never
built. The system that exists uses exactly three roles, and this is the
model going forward.

---

## 1. The three roles

| Role | Who | What they see |
|---|---|---|
| `SUPER_ADMIN` | NICSI system administrators | Everything — every MD, every PM, every project, every rupee. Unrestricted. |
| `MD` (Managing Director) | Zonal/organisational directors | Only the Project Managers they have personally provisioned, and only those PMs' projects/finance data. |
| `PM` (Project Manager) | Field project managers | Only their own project portfolio (a single `prj_mgr_id`). |

There is currently **one PM** provisioned in the system
(`pm_atul_rastogi`, `prj_mgr_id = 1626`, reporting to MD `md.alok_tiwari`).
Everything below is written so that provisioning a second, third, or
Nth PM requires **zero code changes** — the scoping is computed live from
the database on every request.

---

## 2. Where enforcement happens (and why it changed)

### Before this change
RBAC was **frontend-only**. Pages like `FinancePage.tsx` computed a
`prjMgrId`/`managedBy` query parameter from the logged-in user's role and
sent it to the backend. The backend (`FinanceDataController`,
`ProjectListController`, `ProjectManagerController`) simply trusted
whatever the client sent — there was no `@PreAuthorize`, no
`Authentication` check, nothing. This meant:

- Any authenticated session (or even a raw `curl`/Postman call, since most
  routes were `permitAll()`) could omit the scoping parameter entirely and
  see every PM's and every MD's data.
- A PM could pass a different `prjMgrId` and see another PM's projects.
- `GET /api/v1/users/mds` leaked every Managing Director's identity to any
  caller.
- `ReportsPage.tsx` had **no scoping at all** — a PM viewing Reports saw
  the entire organisation's data, unconditionally.

### After this change
RBAC is now **server-enforced**, based on the caller's authenticated JWT
identity — never on a client-supplied parameter. The core building block is
`ScopeResolver` (`com.npms.core.security.ScopeResolver`), which every
data-serving controller now calls first:

```java
AccessScope scope = scopeResolver.resolve(authentication);
```

`AccessScope` (`com.npms.core.security.AccessScope`) tells the controller
exactly what the caller is allowed to see:

- **`SUPER_ADMIN`** → `allowedPrjMgrIds() == null` (unrestricted).
- **`MD`** → `allowedPrjMgrIds()` is the *live* list of `prj_mgr_id` values
  for every PM currently provisioned with `managed_by = <this MD's
  username>`. Recomputed from `AppUserRepository` on every request.
- **`PM`** → `allowedPrjMgrIds()` is always exactly one element: the PM's
  own `prj_mgr_id`, looked up server-side from their `app_user` row by
  their authenticated username. A PM can never widen this by changing a
  request parameter.

Any client-supplied `prjMgrId`/`managedBy`/`provisionedOnly` parameter is
now only ever used to let an *already-unrestricted* caller (Super Admin)
or an *already-scoped* caller (MD drilling into one of their own PMs)
**narrow** their own view. `AccessScope.requirePrjMgrId(...)` and
`requireOwnUsername(...)` throw a `403 FORBIDDEN_SCOPE` if a caller asks
for something outside what `ScopeResolver` already determined they may see.

### Spring Security changes
`SecurityConfig` previously ended with `anyRequest().permitAll()` — the
actual root cause of the whole class of bug. It now requires authentication
on every `/api/v1/**` route except the public login endpoints and
`/actuator/**`. `GET /api/v1/users/mds` (list of every Managing Director) is
now restricted to `SUPER_ADMIN` only.

### Consistent error responses
`GlobalExceptionHandler` was added to core-service so every RBAC violation
returns the same JSON envelope used throughout NPMS:
```json
{ "success": false, "error": "FORBIDDEN_SCOPE", "message": "You are not authorised to access ..." }
```

---

## 3. What changed per controller

| Controller | Endpoints | Change |
|---|---|---|
| `ProjectListController` | `GET /advanced-search`, `GET /{id}/generate-notice`, `POST /{id}/dispatch-notice` | Scope now resolved server-side; notice generation/dispatch checks the target project's `prjMgrId` against the caller's scope before doing anything. Response now includes a `scope` block the frontend uses for an honest UI banner. |
| `FinanceDataController` | `/purchase-orders`, `/bill-desk`, `/tax-invoices` (list + by-project variants), `/purchase-orders/expired`, `/purchase-orders/expiring-soon` | Same server-trusted scope resolution applied uniformly via a shared `resolveScopedIds` helper. By-project lookups now check the returned row's `prjMgrId` against scope. |
| `ProjectManagerController` (Team Oversight) | `GET /`, `GET /{prjMgrId}` | A **PM caller is now rejected with 403** — this is a management/oversight view of a team, not something a PM should ever see. An MD's own username is used regardless of what `managedBy` the client sends. |
| `UserAdminController` | (unchanged — already had real RBAC before this change) | Confirmed as the reference implementation this fix generalises: `Authentication`-based `Actor`, MD-only-manages-own-PMs, Super-Admin-only account protections. |
| `/api/v1/users/mds` | — | Restricted to `SUPER_ADMIN` at the Spring Security filter-chain level. |

---

## 4. Scaling to more than one PM

Nothing in this design assumes exactly one PM. Concretely:

1. Super Admin (or an MD) provisions a second PM via
   `POST /api/v1/users` with `role=PM` and a new `prjMgrId`. This writes a
   new row to `nicsi_erp.app_user` with `managed_by` set to the provisioning
   MD's username (or a chosen MD, if Super Admin provisions it).
2. The very next request that MD makes to any scoped endpoint
   (`/projects/advanced-search`, `/finance/*`, `/project-managers`) will
   automatically include the new PM's `prj_mgr_id` in
   `ScopeResolver.resolve(...)`'s live `findByRoleAndManagedBy("PM",
   username)` query — no restart, no code change, no configuration.
3. The new PM logs in and is automatically scoped to exactly their own
   `prj_mgr_id`, the same way the existing PM already is.
4. If two PMs report to different MDs, each MD's `AccessScope` only ever
   contains their own PMs — cross-MD visibility never happens because the
   query filters by `managed_by = <that specific MD's username>`.

---

## 5. What is intentionally *not* covered by this change

- **Notification/AI service modules** — out of scope per explicit user
  instruction; not touched.
- **`npms-master-service` / `npms-erp-sync-service`** — not part of the
  live request path today (frontend never calls them); not audited here.
- **The unused 6-role model in the original phase docs**
  (`MINISTRY_ADMIN`, `PROJECT_OFFICER`, etc.) — still present as inert rows
  in `auth.roles`, but no code path ever assigns or checks them. This
  document is the authoritative model going forward; the old docs describe
  a design that was superseded before this system was built.
