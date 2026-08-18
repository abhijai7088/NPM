/**
 * Delegated PM Context — Axios request interceptor.
 *
 * When an MD drills into a PM's portfolio (MD Override Mode),
 * the PM's prjMgrId is stored in localStorage under 'actingAsPmId'.
 *
 * This interceptor automatically appends the X-Acting-As-Pm header
 * to every mutating request (POST/PUT/PATCH/DELETE) so the backend
 * can write: "Performed By: md.alok_tiwari, Acting As: pm_atul_rastogi"
 * into all lifecycle_transition and ticket_event audit records.
 *
 * No credential switch occurs — the MD's JWT remains unchanged.
 */
import axios from 'axios';

const ACTING_AS_KEY = 'actingAsPmId';

/** Set the delegated PM context (called when MD opens a PM's portfolio). */
export function setDelegatedPmContext(prjMgrId: number | string | null): void {
  if (prjMgrId == null) {
    localStorage.removeItem(ACTING_AS_KEY);
  } else {
    localStorage.setItem(ACTING_AS_KEY, String(prjMgrId));
  }
}

/** Get the currently delegated PM ID, if any. */
export function getDelegatedPmContext(): string | null {
  return localStorage.getItem(ACTING_AS_KEY);
}

/** Clear the delegated PM context (called when MD returns to roster). */
export function clearDelegatedPmContext(): void {
  localStorage.removeItem(ACTING_AS_KEY);
}

/** True if the MD is currently operating in delegated PM context. */
export function hasDelegatedContext(): boolean {
  return !!localStorage.getItem(ACTING_AS_KEY);
}

// ── Axios interceptor ──────────────────────────────────────────────────────

axios.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT'
                  || method === 'PATCH' || method === 'DELETE';

  if (isMutating) {
    const actingAs = getDelegatedPmContext();
    if (actingAs) {
      config.headers = config.headers ?? {};
      config.headers['X-Acting-As-Pm'] = actingAs;
    }
  }
  return config;
});
