import React, { useState, useEffect } from 'react';
import {
  getOverdueTickets, getEscalatedTickets,
  getPrioritySummary, listTickets, createTicket,
  PRIORITY_COLORS, STATUS_COLORS, TICKET_TYPE_LABELS,
  type ProjectTicket,
} from '../../api/tickets';
import { getOverdueProjects, getOnHoldProjects, getStageCounts, STAGE_LABELS } from '../../api/lifecycle';
import { TicketDetailModal } from '../../components/tickets/TicketDetailModal';
import './PmcTowerPage.css';

export const PmcTowerPage: React.FC = () => {
  const [overdue, setOverdue]       = useState<ProjectTicket[]>([]);
  const [escalated, setEscalated]   = useState<ProjectTicket[]>([]);
  const [priority, setPriority]     = useState<Record<string,number>>({});
  const [stageCounts, setStageCounts] = useState<Record<string,number>>({});
  const [overdueProjects, setOverdueProjects] = useState<any[]>([]);
  const [heldProjects, setHeldProjects]       = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [od, esc, pri, sc, op, hp] = await Promise.allSettled([
        getOverdueTickets(),
        getEscalatedTickets(),
        getPrioritySummary(),
        getStageCounts(),
        getOverdueProjects(),
        getOnHoldProjects(),
      ]);
      if (od.status === 'fulfilled') setOverdue(od.value.data ?? []);
      if (esc.status === 'fulfilled') setEscalated(esc.value.data ?? []);
      if (pri.status === 'fulfilled') setPriority(pri.value.data ?? {});
      if (sc.status === 'fulfilled') setStageCounts(sc.value.data ?? {});
      if (op.status === 'fulfilled') setOverdueProjects(op.value.data ?? []);
      if (hp.status === 'fulfilled') setHeldProjects(hp.value.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalOpen = (priority.CRITICAL ?? 0) + (priority.HIGH ?? 0) +
                    (priority.MEDIUM ?? 0) + (priority.LOW ?? 0);

  return (
    <div className="pmc-tower">
      {/* Header */}
      <div className="pmc-header">
        <div>
          <h1 className="pmc-title">PMC Control Tower</h1>
          <p className="pmc-subtitle">Project Monitoring Cell — Organisation-wide oversight dashboard</p>
        </div>
        <button className="pmc-refresh-btn" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="pmc-loading"><div className="pmc-spinner"/><span>Loading tower data…</span></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="pmc-kpi-row">
            <div className="pmc-kpi pmc-kpi--danger">
              <div className="pmc-kpi__icon">⚠</div>
              <div>
                <div className="pmc-kpi__value">{overdue.length}</div>
                <div className="pmc-kpi__label">Overdue Tickets</div>
              </div>
            </div>
            <div className="pmc-kpi pmc-kpi--warning">
              <div className="pmc-kpi__icon">↑</div>
              <div>
                <div className="pmc-kpi__value">{escalated.length}</div>
                <div className="pmc-kpi__label">Escalated Tickets</div>
              </div>
            </div>
            <div className="pmc-kpi pmc-kpi--hold">
              <div className="pmc-kpi__icon">⊘</div>
              <div>
                <div className="pmc-kpi__value">{heldProjects.length}</div>
                <div className="pmc-kpi__label">Projects on Hold</div>
              </div>
            </div>
            <div className="pmc-kpi pmc-kpi--overdue-proj">
              <div className="pmc-kpi__icon">⏱</div>
              <div>
                <div className="pmc-kpi__value">{overdueProjects.length}</div>
                <div className="pmc-kpi__label">SLA-Breached Projects</div>
              </div>
            </div>
            <div className="pmc-kpi pmc-kpi--info">
              <div className="pmc-kpi__icon">◉</div>
              <div>
                <div className="pmc-kpi__value">{totalOpen}</div>
                <div className="pmc-kpi__label">Total Open Tickets</div>
              </div>
            </div>
          </div>

          {/* Two column layout */}
          <div className="pmc-main-grid">
            {/* LEFT: Priority Heatmap + Stage Distribution */}
            <div className="pmc-left">
              {/* Priority heatmap */}
              <div className="pmc-card">
                <h3 className="pmc-card__title">Open Tickets by Priority</h3>
                <div className="pmc-priority-bars">
                  {(['CRITICAL','HIGH','MEDIUM','LOW'] as const).map(p => {
                    const count = priority[p] ?? 0;
                    const max   = Math.max(...Object.values(priority), 1);
                    return (
                      <div key={p} className="pmc-priority-bar">
                        <span className="pmc-priority-label" style={{ color: PRIORITY_COLORS[p] }}>
                          {p}
                        </span>
                        <div className="pmc-bar-track">
                          <div
                            className="pmc-bar-fill"
                            style={{
                              width: `${(count / max) * 100}%`,
                              background: PRIORITY_COLORS[p],
                            }}
                          />
                        </div>
                        <span className="pmc-bar-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stage distribution */}
              <div className="pmc-card">
                <h3 className="pmc-card__title">Project Stage Distribution</h3>
                <div className="pmc-stages">
                  {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                    <div key={stage} className="pmc-stage-row">
                      <span className="pmc-stage-label">{label}</span>
                      <div className="pmc-stage-bar-track">
                        <div
                          className="pmc-stage-bar-fill"
                          style={{ width: `${Math.min(100, ((stageCounts[stage] ?? 0) / Math.max(...Object.values(stageCounts), 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="pmc-stage-count">{stageCounts[stage] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: Escalated + Overdue tickets */}
            <div className="pmc-right">
              {/* Escalation Queue */}
              <div className="pmc-card">
                <h3 className="pmc-card__title">🔺 Escalation Queue ({escalated.length})</h3>
                {escalated.length === 0 ? (
                  <div className="pmc-empty">No escalated tickets. All clear!</div>
                ) : (
                  <div className="pmc-ticket-mini-list">
                    {escalated.map(t => (
                      <div key={t.id} className="pmc-ticket-mini" onClick={() => setSelectedTicketId(t.id)}>
                        <div className="pmc-ticket-mini__header">
                          <span className="pmc-ticket-code">{t.ticketCode}</span>
                          <span className="pmc-ticket-priority" style={{ color: PRIORITY_COLORS[t.priority] }}>
                            {t.priority}
                          </span>
                        </div>
                        <div className="pmc-ticket-mini__title">{t.title}</div>
                        <div className="pmc-ticket-mini__meta">
                          <span>→ {t.escalatedTo}</span>
                          <span style={{ color: STATUS_COLORS[t.status] }}>{t.status.replace('_',' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overdue Tickets */}
              <div className="pmc-card">
                <h3 className="pmc-card__title">⏰ Overdue Tickets ({overdue.length})</h3>
                {overdue.length === 0 ? (
                  <div className="pmc-empty">No overdue tickets.</div>
                ) : (
                  <div className="pmc-ticket-mini-list">
                    {overdue.slice(0, 8).map(t => (
                      <div key={t.id} className="pmc-ticket-mini pmc-ticket-mini--overdue" onClick={() => setSelectedTicketId(t.id)}>
                        <div className="pmc-ticket-mini__header">
                          <span className="pmc-ticket-code">{t.ticketCode}</span>
                          <span className="pmc-ticket-priority" style={{ color: PRIORITY_COLORS[t.priority] }}>
                            {t.priority}
                          </span>
                        </div>
                        <div className="pmc-ticket-mini__title">{t.title}</div>
                        <div className="pmc-ticket-mini__meta">
                          <span>{t.assignedTo ? `@${t.assignedTo}` : 'Unassigned'}</span>
                          {t.slaDeadline && (
                            <span className="pmc-overdue-label">
                              Due: {new Date(t.slaDeadline).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* On-Hold Projects */}
              {heldProjects.length > 0 && (
                <div className="pmc-card">
                  <h3 className="pmc-card__title">⊘ Projects on Financial Hold ({heldProjects.length})</h3>
                  <div className="pmc-held-list">
                    {heldProjects.map(p => (
                      <div key={p.headerId} className="pmc-held-item">
                        <div className="pmc-held-id">#{p.headerId}</div>
                        <div className="pmc-held-stage">{STAGE_LABELS[p.currentStage] ?? p.currentStage}</div>
                        <div className="pmc-held-reason">{p.holdReason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedTicketId && (
        <TicketDetailModal
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
};
