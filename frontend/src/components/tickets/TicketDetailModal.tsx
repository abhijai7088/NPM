import React, { useState, useEffect, useCallback } from 'react';
import {
  getTicket, assignTicket, updateTicketStatus,
  escalateTicket, reopenTicket, addComment,
  PRIORITY_COLORS, STATUS_COLORS, TICKET_TYPE_LABELS,
  type ProjectTicket, type TicketEvent,
} from '../../api/tickets';
import { useAuthStore } from '../../store/authStore';
import './TicketDetailModal.css';

interface Props {
  ticketId: number;
  onClose: () => void;
  onRefresh?: () => void;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_FLOW: Record<string, string[]> = {
  OPEN:            ['IN_PROGRESS'],
  IN_PROGRESS:     ['AWAITING_REVIEW'],
  AWAITING_REVIEW: ['RESOLVED', 'IN_PROGRESS'],
  REOPENED:        ['IN_PROGRESS'],
};

export const TicketDetailModal: React.FC<Props> = ({ ticketId, onClose, onRefresh }) => {
  const { user } = useAuthStore();
  const role = user?.role ?? 'PM';

  const [ticket, setTicket] = useState<ProjectTicket | null>(null);
  const [events, setEvents]  = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Action states
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [assignTo, setAssignTo]         = useState('');
  const [remarks, setRemarks]           = useState('');
  const [evidenceUrl, setEvidenceUrl]   = useState('');
  const [newStatus, setNewStatus]       = useState('');
  const [escalateTo, setEscalateTo]     = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTicket(ticketId);
      setTicket(data.ticket);
      setEvents(data.events);
    } catch { /* show stale */ }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const resetAction = () => {
    setActiveAction(null);
    setRemarks(''); setEvidenceUrl(''); setAssignTo('');
    setNewStatus(''); setEscalateTo(''); setReopenReason('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!ticket) return;
    setSubmitting(true);
    setError(null);
    try {
      switch (activeAction) {
        case 'assign':
          await assignTicket(ticket.id, assignTo, remarks);
          break;
        case 'status':
          await updateTicketStatus(ticket.id, newStatus, remarks, evidenceUrl || undefined);
          break;
        case 'escalate':
          await escalateTicket(ticket.id, escalateTo, remarks);
          break;
        case 'reopen':
          await reopenTicket(ticket.id, reopenReason);
          break;
        case 'comment':
          await addComment(ticket.id, remarks, evidenceUrl || undefined);
          break;
      }
      resetAction();
      await load();
      onRefresh?.();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !ticket) {
    return (
      <div className="tmd-overlay" onClick={onClose}>
        <div className="tmd-panel" onClick={e => e.stopPropagation()}>
          <div className="tmd-loading"><div className="tmd-spinner"/><span>Loading…</span></div>
        </div>
      </div>
    );
  }

  const nextStatuses = STATUS_FLOW[ticket.status] ?? [];
  const canAssign  = (role === 'PM' || role === 'MD' || role === 'PMC' || role === 'SUPER_ADMIN')
                      && ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED';
  const canStatus  = nextStatuses.length > 0 && ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED';
  const canEscalate= (role === 'PM' || role === 'OA') && ticket.status !== 'CLOSED';
  const canReopen  = (role === 'MD' || role === 'SUPER_ADMIN')
                      && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED');
  const canComment = ticket.status !== 'CLOSED';

  return (
    <div className="tmd-overlay" onClick={onClose}>
      <div className="tmd-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tmd-header">
          <div className="tmd-header__left">
            <span className="tmd-code">{ticket.ticketCode}</span>
            <span className="tmd-type">{TICKET_TYPE_LABELS[ticket.ticketType] ?? ticket.ticketType}</span>
          </div>
          <button className="tmd-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Title + Meta */}
        <div className="tmd-body">
          <h2 className="tmd-title">{ticket.title}</h2>
          {ticket.description && <p className="tmd-desc">{ticket.description}</p>}

          <div className="tmd-chips">
            <span className="tmd-chip" style={{ background: PRIORITY_COLORS[ticket.priority] + '20', color: PRIORITY_COLORS[ticket.priority], borderColor: PRIORITY_COLORS[ticket.priority] + '40' }}>
              ◉ {ticket.priority}
            </span>
            <span className="tmd-chip" style={{ background: STATUS_COLORS[ticket.status] + '20', color: STATUS_COLORS[ticket.status], borderColor: STATUS_COLORS[ticket.status] + '40' }}>
              {ticket.status.replace('_', ' ')}
            </span>
            {ticket.isOverdue && <span className="tmd-chip tmd-chip--overdue">⚠ OVERDUE</span>}
            {ticket.escalatedTo && <span className="tmd-chip tmd-chip--escalated">↑ Escalated → {ticket.escalatedTo}</span>}
          </div>

          <div className="tmd-meta-grid">
            <div className="tmd-meta-item"><label>Created By</label><value>{ticket.createdBy}</value></div>
            <div className="tmd-meta-item"><label>Assigned To</label><value>{ticket.assignedTo ?? '—'}</value></div>
            <div className="tmd-meta-item"><label>Stage Ref</label><value>{ticket.stageRef ?? '—'}</value></div>
            {ticket.slaDeadline && (
              <div className="tmd-meta-item">
                <label>SLA Deadline</label>
                <value className={ticket.isOverdue ? 'overdue' : ''}>
                  {new Date(ticket.slaDeadline).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                </value>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="tmd-actions">
            {canAssign   && <button className="tmd-btn tmd-btn--assign"   onClick={() => { resetAction(); setActiveAction('assign'); }}>Assign OA</button>}
            {canStatus   && <button className="tmd-btn tmd-btn--status"   onClick={() => { resetAction(); setActiveAction('status'); setNewStatus(nextStatuses[0]); }}>Update Status</button>}
            {canEscalate && <button className="tmd-btn tmd-btn--escalate" onClick={() => { resetAction(); setActiveAction('escalate'); }}>Escalate</button>}
            {canReopen   && <button className="tmd-btn tmd-btn--reopen"   onClick={() => { resetAction(); setActiveAction('reopen'); }}>Reopen</button>}
            {canComment  && <button className="tmd-btn tmd-btn--comment"  onClick={() => { resetAction(); setActiveAction('comment'); }}>Add Comment</button>}
          </div>

          {/* Action Form */}
          {activeAction && (
            <div className="tmd-form">
              {activeAction === 'assign' && (
                <input className="tmd-input" placeholder="OA username…" value={assignTo} onChange={e => setAssignTo(e.target.value)} />
              )}
              {activeAction === 'status' && (
                <select className="tmd-select" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                  {nextStatuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              )}
              {activeAction === 'escalate' && (
                <input className="tmd-input" placeholder="Escalate to (username)…" value={escalateTo} onChange={e => setEscalateTo(e.target.value)} />
              )}
              {activeAction === 'reopen' && (
                <textarea className="tmd-textarea" rows={3} placeholder="Reopen reason (mandatory)…" value={reopenReason} onChange={e => setReopenReason(e.target.value)} />
              )}
              {(activeAction === 'comment' || activeAction === 'status') && (
                <textarea className="tmd-textarea" rows={3} placeholder="Remarks…" value={remarks} onChange={e => setRemarks(e.target.value)} />
              )}
              {(activeAction === 'comment' || activeAction === 'status') && (
                <input className="tmd-input" type="url" placeholder="Evidence URL (optional)…" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} />
              )}
              {activeAction === 'assign' && (
                <input className="tmd-input" placeholder="Remarks (optional)…" value={remarks} onChange={e => setRemarks(e.target.value)} />
              )}
              {error && <div className="tmd-error">{error}</div>}
              <div className="tmd-form-actions">
                <button className="tmd-btn tmd-btn--confirm" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Confirm'}
                </button>
                <button className="tmd-btn tmd-btn--cancel" onClick={resetAction}>Cancel</button>
              </div>
            </div>
          )}

          {/* Event Log */}
          <div className="tmd-events">
            <h4 className="tmd-events__title">Activity Log</h4>
            {events.length === 0 ? (
              <div className="tmd-events__empty">No events yet.</div>
            ) : (
              events.map(e => (
                <div key={e.id} className="tmd-event">
                  <div className="tmd-event__avatar">{e.performedBy[0]?.toUpperCase()}</div>
                  <div className="tmd-event__body">
                    <div className="tmd-event__header">
                      <strong>{e.performedBy}</strong>
                      {e.actingAs && <span className="tmd-acting">(acting as {e.actingAs})</span>}
                      <span className={`tmd-event-type tmd-event-type--${e.eventType.toLowerCase()}`}>{e.eventType}</span>
                      {e.fromStatus && e.toStatus && (
                        <span className="tmd-status-change">{e.fromStatus} → {e.toStatus}</span>
                      )}
                      <span className="tmd-event__time">{timeAgo(e.eventAt)}</span>
                    </div>
                    {e.remarks && <p className="tmd-event__remarks">{e.remarks}</p>}
                    {e.evidenceUrl && (
                      <a href={e.evidenceUrl} target="_blank" rel="noreferrer" className="tmd-evidence">📎 View Evidence</a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
