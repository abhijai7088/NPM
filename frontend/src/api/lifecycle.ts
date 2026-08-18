import axios from 'axios';

const BASE = '/api/v1/lifecycle';

export interface ProjectLifecycle {
  id: number;
  headerId: number;
  currentStage: string;
  assignedPmId?: number;
  assignedOaUsername?: string;
  slaDeadline?: string;
  isOverdue: boolean;
  isOnHold: boolean;
  holdReason?: string;
  notes?: string;
  updatedAt: string;
}

export interface LifecycleTransition {
  id: number;
  headerId: number;
  fromStage?: string;
  toStage: string;
  performedBy: string;
  actingAs?: string;
  remarks: string;
  evidenceUrl?: string;
  transitionType: string;
  transitionedAt: string;
}

export interface LifecycleResponse {
  success: boolean;
  lifecycle: ProjectLifecycle;
  transitions: LifecycleTransition[];
  stageOrder: string[];
}

export const STAGE_ORDER = [
  'DRAFT', 'SANCTION', 'RECEIPT', 'PO_ISSUED',
  'BILL_SUBMITTED', 'APPROVAL_PENDING', 'PAYMENT_DONE', 'CLOSED'
] as const;

export type LifecycleStage = typeof STAGE_ORDER[number];

export const STAGE_LABELS: Record<string, string> = {
  DRAFT:             'Draft',
  SANCTION:          'Sanction Received',
  RECEIPT:           'Client Receipt',
  PO_ISSUED:         'PO Issued',
  BILL_SUBMITTED:    'Bill Submitted',
  APPROVAL_PENDING:  'Approval Pending',
  PAYMENT_DONE:      'Payment Done',
  CLOSED:            'Closed',
};

/** Fetch current lifecycle state + full transition history for a project. */
export async function getLifecycle(headerId: number): Promise<LifecycleResponse> {
  const res = await axios.get(`${BASE}/${headerId}`, { withCredentials: true });
  return res.data;
}

/** Advance or reopen a lifecycle stage. */
export async function transitionStage(
  headerId: number,
  toStage: string,
  remarks: string,
  evidenceUrl?: string,
  reopen?: boolean
): Promise<{ success: boolean; lifecycle: ProjectLifecycle; message: string }> {
  const res = await axios.post(
    `${BASE}/${headerId}/transition`,
    { toStage, remarks, evidenceUrl, reopen: reopen ? 'true' : undefined },
    { withCredentials: true }
  );
  return res.data;
}

/** Place project on financial hold (MD/PMC only). */
export async function placeHold(headerId: number, holdReason: string) {
  const res = await axios.post(
    `${BASE}/${headerId}/hold`,
    { holdReason },
    { withCredentials: true }
  );
  return res.data;
}

/** Release financial hold (MD/PMC only). */
export async function releaseHold(headerId: number, remarks: string) {
  const res = await axios.post(
    `${BASE}/${headerId}/release`,
    { remarks },
    { withCredentials: true }
  );
  return res.data;
}

/** Get all overdue projects (PMC/MD). */
export async function getOverdueProjects() {
  const res = await axios.get(`${BASE}/overdue`, { withCredentials: true });
  return res.data;
}

/** Get all on-hold projects (PMC/MD). */
export async function getOnHoldProjects() {
  const res = await axios.get(`${BASE}/on-hold`, { withCredentials: true });
  return res.data;
}

/** Get stage distribution counts for KPI cards. */
export async function getStageCounts(): Promise<{ success: boolean; data: Record<string, number> }> {
  const res = await axios.get(`${BASE}/stage-counts`, { withCredentials: true });
  return res.data;
}
