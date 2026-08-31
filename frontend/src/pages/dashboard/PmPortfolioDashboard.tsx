import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, RefreshCw, Ticket } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import './RoleDashboards.css';

export const PmPortfolioDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const params: any = { page: 0, size: 500 };
      if (user?.prjMgrId) params.prjMgrId = user.prjMgrId;
      const [p, t] = await Promise.allSettled([
        axios.get('/api/v1/projects/advanced-search', { params }),
        axios.get('/api/v1/tickets', { params: { page: 0, size: 100 } }),
      ]);
      if (p.status === 'fulfilled') setProjects(p.value.data?.data ?? []);
      if (t.status === 'fulfilled') setTickets(t.value.data?.data ?? []);
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, [user?.prjMgrId]);

  useEffect(() => { load(); }, [load]);
  const active = tickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status));
  const overdue = tickets.filter(t => t.isOverdue);
  const review = tickets.filter(t => t.status === 'AWAITING_REVIEW');
  const closed = tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));

  const financial = useMemo(() => projects.reduce((a, p) => a + Number(p.amountReceived || 0), 0), [projects]);
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, notation: n >= 1e7 ? 'compact' : 'standard' }).format(n);

  return <div className="role-dashboard">
    <div className="role-hero role-hero--oa">
      <div><div className="role-eyebrow">PROJECT OWNERSHIP • PM WORKSPACE</div><h1>My Project Portfolio</h1><p>{user?.fullName ?? user?.username} · PM ID {user?.prjMgrId ?? 'Not linked'} · {user?.zone ?? 'Zone not configured'}</p></div>
      <button className="role-refresh" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={15} /> Refresh</button>
    </div>
    <div className="role-kpis">
      <div className="role-kpi"><FolderKanban size={19} /><strong>{projects.length}</strong><span>Assigned Projects</span></div>
      <div className="role-kpi role-kpi--info"><Ticket size={19} /><strong>{active.length}</strong><span>Open Tickets</span></div>
      <div className="role-kpi role-kpi--danger"><AlertTriangle size={19} /><strong>{overdue.length}</strong><span>Overdue</span></div>
      <div className="role-kpi role-kpi--warning"><Clock3 size={19} /><strong>{review.length}</strong><span>Awaiting Review</span></div>
      <div className="role-kpi role-kpi--success"><CheckCircle2 size={19} /><strong>{closed.length}</strong><span>Resolved / Closed</span></div>
    </div>
    <div className="role-grid-2">
      <section className="role-panel"><div className="role-panel-head"><div><h2>Portfolio Snapshot</h2><p>Server-scoped to this PM's assigned projects.</p></div></div><div style={{marginTop:18,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><div><small className="role-muted">Projects</small><div style={{fontSize:24,fontWeight:800}}>{loading ? '…' : projects.length}</div></div><div><small className="role-muted">Amount Received</small><div style={{fontSize:24,fontWeight:800}}>₹{loading ? '…' : fmt(financial)}</div></div></div></section>
      <section className="role-panel"><div className="role-panel-head"><div><h2>Review Queue</h2><p>Items submitted by OAs that require PM decision.</p></div></div><div className="exception-list"><button onClick={() => navigate('/tickets?status=AWAITING_REVIEW')}><span>Awaiting your review</span><strong>{review.length}</strong></button><button onClick={() => navigate('/tickets?status=REOPENED')}><span>Returned / reopened</span><strong>{tickets.filter(t => t.status === 'REOPENED').length}</strong></button><button onClick={() => navigate('/tickets?overdue=true')}><span>SLA risks</span><strong>{overdue.length}</strong></button></div></section>
    </div>
    <section className="role-panel"><div className="role-panel-head"><div><h2>Recent Project Work</h2><p>Open a project for Project 360 lifecycle, tickets, assignments, finance and audit history.</p></div><button className="role-primary" onClick={() => navigate('/projects')}>Open Projects</button></div>
      {projects.slice(0,8).map((p:any) => <button key={p.headerId ?? p.id} onClick={() => navigate(`/projects/${p.headerId ?? p.id}`)} style={{width:'100%',display:'grid',gridTemplateColumns:'1fr 130px 110px',gap:12,alignItems:'center',padding:'11px 0',border:0,borderBottom:'1px solid #edf1f5',background:'transparent',textAlign:'left',cursor:'pointer'}}><span><strong style={{display:'block',color:'#0f172a',fontSize:12}}>{p.projectName ?? p.projectCode ?? 'Project'}</strong><small style={{color:'#94a3b8'}}>{p.projectCode ?? p.headerId ?? '—'}</small></span><span style={{fontSize:11,color:'#64748b'}}>{p.expiryStatus ?? '—'}</span><span style={{fontSize:11,color:'#2563eb',fontWeight:700}}>Project 360 →</span></button>)}
      {!loading && projects.length === 0 && <div className="role-empty"><p>No projects are currently linked to your PM ID.</p></div>}
    </section>
  </div>;
};
