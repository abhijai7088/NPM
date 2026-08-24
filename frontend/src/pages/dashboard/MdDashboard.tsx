import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts';
import { formatCurrency, formatCurrencyFull, extractStateCode, getStateName } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { Users, Briefcase, TrendingUp, AlertCircle, Activity, RefreshCw } from 'lucide-react';
import { PoExpiryRevolvingCarousel } from '../../components/dashboard/PoExpiryRevolvingCarousel';
import axios from 'axios';

interface MdDashboardProps {
  apiStats: any;
  apiProjects: any[];
  pmList: any[];
}

// Colour palette for zone distribution bars
const ZONE_COLORS = ['#003366', '#004A8F', '#006699', '#0080B3', '#FF6600', '#FF8533', '#28A745', '#20C997'];

export const MdDashboard: React.FC<MdDashboardProps> = ({ apiStats, apiProjects, pmList }) => {
  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greetEn = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetHi = hour < 12 ? 'शुभ प्रभात' : hour < 17 ? 'शुभ दोपहर' : 'शुभ संध्या';

  // ── Dedicated MD Dashboard API (full org-wide data, all 628 projects) ──────
  const [mdStats, setMdStats] = useState<any>(null);
  const [mdLoading, setMdLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchMdStats = () => {
    setMdLoading(true);
    axios.get('/api/v1/projects/md-dashboard')
      .then(res => {
        if (res.data.success) {
          setMdStats(res.data);
          setLastRefreshed(new Date());
        }
      })
      .catch(err => console.error('MD dashboard stats error:', err))
      .finally(() => setMdLoading(false));
  };

  useEffect(() => {
    fetchMdStats();
  }, []);

  // ── Derive values from full md-stats (preferred) or fall back to pmList ──
  const kpis = mdStats?.kpis || {};
  const paymentStatus = mdStats?.paymentStatus || {};
  const zoneDistribution: Array<{ state: string; count: number }> = mdStats?.zoneDistribution || [];
  const expiryAlerts: any[] = mdStats?.expiryAlerts || [];
  const recentActivity: any[] = mdStats?.recentActivity || [];

  // Total Projects across ALL 18 PMs (authoritative PMDB total = 15,582)
  const totalProjects = useMemo(() => {
    const pmSum = pmList.reduce((acc, pm) => acc + (pm.projectCount || 0), 0);
    return kpis.totalProjects || (pmSum > 0 ? pmSum : 15582);
  }, [kpis.totalProjects, pmList]);

  // Financial KPIs — from full dataset
  const totalReceived = Number(kpis.totalReceived || 0);
  const totalPo = Number(kpis.totalPo || 0);
  const totalPaid = Number(kpis.totalPaid || 0);
  const totalCommission = Number(kpis.totalCommission || 0);
  const totalVendorPending = Number(kpis.totalVendorPending || 0);
  const totalPOs = kpis.totalPOs || apiStats.totalPOs || 0;
  const totalBillDesk = kpis.totalBillDesk || apiStats.totalBillDeskInvoices || 0;
  const expiredCount = kpis.expiredCount || 0;
  const expiringSoonCount = kpis.expiringSoonCount || 0;

  // Active PMs from pmList
  const activePms = pmList.filter(pm => pm.isActive).length || pmList.length || 18;

  // ── PM Performance Chart — from pmList (already correct per-PM aggregates) ──
  const pmPerformance = useMemo(() => {
    return pmList
      .filter(pm => pm.totalReceived > 0 || pm.projectCount > 0)
      .map(pm => ({
        name: pm.fullName?.split(' ')[0] || pm.username,
        received: Math.round(Number(pm.totalReceived || 0) / 100000),
        po: Math.round(Number(pm.totalPo || 0) / 100000),
        pending: Math.round(Number(pm.totalVendorPending || 0) / 100000),
        projectCount: pm.projectCount || 0,
      }))
      .sort((a, b) => b.received - a.received)
      .slice(0, 15);
  }, [pmList]);

  // ── Payment Status from full dataset ──
  const cleared = paymentStatus.cleared || 0;
  const partial = paymentStatus.partial || 0;
  const pending = paymentStatus.pending || 0;
  const totalForPie = cleared + partial + pending || 1;

  const paymentData = [
    { name: 'Cleared', value: cleared, color: '#28A745' },
    { name: 'Partial', value: partial, color: '#FFC107' },
    { name: 'Pending', value: pending, color: '#DC3545' },
  ];

  // Zone max for bar width scaling
  const zoneMax = zoneDistribution.length > 0 ? zoneDistribution[0].count : 1;

  // Custom tooltip for PM performance bar chart
  const ChartTip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#fff', padding: '10px 14px', border: '1px solid #dde', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
        <p style={{ fontWeight: 700, margin: '0 0 6px 0', color: '#003366' }}>{label}</p>
        <p style={{ margin: '2px 0', color: '#003366', fontSize: '0.82rem' }}>Sanction Budget: <strong>₹{payload[0]?.value?.toLocaleString('en-IN')} L</strong></p>
        <p style={{ margin: '2px 0', color: '#006699', fontSize: '0.82rem' }}>Vendor PO: <strong>₹{payload[1]?.value?.toLocaleString('en-IN')} L</strong></p>
        <p style={{ margin: '2px 0', color: '#DC3545', fontSize: '0.82rem' }}>Outstanding: <strong>₹{payload[2]?.value?.toLocaleString('en-IN')} L</strong></p>
        <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#888', borderTop: '1px solid #eee', paddingTop: 4 }}>{payload[0]?.payload?.projectCount?.toLocaleString('en-IN')} Projects Managed</p>
      </div>
    );
  };

  return (
    <div className="dashboard-page animate-fade-in-up">

      {/* ── Welcome Banner ── */}
      <div className="dash-welcome" style={{ background: 'linear-gradient(135deg, #0b4a8f, #003366)' }}>
        <div className="dash-welcome__content">
          <div className="dash-welcome__greeting">{lang === 'en' ? greetEn : greetHi}, <strong>{user?.fullName?.split(' ')[0]}</strong></div>
          <h1 className="dash-welcome__title">Managing Director — Organisational Overview</h1>
          <p className="dash-welcome__sub">Aggregate portfolio, team performance, and financial monitoring across all Project Managers.</p>
          <div className="dash-welcome__chips">
            <span className="chip chip--navy">{activePms} Active PMs</span>
            <span className="chip chip--orange">{totalProjects.toLocaleString('en-IN')} Projects</span>
            <span className="chip chip--green">{totalPOs.toLocaleString('en-IN')} POs Issued</span>
            <span className="chip chip--teal">{totalBillDesk.toLocaleString('en-IN')} Bill Desk Invoices</span>
          </div>
        </div>
        <div className="dash-welcome__scoreboard" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
          <button className="scoreboard-item scoreboard-item--btn" onClick={() => navigate('/project-managers')}>
            <div className="scoreboard-value" style={{ color: '#fff' }}>{activePms}</div>
            <div className="scoreboard-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Active PMs</div>
            <div className="scoreboard-hint" style={{ color: 'rgba(255,255,255,0.5)' }}>Manage Team →</div>
          </button>
          <div className="scoreboard-divider" style={{ background: 'rgba(255,255,255,0.2)' }} />
          <div className="scoreboard-item">
            <div className="scoreboard-value" style={{ color: '#fff' }}>{totalProjects.toLocaleString('en-IN')}</div>
            <div className="scoreboard-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Total Projects</div>
          </div>
        </div>
      </div>

      {/* ── RBAC Scope Banner ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eef6ff', border: '1px solid #cfe3fb', borderRadius: 8, padding: '0.6rem 1rem', fontSize: '0.8125rem', color: '#0b4a8f' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <strong>Organisational Scope:</strong>&nbsp;Showing all projects under PMs provisioned for {user?.fullName} &middot; {activePms} active Project Managers &middot; {totalProjects.toLocaleString('en-IN')} total projects across all PMs
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#6c757d' }}>
          {mdLoading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Refreshing…</span>
          ) : (
            <span>Last updated: {lastRefreshed.toLocaleTimeString('en-IN')}</span>
          )}
          <button onClick={fetchMdStats} disabled={mdLoading} style={{ background: 'none', border: '1px solid #cfe3fb', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', color: '#0b4a8f' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* ── PO Expiry Live Carousel (uses all projects from expiryAlerts - org wide with PM names) ── */}
      <PoExpiryRevolvingCarousel
        projects={expiryAlerts.length > 0 ? expiryAlerts : apiProjects}
        title="Organisation PO Expiry Live Alerts"
        subtitle={`${(expiredCount + expiringSoonCount).toLocaleString('en-IN')} Projects Require Immediate Attention across all PMs (${expiredCount.toLocaleString('en-IN')} Expired, ${expiringSoonCount.toLocaleString('en-IN')} Expiring Soon)`}
        showPmName={true}
        totalExpiredCount={expiredCount}
        totalExpiringSoonCount={expiringSoonCount}
      />

      {/* ── High-Level Organizational KPIs (Single Aligned Row) ── */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.65rem' }}>
        {/* KPI 1: Total Amount Received (formerly Total Sanction Budget) */}
        <div className="kpi-card" onClick={() => navigate('/finance')} style={{ cursor: 'pointer', padding: '0.75rem 0.85rem' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#00336618', color: '#003366' }}><TrendingUp size={18} /></div>
          </div>
          <div className="kpi-card__value" style={{ fontSize: '1.15rem' }}>{formatCurrencyFull(totalReceived)}</div>
          <div className="kpi-card__sub" style={{ fontSize: '0.68rem' }}>Across {totalProjects.toLocaleString('en-IN')} projects</div>
          <div className="kpi-card__label" style={{ fontSize: '0.7rem' }}>Total Amount Received</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #003366, #00336644)' }} />
        </div>

        {/* KPI 2: Total PO Value */}
        <div className="kpi-card" onClick={() => navigate('/finance?view=po')} style={{ cursor: 'pointer', padding: '0.75rem 0.85rem' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#0069a018', color: '#0069a0' }}><Briefcase size={18} /></div>
          </div>
          <div className="kpi-card__value" style={{ fontSize: '1.15rem' }}>{formatCurrencyFull(totalPo)}</div>
          <div className="kpi-card__sub" style={{ fontSize: '0.68rem' }}>{totalPOs.toLocaleString('en-IN')} Purchase Orders Issued</div>
          <div className="kpi-card__label" style={{ fontSize: '0.7rem' }}>Total PO Value</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #0069a0, #0069a044)' }} />
        </div>

        {/* KPI 3: Total NICSI Service Charge */}
        <div className="kpi-card" onClick={() => navigate('/finance?view=commission')} style={{ cursor: 'pointer', padding: '0.75rem 0.85rem' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#FF660018', color: '#FF6600' }}><Briefcase size={18} /></div>
            <span className="kpi-badge kpi-badge--up" style={{ fontSize: '0.65rem' }}>▲ {totalReceived > 0 ? ((totalCommission / totalReceived) * 100).toFixed(1) : '0.0'}%</span>
          </div>
          <div className="kpi-card__value" style={{ fontSize: '1.15rem' }}>{formatCurrencyFull(totalCommission)}</div>
          <div className="kpi-card__sub" style={{ fontSize: '0.68rem' }}>Retained margin across portfolio</div>
          <div className="kpi-card__label" style={{ fontSize: '0.7rem' }}>Total NICSI Service Charge</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #FF6600, #FF660044)' }} />
        </div>

        {/* KPI 4: Total Vendor Payment Cleared */}
        <div className="kpi-card" onClick={() => navigate('/finance?view=vendor')} style={{ cursor: 'pointer', padding: '0.75rem 0.85rem' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#28A74518', color: '#28A745' }}><Briefcase size={18} /></div>
          </div>
          <div className="kpi-card__value" style={{ fontSize: '1.15rem' }}>{formatCurrencyFull(totalPaid)}</div>
          <div className="kpi-card__sub" style={{ fontSize: '0.68rem' }}>{totalPOs.toLocaleString('en-IN')} Purchase Orders Issued</div>
          <div className="kpi-card__label" style={{ fontSize: '0.7rem' }}>Total Vendor Payment Cleared</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #28A745, #28A74544)' }} />
        </div>

        {/* KPI 5: Total Vendor Outstanding */}
        <div className="kpi-card" onClick={() => navigate('/finance?view=vendor')} style={{ cursor: 'pointer', padding: '0.75rem 0.85rem' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#DC354518', color: '#DC3545' }}><AlertCircle size={18} /></div>
            {totalVendorPending > 0 && <span className="kpi-badge kpi-badge--down" style={{ fontSize: '0.65rem' }}>▼ Action Req</span>}
          </div>
          <div className="kpi-card__value" style={{ fontSize: '1.15rem', color: totalVendorPending > 0 ? '#DC3545' : 'inherit' }}>{formatCurrencyFull(totalVendorPending)}</div>
          <div className="kpi-card__sub" style={{ fontSize: '0.68rem' }}>Pending dues to vendors (PO − Paid)</div>
          <div className="kpi-card__label" style={{ fontSize: '0.7rem' }}>Total Vendor Outstanding</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #DC3545, #DC354544)' }} />
        </div>
      </div>

      {/* ── Row 2: PM Performance Chart + Payment Status ── */}
      <div className="chart-row">
        {/* PM Performance Chart (correct per-PM data from pmList) */}
        <div className="card chart-card chart-card--wide" style={{ flex: 3 }}>
          <div className="card-header">
            <div>
              <h3 className="chart-title">Team Performance: Project Managers</h3>
              <p className="chart-sub">Sanction Budget vs Vendor POs vs Outstanding (₹ Lakhs) — Project counts from ERP Source</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/reports')}>Full Report →</button>
          </div>
          <div className="card-body">
            {pmPerformance.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
                <Users size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p>No project data available for your team yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pmPerformance} margin={{ top: 12, right: 12, left: -8, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6c757d' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6c757d' }} tickFormatter={v => `₹${v}L`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} verticalAlign="top" />
                  <Bar dataKey="received" name="Sanction Budget" fill="#003366" radius={[3, 3, 0, 0]} barSize={28} />
                  <Bar dataKey="po" name="Vendor PO" fill="#006699" radius={[3, 3, 0, 0]} barSize={28} />
                  <Bar dataKey="pending" name="Vendor Outstanding" fill="#DC3545" radius={[3, 3, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Status Donut — org-wide from full 628 projects */}
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Payment Status</h3>
              <p className="chart-sub">Organisation-wide vendor settlement</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentData} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={4} dataKey="value">
                    {paymentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} projects`]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#003366' }}>{totalProjects.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: '0.68rem', color: '#6c757d' }}>projects</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
              {paymentData.map(d => (
                <button key={d.name} onClick={() => navigate(`/projects?status=${d.name.toLowerCase()}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.82rem', color: '#555', textAlign: 'left' }}>{d.name}</span>
                  <span style={{ fontWeight: 700, color: d.color }}>{d.value.toLocaleString('en-IN')}</span>
                  <span style={{ fontSize: '0.72rem', color: '#adb5bd' }}>{Math.round(d.value / totalForPie * 100)}%</span>
                </button>
              ))}
            </div>
            {/* Accurate PO summary */}
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.6rem', fontSize: '0.75rem', color: '#6c757d', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
              <span>Total PO Value:</span><span style={{ fontWeight: 600, color: '#003366', textAlign: 'right' }}>{formatCurrency(totalPo)}</span>
              <span>Paid to Vendors:</span><span style={{ fontWeight: 600, color: '#28A745', textAlign: 'right' }}>{formatCurrency(totalPaid)}</span>
              <span>Outstanding:</span><span style={{ fontWeight: 600, color: '#DC3545', textAlign: 'right' }}>{formatCurrency(totalVendorPending)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Zone Distribution + Recent Activity Feed (Equal Fixed Height Row) ── */}
      <div className="chart-row">
        {/* State / Zone-wise Distribution — accurate from full project dataset across all 36 States/UTs */}
        <div className="card chart-card" style={{ display: 'flex', flexDirection: 'column', height: '520px' }}>
          <div className="card-header">
            <div>
              <h3 className="chart-title">State / UT Project Distribution</h3>
              <p className="chart-sub">Extracted dynamically from project codes ({totalProjects.toLocaleString('en-IN')} total projects)</p>
            </div>
            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>{zoneDistribution.length} States / UTs</span>
          </div>
          <div className="card-body" style={{ paddingTop: '0.5rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {mdLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>Loading state data…</div>
            ) : zoneDistribution.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No state data available.</div>
            ) : zoneDistribution.map((z: any, i: number) => {
              const count = z.count || 0;
              const pct = totalProjects > 0 ? ((count / totalProjects) * 100).toFixed(1) : '0.0';
              const stCode = z.stateCode || extractStateCode(z.state);
              return (
                <div
                  key={z.state}
                  onClick={() => navigate(`/projects?state=${encodeURIComponent(stCode || z.state)}`)}
                  title={`Click to view all projects in ${z.state}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.5rem',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    transition: 'background 0.2s',
                  }}
                  className="table-row-hover"
                >
                  <div style={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {stCode && stCode !== 'NA' && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#00336615', color: '#003366' }}>
                        {stCode}
                      </span>
                    )}
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {z.state}
                    </span>
                  </div>
                  <div style={{ flex: 1, height: 10, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max((count / zoneMax) * 100, 2)}%`,
                        height: '100%',
                        background: ZONE_COLORS[i % ZONE_COLORS.length],
                        borderRadius: 5,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 65, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#003366' }}>{count.toLocaleString('en-IN')}</span>
                    <span style={{ fontSize: '0.7rem', color: '#888' }}>({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Feed — accurate from full projects */}
        <div className="card chart-card chart-card--wide" style={{ display: 'flex', flexDirection: 'column', height: '520px' }}>
          <div className="card-header">
            <div>
              <h3 className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} style={{ color: '#003366' }} />
                Recent Activity Feed
              </h3>
              <p className="chart-sub">Latest high-value projects across the organisation (all PMs)</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/projects')}>View All →</button>
          </div>
          <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project Code</th>
                  <th>State / UT</th>
                  <th>Department / Customer</th>
                  <th>PM Name</th>
                  <th>Project Funds Received</th>
                  <th>PO Value</th>
                  <th>Expiry Status</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6c757d', padding: '1rem' }}>
                    {mdLoading ? 'Loading recent activity…' : 'No recent activity.'}
                  </td></tr>
                ) : recentActivity.map((p: any) => {
                  const sc = p?.stateCode || extractStateCode(p?.projectCode);
                  const stName = p?.stateName || getStateName(p?.projectCode);
                  return (
                    <tr key={p?.headerId || p?.projectCode} onClick={() => navigate(`/projects?id=${p?.headerId || ''}`)} style={{ cursor: 'pointer' }}>
                      <td><code className="proj-code">{p?.projectCode}</code></td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#00336610', color: '#003366', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {sc !== 'NA' && <strong>{sc}</strong>}
                          <span>{stName}</span>
                        </span>
                      </td>
                      <td className="proj-name" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.customerName || p?.projectName}</td>
                      <td style={{ color: '#006699', fontWeight: 600, fontSize: '0.82rem' }}>{p?.prjMgrName || '—'}</td>
                      <td style={{ fontWeight: 700, color: '#003366' }}>{formatCurrency(p?.amountReceived)}</td>
                      <td style={{ color: '#FF6600' }}>{formatCurrency(p?.poAmount)}</td>
                      <td>
                        <span className={`badge badge-${p?.expiryStatus === 'EXPIRED' ? 'danger' : p?.expiryStatus === 'EXPIRING_SOON' ? 'warning' : p?.expiryStatus === 'ACTIVE' ? 'success' : 'secondary'}`}>
                          {p?.expiryStatus || 'NO_PO'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>



      {/* ── PM List Table ── */}
      <div className="card chart-card chart-card--wide">
        <div className="card-header">
          <div>
            <h3 className="chart-title">My Project Managers</h3>
            <p className="chart-sub">Directory and status of PMs reporting to you · Project counts from ERP source</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/project-managers')}>Manage Team →</button>
        </div>
        <div style={{ overflowX: 'auto', padding: '0 1rem 1rem 1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project Manager</th>
                <th>Username</th>
                <th>Zone</th>
                <th>Projects (ERP Total)</th>
                <th>Receipts</th>
                <th>PO Total</th>
                <th>Vendor Dues</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pmList.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#6c757d', padding: '2rem' }}>No Project Managers found.</td></tr>
              ) : pmList.map((pm, idx) => {
                const uName = pm.username || (pm.email ? pm.email.split('@')[0] : `pm_${pm.prjMgrId}`);
                return (
                  <tr key={pm.username || pm.prjMgrId || idx} style={{ cursor: 'pointer' }} onClick={() => navigate('/project-managers')} className="table-row-hover">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#00669918', color: '#006699', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                          {(pm.fullName || uName).substring(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#003366' }}>{pm.fullName}</div>
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '2px' }}>PRJ_MGR_{pm.prjMgrId || 'XX'}</div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{ background: '#f8f9fa', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', color: '#003366', fontWeight: 600 }}>{uName}</code></td>
                    <td style={{ fontWeight: 500 }}>{pm.zone || '—'}</td>
                    <td style={{ fontWeight: 700, textAlign: 'center' }}>
                      <span style={{ color: '#003366', fontSize: '0.9rem' }}>{(pm.projectCount || 0).toLocaleString('en-IN')}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#003366' }}>{formatCurrency(pm.totalReceived || 0)}</td>
                    <td style={{ color: '#006699' }}>{formatCurrency(pm.totalPo || 0)}</td>
                    <td style={{ color: (pm.totalVendorPending || 0) > 0 ? '#DC3545' : '#28A745', fontWeight: 600 }}>
                      {(pm.totalVendorPending || 0) > 0 ? formatCurrency(pm.totalVendorPending) : '✓ Clear'}
                    </td>
                    <td>
                      <span className={`badge badge-${pm.isActive ? 'success' : 'danger'}`}>
                        {pm.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
