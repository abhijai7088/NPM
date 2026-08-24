// @ts-nocheck
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { ProjectListPage } from '../projects/ProjectListPage';
import { setDelegatedPmContext, clearDelegatedPmContext } from '../../api/delegatedContext';
import './ProjectManagersPage.css';

const USERS_API = '/api/v1/users';

interface PM {
  prjMgrId: number;
  fullName: string;
  designation: string;
  zone: string;
  email: string;
  mobile: string;
  isActive: boolean;
  isProvisioned: boolean;
  projectCount: number;
  totalReceived: number;
  totalCommission: number;
  totalPo: number;
  totalPaid: number;
  totalAbp: number;
  totalVendorPending: number;
  projectTypes?: string[];
}

export const ProjectManagersPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canProvision = user?.role === 'MD' || user?.role === 'SUPER_ADMIN';

  // ── ALL HOOKS MUST BE DECLARED AT THE TOP ──
  const [managers, setManagers] = useState<PM[]>([]);
  const [unassignedPool, setUnassignedPool] = useState<any>(null);
  const [org, setOrg] = useState<any>({});
  const [loading, setLoading] = useState(true);

  // Impersonation / PM Drill-down State — Two levels:
  const [selectedPm, setSelectedPm] = useState<PM | null>(null);
  const [pmTypeData, setPmTypeData] = useState<{ types: any[]; totalProjects: number } | null>(null);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Filters visibility & state
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // PM provisioning form
  const [showForm, setShowForm] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [pmUsers, setPmUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({ prjMgrId: '', fullName: '', username: '', email: '', password: '' });

  const mdScope = user?.role === 'MD' ? `?managedBy=${encodeURIComponent(user?.username || '')}` : '';

  const loadManagers = () => {
    axios.get(`/api/v1/project-managers${mdScope}`)
      .then(res => {
        if (res.data.success) {
          setManagers(res.data.data);
          setOrg(res.data.org || {});
          setUnassignedPool(res.data.unassignedPool || null);
        }
      })
      .catch(err => console.error('Error fetching project managers', err))
      .finally(() => setLoading(false));
  };

  const loadProvisioning = () => {
    axios.get(`${USERS_API}/pm-profiles`).then(r => { if (r.data.success) setProfiles(r.data.data); }).catch(() => {});
    axios.get(`${USERS_API}?actingRole=${user?.role || ''}&actingUser=${encodeURIComponent(user?.username || '')}`)
      .then(r => { if (r.data.success) setPmUsers(r.data.data.filter((u: any) => u.role === 'PM')); }).catch(() => {});
  };

  useEffect(() => {
    loadManagers();
    if (canProvision) loadProvisioning();
    // eslint-disable-next-line
  }, []);

  const assignedIds = useMemo(() => new Set(pmUsers.map(u => String(u.prjMgrId))), [pmUsers]);

  // Extract all distinct project types across all PMs for filter dropdown
  const allProjectTypes = useMemo(() => {
    const typesSet = new Set<String>();
    managers.forEach(pm => {
      if (pm.projectTypes) {
        pm.projectTypes.forEach(t => typesSet.add(t));
      }
    });
    return Array.from(typesSet).sort();
  }, [managers]);

  // Filtered PM cards roster
  const filteredManagers = useMemo(() => {
    return managers.filter(pm => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = pm.fullName?.toLowerCase().includes(q);
        const matchesEmail = pm.email?.toLowerCase().includes(q);
        const matchesId = String(pm.prjMgrId).includes(q);
        const matchesZone = pm.zone?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesId && !matchesZone) return false;
      }
      // Zone filter
      if (zoneFilter !== 'ALL' && pm.zone !== zoneFilter) return false;

      // Project type filter
      if (typeFilter !== 'ALL') {
        if (!pm.projectTypes || !pm.projectTypes.includes(typeFilter)) return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE_ACCOUNT' && !pm.isProvisioned) return false;
      if (statusFilter === 'UNASSIGNED' && pm.isProvisioned) return false;
      if (statusFilter === 'HAS_VENDOR_DUES' && (!pm.totalVendorPending || pm.totalVendorPending <= 0)) return false;

      return true;
    });
  }, [managers, searchQuery, zoneFilter, typeFilter, statusFilter]);

  const activeFiltersCount = useMemo(() => {
    let cnt = 0;
    if (searchQuery.trim()) cnt++;
    if (zoneFilter !== 'ALL') cnt++;
    if (typeFilter !== 'ALL') cnt++;
    if (statusFilter !== 'ALL') cnt++;
    return cnt;
  }, [searchQuery, zoneFilter, typeFilter, statusFilter]);

  const handleSelectPm = async (pm: PM) => {
    setSelectedPm(pm);
    setSelectedType(null);
    setPmTypeData(null);
    setLoadingTypes(true);
    try {
      const res = await axios.get(`/api/v1/project-managers/${pm.prjMgrId}/project-types`);
      if (res.data.success) {
        setPmTypeData({ types: res.data.projectTypes || [], totalProjects: res.data.totalProjects || 0 });
      }
    } catch (err) {
      console.error('Error fetching PM project types', err);
      setPmTypeData({ types: [], totalProjects: 0 });
    } finally {
      setLoadingTypes(false);
    }
  };

  const handleBackToRoster = () => {
    clearDelegatedPmContext();
    setSelectedPm(null);
    setPmTypeData(null);
    setSelectedType(null);
  };

  const handleBackToTypes = () => {
    setSelectedType(null);
  };

  const onSelectProfile = (id: string) => {
    const p = profiles.find(pr => String(pr.prjMgrId) === String(id));
    setForm(f => ({
      ...f,
      prjMgrId: id,
      fullName: p?.fullName || f.fullName,
      email: p?.email || f.email,
    }));
  };

  const submitPm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const res = await axios.post(USERS_API, {
        actingRole: user?.role,
        actingUser: user?.username,
        role: 'PM',
        prjMgrId: form.prjMgrId,
        fullName: form.fullName,
        username: form.username,
        email: form.email,
        password: form.password,
      });
      if (res.data.success) {
        setMsg({ type: 'ok', text: res.data.message || 'Project Manager provisioned successfully!' });
        setForm({ prjMgrId: '', fullName: '', username: '', email: '', password: '' });
        setShowForm(false);
        loadManagers();
        loadProvisioning();
      } else {
        setMsg({ type: 'err', text: res.data.message || 'Could not provision PM.' });
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.response?.data?.message || 'Could not provision PM.' });
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setZoneFilter('ALL');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
  };

  const zoneColor = (zone: string) => {
    if (!zone) return '#6c757d';
    if (zone.includes('North')) return '#003366';
    if (zone.includes('East')) return '#8a1515';
    if (zone.includes('West')) return '#FF6600';
    if (zone.includes('South')) return '#006699';
    return '#6c757d';
  };

  // ── CONDITIONAL RENDERS (MUST COME AFTER ALL HOOKS) ──

  // ── LEVEL 2: Show project list for specific PM + type ──
  if (selectedPm && selectedType) {
    return (
      <div className="pm-page page-container animate-fade-in-up" style={{ padding: '1rem 1.5rem' }}>
        <ProjectListPage
          forcedPrjMgrId={selectedPm.prjMgrId}
          pmInfo={selectedPm}
          forcedProjectType={selectedType}
          onBackToRoster={handleBackToTypes}
          backLabel={`← Back to ${(selectedPm?.fullName || 'PM').split(' ')[0]}'s Project Types`}
        />
      </div>
    );
  }

  // ── LEVEL 1: Show PM project type breakdown ──
  if (selectedPm) {
    const typeColors: string[] = ['#003366', '#006699', '#FF6600', '#28A745', '#DC3545', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#0dcaf0'];
    const totalCount = pmTypeData?.totalProjects || selectedPm.projectCount || 0;
    const rawTypes = pmTypeData?.types || (selectedPm as any).projectTypeDetails || (selectedPm as any).projectTypes || [];
    const pmFirstName = (selectedPm?.fullName || 'PM').split(' ')[0];
    const pmInitials = (selectedPm?.fullName || '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('') || 'PM';

    return (
      <div className="pm-page page-container animate-fade-in-up" style={{ padding: '1.5rem' }}>
        {/* ── Back Button ── */}
        <button
          className="btn btn-ghost btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1rem', color: '#003366', fontWeight: 600 }}
          onClick={handleBackToRoster}
        >
          ← Back to Project Managers Roster
        </button>

        {/* ── PM Header Card ── */}
        <div style={{ background: 'linear-gradient(135deg, #003366, #006699)', borderRadius: 14, padding: '1.5rem 2rem', color: '#fff', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>
              {pmInitials}
            </div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{selectedPm.fullName || `PM #${selectedPm.prjMgrId}`}</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>{selectedPm.designation || 'Project Manager'} &middot; {selectedPm.zone || 'NICSI'} &middot; PRJ_MGR_{selectedPm.prjMgrId}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{totalCount.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>ERP Career Projects</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{rawTypes.length}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Project Categories</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#003366', margin: 0 }}>Project Categories — Select to Filter Projects</h3>
          <p style={{ fontSize: '0.82rem', color: '#6c757d', marginTop: 4 }}>Select a category below to view all project transaction records under {selectedPm.fullName}'s portfolio</p>
        </div>

        {loadingTypes ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#003366', fontWeight: 600 }}>Loading project categories…</div>
        ) : rawTypes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>No project type breakdown data available for this PM.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {rawTypes.map((t: any, idx: number) => {
              const typeName = typeof t === 'string' ? t : (t.type || t.name || 'Category');
              const summaryCount = typeof t === 'string' ? 0 : (Number(t.summaryCount || t.count) || 0);
              const detailedCount = typeof t === 'string' ? 0 : (Number(t.detailedCount) || 0);
              const color = typeColors[idx % typeColors.length];
              const pct = totalCount > 0 ? Math.round((summaryCount / totalCount) * 100) : 0;
              return (
                <button
                  key={typeName + idx}
                  onClick={() => { setDelegatedPmContext(selectedPm.prjMgrId); setSelectedType(typeName); }}
                  style={{
                    background: '#fff',
                    border: `2px solid ${color}20`,
                    borderLeft: `5px solid ${color}`,
                    borderRadius: 12,
                    padding: '1rem 1.25rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 3px 10px rgba(0,0,0,0.06)',
                    width: '100%',
                  }}
                  className="table-row-hover"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1a1a2e' }}>{typeName}</span>
                    <span style={{ background: `${color}18`, color, fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>
                      {summaryCount.toLocaleString('en-IN')} Projects
                    </span>
                  </div>
                  {totalCount > 0 && (
                    <div style={{ width: '100%', height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#6c757d' }}>{pct > 0 ? `${pct}% of portfolio` : 'Category'}</span>
                    <span style={{ fontSize: '0.75rem', color, fontWeight: 700 }}>
                      {detailedCount > 0 ? `Inspect ${detailedCount} DB Record${detailedCount > 1 ? 's' : ''} →` : 'View Projects →'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── All Projects button ── */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setDelegatedPmContext(selectedPm.prjMgrId); setSelectedType('__ALL__'); }}
            style={{ padding: '0.6rem 2rem', fontWeight: 700 }}
          >
            View All {(selectedPm as any).projectCountList || selectedPm.projectCount || 0} Project Records →
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pm-page page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#003366' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <h3>Loading Project Manager Directory…</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="pm-page page-container animate-fade-in-up">
      {/* Top Banner / Header */}
      <div className="pm-header-banner">
        <div>
          <h1 className="pm-title">Project Managers Directory — Team Oversight</h1>
          <p className="pm-subtitle">
            Managing Director view - Full zonal Project Manager directory, project categories, and financial holds
          </p>
        </div>
        <div className="pm-action-buttons">
          {canProvision && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? '✕ Close Form' : '+ Provision Project Manager'}
            </button>
          )}
          <button
            className={`btn ${showFilters ? 'btn-navy' : 'btn-outline-navy'} btn-sm`}
            onClick={() => setShowFilters(!showFilters)}
          >
            ⚡ Filter PM Roster {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>
          <span className="pm-count-badge">
            {filteredManagers.length} of {managers.length} PMs
          </span>
        </div>
      </div>

      {/* Roster Aggregate Stats Cards */}
      <div className="pm-stats-grid">
        <div className="pm-stat-card">
          <div className="pm-stat-label">TOTAL ROSTER PMS</div>
          <div className="pm-stat-value">{org.totalManagers || managers.length || 0}</div>
          <div className="pm-stat-sub">{assignedIds.size} Provisioned Accounts</div>
        </div>
        <div className="pm-stat-card">
          <div className="pm-stat-label">TOTAL PROJECTS</div>
          <div className="pm-stat-value">{(org.totalProjects || 0).toLocaleString('en-IN')}</div>
          <div className="pm-stat-sub">Across all zones</div>
        </div>
        <div className="pm-stat-card">
          <div className="pm-stat-label">TOTAL CLIENT RECEIPTS</div>
          <div className="pm-stat-value">{formatCurrency(org.totalReceived || 0)}</div>
          <div className="pm-stat-sub">Organisation-wide</div>
        </div>
        <div className="pm-stat-card">
          <div className="pm-stat-label">NICSI MARGIN</div>
          <div className="pm-stat-value" style={{ color: '#28A745' }}>{formatCurrency(org.totalCommission || 0)}</div>
          <div className="pm-stat-sub">Service Charge</div>
        </div>
        <div className="pm-stat-card">
          <div className="pm-stat-label">VENDOR PENDING DUES</div>
          <div className="pm-stat-value" style={{ color: (org.totalVendorPending || 0) > 0 ? '#DC3545' : '#28A745' }}>
            {formatCurrency(org.totalVendorPending || 0)}
          </div>
          <div className="pm-stat-sub">Dues to vendors</div>
        </div>
      </div>

      {/* PM Account Provisioning Form (MD / Admin only) */}
      {showForm && (
        <div className="card pm-form-card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h3>Provision New Project Manager Account</h3>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>Create RBAC login credentials for a PM profile</span>
          </div>

          {msg && (
            <div className={`alert ${msg.type === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ margin: '1rem' }}>
              {msg.text}
            </div>
          )}

          <form onSubmit={submitPm} style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label className="form-label">Select PM Profile *</label>
                <select
                  className="form-control"
                  value={form.prjMgrId}
                  onChange={e => onSelectProfile(e.target.value)}
                  required
                >
                  <option value="">-- Choose from ERP PM List --</option>
                  {profiles.map(p => (
                    <option key={p.prjMgrId} value={p.prjMgrId}>
                      {p.fullName} ({p.zone || 'Zone'}) {assignedIds.has(String(p.prjMgrId)) ? '✓ Provisioned' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Full Name *</label>
                <input
                  className="form-control"
                  value={form.fullName}
                  onChange={e => setForm({ ...form, fullName: e.target.value })}
                  placeholder="e.g. Atul Rastogi"
                  required
                />
              </div>

              <div>
                <label className="form-label">Username *</label>
                <input
                  className="form-control"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. atul_rastogi"
                  required
                />
              </div>

              <div>
                <label className="form-label">NICSI Email *</label>
                <input
                  type="email"
                  className="form-control"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="atul@nicsi.gov.in"
                  required
                />
              </div>

              <div>
                <label className="form-label">Initial Password *</label>
                <input
                  type="password"
                  className="form-control"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Provisioning...' : 'Provision Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Roster Filters Drawer */}
      {showFilters && (
        <div className="pm-filter-panel card" style={{ marginBottom: '1.5rem' }}>
          <div className="pm-filter-group" style={{ flex: 2 }}>
            <label>Search Roster</label>
            <input
              className="form-control"
              placeholder="Search by PM Name, Email, PRJ_MGR_ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="pm-filter-group">
            <label>Zone Filter</label>
            <select className="form-control" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
              <option value="ALL">All Zones</option>
              <option value="North Zone">North Zone</option>
              <option value="South Zone">South Zone</option>
              <option value="East Zone">East Zone</option>
              <option value="West Zone">West Zone</option>
            </select>
          </div>

          <div className="pm-filter-group">
            <label>Project Category</label>
            <select className="form-control" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="ALL">All Project Categories</option>
              {allProjectTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="pm-filter-group">
            <label>Account Status</label>
            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE_ACCOUNT">Provisioned Accounts Only</option>
              <option value="UNASSIGNED">Needs Provisioning</option>
              <option value="HAS_VENDOR_DUES">Has Vendor Pending Dues</option>
            </select>
          </div>

          {activeFiltersCount > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-end', marginBottom: 2 }}
              onClick={resetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Dedicated Corporate Unassigned Projects Pool Banner */}
      {unassignedPool && unassignedPool.projectCount > 0 && (
        <div className="card" style={{
          background: 'linear-gradient(135deg, #f0f7ff, #e6f0fa)',
          border: '1.5px solid #b3d1ff',
          borderRadius: '10px',
          padding: '0.85rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          boxShadow: '0 3px 12px rgba(0, 51, 102, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '8px',
              background: '#003366', color: '#ffffff', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem'
            }}>
              🏢
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#003366' }}>
                Corporate Unassigned Projects Pool ({unassignedPool.projectCount} Projects)
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '1px' }}>
                Central corporate pool projects not yet assigned to a specific Project Manager &middot; Total Receipts: <strong>{formatCurrency(unassignedPool.totalReceived)}</strong> &middot; Total PO: <strong>{formatCurrency(unassignedPool.totalPo)}</strong>
              </div>
            </div>
          </div>
          <button
            className="btn btn-navy btn-sm"
            onClick={() => navigate('/projects?unassigned=true')}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem', whiteSpace: 'nowrap' }}
          >
            Inspect Unassigned Pool ({unassignedPool.projectCount} Projects) →
          </button>
        </div>
      )}

      {/* Modern Compact PM Cards Grid */}
      <div className="pm-cards-grid-compact">
        {filteredManagers.map(pm => {
          return (
            <div
              key={pm.prjMgrId}
              className="pm-card-compact"
              onClick={() => handleSelectPm(pm)}
            >
              {/* Card Header */}
              <div className="pm-card-compact__header" style={{ borderLeftColor: zoneColor(pm.zone) }}>
                <div className="pm-card-compact__avatar" style={{ background: zoneColor(pm.zone) }}>
                  {pm.fullName?.split(' ').map(w => w[0]).slice(0, 2).join('') || 'PM'}
                </div>
                <div className="pm-card-compact__title-wrap">
                  <div className="pm-card-compact__name-row">
                    <span className="pm-card-compact__name">{pm.fullName}</span>
                    <span className="pm-card-compact__id">#{pm.prjMgrId}</span>
                  </div>
                  <div className="pm-card-compact__sub-info">
                    {pm.designation} &middot; <span style={{ fontWeight: 700, color: zoneColor(pm.zone) }}>{pm.zone}</span>
                  </div>
                </div>
                <div className="pm-card-compact__badge-col">
                  <span className={`pm-status-pill ${pm.isProvisioned ? 'pm-status-pill--active' : 'pm-status-pill--pending'}`}>
                    {pm.isProvisioned ? '● Active' : '○ Pending'}
                  </span>
                  <div className="pm-card-compact__count-pill">{pm.projectCount} Projects</div>
                </div>
              </div>

              {/* Financial Metrics Matrix */}
              <div className="pm-card-compact__grid">
                <div className="pm-card-compact__metric">
                  <span className="pm-card-compact__m-label">Receipts</span>
                  <span className="pm-card-compact__m-val" style={{ color: '#003366' }}>{formatCurrency(pm.totalReceived)}</span>
                </div>
                <div className="pm-card-compact__metric">
                  <span className="pm-card-compact__m-label">NICSI Charge</span>
                  <span className="pm-card-compact__m-val" style={{ color: '#28A745' }}>{formatCurrency(pm.totalCommission)}</span>
                </div>
                <div className="pm-card-compact__metric">
                  <span className="pm-card-compact__m-label">Vendor PO</span>
                  <span className="pm-card-compact__m-val" style={{ color: '#006699' }}>{formatCurrency(pm.totalPo)}</span>
                </div>
                <div className="pm-card-compact__metric">
                  <span className="pm-card-compact__m-label">Vendor Pending</span>
                  <span className="pm-card-compact__m-val" style={{ color: pm.totalVendorPending > 0 ? '#DC3545' : '#28A745' }}>
                    {pm.totalVendorPending > 0 ? formatCurrency(pm.totalVendorPending) : '✓ Clear'}
                  </span>
                </div>
              </div>

              {/* Category Chips */}
              {pm.projectTypes && pm.projectTypes.length > 0 && (
                <div className="pm-card-compact__tags">
                  {pm.projectTypes.slice(0, 3).map((pt, idx) => (
                    <span key={idx} className="pm-type-chip">{pt}</span>
                  ))}
                  {pm.projectTypes.length > 3 && (
                    <span className="pm-type-chip pm-type-chip--more">+{pm.projectTypes.length - 3} more</span>
                  )}
                </div>
              )}

              {/* Card Footer Action */}
              <div className="pm-card-compact__footer">
                <span className="pm-card-compact__email" title={pm.email}>✉ {pm.email}</span>
                <button
                  className="btn btn-primary btn-xs pm-card-compact__btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPm(pm);
                  }}
                >
                  Inspect Account &amp; Projects →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredManagers.length === 0 && (
        <div className="pm-empty card" style={{ marginTop: '1rem' }}>
          <h3 className="pm-empty__title">No Project Managers match the selected filters</h3>
          <p className="pm-empty__text">Try adjusting search terms, zone filter, or project category options.</p>
          <button className="btn btn-primary btn-sm" onClick={resetFilters}>Reset All Filters</button>
        </div>
      )}

      {/* Organizational Roster Comparison Table */}
      <div className="card" style={{ marginTop: '1.5rem', overflow: 'hidden' }}>
        <div className="card-header">
          <h3 className="pm-table-title">Full Organizational PM Roster Comparison</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>PRJ_MGR_ID</th>
                <th>Project Manager</th>
                <th>Zone</th>
                <th>Account Status</th>
                <th>Projects</th>
                <th>Funds Received</th>
                <th>NICSI Charge</th>
                <th>Vendor PO Total</th>
                <th>Vendor Dues</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredManagers.map(pm => (
                <tr key={pm.prjMgrId} className="table-row-hover">
                  <td><code>#{pm.prjMgrId}</code></td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#003366' }}>{pm.fullName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>{pm.designation}</div>
                  </td>
                  <td><span className="pm-zone-badge">{pm.zone}</span></td>
                  <td>
                    <span className={`pm-status-pill ${pm.isProvisioned ? 'pm-status-pill--active' : 'pm-status-pill--pending'}`}>
                      {pm.isProvisioned ? 'Provisioned' : 'Unassigned'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{pm.projectCount}</td>
                  <td>{formatCurrency(pm.totalReceived)}</td>
                  <td style={{ color: '#28A745' }}>{formatCurrency(pm.totalCommission)}</td>
                  <td>{formatCurrency(pm.totalPo)}</td>
                  <td style={{ color: pm.totalVendorPending > 0 ? '#DC3545' : '#28A745' }}>
                    {pm.totalVendorPending > 0 ? formatCurrency(pm.totalVendorPending) : '✓ Clear'}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleSelectPm(pm)}
                      style={{ color: '#003366', fontWeight: 700 }}
                    >
                      View Categories &amp; Projects →
                    </button>
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
