import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  listTickets,
  createTicket,
  PRIORITY_COLORS,
  STATUS_COLORS,
  TICKET_TYPE_LABELS,
  type ProjectTicket,
} from '../../api/tickets';
import { TicketDetailModal } from '../../components/tickets/TicketDetailModal';
import { CreateManagementTicketModal } from '../../components/tickets/CreateManagementTicketModal';
import { UnassignedProjectsSection } from '../../components/projects/UnassignedProjectsSection';
import { useAuthStore } from '../../store/authStore';
import './TicketListPage.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PmOption {
  prjMgrId: number;
  fullName: string;
  zone: string;
  projectCount: number;
}

interface ProjectOption {
  headerId: number;
  projectCode: string;
  projectName: string;
  customerName: string;
  prjMgrId?: number;
  prjMgrName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

// Custom dropdown filter with downward alignment and searching capabilities
const SearchableDropdown: React.FC<{
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  style?: React.CSSProperties;
}> = ({ label, value, onChange, options, placeholder = 'Search...', style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options list on matching search string
  const filteredOptions = useMemo(() => {
    return options.filter(opt =>
      opt.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', minWidth: '170px', ...style }}>
      {label && <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#495057', marginBottom: '0.25rem' }}>{label}</label>}
      
      {/* Dropdown Toggle Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        style={{
          width: '100%',
          height: '38px',
          padding: '0 12px',
          background: '#ffffff',
          border: '1.5px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '0.85rem',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: selectedOption ? '#1f2937' : '#94a3b8',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(0, 51, 102, 0.1)' : 'none',
          borderColor: isOpen ? '#003366' : '#e5e7eb',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
          {selectedOption ? selectedOption.label : 'Select...'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown Options List (Always opens downwards!) */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          zIndex: 999,
          maxHeight: '260px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Inner Search Box */}
          <div style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={placeholder}
                style={{
                  width: '100%',
                  height: '30px',
                  padding: '0 8px 0 26px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.78rem',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                }}
                onClick={e => e.stopPropagation()}
              />
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>

          {/* Options Items */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                No matches found
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: '0.8125rem',
                      color: isSelected ? '#003366' : '#334155',
                      background: isSelected ? '#f0f7ff' : 'transparent',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s ease'
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#003366" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const TicketListPage: React.FC = () => {
  const { user } = useAuthStore();
  const role = user?.role ?? 'PM';
  const isMd = role === 'MD' || role === 'SUPER_ADMIN';
  const isPm = role === 'PM';

  // Ticket list
  const [tickets, setTickets]       = useState<ProjectTicket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // MD: PM selector
  const [pmList, setPmList]               = useState<PmOption[]>([]);
  const [pmListLoading, setPmListLoading] = useState(false);
  const [selectedPmId, setSelectedPmId]   = useState<string>('');

  // Project list (loaded per PM or organisation-wide)
  const [projectList, setProjectList]               = useState<ProjectOption[]>([]);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectSearch, setProjectSearch]           = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [cTitle, setCTitle]         = useState('');
  const [cDesc, setCDesc]           = useState('');
  const [cType, setCType]           = useState('PO_FOLLOW_UP');
  const [cPri, setCPri]             = useState('MEDIUM');
  const [cHeaderId, setCHeaderId]   = useState('');
  const [cAssignedTo, setCAssignedTo] = useState('');
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Load PM list for MD / Super Admin ────────────────────────────────────────

  useEffect(() => {
    if (!isMd) return;
    setPmListLoading(true);
    axios.get('/api/v1/project-managers')
      .then(res => {
        if (res.data.success) {
          const list: PmOption[] = (res.data.data as any[]).map(pm => ({
            prjMgrId:     pm.prjMgrId,
            fullName:     pm.fullName,
            zone:         pm.zone || '',
            projectCount: pm.projectCount || 0,
          }));
          setPmList(list);
        }
      })
      .catch(() => {})
      .finally(() => setPmListLoading(false));
  }, [isMd]);

  // ── Load projects for a given prjMgrId or Organisation-wide ─────────────────

  const loadProjects = useCallback(async (prjMgrId: number | null) => {
    setProjectListLoading(true);
    try {
      if (prjMgrId) {
        const res = await axios.get(`/api/v1/project-managers/${prjMgrId}/projects`);
        if (res.data.success) {
          setProjectList(
            (res.data.data as any[]).map((p: any) => ({
              headerId:     Number(p.headerId ?? p.header_id),
              projectCode:  p.projectCode ?? p.project_cd ?? '',
              projectName:  p.projectName ?? p.prj_nm ?? '',
              customerName: p.customerName ?? p.customer_name ?? '',
              prjMgrId:     p.prjMgrId ?? prjMgrId,
              prjMgrName:   p.prjMgrName,
            }))
          );
        }
      } else {
        const res = await axios.get(`/api/v1/projects/advanced-search?page=0&size=200`);
        if (res.data.success && res.data.data) {
          setProjectList(
            (res.data.data as any[]).map((p: any) => ({
              headerId:     Number(p.headerId ?? p.header_id),
              projectCode:  p.projectCode ?? p.project_cd ?? '',
              projectName:  p.projectName ?? p.prj_nm ?? '',
              customerName: p.customerName ?? p.customer_name ?? '',
              prjMgrId:     p.prjMgrId,
              prjMgrName:   p.prjMgrName,
            }))
          );
        }
      }
    } catch { /* ignore */ }
    finally { setProjectListLoading(false); }
  }, []);

  // Initial load
  useEffect(() => {
    if (isPm && user?.prjMgrId) {
      loadProjects(user.prjMgrId);
    } else if (isMd || (role as string) === 'PMC') {
      loadProjects(null);
    }
  }, [isPm, isMd, role, user?.prjMgrId, loadProjects]);

  // Live debounced search when user types in project picker
  useEffect(() => {
    if (!projectSearch || projectSearch.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/v1/projects/advanced-search?search=${encodeURIComponent(projectSearch.trim())}&size=50`);
        if (res.data.success && res.data.data) {
          const fetched: ProjectOption[] = (res.data.data as any[]).map((p: any) => ({
            headerId:     Number(p.headerId ?? p.header_id),
            projectCode:  p.projectCode ?? p.project_cd ?? '',
            projectName:  p.projectName ?? p.prj_nm ?? '',
            customerName: p.customerName ?? p.customer_name ?? '',
            prjMgrId:     p.prjMgrId,
            prjMgrName:   p.prjMgrName,
          }));
          setProjectList(prev => {
            const seen = new Set(prev.map(x => x.headerId));
            const newItems = fetched.filter(x => !seen.has(x.headerId));
            return [...prev, ...newItems];
          });
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timeout);
  }, [projectSearch]);

  // MD: when PM selection changes
  const handlePmSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPmId(val);
    setCHeaderId('');
    setProjectSearch('');
    setShowProjectDropdown(false);
    loadProjects(val ? Number(val) : null);
  };

  // ── Load tickets (filtered by PM if MD has selected one) ─────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        status:   filterStatus   || undefined,
        priority: filterPriority || undefined,
      };
      if (isMd && selectedPmId) params.prjMgrId = Number(selectedPmId);
      const res = await listTickets(params);
      setTickets(res.data ?? []);
    } finally { setLoading(false); }
  }, [filterStatus, filterPriority, isMd, selectedPmId]);

  useEffect(() => { load(); }, [load]);

  // ── Project search filter ─────────────────────────────────────────────────────

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projectList;
    const q = projectSearch.toLowerCase();
    return projectList.filter(p =>
      p.projectCode.toLowerCase().includes(q) ||
      p.projectName.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      String(p.headerId).includes(q)
    );
  }, [projectList, projectSearch]);

  const selectedProject = projectList.find(p => String(p.headerId) === cHeaderId);

  // ── Ticket search filter ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.ticketCode.toLowerCase().includes(q) ||
      (t.assignedTo ?? '').toLowerCase().includes(q)
    );
  }, [tickets, search]);

  // ── Create handler ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!cTitle.trim() || !cHeaderId) return;
    setCreating(true);
    setCreateError('');
    try {
      await createTicket({
        headerId: Number(cHeaderId),
        title: cTitle,
        description: cDesc,
        ticketType: cType,
        priority: cPri,
        assignedTo: cAssignedTo || undefined,
      } as any);
      setShowCreate(false);
      setCTitle(''); setCDesc(''); setCHeaderId(''); setCAssignedTo('');
      setProjectSearch(''); setShowProjectDropdown(false);
      await load();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Failed to raise notice. Please try again.');
    } finally { setCreating(false); }
  };

  const canCreate = true;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="tl-page">

      {/* Header */}
      <div className="tl-header">
        <div>
          <h1 className="tl-title">NICSI Ticket Management System</h1>
          <p className="tl-subtitle">
            Monitor project issues, deadlines, PO extensions, bill submissions, and compliance across all projects
          </p>
        </div>
        {role !== 'OA' && (
          <button
            className="tl-create-btn"
            onClick={() => setShowCreate(true)}
          >
            + Raise a ticket
          </button>
        )}
      </div>

      {/* Governed 6-Section Management Ticket Modal */}
      <CreateManagementTicketModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          load();
        }}
        userRole={role}
      />

      {/* ── MD / Super Admin: Unassigned Projects Panel ── */}
      {isMd && <UnassignedProjectsSection onAssigned={load} />}

      {/* ── MD / Super Admin: PM Selector strip ── */}
      {isMd && (
        <div className="tl-pm-strip">
          <div className="tl-pm-strip-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Filter by Project Manager:
          </div>
          <select
            className="tl-pm-select"
            value={selectedPmId}
            onChange={handlePmSelect}
            disabled={pmListLoading}
          >
            <option value="">— All PMs (Organisation-wide) —</option>
            {pmList.map(pm => (
              <option key={pm.prjMgrId} value={String(pm.prjMgrId)}>
                {pm.fullName}  ·  {pm.zone}  ·  {pm.projectCount} projects
              </option>
            ))}
          </select>
          {selectedPmId && (
            <button
              className="tl-pm-clear"
              onClick={() => {
                setSelectedPmId('');
                loadProjects(null);
                setCHeaderId('');
                setProjectSearch('');
              }}
            >
              ✕ Clear Filter
            </button>
          )}
          {pmListLoading && <span className="tl-pm-loading">Loading PMs…</span>}
        </div>
      )}

      {/* Filters */}
      <div className="tl-filters">
        <div className="tl-search-wrap">
          <span className="tl-search-icon">🔍</span>
          <input
            className="tl-search"
            placeholder="Search notices, codes, assignees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(() => {
          const statusOptions = [
            { value: '', label: 'All Statuses' },
            ...['OPEN', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RESOLVED', 'CLOSED', 'REOPENED'].map(s => ({
              value: s,
              label: s.replace(/_/g, ' ')
            }))
          ];

          const priorityOptions = [
            { value: '', label: 'All Priorities' },
            ...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => ({
              value: p,
              label: p
            }))
          ];

          return (
            <>
              <SearchableDropdown
                value={filterStatus}
                onChange={setFilterStatus}
                options={statusOptions}
                placeholder="Search status..."
              />
              <SearchableDropdown
                value={filterPriority}
                onChange={setFilterPriority}
                options={priorityOptions}
                placeholder="Search priority..."
              />
            </>
          );
        })()}
        <button className="tl-reset-btn" onClick={() => { setFilterStatus(''); setFilterPriority(''); setSearch(''); }}>
          Clear
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="tl-loading">
          <div className="tl-spinner" />
          <span>Loading notices…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="tl-empty">
          {isMd && selectedPmId
            ? `No notices found for this PM${filterStatus ? ` · status: ${filterStatus}` : ''}.`
            : 'No notices match your filters.'}
        </div>
      ) : (
        <div className="tl-table-wrap">
          <table className="tl-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject / Title</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>SLA</th>
                <th>Raised On</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} onClick={() => setSelectedId(t.id)} className="tl-row">
                  <td><span className="tl-code">{t.ticketCode}</span></td>
                  <td className="tl-title-cell">
                    {t.title}
                    {t.escalatedTo && <span className="tl-escalated-badge">↑ Escalated</span>}
                  </td>
                  <td>{TICKET_TYPE_LABELS[t.ticketType] ?? t.ticketType}</td>
                  <td>
                    <span className="tl-priority-chip"
                      style={{ color: PRIORITY_COLORS[t.priority], background: PRIORITY_COLORS[t.priority] + '18' }}>
                      {t.priority}
                    </span>
                  </td>
                  <td>
                    <span className="tl-status-chip"
                      style={{ color: STATUS_COLORS[t.status], background: STATUS_COLORS[t.status] + '18' }}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>{t.assignedTo ? `@${t.assignedTo}` : <span className="tl-unassigned">Unassigned</span>}</td>
                  <td>
                    {t.slaDeadline ? (
                      <span className={t.isOverdue ? 'tl-overdue' : ''}>
                        {new Date(t.slaDeadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        {t.isOverdue && ' ⚠'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="tl-date">
                    {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tl-count">
            {filtered.length} notice{filtered.length !== 1 ? 's' : ''}
            {isMd && selectedPmId
              ? ` · ${pmList.find(p => String(p.prjMgrId) === selectedPmId)?.fullName ?? ''}`
              : ''}
          </div>
        </div>
      )}

      {selectedId && (
        <TicketDetailModal
          ticketId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
};

