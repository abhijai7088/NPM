// @ts-nocheck
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { ProjectListPage } from '../projects/ProjectListPage';
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

  const [managers, setManagers] = useState<PM[]>([]);
  const [org, setOrg] = useState<any>({});
  const [loading, setLoading] = useState(true);

  // Impersonation / PM Drill-down State
  const [selectedPm, setSelectedPm] = useState<PM | null>(null);

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

  if (loading) {
    return (
      <div className="pm-page page-container">
        <div className="loading-spinner">Loading project managers roster…</div>
      </div>
    );
  }

  // ── PM IMPERSONATION / DRILL-DOWN VIEW ──
  if (selectedPm) {
    return (
      <div className="pm-page page-container animate-fade-in-up" style={{ padding: '1rem 1.5rem' }}>
        <ProjectListPage
          forcedPrjMgrId={selectedPm.prjMgrId}
          pmInfo={selectedPm}
          onBackToRoster={() => setSelectedPm(null)}
        />
      </div>
    );
  }

  // ── MAIN MD PROJECT MANAGERS DIRECTORY VIEW ──
  return (
    <div className="pm-page page-container animate-fade-in-up">
      {/* Header */}
      <div className="pm-header">
        <div>
          <h2 className="pm-title">Project Managers Directory — Team Oversight</h2>
          <p className="pm-sub">Managing Director view · Full zonal Project Manager directory, project categories, and financial holds</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {canProvision && (
            <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(v => !v); setMsg(null); }}>
              {showForm ? 'Close' : '+ Provision Project Manager'}
            </button>
          )}
          <button
            className={`btn btn-sm ${showFilters ? 'btn-navy' : 'btn-outline'}`}
            onClick={() => setShowFilters(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>⚡ {showFilters ? 'Hide Filters' : 'Filter PM Roster'}</span>
            {activeFiltersCount > 0 && (
              <span className="pm-filter-count">{activeFiltersCount}</span>
            )}
          </button>
          <div className="pm-count-badge">{filteredManagers.length} of {managers.length} PMs</div>
        </div>
      </div>

      {msg && <div className={`pm-alert pm-alert--${msg.type}`}>{msg.text}</div>}

      {/* PM provisioning form (MD / Super Admin) */}
      {canProvision && showForm && (
        <form className="card pm-provision" onSubmit={submitPm}>
          <h3 className="pm-provision__title">Provision Project Manager (PM)</h3>
          <p className="pm-provision__hint">
            Assign a login to a zonal Project Manager portfolio. Enter the Manager ID to dynamically fetch and link officer details.
          </p>
          <div className="pm-provision__grid">
            <label className="um-field">
              <span>Project Manager ID (PRJ_MGR_ID) *</span>
              <input
                required
                type="number"
                value={form.prjMgrId}
                onChange={e => onSelectProfile(e.target.value)}
                placeholder="e.g. 1626"
              />
            </label>
            <label className="um-field">
              <span>Full Name *</span>
              <input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Officer name" />
            </label>
            <label className="um-field">
              <span>Username (Employee ID) *</span>
              <input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="e.g. atul" />
            </label>
            <label className="um-field">
              <span>Official Email *</span>
              <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="officer@nicsi.gov.in" />
            </label>
            <label className="um-field">
              <span>Initial Password *</span>
              <input required type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Share securely" />
            </label>
          </div>

          {profiles.length > 0 && (
            <div className="pm-provision__profiles">
              <span className="pm-provision__profiles-lbl">Available Project Manager profiles:</span>
              <div className="pm-provision__profiles-chips">
                {profiles.map(p => {
                  const taken = assignedIds.has(String(p.prjMgrId));
                  return (
                    <button
                      key={p.prjMgrId}
                      type="button"
                      className={`pm-profile-chip${taken ? ' pm-profile-chip--taken' : ''}${String(form.prjMgrId) === String(p.prjMgrId) ? ' pm-profile-chip--active' : ''}`}
                      disabled={taken}
                      onClick={() => onSelectProfile(String(p.prjMgrId))}
                      title={taken ? 'Already assigned to a PM login' : `Assign ${p.fullName}`}
                    >
                      <strong>ID {p.prjMgrId}</strong> · {p.fullName} {taken ? ' (assigned)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="pm-provision__actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Provisioning…' : 'Create PM Account'}</button>
          </div>
        </form>
      )}

      {/* Org-level KPIs */}
      <div className="pm-org-grid">
        <div className="pm-org-card">
          <div className="pm-org-card__label">Total Roster PMs</div>
          <div className="pm-org-card__val" style={{ color: '#003366' }}>{managers.length}</div>
          <div className="pm-org-card__sub">{managers.filter(m => m.isProvisioned).length} Provisioned Accounts</div>
        </div>
        <div className="pm-org-card">
          <div className="pm-org-card__label">Total Projects</div>
          <div className="pm-org-card__val" style={{ color: '#006699' }}>{org.totalProjects ?? 0}</div>
          <div className="pm-org-card__sub">Across all zones</div>
        </div>
        <div className="pm-org-card">
          <div className="pm-org-card__label">Total Client Receipts</div>
          <div className="pm-org-card__val" style={{ color: '#FF6600' }}>{formatCurrency(org.totalReceived ?? 0)}</div>
          <div className="pm-org-card__sub">Organisation-wide</div>
        </div>
        <div className="pm-org-card">
          <div className="pm-org-card__label">NICSI Margin</div>
          <div className="pm-org-card__val" style={{ color: '#28A745' }}>{formatCurrency(org.totalCommission ?? 0)}</div>
          <div className="pm-org-card__sub">Service Charge</div>
        </div>
        <div className="pm-org-card">
          <div className="pm-org-card__label">Vendor Pending Dues</div>
          <div className="pm-org-card__val" style={{ color: '#DC3545' }}>{formatCurrency(org.totalVendorPending ?? 0)}</div>
          <div className="pm-org-card__sub">Dues to vendors</div>
        </div>
      </div>

      {/* Collapsible Filter Toolbar */}
      {showFilters && (
        <div className="pm-filter-bar card animate-fade-in-up">
          <div className="pm-filter-group" style={{ flex: 2 }}>
            <label>Search PM Roster</label>
            <input
              type="text"
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

      {/* Modern Compact PM Cards Grid */}
      <div className="pm-cards-grid-compact">
        {filteredManagers.map(pm => {
          return (
            <div
              key={pm.prjMgrId}
              className="pm-card-compact"
              onClick={() => setSelectedPm(pm)}
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
                    setSelectedPm(pm);
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
                <th>PO Total</th>
                <th>Vendor Dues</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredManagers.map(pm => (
                <tr key={pm.prjMgrId} className="table-row-hover" style={{ cursor: 'pointer' }} onClick={() => setSelectedPm(pm)}>
                  <td><code>#{pm.prjMgrId}</code></td>
                  <td style={{ fontWeight: 600 }}>{pm.fullName}</td>
                  <td><span className="pm-zone-pill" style={{ background: `${zoneColor(pm.zone)}18`, color: zoneColor(pm.zone) }}>{pm.zone}</span></td>
                  <td>
                    <span className={`pm-status-pill ${pm.isProvisioned ? 'pm-status-pill--active' : 'pm-status-pill--pending'}`}>
                      {pm.isProvisioned ? 'Active' : 'Unassigned'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{pm.projectCount}</td>
                  <td style={{ fontWeight: 600, color: '#003366' }}>{formatCurrency(pm.totalReceived)}</td>
                  <td style={{ fontWeight: 600, color: '#28A745' }}>{formatCurrency(pm.totalCommission)}</td>
                  <td style={{ color: '#006699' }}>{formatCurrency(pm.totalPo)}</td>
                  <td style={{ color: pm.totalVendorPending > 0 ? '#DC3545' : '#28A745', fontWeight: 600 }}>
                    {pm.totalVendorPending > 0 ? formatCurrency(pm.totalVendorPending) : '✓'}
                  </td>
                  <td>
                    <button
                      className="btn btn-navy btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPm(pm);
                      }}
                    >
                      Inspect Account →
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
