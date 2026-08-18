import React, { useState, useEffect } from 'react';
import { getMyTasks, updateTicketStatus, addComment, PRIORITY_COLORS, STATUS_COLORS, type ProjectTicket } from '../../api/tickets';
import { TicketDetailModal } from '../../components/tickets/TicketDetailModal';
import { useAuthStore } from '../../store/authStore';
import './OaTaskDashboard.css';

function slaCountdown(deadline?: string): { text: string; urgent: boolean } {
  if (!deadline) return { text: '—', urgent: false };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: 'OVERDUE', urgent: true };
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return { text: `${hrs}h left`, urgent: hrs < 4 };
  return { text: `${Math.floor(hrs / 24)}d left`, urgent: false };
}

export const OaTaskDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<ProjectTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quickStatus, setQuickStatus] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMyTasks();
      setTasks(res.data ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const activeTasks = tasks.filter(t => !['RESOLVED','CLOSED'].includes(t.status));
  const resolvedTasks = tasks.filter(t => ['RESOLVED','CLOSED'].includes(t.status));

  const handleQuickUpdate = async (t: ProjectTicket, newStatus: string) => {
    if (submitting) return;
    setSubmitting(t.id);
    try {
      await updateTicketStatus(t.id, newStatus);
      await load();
    } finally { setSubmitting(null); }
  };

  return (
    <div className="oa-dashboard">
      {/* Header */}
      <div className="oa-header">
        <div>
          <h1 className="oa-title">My Tasks</h1>
          <p className="oa-subtitle">
            Welcome, <strong>{user?.fullName ?? user?.username}</strong> — your assigned work items
          </p>
        </div>
        <button className="oa-refresh-btn" onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary KPIs */}
      <div className="oa-kpi-row">
        <div className="oa-kpi">
          <div className="oa-kpi__value">{activeTasks.length}</div>
          <div className="oa-kpi__label">Active Tasks</div>
        </div>
        <div className="oa-kpi oa-kpi--warn">
          <div className="oa-kpi__value">{tasks.filter(t => t.isOverdue).length}</div>
          <div className="oa-kpi__label">Overdue</div>
        </div>
        <div className="oa-kpi oa-kpi--ok">
          <div className="oa-kpi__value">{resolvedTasks.length}</div>
          <div className="oa-kpi__label">Resolved</div>
        </div>
        <div className="oa-kpi oa-kpi--escalated">
          <div className="oa-kpi__value">{tasks.filter(t => t.escalatedTo).length}</div>
          <div className="oa-kpi__label">Escalated</div>
        </div>
      </div>

      {loading ? (
        <div className="oa-loading"><div className="oa-spinner"/><span>Loading tasks…</span></div>
      ) : activeTasks.length === 0 ? (
        <div className="oa-empty">
          <div className="oa-empty-icon">✓</div>
          <h3>All caught up!</h3>
          <p>You have no active tasks at the moment.</p>
        </div>
      ) : (
        <div className="oa-task-list">
          {activeTasks
            .sort((a, b) => {
              const pOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
              return (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9);
            })
            .map(t => {
              const cd = slaCountdown(t.slaDeadline);
              const nextStatus = t.status === 'OPEN' ? 'IN_PROGRESS'
                : t.status === 'IN_PROGRESS' ? 'AWAITING_REVIEW'
                : t.status === 'REOPENED'     ? 'IN_PROGRESS'
                : null;

              return (
                <div
                  key={t.id}
                  className={`oa-task-card ${t.isOverdue ? 'overdue' : ''} ${t.priority.toLowerCase()}`}
                >
                  {/* Priority stripe */}
                  <div className="oa-priority-stripe" style={{ background: PRIORITY_COLORS[t.priority] }} />

                  <div className="oa-task-main">
                    <div className="oa-task-header">
                      <span className="oa-ticket-code">{t.ticketCode}</span>
                      <span className="oa-task-type">{t.ticketType.replace('_',' ')}</span>
                      {t.stageRef && <span className="oa-stage-ref">{t.stageRef}</span>}
                      {t.isOverdue && <span className="oa-overdue-tag">⚠ OVERDUE</span>}
                      {t.escalatedTo && <span className="oa-escalated-tag">↑ Escalated</span>}
                    </div>

                    <h3 className="oa-task-title" onClick={() => setSelectedId(t.id)}>
                      {t.title}
                    </h3>
                    {t.description && <p className="oa-task-desc">{t.description}</p>}

                    <div className="oa-task-footer">
                      <div className="oa-sla-info">
                        <span className="oa-sla-icon">⏱</span>
                        <span className={`oa-sla-text ${cd.urgent ? 'urgent' : ''}`}>{cd.text}</span>
                      </div>

                      <span
                        className="oa-status-chip"
                        style={{ color: STATUS_COLORS[t.status], background: STATUS_COLORS[t.status] + '18' }}
                      >
                        {t.status.replace('_',' ')}
                      </span>

                      <div className="oa-task-actions">
                        {nextStatus && (
                          <button
                            className="oa-action-btn oa-action-btn--advance"
                            onClick={() => handleQuickUpdate(t, nextStatus)}
                            disabled={submitting === t.id}
                          >
                            {submitting === t.id ? '…' : `→ ${nextStatus.replace('_',' ')}`}
                          </button>
                        )}
                        <button
                          className="oa-action-btn oa-action-btn--detail"
                          onClick={() => setSelectedId(t.id)}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Recently Resolved */}
      {resolvedTasks.length > 0 && (
        <div className="oa-resolved-section">
          <h4 className="oa-resolved-title">Recently Resolved ({resolvedTasks.length})</h4>
          <div className="oa-resolved-list">
            {resolvedTasks.slice(0, 5).map(t => (
              <div key={t.id} className="oa-resolved-item" onClick={() => setSelectedId(t.id)}>
                <span className="oa-ticket-code">{t.ticketCode}</span>
                <span className="oa-resolved-name">{t.title}</span>
                <span className="oa-resolved-status" style={{ color: STATUS_COLORS[t.status] }}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedId && (
        <TicketDetailModal
          ticketId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
};
