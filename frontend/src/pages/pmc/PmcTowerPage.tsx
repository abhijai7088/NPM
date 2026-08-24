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

import axios from 'axios';

export const PmcTowerPage: React.FC = () => {
  const [overdue, setOverdue]       = useState<ProjectTicket[]>([]);
  const [escalated, setEscalated]   = useState<ProjectTicket[]>([]);
  const [priority, setPriority]     = useState<Record<string,number>>({});
  const [stageCounts, setStageCounts] = useState<Record<string,number>>({});
  const [overdueProjects, setOverdueProjects] = useState<any[]>([]);
  const [heldProjects, setHeldProjects]       = useState<any[]>([]);
  const [pmcProjects, setPmcProjects]         = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [od, esc, pri, sc, op, hp, pmcRes] = await Promise.allSettled([
        getOverdueTickets(),
        getEscalatedTickets(),
        getPrioritySummary(),
        getStageCounts(),
        getOverdueProjects(),
        getOnHoldProjects(),
        axios.get('/api/v1/projects/pmc-monitored')
      ]);
      if (od.status === 'fulfilled') setOverdue(od.value.data ?? []);
      if (esc.status === 'fulfilled') setEscalated(esc.value.data ?? []);
      if (pri.status === 'fulfilled') setPriority(pri.value.data ?? {});
      if (sc.status === 'fulfilled') setStageCounts(sc.value.data ?? {});
      if (op.status === 'fulfilled') setOverdueProjects(op.value.data ?? []);
      if (hp.status === 'fulfilled') setHeldProjects(hp.value.data ?? []);
      if (pmcRes.status === 'fulfilled' && pmcRes.value.data?.success) {
        setPmcProjects(pmcRes.value.data.data || []);
      }
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

          {/* 🏰 PMC Monitored Projects Desk */}
          <div className="pmc-card" style={{ marginTop: '1.5rem', padding: '1.25rem', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0, 51, 102, 0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#003366', margin: 0 }}>
                  🏰 PMC Tower Monitored Projects Desk
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 0 0' }}>
                  Projects flagged by Admin/MD for active Project Monitoring Cell oversight & compliance tracking.
                </p>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 12px', borderRadius: '9999px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                {pmcProjects.length} PMC Monitored Projects
              </span>
            </div>

            {pmcProjects.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No projects added to PMC Tower yet. Admin/MD can add projects to PMC oversight from the Allocation Desk.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Project Code</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Project Name & Client</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>Type</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>PO Value</th>
                      <th style={{ padding: '0.65rem 0.8rem' }}>PMC Status</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pmcProjects.map((p: any) => (
                      <tr key={p.headerId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.8rem', fontFamily: 'monospace', fontWeight: 700, color: '#00509d' }}>
                          {p.projectCode}
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.projectName}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{p.customerName}</div>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                            {p.prjType || 'GN'}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700, color: '#334155' }}>
                          ₹{((p.poAmount || 0) / 100000).toFixed(2)} L
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '9999px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                            🏰 PMC Monitored
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>
                          <a href={`/projects?search=${encodeURIComponent(p.projectCode)}`} style={{ fontSize: '0.75rem', fontWeight: 700, color: '#006699', textDecoration: 'none' }}>
                            View Details →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
