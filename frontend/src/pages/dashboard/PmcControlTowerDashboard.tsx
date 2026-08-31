import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CircleDollarSign, Clock3, RefreshCw, ShieldAlert, Ticket, TimerReset } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import './RoleDashboards.css';

type Row = Record<string, any>;

const ageText = (date?: string) => {
  if (!date) return '—';
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const hours = Math.floor(diff / 3_600_000);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const PmcMetric = ({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone?: string }) => (
  <div className={`role-kpi ${tone ? `role-kpi--${tone}` : ''}`}><span>{icon}</span><strong>{value}</strong><span>{label}</span></div>
);

export const PmcControlTowerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [ticketRes, overdueRes, holdRes] = await Promise.allSettled([
        axios.get('/api/v1/tickets', { params: { page: 0, size: 100 } }),
        axios.get('/api/v1/lifecycle/overdue'),
        axios.get('/api/v1/lifecycle/on-hold'),
      ]);
      if (ticketRes.status === 'fulfilled') setTickets(ticketRes.value.data?.data ?? []);
      const overdue = overdueRes.status === 'fulfilled' ? (overdueRes.value.data?.data ?? []) : [];
      const holds = holdRes.status === 'fulfilled' ? (holdRes.value.data?.data ?? []) : [];
      setProjects([...overdue, ...holds]);
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overdueTickets = useMemo(() => tickets.filter(t => t.isOverdue || ['SLA_BREACHED', 'OVERDUE'].includes(t.status)), [tickets]);
  const escalated = useMemo(() => tickets.filter(t => t.escalated || t.status === 'ESCALATED'), [tickets]);
  const critical = useMemo(() => tickets.filter(t => t.priority === 'CRITICAL'), [tickets]);
  const open = useMemo(() => tickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status)), [tickets]);
  const onHold = useMemo(() => projects.filter(p => p.isOnHold).length, [projects]);

  const queue = useMemo(() => [...tickets].sort((a, b) => {
    const priority: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    if (!!a.isOverdue !== !!b.isOverdue) return a.isOverdue ? -1 : 1;
    return (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9);
  }).slice(0, 20), [tickets]);

  return (
    <div className="role-dashboard">
      <div className="role-hero role-hero--pmc">
        <div>
          <div className="role-eyebrow">CONTROL • EXCEPTION MANAGEMENT</div>
          <h1>PMC Control Tower</h1>
          <p>{user?.fullName ?? user?.username}: monitor exceptions across projects, intervene on SLA risks, and maintain a complete escalation trail.</p>
        </div>
        <div className="role-hero-actions">
          <button className="role-refresh" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh</button>
          <button className="role-primary" onClick={() => navigate('/pmc')}><ArrowUpRight size={15} /> Open full tower</button>
        </div>
      </div>

      <div className="role-kpis">
        <PmcMetric icon={<AlertTriangle size={19} />} value={overdueTickets.length} label="Overdue Tickets" tone="danger" />
        <PmcMetric icon={<ArrowUpRight size={19} />} value={escalated.length} label="Escalated" tone="warning" />
        <PmcMetric icon={<CircleDollarSign size={19} />} value={onHold} label="Financial Holds" tone="warning" />
        <PmcMetric icon={<ShieldAlert size={19} />} value={critical.length} label="Critical Tickets" tone="danger" />
        <PmcMetric icon={<Ticket size={19} />} value={open.length} label="Open Tickets" tone="info" />
      </div>

      <div className="role-grid-2">
        <section className="role-panel">
          <div className="role-panel-head"><div><h2>Priority Heatmap</h2><p>Current operational pressure across the visible PMC queue.</p></div><TimerReset size={18} /></div>
          <div className="priority-bars">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(priority => {
              const count = tickets.filter(t => t.priority === priority).length;
              const max = Math.max(1, tickets.length);
              return <div key={priority} className="priority-row"><span>{priority}</span><div className="priority-track"><div className="priority-fill" style={{ width: `${Math.round((count / max) * 100)}%` }} /></div><strong>{count}</strong></div>;
            })}
          </div>
        </section>

        <section className="role-panel">
          <div className="role-panel-head"><div><h2>Exception Focus</h2><p>What needs a PMC decision today.</p></div><ShieldAlert size={18} /></div>
          <div className="exception-list">
            <button onClick={() => navigate('/tickets?status=ESCALATED')}><span>Escalations requiring intervention</span><strong>{escalated.length}</strong></button>
            <button onClick={() => navigate('/tickets?overdue=true')}><span>SLA / overdue tickets</span><strong>{overdueTickets.length}</strong></button>
            <button onClick={() => navigate('/projects?status=ON_HOLD')}><span>Projects on financial hold</span><strong>{onHold}</strong></button>
          </div>
        </section>
      </div>

      <section className="role-panel">
        <div className="role-panel-head"><div><h2>Exception Queue</h2><p>Prioritised view. Open a ticket for its full event history, evidence, comments, and current owner.</p></div><span className="role-muted">{queue.length} shown</span></div>
        {loading ? <div className="role-empty"><div className="role-spinner" /><span>Loading control-tower data…</span></div> : queue.length === 0 ? <div className="role-empty role-empty--success"><CheckCircleFallback /> <h3>No active exceptions</h3><p>The visible queue has no tickets requiring intervention.</p></div> : (
          <div className="role-table-wrap"><table className="role-table"><thead><tr><th>Ticket</th><th>Project</th><th>Priority</th><th>Status</th><th>Age</th><th>Owner</th><th /></tr></thead><tbody>
            {queue.map(t => <tr key={t.id}><td><strong>{t.ticketCode ?? `TKT-${t.id}`}</strong><small>{t.ticketType ?? 'Ticket'}</small></td><td>{t.projectCode ?? t.headerId ?? '—'}</td><td><span className={`priority-dot priority-dot--${String(t.priority ?? '').toLowerCase()}`}>{t.priority ?? '—'}</span></td><td>{String(t.status ?? '').replaceAll('_', ' ')}</td><td><span className={t.isOverdue ? 'text-danger' : ''}><Clock3 size={13} /> {ageText(t.createdAt)}</span></td><td>{t.assignedTo ?? t.assignedUsername ?? 'Unassigned'}</td><td><button className="table-action" onClick={() => navigate(`/tickets/${t.id}`)}>Review →</button></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
};

const CheckCircleFallback = () => <span className="role-success-mark">✓</span>;
