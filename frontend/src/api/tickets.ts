import axios from 'axios';

const BASE = '/api/v1/tickets';

export interface ProjectTicket {
  id: number;
  headerId: number;
  ticketCode: string;
  title: string;
  description?: string;
  ticketType: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  createdBy: string;
  assignedTo?: string;
  reviewedBy?: string;
  escalatedTo?: string;
  slaHours: number;
  slaDeadline?: string;
  isOverdue: boolean;
  resolvedAt?: string;
  closedAt?: string;
  reopenReason?: string;
  stageRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: number;
  ticketId: number;
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  performedBy: string;
  actingAs?: string;
  remarks?: string;
  evidenceUrl?: string;
  eventAt: string;
}

export const TICKET_TYPES = [
  'PO_FOLLOW_UP',
  'BILL_SUBMISSION',
  'RECEIPT_PENDING',
  'GST_INVOICE',
  'VENDOR_REMINDER',
  'PENALTY_WAIVER',
  'EXPIRY_RENEWAL',
  'COMPLIANCE_AUDIT',
  'SITE_VISIT',
  'CLIENT_COORDINATION',
  'INTERNAL_APPROVAL',
  'NICSI_HOLD_RELEASE',
  'GENERAL',
] as const;

export const TICKET_TYPE_LABELS: Record<string, string> = {
  PO_FOLLOW_UP:         '📄 PO Follow-Up',
  BILL_SUBMISSION:      '🧾 Bill Submission',
  RECEIPT_PENDING:      '💰 Receipt Pending from Client',
  GST_INVOICE:          '🏛️ GST Tax Invoice',
  VENDOR_REMINDER:      '🔔 Vendor Reminder',
  PENALTY_WAIVER:       '⚖️ Penalty / Waiver Request',
  EXPIRY_RENEWAL:       '📅 PO Expiry / Renewal',
  COMPLIANCE_AUDIT:     '✅ Compliance & Audit',
  SITE_VISIT:           '🏗️ Site / Field Visit',
  CLIENT_COORDINATION:  '🤝 Client Coordination',
  INTERNAL_APPROVAL:    '🔏 Internal NICSI Approval',
  NICSI_HOLD_RELEASE:   '🔓 NICSI Hold Release',
  GENERAL:              '📌 General / Other',
};


export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH:     '#EA580C',
  MEDIUM:   '#D97706',
  LOW:      '#16A34A',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN:             '#3B82F6',
  IN_PROGRESS:      '#8B5CF6',
  AWAITING_REVIEW:  '#F59E0B',
  RESOLVED:         '#10B981',
  CLOSED:           '#6B7280',
  REOPENED:         '#EF4444',
};

/** List tickets (with optional filters). */
export async function listTickets(params: {
  headerId?: number;
  prjMgrId?: number;
  status?: string;
  priority?: string;
} = {}): Promise<{ success: boolean; count: number; data: ProjectTicket[] }> {
  const res = await axios.get(BASE, { params, withCredentials: true });
  return res.data;
}

/** Get single ticket + its full event log. */
export async function getTicket(id: number): Promise<{
  success: boolean;
  ticket: ProjectTicket;
  events: TicketEvent[];
}> {
  const res = await axios.get(`${BASE}/${id}`, { withCredentials: true });
  return res.data;
}

/** Create a new ticket. */
export async function createTicket(payload: {
  headerId: number;
  title: string;
  description?: string;
  ticketType?: string;
  priority?: string;
  stageRef?: string;
}): Promise<{ success: boolean; message: string; data: ProjectTicket }> {
  const res = await axios.post(BASE, payload, { withCredentials: true });
  return res.data;
}

/** Assign ticket to an OA. */
export async function assignTicket(id: number, assignTo: string, remarks?: string) {
  const res = await axios.put(
    `${BASE}/${id}/assign`,
    { assignTo, remarks },
    { withCredentials: true }
  );
  return res.data;
}

/** Update ticket status. */
export async function updateTicketStatus(
  id: number,
  status: string,
  remarks?: string,
  evidenceUrl?: string
) {
  const res = await axios.put(
    `${BASE}/${id}/status`,
    { status, remarks, evidenceUrl },
    { withCredentials: true }
  );
  return res.data;
}

/** Escalate ticket to PMC/MD. */
export async function escalateTicket(id: number, escalateTo: string, remarks?: string) {
  const res = await axios.put(
    `${BASE}/${id}/escalate`,
    { escalateTo, remarks },
    { withCredentials: true }
  );
  return res.data;
}

/** Reopen a resolved/closed ticket (MD only, mandatory reason). */
export async function reopenTicket(id: number, reopenReason: string) {
  const res = await axios.post(
    `${BASE}/${id}/reopen`,
    { reopenReason },
    { withCredentials: true }
  );
  return res.data;
}

/** Add a comment or evidence to a ticket. */
export async function addComment(id: number, comment: string, evidenceUrl?: string) {
  const res = await axios.post(
    `${BASE}/${id}/comment`,
    { comment, evidenceUrl },
    { withCredentials: true }
  );
  return res.data;
}

/** Get full event log for a ticket. */
export async function getTicketEvents(id: number): Promise<{
  success: boolean;
  count: number;
  data: TicketEvent[];
}> {
  const res = await axios.get(`${BASE}/${id}/events`, { withCredentials: true });
  return res.data;
}

/** Get overdue tickets (PMC/MD only). */
export async function getOverdueTickets() {
  const res = await axios.get(`${BASE}/overdue`, { withCredentials: true });
  return res.data;
}

/** Get escalated tickets (PMC/MD only). */
export async function getEscalatedTickets() {
  const res = await axios.get(`${BASE}/escalated`, { withCredentials: true });
  return res.data;
}

/** OA personal task queue. */
export async function getMyTasks(): Promise<{
  success: boolean;
  count: number;
  data: ProjectTicket[];
}> {
  const res = await axios.get(`${BASE}/my-tasks`, { withCredentials: true });
  return res.data;
}

/** Priority summary for PMC heatmap. */
export async function getPrioritySummary(): Promise<{
  success: boolean;
  data: Record<string, number>;
}> {
  const res = await axios.get(`${BASE}/priority-summary`, { withCredentials: true });
  return res.data;
}
