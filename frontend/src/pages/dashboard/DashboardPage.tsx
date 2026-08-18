// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from 'recharts';
import {
  formatCurrency, formatCurrencyFull, STATE_MAP,
} from '../../utils/formatters';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { MdDashboard } from './MdDashboard';
import { PoExpiryRevolvingCarousel } from '../../components/dashboard/PoExpiryRevolvingCarousel';
import './DashboardPage.css';

// ── Static Counter ──
function useCounter(target: number, duration = 1800) {
  return target;
}

const BAR_COLORS = ['#003366', '#006699', '#FF6600'];

// Custom tooltip
const ChartTip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }} className="chart-tooltip__item">
          {e.name}: <strong>₹{e.value?.toLocaleString('en-IN')} L</strong>
        </p>
      ))}
    </div>
  );
};

// KPI Card — clickable
const KpiCard = ({
  title, value, sub, icon, accent, badge, delay = 0, onClick
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode;
  accent: string; badge?: { text: string; up: boolean }; delay?: number;
  onClick?: () => void;
}) => (
  <div
    className={`kpi-card${onClick ? ' kpi-card--clickable' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
  >
    <div className="kpi-card__top">
      <div className="kpi-card__icon" style={{ background: `${accent}18`, color: accent }}>{icon}</div>
      {badge && (
        <span className={`kpi-badge ${badge.up ? 'kpi-badge--up' : 'kpi-badge--down'}`}>
          {badge.up ? '▲' : '▼'} {badge.text}
        </span>
      )}
    </div>
    <div className="kpi-card__value">{value}</div>
    {sub && <div className="kpi-card__sub">{sub}</div>}
    <div className="kpi-card__label">{title}</div>
    {onClick && <div className="kpi-card__hint">Click to view details →</div>}
    <div className="kpi-card__stripe" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}44)` }} />
  </div>
);

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [apiProjects, setApiProjects] = useState<any[]>([]);
  const [apiStats, setApiStats] = useState({
    totalAmountReceived: 0,
    totalCommission: 0,
    totalPOAmount: 0,
    totalPaid: 0,
    totalVendorPending: 0,
    total: 0,
    totalPOs: 0,
    totalBillDeskInvoices: 0,
    totalExpInvoices: 0,
    totalInvoiced: 0,
    totalABP: 0,
    cleared: 0,
    partial: 0,
    pending: 0
  });

  const [chartFilterOpen, setChartFilterOpen] = useState(false);
  const [chartSortBy, setChartSortBy] = useState<'received' | 'commission' | 'po'>('received');
  const [utilFilter, setUtilFilter] = useState<'ALL' | 'ACTIVE_PO' | 'PENDING'>('ALL');

  const [pmList, setPmList] = useState<any[]>([]);

  const isPM = user?.role === 'PM';
  const isMD = user?.role === 'MD';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // PM: own projects. MD: only the Project Managers attached to them.
  // Super Admin: full organisation view.
  const scopeParam = isPM && user?.prjMgrId
    ? `&prjMgrId=${user.prjMgrId}`
    : (isMD ? `&managedBy=${encodeURIComponent(user?.username || '')}` : '');

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);

    // Fetch dynamic ERP data (PM scoped to own projects, MD/SuperAdmin org-wide)
    axios.get(`/api/v1/projects/advanced-search?page=0&size=200${scopeParam}`)
      .then(res => {
        if (res.data.success) {
          const projs = res.data.data;
          setApiProjects(projs);

          const kpis = res.data.kpis || {};

          let totalPOs = 0, totalBillDesk = 0, totalExp = 0, totalABP = 0;
          let cleared = 0, partial = 0, pending = 0;
          let totalInvoiced = 0, totalPaid = 0;

          projs.forEach((p: any) => {
            totalPOs += p.noOfPo || 0;
            totalBillDesk += p.noOfInvBilldesk || 0;
            totalExp += p.noOfExpInvoice || 0;
            totalABP += p.projectAbp || p.amountReceived || 0;
            totalInvoiced += p.totalInvoiceAmount || 0;
            totalPaid += p.totalAmountPaid || 0;

            if (p.poAmount > 0 && p.totalAmountPaid >= p.poAmount) cleared++;
            else if (p.totalAmountPaid > 0) partial++;
            else pending++;
          });

          setApiStats({
            totalAmountReceived: kpis.totalReceived || 0,
            totalCommission: kpis.totalCommission || 0,
            totalPOAmount: kpis.totalPo || 0,
            totalPaid: totalPaid,
            totalVendorPending: kpis.totalVendorPending || 0,
            total: res.data.total || 0,
            totalPOs,
            totalBillDeskInvoices: totalBillDesk,
            totalExpInvoices: totalExp,
            totalInvoiced,
            totalABP,
            cleared,
            partial,
            pending
          });
        }
      })
      .catch(err => console.error("Error fetching dashboard data", err));

    if (isMD || isSuperAdmin) {
      axios.get('/api/v1/project-managers')
        .then(res => {
          if (res.data.success) {
            setPmList(res.data.data);
          }
        })
        .catch(err => console.error("Error fetching PMs", err));
    }

    return () => clearTimeout(t);
  }, []);

  const cntReceived = useCounter(Math.round(apiStats.totalAmountReceived / 100000));
  const cntCommission = useCounter(Math.round(apiStats.totalCommission / 100000));
  const cntPO = useCounter(Math.round(apiStats.totalPOAmount / 100000));
  const cntPaid = useCounter(Math.round(apiStats.totalPaid / 100000));
  const cntVendPending = useCounter(Math.round(apiStats.totalVendorPending / 100000));

  const topProjects = [...apiProjects]
    .sort((a, b) => {
      if (chartSortBy === 'commission') return (b.nicsiCommission || 0) - (a.nicsiCommission || 0);
      if (chartSortBy === 'po') return (b.poAmount || 0) - (a.poAmount || 0);
      return (b.amountReceived || 0) - (a.amountReceived || 0);
    })
    .slice(0, 8)
    .map((p: any) => ({
      name: (p.projectName || '').length > 18 ? (p.projectName || '').substring(0, 18) + '…' : (p.projectName || ''),
      received: Math.round((p.amountReceived || 0) / 100000),
      po: Math.round((p.poAmount || 0) / 100000),
      commission: Math.round((p.nicsiCommission || 0) / 100000),
      paid: Math.round((p.totalAmountPaid || 0) / 100000),
    }));

  const utilData = [...apiProjects]
    .filter(p => {
      if (utilFilter === 'ACTIVE_PO') return p.expiryStatus === 'ACTIVE';
      if (utilFilter === 'PENDING') return p.paymentStatus !== 'cleared';
      return true;
    })
    .sort((a, b) => (b.amountReceived || 0) - (a.amountReceived || 0))
    .slice(0, 8)
    .map((p: any) => ({
      name: (p.projectName || '').length > 18 ? (p.projectName || '').substring(0, 18) + '…' : (p.projectName || ''),
      received: Math.round((p.amountReceived || 0) / 100000),
      paid: Math.round((p.totalAmountPaid || 0) / 100000),
    }));

  const paymentData = [
    { name: 'Cleared', value: apiStats.cleared, color: '#28A745' },
    { name: 'Partial', value: apiStats.partial, color: '#FFC107' },
    { name: 'Pending', value: apiStats.pending, color: '#DC3545' },
  ];

  const stateData = Object.entries(
    apiProjects.reduce((acc: any, p: any) => {
      let sc = 'NA';
      if (p.projectCode) {
        const match = p.projectCode.match(/ZO([A-Z]{2})/);
        sc = match ? match[1] : 'NA';
      }
      const st = STATE_MAP[sc] ?? sc;
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 7);

  const hour = new Date().getHours();
  const greetEn = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetHi = hour < 12 ? 'शुभ प्रभात' : hour < 17 ? 'शुभ दोपहर' : 'शुभ संध्या';

  const goProjects = (status?: string) =>
    navigate(status ? `/projects?status=${status}` : '/projects');

  // Branch rendering for Super Admin
  if (isSuperAdmin) {
    return <SuperAdminDashboard />;
  }

  // Branch rendering for Managing Director
  if (isMD) {
    return <MdDashboard apiStats={apiStats} apiProjects={apiProjects} pmList={pmList} />;
  }

  return (
    <div className="dashboard-page">

      {/* ── Welcome Banner ── */}
      <div className="dash-welcome">
        <div className="dash-welcome__content">
          <div className="dash-welcome__greeting">{lang === 'en' ? greetEn : greetHi}, <strong>{user?.fullName?.split(' ')[0] ?? (lang === 'en' ? 'Admin' : 'एडमिन')}</strong></div>
          <h1 className="dash-welcome__title">
            {isPM
              ? (lang === 'en' ? 'My Project Portfolio' : 'मेरी परियोजना पोर्टफोलियो')
              : (lang === 'en' ? 'Project Monitoring Dashboard' : 'परियोजना निगरानी डैशबोर्ड')}
          </h1>
          <p className="dash-welcome__sub">
            {isPM
              ? (lang === 'en'
                  ? <>Financial overview of <strong>{apiStats.total} projects</strong> · {user?.fullName} · {user?.zone}</>
                  : <><strong>{apiStats.total} परियोजनाओं</strong> का अवलोकन · {user?.fullName} · {user?.zone}</>)
              : (lang === 'en'
                  ? <>Organisation-wide overview of <strong>{apiStats.total} projects</strong> across all zones · {user?.role === 'MD' ? 'Managing Director' : 'Super Admin'} view</>
                  : <>सभी क्षेत्रों में <strong>{apiStats.total} परियोजनाओं</strong> का संगठन-व्यापी अवलोकन</>)
            }
          </p>
          <div className="dash-welcome__chips">
            <span className="chip chip--navy">{isPM ? (user?.zone ?? 'Zone') : (lang === 'en' ? 'All Zones' : 'सभी क्षेत्र')}</span>
            <span className="chip chip--orange">{apiStats.total} {lang === 'en' ? 'Projects' : 'परियोजनाएं'}</span>
            <span className="chip chip--green">{apiStats.totalPOs} {lang === 'en' ? 'POs Issued' : 'पीओ जारी किए गए'}</span>
            <span className="chip chip--teal">{apiStats.totalBillDeskInvoices} {lang === 'en' ? 'Vendor Bills (Bill Desk)' : 'विक्रेता बिल'}</span>
          </div>
        </div>
        <div className="dash-welcome__scoreboard">
          <button className="scoreboard-item scoreboard-item--btn" onClick={() => goProjects('cleared')}>
            <div className="scoreboard-value" style={{ color: '#7EDFA0' }}>{apiStats.cleared}</div>
            <div className="scoreboard-label">Cleared</div>
            <div className="scoreboard-hint">View →</div>
          </button>
          <div className="scoreboard-divider" />
          <button className="scoreboard-item scoreboard-item--btn" onClick={() => goProjects('partial')}>
            <div className="scoreboard-value" style={{ color: '#FFC107' }}>{apiStats.partial}</div>
            <div className="scoreboard-label">Partial</div>
            <div className="scoreboard-hint">View →</div>
          </button>
          <div className="scoreboard-divider" />
          <button className="scoreboard-item scoreboard-item--btn" onClick={() => goProjects('pending')}>
            <div className="scoreboard-value" style={{ color: '#ff7b7b' }}>{apiStats.pending}</div>
            <div className="scoreboard-label">Pending</div>
            <div className="scoreboard-hint">View →</div>
          </button>
        </div>
      </div>

      {/* ── RBAC Scope Banner ── */}
      {isPM && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eef6ff', border: '1px solid #cfe3fb', borderRadius: 8, padding: '0.6rem 1rem', fontSize: '0.8125rem', color: '#0b4a8f', marginBottom: '0.25rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <strong>Portfolio Scope:</strong>&nbsp;Displaying data for your assigned projects only &mdash; {user?.fullName} &middot; {user?.zone || 'All Zones'} &middot; PRJ_MGR_ID: {user?.prjMgrId || 'N/A'}
        </div>
      )}

      {/* ── Dynamic Single-Line Revolving PO Expiry Live Alert Carousel ── */}
      <PoExpiryRevolvingCarousel projects={apiProjects} />

      {/* ── KPI Cards ── */}
      <div className="kpi-grid">
        <KpiCard delay={0} title="Total Projects" value={String(apiStats.total)} sub="Zonal Office" accent="#003366"
          onClick={() => goProjects()}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>}
          badge={{ text: `${apiStats.totalPOs} POs`, up: true }}
        />
        <KpiCard delay={80} title="Client Receipts (NICSI)" value={`₹${cntReceived.toLocaleString('en-IN')} L`} sub={formatCurrencyFull(apiStats.totalAmountReceived)} accent="#FF6600"
          onClick={() => navigate('/finance')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>}
        />
        <KpiCard delay={160} title="NICSI Service Charge" value={`₹${cntCommission.toLocaleString('en-IN')} L`} sub={`Avg ${apiStats.totalAmountReceived ? ((apiStats.totalCommission / apiStats.totalAmountReceived) * 100).toFixed(1) : '0.0'}% of receipts`} accent="#9B59B6"
          onClick={() => navigate('/finance?view=commission')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          badge={{ text: `${apiStats.totalAmountReceived ? ((apiStats.totalCommission / apiStats.totalAmountReceived) * 100).toFixed(1) : '0.0'}%`, up: true }}
        />
        <KpiCard delay={240} title="Vendor PO Allotment" value={`₹${cntPO.toLocaleString('en-IN')} L`} sub={`${apiStats.totalPOs} purchase orders issued`} accent="#006699"
          onClick={() => navigate('/finance?view=vendor')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg>}
        />
        <KpiCard delay={320} title="Vendor Bills Paid" value={`₹${cntPaid.toLocaleString('en-IN')} L`} sub={`${apiStats.totalExpInvoices} bills processed as expenditure`} accent="#28A745"
          onClick={() => navigate('/finance?view=invoices')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
          badge={{ text: 'Settled', up: true }}
        />
        <KpiCard delay={400} title="Vendor Amt. Pending" value={`₹${cntVendPending.toLocaleString('en-IN')} L`} sub="Due to vendors (PO − Paid)" accent="#DC3545"
          onClick={() => goProjects('pending')}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          badge={{ text: `${apiStats.pending} projects`, up: false }}
        />
      </div>

      {/* ── PM Portfolio Overview (Removed from here, now in MdDashboard) ── */}

      {/* ── Charts Row 1 ── */}
      <div className="chart-row">
        <div className="card chart-card chart-card--wide">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Top 8 Projects — Financial Breakdown</h3>
              <p className="chart-sub">Client Receipt vs Vendor PO vs Commission vs Paid (₹ Lakhs)</p>
            </div>
            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-outline btn-sm" 
                onClick={() => setChartFilterOpen(!chartFilterOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                Filter: {chartSortBy === 'received' ? 'By Amount' : chartSortBy === 'commission' ? 'By Commission' : 'By PO'}
              </button>
              {chartFilterOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '8px', zIndex: 10, minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666', padding: '4px 8px', marginBottom: '4px' }}>Sort Top 8 By:</div>
                  <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: chartSortBy === 'received' ? '#f0f4f8' : 'transparent', borderRadius: '4px', cursor: 'pointer', color: '#003366' }} onClick={() => { setChartSortBy('received'); setChartFilterOpen(false); }}>Highest Receipt</button>
                  <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: chartSortBy === 'commission' ? '#f0f4f8' : 'transparent', borderRadius: '4px', cursor: 'pointer', color: '#003366' }} onClick={() => { setChartSortBy('commission'); setChartFilterOpen(false); }}>Highest Commission</button>
                  <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: chartSortBy === 'po' ? '#f0f4f8' : 'transparent', borderRadius: '4px', cursor: 'pointer', color: '#003366' }} onClick={() => { setChartSortBy('po'); setChartFilterOpen(false); }}>Highest Vendor PO</button>
                </div>
              )}
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProjects} margin={{ top: 12, right: 12, left: -8, bottom: 64 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6c757d' }} angle={-38} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#6c757d' }} tickFormatter={v => `₹${v}L`} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingBottom: '16px' }} verticalAlign="top" />
                <Bar dataKey="received" name="Client Receipt" fill="#003366" radius={[3, 3, 0, 0]} />
                <Bar dataKey="po" name="Vendor PO" fill="#006699" radius={[3, 3, 0, 0]} />
                <Bar dataKey="commission" name="NICSI Service Charge" fill="#FF6600" radius={[3, 3, 0, 0]} />
                <Bar dataKey="paid" name="Paid to Vendor" fill="#28A745" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PO Expiry Status Card (Top Right) */}
        <div className="card chart-card animate-fade-in-up delay-300">
          <div className="card-header">
            <div>
              <h3 className="chart-title">PO Expiry Status</h3>
              <p className="chart-sub">Active, Expiring & Invoice Pipeline</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: '0.5rem' }}>
            {(() => {
              const expiryGroups = { EXPIRED: 0, EXPIRING_SOON: 0, ACTIVE: 0, NO_PO: 0 };
              apiProjects.forEach((p: any) => {
                const s = p.expiryStatus || 'NO_PO';
                if (s in expiryGroups) expiryGroups[s as keyof typeof expiryGroups]++;
              });
              const expiryData = [
                { label: 'Active', count: expiryGroups.ACTIVE, color: '#28A745', status: 'ACTIVE' },
                { label: 'Expiring Soon', count: expiryGroups.EXPIRING_SOON, color: '#FFC107', status: 'EXPIRING_SOON' },
                { label: 'Expired', count: expiryGroups.EXPIRED, color: '#DC3545', status: 'EXPIRED' },
                { label: 'No PO', count: expiryGroups.NO_PO, color: '#adb5bd', status: 'NO_PO' },
              ];
              const max = Math.max(...expiryData.map(d => d.count), 1);
              return expiryData.map(d => (
                <button
                  key={d.label}
                  onClick={() => navigate(`/projects?expiryStatus=${d.status}`)}
                  className="expiry-status-row"
                  title={`Click to view all ${d.count} ${d.label} projects`}
                >
                  <span style={{ minWidth: 90, fontSize: '0.8rem', fontWeight: 600, color: '#555' }}>{d.label}</span>
                  <div style={{ flex: 1, height: 10, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${(d.count / max) * 100}%`, height: '100%', background: d.color, borderRadius: 5, transition: 'width 0.6s ease' }} />
                  </div>
                  <span style={{ minWidth: 24, fontWeight: 700, fontSize: '0.9rem', color: d.color }}>{d.count}</span>
                  <span className="expiry-arrow">→</span>
                </button>
              ));
            })()}

            {/* Invoice Pipeline Mini-Cards */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.85rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>Invoice Pipeline</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {[
                  { label: 'Bill Desk Invoices', value: apiStats.totalBillDeskInvoices, color: '#003366', filter: 'hasVendorBilled=true' },
                  { label: 'Exp. Bills Processed', value: apiStats.totalExpInvoices, color: '#28A745', filter: 'hasExpBills=true' },
                  { label: 'Total POs Issued', value: apiStats.totalPOs, color: '#FF6600', filter: 'hasPOs=true' },
                  { label: 'Invoice Value', value: formatCurrency(apiStats.totalInvoiced), color: '#006699', filter: 'hasInvoiced=true' },
                ].map(m => (
                  <button
                    key={m.label}
                    onClick={() => navigate(`/projects?${m.filter}`)}
                    className="pipeline-card-btn"
                    title={`Click to view projects for ${m.label}`}
                  >
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: '0.68rem', color: '#6c757d', marginTop: 2, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{m.label}</span>
                      <span style={{ color: m.color, fontSize: '0.75rem', fontWeight: 'bold' }}>→</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row 2: Fund Utilisation Trend + Payment Status ── */}
      <div className="chart-row">
        {/* Fund Utilisation Trend */}
        <div className="card chart-card chart-card--wide">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Fund Utilisation Trend</h3>
              <p className="chart-sub">Client Funds Received vs Vendor Disbursed (₹ Lakhs)</p>
            </div>
            <select 
              value={utilFilter} 
              onChange={e => setUtilFilter(e.target.value as any)}
              style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="ALL">All Projects</option>
              <option value="ACTIVE_PO">Active POs Only</option>
              <option value="PENDING">Pending Payment</option>
            </select>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={utilData} margin={{ top: 12, right: 12, left: -8, bottom: 60 }}>
                <defs>
                  <linearGradient id="gradReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#003366" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#003366" stopOpacity={0.02}/>
                  </linearGradient>
                  <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#28A745" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#28A745" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6c757d' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#6c757d' }} tickFormatter={v => `₹${v}L`} />
                <Tooltip content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const rec = payload[0]?.value as number || 0;
                    const paid = payload[1]?.value as number || 0;
                    return (
                      <div style={{ background: '#fff', border: '1px solid #ddd', padding: '10px', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                        <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: '12px' }}>{label}</p>
                        <p style={{ margin: 0, color: '#003366', fontSize: '11px' }}>Received: ₹{rec.toLocaleString('en-IN')} L</p>
                        <p style={{ margin: 0, color: '#28A745', fontSize: '11px' }}>Disbursed: ₹{paid.toLocaleString('en-IN')} L</p>
                        <p style={{ margin: '4px 0 0 0', color: '#DC3545', fontSize: '11px', fontWeight: 'bold' }}>Gap: ₹{(rec - paid).toLocaleString('en-IN')} L</p>
                      </div>
                    );
                  }
                  return null;
                }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} verticalAlign="top" />
                <Area type="monotone" dataKey="received" name="Client Funds Received" stroke="#003366" strokeWidth={2} fill="url(#gradReceived)" />
                <Area type="monotone" dataKey="paid" name="Vendor Disbursed" stroke="#28A745" strokeWidth={2} fill="url(#gradPaid)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Status Chart (Bottom Right) */}
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Payment Status</h3>
              <p className="chart-sub">Vendor invoice settlement</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={paymentData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={4} dataKey="value">
                  {paymentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} projects`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend">
              {paymentData.map((d, i) => (
                <button key={i} className="pie-legend__row pie-legend__row--btn"
                  onClick={() => goProjects(d.name.toLowerCase())}>
                  <span className="pie-legend__dot" style={{ background: d.color }} />
                  <span className="pie-legend__name">{d.name}</span>
                  <span className="pie-legend__count">{d.value}</span>
                  <span className="pie-legend__pct">{Math.round(d.value / apiStats.total * 100)}%</span>
                  <span className="pie-legend__go">→</span>
                </button>
              ))}
            </div>

            {/* Commission breakdown */}
            <div className="commission-summary">
              <div className="commission-summary__title">Service Charge Insight</div>
              <div className="commission-summary__row">
                <span>Total Service Charge</span>
                <strong style={{ color: '#FF6600' }}>{formatCurrency(apiStats.totalCommission)}</strong>
              </div>
              <div className="commission-summary__row">
                <span>Avg. Rate</span>
                <strong>{((apiStats.totalCommission / apiStats.totalAmountReceived) * 100).toFixed(1)}%</strong>
              </div>
              <div className="commission-summary__row">
                <span>BillDesk Invoices</span>
                <strong>{apiStats.totalBillDeskInvoices}</strong>
              </div>
              <div className="commission-summary__row">
                <span>Bills Processed as Expenditure</span>
                <strong>{apiStats.totalExpInvoices}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts Row 3: Commission Slab Pie + State Bar + Recent Projects Table ── */}
      <div className="chart-row">
        {/* Commission Slab Distribution Pie */}
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Commission Slab Distribution</h3>
              <p className="chart-sub">Projects by service charge rate band</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            {(() => {
              const slabs: Record<string, number> = { '5% Slab': 0, '7% Slab': 0, '9% Slab': 0 };
              apiProjects.forEach((p: any) => {
                // The DB 'nicsiCommission' is the total retained margin (Base Commission + Penalty)
                // To get the true NICSI contractual slab, we must subtract the penalty.
                const totalRetained = p.nicsiCommission || 0;
                const penalty = p.totalPenaltyAmt || 0;
                const baseCommissionAmt = Math.max(0, totalRetained - penalty);
                
                const basePercent = p.amountReceived ? (baseCommissionAmt / p.amountReceived) * 100 : 0;
                
                if (basePercent <= 6) slabs['5% Slab']++;
                else if (basePercent <= 8) slabs['7% Slab']++;
                else slabs['9% Slab']++;
              });
              const SLAB_COLORS = ['#28A745', '#006699', '#003366'];
              const slabData = Object.entries(slabs).map(([name, value], i) => ({ name, value, color: SLAB_COLORS[i] })).filter(d => d.value > 0);
              return (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={slabData} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={4} dataKey="value">
                        {slabData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v} projects`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {slabData.map(d => (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ color: '#555', fontWeight: 600 }}>{d.name}</span>
                        <span style={{ fontWeight: 800, color: d.color }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* State distribution */}
        <div className="card chart-card">
          <div className="card-header">
            <h3 className="chart-title">Projects by State</h3>
          </div>
          <div className="card-body" style={{ paddingTop: '0.5rem' }}>
            {stateData.map(([state, cnt], i) => (
              <div key={state} className="state-row">
                <span className="state-row__name">{state}</span>
                <div className="state-row__bar">
                  <div
                    className="state-row__fill"
                    style={{ width: `${(cnt / stateData[0][1]) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                  />
                </div>
                <span className="state-row__count">{cnt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent projects with billing status */}
        <div className="card chart-card chart-card--wide">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Recent Projects — Billing & Commission</h3>
              <p className="chart-sub">Latest 6 projects with commission & phase status</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => goProjects()}>View All →</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project Code</th>
                  <th>Department / Customer</th>
                  <th>Project Funds Received</th>
                  <th>NICSI Service Charge</th>
                  <th>Total PO Value</th>
                  <th>Amount Paid</th>
                  <th>Bills Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {apiProjects.slice(0, 6).map((p: any) => (
                  <tr key={p?.headerId}>
                    <td><code className="proj-code">{p?.projectCode}</code></td>
                    <td className="proj-name">{p?.customerName}</td>
                    <td style={{ fontWeight: 700, color: '#003366' }}>{formatCurrency(p?.amountReceived)}</td>
                    <td>
                      <span className="commission-chip">
                        {formatCurrency(p?.nicsiCommission)} <em>({p?.commissionPct}%)</em>
                      </span>
                    </td>
                    <td style={{ color: '#006699' }}>{p?.noOfPO > 0 ? formatCurrency(p?.poAmount) : <span style={{ color: '#adb5bd' }}>—</span>}</td>
                    <td style={{ fontWeight: 700, color: '#28A745' }}>{p?.totalAmountPaid > 0 ? formatCurrency(p?.totalAmountPaid) : <span style={{ color: '#adb5bd' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="bill-chip">
                        {p?.noOfExpInvoice}/{p?.noOfInvBilldesk > 0 ? p?.noOfInvBilldesk : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${p?.paymentStatus === 'cleared' ? 'success' : p?.paymentStatus === 'partial' ? 'warning' : 'danger'}`}>
                        {p?.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
