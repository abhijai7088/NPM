// @ts-nocheck
/**
 * NICSI NPMS — ZO Projects API Service
 *
 * Fetches project data from the Spring Boot backend (PostgreSQL).
 * Falls back to static data if the backend is unavailable (dev mode).
 *
 * Backend base: http://localhost:8080/api/v1/zo-projects
 * (or via API Gateway: http://localhost:8443/api/v1/zo-projects)
 */

import { PROJECTS, PROJECT_STATS } from '../utils/formatters';
import type { Project } from '../utils/formatters';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
const ZO_API   = `${BASE_URL}/api/v1/zo-projects`;

// ── Types returned from the backend ──────────────────────────

export interface ApiProjectStats {
  totalProjects:       number;
  totalAmountReceived: number;
  totalPoAmount:       number;
  totalInvoiced:       number;
  totalPaid:           number;
  totalAbp:            number;
  totalCommission:     number;
  totalVendorPending:  number;
  totalClientPending:  number;
  totalPos:            number;
  totalBillDeskInvoices: number;
  totalExpInvoices:    number;
  totalTaxInvoices:    number;
  pendingCount:        number;
  clearedCount:        number;
  partialCount:        number;
}

export interface ApiPagedResponse<T> {
  success: boolean;
  data:    T[];
  total:   number;
  page:    number;
  size:    number;
  pages:   number;
  message: string;
}

// ── Auth header helper ────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('npms_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── API Functions ─────────────────────────────────────────────

/**
 * Fetch paginated project list from PostgreSQL.
 * Falls back to static data on network failure.
 */
export async function fetchZoProjects(params?: {
  page?:   number;
  size?:   number;
  search?: string;
  mgrId?:  number;
}): Promise<{ projects: Project[]; total: number; fromCache: boolean }> {
  const qp = new URLSearchParams();
  if (params?.page   !== undefined) qp?.set('page',   String(params.page));
  if (params?.size   !== undefined) qp?.set('size',   String(params.size));
  if (params?.search)               qp?.set('search', params.search);
  if (params?.mgrId  !== undefined) qp?.set('mgrId',  String(params.mgrId));

  try {
    const res = await fetch(`${ZO_API}?${qp}`, {
      headers: authHeaders(),
      signal:  AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json: ApiPagedResponse<Project> = await res.json();
    return { projects: json.data, total: json.total, fromCache: false };

  } catch (err) {
    console.warn('[NPMS] Backend unavailable — using static data. Error:', err);
    // Graceful fallback to static seed data
    const q = params?.search?.toLowerCase() ?? '';
    const filtered = q
      ? PROJECTS.filter((p: any) =>
          p?.projectName.toLowerCase().includes(q) ||
          p?.customerName.toLowerCase().includes(q) ||
          p?.projectCode.toLowerCase().includes(q))
      : PROJECTS;
    return { projects: filtered, total: filtered.length, fromCache: true };
  }
}

/**
 * Fetch single project detail by headerId.
 */
export async function fetchZoProjectDetail(headerId: number): Promise<Project | null> {
  try {
    const res = await fetch(`${ZO_API}/${headerId}`, {
      headers: authHeaders(),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data as Project;
  } catch {
    return PROJECTS.find((p: any) => p?.headerId === headerId) ?? null;
  }
}

/**
 * Fetch dashboard aggregate statistics.
 * Returns pre-computed stats from DB view, or static PROJECT_STATS fallback.
 */
export async function fetchZoStats(mgrId = 1626): Promise<ApiProjectStats> {
  try {
    const res = await fetch(`${ZO_API}/stats?mgrId=${mgrId}`, {
      headers: authHeaders(),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data as ApiProjectStats;
  } catch {
    // Map static PROJECT_STATS to API shape
    return {
      totalProjects:        PROJECT_STATS.total,
      totalAmountReceived:  PROJECT_STATS.totalAmountReceived,
      totalPoAmount:        PROJECT_STATS.totalPOAmount,
      totalInvoiced:        PROJECT_STATS.totalInvoiced,
      totalPaid:            PROJECT_STATS.totalPaid,
      totalAbp:             PROJECT_STATS.totalABP,
      totalCommission:      PROJECT_STATS.totalCommission,
      totalVendorPending:   PROJECT_STATS.totalVendorPending,
      totalClientPending:   PROJECT_STATS.totalClientPending,
      totalPos:             PROJECT_STATS.totalPOs,
      totalBillDeskInvoices: PROJECT_STATS.totalBillDeskInvoices,
      totalExpInvoices:     PROJECT_STATS.totalExpInvoices,
      totalTaxInvoices:     PROJECT_STATS.totalTaxInvoices,
      pendingCount:         PROJECT_STATS.pending,
      clearedCount:         PROJECT_STATS.cleared,
      partialCount:         PROJECT_STATS.partial,
    };
  }
}

/**
 * Fetch state-wise summary from DB.
 */
export async function fetchStateSummary(): Promise<Array<{ state_code: string; project_count: number; total_received: number; total_commission: number }>> {
  try {
    const res = await fetch(`${ZO_API}/states`, { headers: authHeaders(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data;
  } catch {
    return [];
  }
}

/**
 * Fetch projects with pending vendor payments.
 */
export async function fetchVendorPending(): Promise<Project[]> {
  try {
    const res = await fetch(`${ZO_API}/vendor-pending`, { headers: authHeaders(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data;
  } catch {
    return PROJECTS.filter((p: any) => p?.vendorPendingPayment > 0);
  }
}
