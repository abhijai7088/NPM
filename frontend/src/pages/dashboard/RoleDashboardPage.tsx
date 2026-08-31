import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FolderKanban, RefreshCw, ShieldCheck, Ticket, Users, WalletCards } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { MdDashboard } from './MdDashboard';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { getMyTasks, type ProjectTicket } from '../../api/tickets';
import './RoleDashboardPage.css';

type Role = 'SUPER_ADMIN' | 'MD' | 'PM' | 'PMC' | 'OA';

const money = (v: number) => `₹${(Number(v || 0) / 10000000).toFixed(2)} Cr`;
const age = (date?: string) => {
  if (!date) return '—';
  const h = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3600000));
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

const Metric = ({ label, value, icon, tone = 'default', onClick }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string; onClick?: () => void }) => (
  <button className={`role-metric role-metric--${tone}`} onClick={onClick} type="button">
    <span className="role-metric__icon">{icon}</span><span className="role-metric__body"><strong>{value}</strong><small>{label}</small></span>
  </button>
);

const Toolbar = ({ title, subtitle, onRefresh, loading }: { title: string; subtitle: string; onRefresh?: () => void; loading?: boolean }) => (
  <div className="role-dashboard__toolbar"><div><p className="role-eyebrow">NPMS · Role Workspace</p><h1>{title}</h1><p>{subtitle}</p></div>{onRefresh && <button className="role-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh</button>}</div>
);

export const RoleDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const role = (user?.role as Role) ?? 'PM';
  if (role === 'SUPER_ADMIN') return <SuperAdminDashboard />;
  if (role === 'MD') return <MdDashboard apiStats={{}} apiProjects={[]} pmList={[]} />;
  if (role === 'PMC') return <PmcDashboard />;
  if (role === 'OA') return <OaDashboard />;
  return <PmDashboard />;
};

const OaDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<ProjectTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const load = async () => { setLoading(true); try { const r = await getMyTasks(); setTasks(r.data || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const active = tasks.filter(t => !['RESOLVED','CLOSED'].includes(t.status));
  const overdue = active.filter(t => t.isOverdue);
  const returned = active.filter(t => t.status === 'REOPENED');
  const pendingAck = active.filter(t => t.status === 'AWAITING_REVIEW');
  return <div className="role-dashboard role-dashboard--oa">
    <Toolbar title="OA Execution Desk" subtitle="Your assigned operational work, SLA attention, correction queue and submission status." onRefresh={load} loading={loading}/>
    {returned.length > 0 && <div className="role-alert role-alert--danger"><AlertCircle size={18}/><div><strong>{returned.length} task{returned.length > 1 ? 's' : ''} returned for correction</strong><span>Open the task to review PM feedback before resubmitting.</span></div><button onClick={() => document.getElementById('oa-returned')?.scrollIntoView({ behavior: 'smooth' })}>Review</button></div>}
    <div className="role-metric-grid role-metric-grid--5">
      <Metric label="Active Tasks" value={active.length} icon={<Ticket size={18}/>} />
      <Metric label="Overdue" value={overdue.length} icon={<Clock3 size={18}/>} tone="danger" />
      <Metric label="Returned" value={returned.length} icon={<AlertCircle size={18}/>} tone="warning" />
      <Metric label="Pending ACK" value={pendingAck.length} icon={<ShieldCheck size={18}/>} tone="info" />
      <Metric label="Resolved" value={tasks.filter(t => ['RESOLVED','CLOSED'].includes(t.status)).length} icon={<CheckCircle2 size={18}/>} tone="success" />
    </div>
    <section className="role-panel" id="oa-returned"><div className="role-panel__head"><div><h2>My Work Queue</h2><p>Prioritised by urgency and SLA.</p></div><button onClick={() => navigate('/my-tasks')} className="role-link">Open full task desk <ArrowRight size={15}/></button></div>
      {loading ? <div className="role-empty">Loading assigned work…</div> : active.length === 0 ? <div className="role-empty role-empty--success"><CheckCircle2/><strong>All caught up</strong><span>No active operational tasks require action.</span></div> : <div className="role-task-list">{active.slice().sort((a,b) => (Number(b.isOverdue)-Number(a.isOverdue)) || (a.priority.localeCompare(b.priority))).map(t => <button key={t.id} className={`role-task ${t.isOverdue ? 'is-overdue' : ''}`} onClick={() => navigate(`/tickets?id=${t.id}`)}><span className="role-task__code">{t.ticketCode}</span><span className="role-task__main"><strong>{t.title}</strong><small>{t.ticketType.replaceAll('_',' ')} · {t.status.replaceAll('_',' ')}</small></span><span className="role-task__meta"><b>{t.isOverdue ? 'OVERDUE' : age(t.slaDeadline)}</b><ArrowRight size={15}/></span></button>)}</div>}
    </section>
  </div>;
};

const PmcDashboard: React.FC = () => {
  const [data, setData] = useState({ overdue: [] as ProjectTicket[], escalated: [] as ProjectTicket[], priority: {} as Record<string, number>, held: [] as any[], sla: [] as any[] });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const load = async () => { setLoading(true); const [od, es, pr, hold, sla] = await Promise.allSettled([axios.get('/api/v1/tickets/overdue'), axios.get('/api/v1/tickets/escalated'), axios.get('/api/v1/tickets/priority-summary'), axios.get('/api/v1/lifecycle/on-hold'), axios.get('/api/v1/lifecycle/overdue')]); setData({ overdue: od.status === 'fulfilled' ? od.value.data?.data || [] : [], escalated: es.status === 'fulfilled' ? es.value.data?.data || [] : [], priority: pr.status === 'fulfilled' ? pr.value.data?.data || {} : {}, held: hold.status === 'fulfilled' ? hold.value.data?.data || [] : [], sla: sla.status === 'fulfilled' ? sla.value.data?.data || [] : [] }); setLoading(false); };
  useEffect(() => { load(); }, []);
  const open = Object.values(data.priority).reduce((a,b) => a + Number(b || 0), 0);
  return <div className="role-dashboard role-dashboard--pmc">
    <Toolbar title="PMC Control Tower" subtitle="Exception management for SLA breaches, escalations, holds and project monitoring." onRefresh={load} loading={loading}/>
    <div className="role-metric-grid role-metric-grid--5"><Metric label="Overdue Tickets" value={data.overdue.length} icon={<Clock3/>} tone="danger"/><Metric label="Escalated" value={data.escalated.length} icon={<ArrowRight/>} tone="warning"/><Metric label="On Hold" value={data.held.length} icon={<ShieldCheck/>} tone="hold"/><Metric label="SLA Breaches" value={data.sla.length} icon={<AlertCircle/>} tone="danger"/><Metric label="Open Tickets" value={open} icon={<Ticket/>} tone="info"/></div>
    <div className="role-grid role-grid--2"><section className="role-panel"><div className="role-panel__head"><div><h2>Priority Heatmap</h2><p>Open work by urgency.</p></div></div><div className="priority-list">{['CRITICAL','HIGH','MEDIUM','LOW'].map(p => { const n = data.priority[p] || 0; const m = Math.max(...Object.values(data.priority).map(Number),1); return <div className="priority-row" key={p}><b>{p}</b><div><span style={{ width: `${Math.max(4, n/m*100)}%` }}/></div><strong>{n}</strong></div>; })}</div></section>
      <section className="role-panel"><div className="role-panel__head"><div><h2>Escalation Queue</h2><p>Items requiring intervention.</p></div><button className="role-link" onClick={() => navigate('/pmc')}>Open Tower <ArrowRight size={15}/></button></div>{data.escalated.slice(0,6).map(t => <button key={t.id} className="role-list-row" onClick={() => navigate(`/tickets?id=${t.id}`)}><span className="role-list-row__badge">{t.priority}</span><span><strong>{t.title}</strong><small>{t.ticketCode} · {t.status.replaceAll('_',' ')}</small></span><ArrowRight size={15}/></button>)}{data.escalated.length === 0 && <div className="role-empty">No escalations in the current queue.</div>}</section></div>
    <section className="role-panel"><div className="role-panel__head"><div><h2>SLA Attention</h2><p>Oldest exceptions first.</p></div><button className="role-link" onClick={() => navigate('/pmc')}>View all <ArrowRight size={15}/></button></div><div className="role-table"><div className="role-table__row role-table__row--head"><span>Project / Ticket</span><span>Priority</span><span>Age</span><span>Action</span></div>{[...data.overdue].slice(0,8).map(t => <button key={t.id} className="role-table__row" onClick={() => navigate(`/tickets?id=${t.id}`)}><span><strong>{t.ticketCode}</strong><small>{t.title}</small></span><b>{t.priority}</b><span>{age(t.slaDeadline)}</span><ArrowRight size={15}/></button>)}</div></section>
  </div>;
};

const PmDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [tickets, setTickets] = useState<ProjectTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const load = async () => { setLoading(true); const [p, t] = await Promise.all([axios.get('/api/v1/projects/advanced-search', { params: { page: 0, size: 12 } }), axios.get('/api/v1/tickets')]); setProjects(p.data?.data || []); setTickets(t.data?.data || []); setLoading(false); };
  useEffect(() => { load().catch(() => setLoading(false)); }, []);
  const received = projects.reduce((s,p) => s + Number(p.amountReceived || 0),0); const po = projects.reduce((s,p) => s + Number(p.poAmount || 0),0); const pending = projects.reduce((s,p) => s + Math.max(0, Number(p.poAmount || 0)-Number(p.totalAmountPaid || 0)),0);
  const review = tickets.filter(t => t.status === 'AWAITING_REVIEW'); const overdue = tickets.filter(t => t.isOverdue);
  return <div className="role-dashboard role-dashboard--pm"><Toolbar title="Project Portfolio" subtitle={`Owned portfolio for ${user?.fullName || user?.username || 'Project Manager'} · project scope is enforced by the server.`} onRefresh={load} loading={loading}/>
    <div className="role-scope"><FolderKanban size={15}/><span>Own PM scope</span><b>{user?.prjMgrId ? `PRJ_MGR_${user.prjMgrId}` : 'Assigned portfolio'}</b></div>
    <div className="role-metric-grid role-metric-grid--5"><Metric label="Projects" value={projects.length} icon={<FolderKanban/>} onClick={() => navigate('/projects')}/><Metric label="Funds Received" value={money(received)} icon={<WalletCards/>}/><Metric label="PO Value" value={money(po)} icon={<WalletCards/>}/><Metric label="Vendor Outstanding" value={money(pending)} icon={<AlertCircle/>} tone={pending>0?'danger':'success'}/><Metric label="Awaiting Review" value={review.length} icon={<ShieldCheck/>} tone={review.length?'warning':'success'} onClick={() => navigate('/tickets?status=AWAITING_REVIEW')}/></div>
    <div className="role-grid role-grid--2"><section className="role-panel"><div className="role-panel__head"><div><h2>Review Queue</h2><p>Items waiting for your decision.</p></div><button className="role-link" onClick={() => navigate('/tickets?status=AWAITING_REVIEW')}>Open tickets <ArrowRight size={15}/></button></div>{review.slice(0,7).map(t => <button key={t.id} className="role-list-row" onClick={() => navigate(`/tickets?id=${t.id}`)}><span className="role-list-row__badge role-list-row__badge--review">REVIEW</span><span><strong>{t.title}</strong><small>{t.ticketCode} · {t.assignedTo || 'Unassigned'}</small></span><ArrowRight size={15}/></button>)}{review.length===0 && <div className="role-empty role-empty--success"><CheckCircle2/><span>No tickets waiting for review.</span></div>}</section>
      <section className="role-panel"><div className="role-panel__head"><div><h2>Portfolio Attention</h2><p>Immediate items in your project scope.</p></div><button className="role-link" onClick={() => navigate('/projects')}>View projects <ArrowRight size={15}/></button></div>{overdue.slice(0,7).map(t => <button key={t.id} className="role-list-row" onClick={() => navigate(`/tickets?id=${t.id}`)}><span className="role-list-row__badge role-list-row__badge--danger">OVERDUE</span><span><strong>{t.title}</strong><small>{t.ticketCode} · {age(t.slaDeadline)}</small></span><ArrowRight size={15}/></button>)}{overdue.length===0 && <div className="role-empty role-empty--success"><CheckCircle2/><span>No overdue tickets.</span></div>}</section></div>
    <section className="role-panel"><div className="role-panel__head"><div><h2>Highest-value Projects</h2><p>Current PM portfolio, ordered by funds received.</p></div><button className="role-link" onClick={() => navigate('/projects')}>Open registry <ArrowRight size={15}/></button></div><div className="role-table"><div className="role-table__row role-table__row--head"><span>Project</span><span>State</span><span>Funds</span><span>PO</span></div>{projects.slice().sort((a,b)=>Number(b.amountReceived||0)-Number(a.amountReceived||0)).slice(0,8).map(p => <button key={p.headerId} className="role-table__row" onClick={() => navigate(`/projects/${p.headerId}`)}><span><strong>{p.projectCode}</strong><small>{p.projectName || 'Project'}</small></span><span>{p.stateCode || '—'}</span><b>{money(p.amountReceived)}</b><span>{money(p.poAmount)}</span></button>)}</div></section>
  </div>;
};
