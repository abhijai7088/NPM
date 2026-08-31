import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, RotateCcw, TimerReset } from 'lucide-react';
import { getMyTasks, updateTicketStatus, PRIORITY_COLORS, STATUS_COLORS, TICKET_TYPE_LABELS, type ProjectTicket } from '../../api/tickets';
import { TicketDetailModal } from '../../components/tickets/TicketDetailModal';
import { useAuthStore } from '../../store/authStore';
import './RoleDashboards.css';

const activeStatus = (status: string) => !['RESOLVED', 'CLOSED'].includes(status);

function slaLabel(deadline?: string) {
  if (!deadline) return { text: 'No SLA', urgent: false };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: 'OVERDUE', urgent: true };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return { text: `${hours}h left`, urgent: hours < 4 };
  return { text: `${Math.floor(hours / 24)}d left`, urgent: false };
}

export const OaExecutionDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<ProjectTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await getMyTasks();
      setTasks(res.data ?? []);
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => tasks.filter(t => activeStatus(t.status)), [tasks]);
  const overdue = useMemo(() => tasks.filter(t => t.isOverdue), [tasks]);
  const returned = useMemo(() => tasks.filter(t => t.status === 'REOPENED'), [tasks]);
  const resolved = useMemo(() => tasks.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)), [tasks]);
  const pendingAck = useMemo(() => tasks.filter(t => t.status === 'AWAITING_REVIEW'), [tasks]);

  const advance = async (ticket: ProjectTicket) => {
    const next = ticket.status === 'OPEN' || ticket.status === 'REOPENED'
      ? 'IN_PROGRESS'
      : ticket.status === 'IN_PROGRESS' ? 'AWAITING_REVIEW' : null;
    if (!next || submitting) return;
    setSubmitting(ticket.id);
    try {
      await updateTicketStatus(ticket.id, next, next === 'AWAITING_REVIEW' ? 'Work completed and submitted for PM review.' : undefined);
      await load(true);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="role-dashboard">
      <div className="role-hero role-hero--oa">
        <div>
          <div className="role-eyebrow">OPERATIONS • OA WORK QUEUE</div>
          <h1>OA Execution Desk</h1>
          <p>Welcome, {user?.fullName ?? user?.username}. Work only the tickets assigned to you, submit evidence, and move completed work to PM review.</p>
        </div>
        <button className="role-refresh" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {returned.length > 0 && (
        <div className="role-alert role-alert--danger">
          <RotateCcw size={18} />
          <div>
            <strong>{returned.length} task{returned.length === 1 ? '' : 's'} returned for correction</strong>
            <span>Open the ticket details to read the PM's correction remarks before resubmitting.</span>
          </div>
        </div>
      )}

      <div className="role-kpis">
        <div className="role-kpi"><Clock3 size={19} /><strong>{active.length}</strong><span>Active Tasks</span></div>
        <div className="role-kpi role-kpi--danger"><AlertCircle size={19} /><strong>{overdue.length}</strong><span>Overdue</span></div>
        <div className="role-kpi role-kpi--warning"><RotateCcw size={19} /><strong>{returned.length}</strong><span>Returned for Correction</span></div>
        <div className="role-kpi role-kpi--success"><CheckCircle2 size={19} /><strong>{resolved.length}</strong><span>Resolved</span></div>
        <div className="role-kpi role-kpi--info"><TimerReset size={19} /><strong>{pendingAck.length}</strong><span>Pending PM Review</span></div>
      </div>

      <div className="role-section-head">
        <div><h2>My Assigned Work</h2><p>Prioritised by severity and SLA. No organisation-wide project access is required for OA execution.</p></div>
      </div>

      {loading ? (
        <div className="role-empty"><div className="role-spinner" /><span>Loading your task queue…</span></div>
      ) : active.length === 0 ? (
        <div className="role-empty role-empty--success"><CheckCircle2 size={34} /><h3>All caught up</h3><p>You have no active operational tasks right now.</p></div>
      ) : (
        <div className="oa-task-grid">
          {[...active].sort((a, b) => {
            const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
            if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
            return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
          }).map(ticket => {
            const sla = slaLabel(ticket.slaDeadline);
            const next = ticket.status === 'OPEN' || ticket.status === 'REOPENED' ? 'IN_PROGRESS' : ticket.status === 'IN_PROGRESS' ? 'AWAITING_REVIEW' : null;
            return (
              <article key={ticket.id} className={`oa-task-card ${ticket.isOverdue ? 'is-overdue' : ''}`}>
                <div className="oa-task-accent" style={{ background: PRIORITY_COLORS[ticket.priority] }} />
                <div className="oa-task-content">
                  <div className="oa-task-topline">
                    <span className="ticket-code">{ticket.ticketCode}</span>
                    <span className="ticket-priority" style={{ color: PRIORITY_COLORS[ticket.priority] }}>{ticket.priority}</span>
                    {ticket.isOverdue && <span className="ticket-badge ticket-badge--danger">OVERDUE</span>}
                    {ticket.status === 'REOPENED' && <span className="ticket-badge ticket-badge--warning">RETURNED</span>}
                  </div>
                  <button className="oa-task-title" onClick={() => setSelectedId(ticket.id)}>{ticket.title}</button>
                  <div className="oa-task-meta">
                    <span>{TICKET_TYPE_LABELS[ticket.ticketType] ?? ticket.ticketType}</span>
                    {ticket.stageRef && <span>Stage: {ticket.stageRef}</span>}
                  </div>
                  {ticket.description && <p className="oa-task-description">{ticket.description}</p>}
                  <div className="oa-task-footer">
                    <span className={`sla-pill ${sla.urgent ? 'urgent' : ''}`}><TimerReset size={14} /> {sla.text}</span>
                    <span className="status-pill" style={{ color: STATUS_COLORS[ticket.status], background: `${STATUS_COLORS[ticket.status]}18` }}>{ticket.status.replaceAll('_', ' ')}</span>
                    <div className="oa-task-actions">
                      {next && <button onClick={() => advance(ticket)} disabled={submitting === ticket.id}>{submitting === ticket.id ? 'Saving…' : `→ ${next.replaceAll('_', ' ')}`}</button>}
                      <button className="secondary" onClick={() => setSelectedId(ticket.id)}>Details</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedId && <TicketDetailModal ticketId={selectedId} onClose={() => setSelectedId(null)} onRefresh={() => load(true)} />}
    </div>
  );
};
