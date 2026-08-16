import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, formatCurrencyFull, STATE_MAP } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { Users, Briefcase, TrendingUp, AlertCircle } from 'lucide-react';
import { PoExpiryRevolvingCarousel } from '../../components/dashboard/PoExpiryRevolvingCarousel';

interface MdDashboardProps {
  apiStats: any;
  apiProjects: any[];
  pmList: any[];
}

export const MdDashboard: React.FC<MdDashboardProps> = ({ apiStats, apiProjects, pmList }) => {
  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greetEn = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetHi = hour < 12 ? 'शुभ प्रभात' : hour < 17 ? 'शुभ दोपहर' : 'शुभ संध्या';

  // Aggregate stats from apiProjects directly to ensure no project is orphaned
  // even if the Project Manager is no longer active in pmList.
  const performanceMap = new Map();

  apiProjects.forEach(p => {
    // Identify the PM for this project
    const pId = p.prjMgrId ? Number(p.prjMgrId) : null;
    let pmName = `PM ID: ${pId || 'Unknown'}`;
    
    // Try to find the real name from pmList
    const matchedPm = pmList.find(user => 
      (user.prjMgrId && Number(user.prjMgrId) === pId) || 
      (p.userEmail && (p.userEmail === user.email || p.userEmail === user.username))
    );

    if (matchedPm) {
      pmName = matchedPm.fullName?.split(' ')[0] || matchedPm.username;
    } else if (p.userEmail && p.userEmail.includes('@')) {
      pmName = p.userEmail.split('@')[0];
    }

    if (!performanceMap.has(pmName)) {
      performanceMap.set(pmName, { name: pmName, received: 0, po: 0, paid: 0, pending: 0, projectCount: 0 });
    }
    
    const entry = performanceMap.get(pmName);
    entry.received += (p.amountReceived || 0) / 100000;
    entry.po += (p.poAmount || 0) / 100000;
    entry.paid += (p.totalAmountPaid || 0) / 100000;
    entry.pending += Math.max(0, (p.poAmount || 0) - (p.totalAmountPaid || 0)) / 100000;
    entry.projectCount += 1;
  });

  const pmPerformance = Array.from(performanceMap.values())
    .map(data => ({
      ...data,
      received: Math.round(data.received),
      po: Math.round(data.po),
      paid: Math.round(data.paid),
      pending: Math.round(data.pending),
    }))
    .sort((a, b) => b.received - a.received);

  const activePms = pmList.filter(pm => pm.isActive).length;

  // Recent activity
  const recentProjects = [...apiProjects]
    .sort((a, b) => new Date(b.createdOn || 0).getTime() - new Date(a.createdOn || 0).getTime())
    .slice(0, 5);

  // Expiry alerts
  const expiryAlerts = apiProjects
    .filter((p: any) => p.expiryStatus === 'EXPIRED' || p.expiryStatus === 'EXPIRING_SOON')
    .slice(0, 5);

  // Zone distribution
  const zoneData = Object.entries(
    apiProjects.reduce((acc: any, p: any) => {
      let sc = 'NA';
      if (p.projectCode) { const m = p.projectCode.match(/ZO([A-Z]{2})/); sc = m ? m[1] : 'NA'; }
      const st = STATE_MAP[sc] ?? sc;
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 8);
  const zoneMax = zoneData.length > 0 ? (zoneData[0][1] as number) : 1;

  // Payment status data
  const paymentData = [
    { name: 'Cleared', value: apiStats.cleared, color: '#28A745' },
    { name: 'Partial', value: apiStats.partial, color: '#FFC107' },
    { name: 'Pending', value: apiStats.pending, color: '#DC3545' },
  ];

  const BAR_COLORS = ['#003366', '#006699', '#FF6600'];
  
  // Custom tooltip for PM Performance chart
  const ChartTip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip" style={{ background: '#fff', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
        <p style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>{label}</p>
        <p style={{ margin: '2px 0', color: '#003366' }}>Client Receipts: <strong>₹{payload[0].value.toLocaleString('en-IN')} L</strong></p>
        <p style={{ margin: '2px 0', color: '#006699' }}>Vendor POs: <strong>₹{payload[1].value.toLocaleString('en-IN')} L</strong></p>
        <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#666' }}>{payload[0].payload.projectCount} Projects Managed</p>
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
            <span className="chip chip--orange">{apiStats.total} Projects</span>
            <span className="chip chip--green">{apiStats.totalPOs} POs Issued</span>
            <span className="chip chip--teal">{apiStats.totalBillDeskInvoices} Bill Desk Invoices</span>
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
            <div className="scoreboard-value" style={{ color: '#fff' }}>{apiStats.total}</div>
            <div className="scoreboard-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Total Projects</div>
          </div>
        </div>
      </div>

      {/* ── MD RBAC Scope Banner ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eef6ff', border: '1px solid #cfe3fb', borderRadius: 8, padding: '0.6rem 1rem', fontSize: '0.8125rem', color: '#0b4a8f' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <strong>Organisational Scope:</strong>&nbsp;Showing all projects under PMs provisioned for {user?.fullName} &middot; {activePms} active Project Managers &middot; {apiStats.total} total projects
      </div>

      {/* ── Dynamic Single-Line Revolving PO Expiry Live Alert Carousel ── */}
      <PoExpiryRevolvingCarousel 
        projects={apiProjects} 
        title="Organisation PO Expiry Live Alerts"
        subtitle="Layman overview of projects with expired or near-expiry Purchase Orders across all PMs"
      />

      {/* ── High-Level Organizational KPIs ── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="kpi-card" onClick={() => navigate('/finance')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#00336618', color: '#003366' }}><TrendingUp size={20} /></div>
          </div>
          <div className="kpi-card__value">{formatCurrencyFull(apiStats.totalAmountReceived)}</div>
          <div className="kpi-card__sub">Across {apiStats.total} projects</div>
          <div className="kpi-card__label">Total Client Receipts</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #003366, #00336644)' }} />
        </div>

        <div className="kpi-card" onClick={() => navigate('/finance?view=commission')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#FF660018', color: '#FF6600' }}><Briefcase size={20} /></div>
            <span className="kpi-badge kpi-badge--up">▲ {apiStats.totalAmountReceived ? ((apiStats.totalCommission / apiStats.totalAmountReceived) * 100).toFixed(1) : '0.0'}%</span>
          </div>
          <div className="kpi-card__value">{formatCurrencyFull(apiStats.totalCommission)}</div>
          <div className="kpi-card__sub">Retained margin across portfolio</div>
          <div className="kpi-card__label">Total NICSI Service Charge</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #FF6600, #FF660044)' }} />
        </div>

        <div className="kpi-card" onClick={() => navigate('/finance?view=vendor')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#28A74518', color: '#28A745' }}><Briefcase size={20} /></div>
          </div>
          <div className="kpi-card__value">{formatCurrencyFull(apiStats.totalPaid)}</div>
          <div className="kpi-card__sub">{apiStats.totalPOs} Purchase Orders Issued</div>
          <div className="kpi-card__label">Total Vendor Payment Cleared</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #28A745, #28A74544)' }} />
        </div>

        <div className="kpi-card" onClick={() => navigate('/finance?view=vendor')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card__top">
            <div className="kpi-card__icon" style={{ background: '#DC354518', color: '#DC3545' }}><AlertCircle size={20} /></div>
            {apiStats.totalVendorPending > 0 && <span className="kpi-badge kpi-badge--down">▼ Action Req</span>}
          </div>
          <div className="kpi-card__value" style={{ color: apiStats.totalVendorPending > 0 ? '#DC3545' : 'inherit' }}>{formatCurrencyFull(apiStats.totalVendorPending)}</div>
          <div className="kpi-card__sub">Pending dues to vendors</div>
          <div className="kpi-card__label">Total Vendor Outstanding</div>
          <div className="kpi-card__stripe" style={{ background: 'linear-gradient(90deg, #DC3545, #DC354544)' }} />
        </div>
      </div>

      <div className="chart-row">
        {/* ── PM Performance Chart ── */}
        <div className="card chart-card chart-card--wide" style={{ flex: 3 }}>
          <div className="card-header">
            <div>
              <h3 className="chart-title">Team Performance: Project Managers</h3>
              <p className="chart-sub">Client Receipts vs Vendor POs vs Outstanding (₹ Lakhs)</p>
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
                  <Bar dataKey="received" name="Client Receipts" fill="#003366" radius={[3, 3, 0, 0]} barSize={28} />
                  <Bar dataKey="po" name="Vendor PO" fill="#006699" radius={[3, 3, 0, 0]} barSize={28} />
                  <Bar dataKey="pending" name="Vendor Outstanding" fill="#DC3545" radius={[3, 3, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Org Payment Status Donut ── */}
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Payment Status</h3>
              <p className="chart-sub">Organisation-wide vendor settlement</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={paymentData} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={4} dataKey="value">
                  {paymentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} projects`]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
              {paymentData.map(d => (
                <button key={d.name} onClick={() => navigate(`/projects?status=${d.name.toLowerCase()}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.82rem', color: '#555', textAlign: 'left' }}>{d.name}</span>
                  <span style={{ fontWeight: 700, color: d.color }}>{d.value}</span>
                  <span style={{ fontSize: '0.72rem', color: '#adb5bd' }}>{apiStats.total > 0 ? Math.round(d.value / apiStats.total * 100) : 0}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Zone Distribution + Expiry Alert Panel ── */}
      <div className="chart-row">
        {/* Zone Distribution */}
        <div className="card chart-card">
          <div className="card-header">
            <h3 className="chart-title">Zone-wise Project Distribution</h3>
          </div>
          <div className="card-body" style={{ paddingTop: '0.5rem' }}>
            {zoneData.map(([zone, cnt], i) => (
              <div key={zone as string} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ minWidth: 110, fontSize: '0.8rem', fontWeight: 600, color: '#555' }}>{zone as string}</span>
                <div style={{ flex: 1, height: 10, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${((cnt as number) / zoneMax) * 100}%`, height: '100%', background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: 5, transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ minWidth: 24, fontWeight: 700, fontSize: '0.9rem', color: '#003366' }}>{cnt as number}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PO Expiry Alert Panel */}
        <div className="card chart-card chart-card--wide">
          <div className="card-header">
            <div>
              <h3 className="chart-title">PO Expiry Alerts</h3>
              <p className="chart-sub">Projects requiring immediate attention</p>
            </div>
            {expiryAlerts.length > 0 && <span className="badge badge-danger">{expiryAlerts.length} Alerts</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            {expiryAlerts.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d', fontSize: '0.875rem' }}>No expiry alerts at this time.</div>
            ) : (
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead><tr><th>Project Code</th><th>Department / Customer</th><th>Total PO Value</th><th>Expiry Status</th><th>Action</th></tr></thead>
                <tbody>
                  {expiryAlerts.map((p: any) => (
                    <tr key={p.headerId}>
                      <td><code style={{ fontSize: '0.72rem', background: '#e8f4fd', color: '#003366', padding: '1px 5px', borderRadius: 3 }}>{p.projectCode}</code></td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.customerName}</td>
                      <td style={{ color: '#FF6600', fontWeight: 700 }}>{formatCurrency(p.poAmount)}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: p.expiryStatus === 'EXPIRED' ? '#DC354520' : '#FFC10730', color: p.expiryStatus === 'EXPIRED' ? '#DC3545' : '#D39E00' }}>
                          {p.expiryStatus}
                        </span>
                      </td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => navigate('/projects')} style={{ padding: '2px 10px', fontSize: '0.72rem' }}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Activity Feed ── */}
      <div className="chart-row">
        <div className="card chart-card chart-card--wide">
          <div className="card-header">
            <div>
              <h3 className="chart-title">Recent Activity Feed</h3>
              <p className="chart-sub">Latest projects onboarded across the organisation</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/projects')}>View All →</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project Code</th>
                  <th>Department / Customer</th>
                  <th>PM Email</th>
                  <th>Project Funds Received</th>
                  <th>Expiry Status</th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#6c757d', padding: '1rem' }}>No recent activity.</td></tr>
                ) : recentProjects.map((p: any) => (
                  <tr key={p?.headerId || p?.projectCode}>
                    <td><code className="proj-code">{p?.projectCode}</code></td>
                    <td className="proj-name">{p?.customerName}</td>
                    <td>{p?.userEmail || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#003366' }}>{formatCurrency(p?.amountReceived)}</td>
                    <td>
                      <span className={`badge badge-${p?.expiryStatus === 'EXPIRED' ? 'danger' : p?.expiryStatus === 'EXPIRING_SOON' ? 'warning' : p?.expiryStatus === 'ACTIVE' ? 'success' : 'secondary'}`}>
                        {p?.expiryStatus || 'NO_PO'}
                      </span>
                    </td>
                  </tr>
                ))}
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
            <p className="chart-sub">Directory and status of PMs reporting to you</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/project-managers')}>Manage Team →</button>
        </div>
        <div style={{ overflowX: 'auto', padding: '0 1rem 1rem 1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project Manager</th>
                <th>Username</th>
                <th>Zone / Ministry</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pmList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6c757d', padding: '2rem' }}>No Project Managers found. Add a PM to begin.</td></tr>
              ) : pmList.map(pm => (
                <tr key={pm.username} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects?managedBy=${pm.username}`)} className="table-row-hover">
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#00669918', color: '#006699', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                        {(pm.fullName || pm.username).substring(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: '#003366' }}>{pm.fullName}</div>
                        <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '2px' }}>PRJ_MGR_{pm.prjMgrId || 'XX'}</div>
                      </div>
                    </div>
                  </td>
                  <td><code style={{ background: '#f8f9fa', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', color: '#333' }}>{pm.username}</code></td>
                  <td style={{ fontWeight: 500 }}>{pm.zone || '—'}</td>
                  <td>
                    <span className={`badge badge-${pm.isActive ? 'success' : 'danger'}`}>
                      {pm.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
