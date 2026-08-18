import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  // Project list (loaded per PM)
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

  // ── Load projects for a given prjMgrId ───────────────────────────────────────

  const loadProjects = useCallback(async (prjMgrId: number | null) => {
    if (!prjMgrId) { setProjectList([]); return; }
    setProjectListLoading(true);
    setProjectList([]);
    try {
      const res = await axios.get(`/api/v1/project-managers/${prjMgrId}/projects`);
      if (res.data.success) {
        setProjectList(
          (res.data.data as any[]).map((p: any) => ({
            headerId:     Number(p.headerId ?? p.header_id),
            projectCode:  p.projectCode ?? p.project_cd ?? '',
            projectName:  p.projectName ?? p.prj_nm ?? '',
            customerName: p.customerName ?? p.customer_name ?? '',
          }))
        );
      }
    } catch { /* ignore */ }
    finally { setProjectListLoading(false); }
  }, []);

  // PM: load own projects on mount
  useEffect(() => {
    if (isPm && user?.prjMgrId) loadProjects(user.prjMgrId);
  }, [isPm, user?.prjMgrId, loadProjects]);

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
      p.customerName.toLowerCase().includes(q)
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
      });
      setShowCreate(false);
      setCTitle(''); setCDesc(''); setCHeaderId('');
      setProjectSearch(''); setShowProjectDropdown(false);
      await load();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Failed to raise notice. Please try again.');
    } finally { setCreating(false); }
  };

  const canCreate = (isMd && selectedPmId) || isPm;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="tl-page">

      {/* Header */}
      <div className="tl-header">
        <div>
          <h1 className="tl-title">NICSI Work-Item Notices</h1>
          <p className="tl-subtitle">
            PO follow-ups, bill submissions, vendor reminders &amp; compliance actions across all projects
          </p>
        </div>
        {role !== 'OA' && (
          <button
            className="tl-create-btn"
            onClick={() => { setShowCreate(v => !v); setCreateError(''); }}
          >
            {showCreate ? '✕ Cancel' : '+ Raise Work-Item Notice'}
          </button>
        )}
      </div>

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
                setProjectList([]);
                setCHeaderId('');
                setProjectSearch('');
              }}
            >
              ✕ Clear
            </button>
          )}
          {pmListLoading && <span className="tl-pm-loading">Loading PMs…</span>}
        </div>
      )}

      {/* ── Create Form ── */}
      {showCreate && (
        <div className="tl-create-form">
          <div className="tl-create-header">
            <h4>Raise New Work-Item Notice</h4>
            {isMd && !selectedPmId && (
              <span className="tl-create-hint">
                ⚠ Select a PM above first to load their projects
              </span>
            )}
          </div>

          {/* Project Selector (MD after PM chosen, or PM login) */}
          {(canCreate) && (
            <div className="tl-field">
              <label className="tl-field-label">
                Select Project *
                {projectList.length > 0 && (
                  <span className="tl-field-count">{projectList.length} projects available</span>
                )}
              </label>

              <div className="tl-project-picker" style={{ position: 'relative' }}>
                <input
                  className="tl-input"
                  placeholder={
                    projectListLoading
                      ? 'Loading projects…'
                      : projectList.length === 0
                        ? isMd ? 'Select a PM above first' : 'Loading projects…'
                        : `Search ${projectList.length} projects (code, name, client)…`
                  }
                  value={projectSearch}
                  onChange={e => {
                    setProjectSearch(e.target.value);
                    setCHeaderId('');
                    setShowProjectDropdown(true);
                  }}
                  onFocus={() => setShowProjectDropdown(true)}
                  disabled={projectListLoading || projectList.length === 0}
                  autoComplete="off"
                />
                {projectListLoading && <div className="tl-spinner-inline" />}

                {showProjectDropdown && (filteredProjects.length > 0 || projectSearch) && (
                  <div className="tl-project-dropdown">
                    {filteredProjects.length === 0 ? (
                      <div className="tl-project-none">No match for "{projectSearch}"</div>
                    ) : (
                      filteredProjects.slice(0, 50).map(p => (
                        <div
                          key={p.headerId}
                          className={`tl-project-opt ${String(p.headerId) === cHeaderId ? 'tl-project-opt--sel' : ''}`}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setCHeaderId(String(p.headerId));
                            setProjectSearch('');
                            setShowProjectDropdown(false);
                          }}
                        >
                          <span className="tl-proj-code">{p.projectCode}</span>
                          <span className="tl-proj-name">{p.projectName}</span>
                          <span className="tl-proj-client">{p.customerName}</span>
                          <span className="tl-proj-id">#{p.headerId}</span>
                        </div>
                      ))
                    )}
                    {filteredProjects.length > 50 && (
                      <div className="tl-project-more">+{filteredProjects.length - 50} more — refine search above</div>
                    )}
                  </div>
                )}
              </div>

              {selectedProject && (
                <div className="tl-selected-proj">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <strong>{selectedProject.projectCode}</strong> · {selectedProject.projectName}
                  <span className="tl-selected-proj-client">({selectedProject.customerName})</span>
                  <span className="tl-selected-proj-id">ID: {selectedProject.headerId}</span>
                  <button
                    className="tl-clear-proj"
                    onClick={() => { setCHeaderId(''); setProjectSearch(''); }}
                  >✕</button>
                </div>
              )}
            </div>
          )}

          {/* Fallback: plain input for PMC / unknown roles */}
          {!canCreate && role !== 'OA' && (
            <div className="tl-create-row">
              <input
                className="tl-input"
                placeholder="Project ID (header_id) *"
                value={cHeaderId}
                onChange={e => setCHeaderId(e.target.value)}
                type="number"
              />
            </div>
          )}

          <div className="tl-field" style={{ marginTop: '0.75rem' }}>
            <label className="tl-field-label">
              Notice Category &amp; Priority *
              <span className="tl-sub-hint">Select the operational workflow type and urgency level</span>
            </label>
            <div className="tl-create-row">
              <select className="tl-select" value={cType} onChange={e => setCType(e.target.value)}>
                {Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select className="tl-select" value={cPri} onChange={e => setCPri(e.target.value)}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
                  <option key={p} value={p}>{p} Priority</option>
                ))}
              </select>
            </div>
          </div>

          <div className="tl-field" style={{ marginTop: '0.75rem' }}>
            <label className="tl-field-label">
              Notice Subject / Title *
              <span className="tl-sub-hint">Summary headline describing the action required for the Project Manager &amp; Operations Officer</span>
            </label>
            <input
              className="tl-input"
              placeholder="e.g. [PO-EXPIRY] Urgent Purchase Order extension required for Project"
              value={cTitle}
              onChange={e => setCTitle(e.target.value)}
            />

            {/* Smart Suggested Title Chips */}
            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#003366', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                💡 Click a template to auto-fill subject:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {[
                  ...(cType === 'PO_FOLLOWUP' ? [
                    '📄 [PO-EXPIRY] Urgent Purchase Order extension required before expiry',
                    '📄 [PO-ISSUE] Follow-up on pending client Purchase Order issuance',
                    '📄 [PO-AMENDMENT] Scope modification & PO budget amendment request',
                  ] : cType === 'BILL_SUBMISSION' ? [
                    '🧾 [BILL-SUBMIT] Vendor Invoice submission follow-up against PO',
                    '🧾 [BILL-VERIFY] Bill verification & GST invoice compliance check',
                  ] : cType === 'NICSI_HOLD_RELEASE' ? [
                    '💰 [HOLD-RELEASE] Payment milestone verification for NICSI cash hold release',
                    '💰 [FUNDS-RECV] Client fund realization & bank credit confirmation',
                  ] : cType === 'VENDOR_PAYMENT' ? [
                    '💳 [VENDOR-PAY] Vendor payment disbursement approval request',
                    '💳 [PENALTY-CHECK] Penalty deduction verification prior to payment release',
                  ] : [
                    '📢 [ACTION-REQ] Operational follow-up and compliance action required',
                    '⏰ [MILESTONE] Milestone review & status verification notice',
                  ])
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      background: cTitle === sug ? '#e0f2fe' : '#f8fafc',
                      color: cTitle === sug ? '#0369a1' : '#475569',
                      border: cTitle === sug ? '1px solid #bae6fd' : '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.25rem 0.55rem',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => setCTitle(sug)}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tl-field" style={{ marginTop: '0.75rem' }}>
            <label className="tl-field-label">
              Detailed Instructions &amp; Notes
              <span className="tl-sub-hint">Specify exact PO reference number, bill dates, invoice values, or compliance instructions</span>
            </label>
            <textarea
              className="tl-textarea"
              rows={3}
              placeholder="Provide exact PO number, bill date, milestone details, or action instructions for the assignee…"
              value={cDesc}
              onChange={e => setCDesc(e.target.value)}
            />
          </div>


          {createError && <div className="tl-create-error">{createError}</div>}

          <div className="tl-create-actions">
            <button
              className="tl-btn tl-btn--primary"
              onClick={handleCreate}
              disabled={creating || !cTitle.trim() || !cHeaderId}
            >
              {creating ? 'Raising…' : 'Raise Notice'}
            </button>
            <button
              className="tl-btn tl-btn--secondary"
              onClick={() => { setShowCreate(false); setCreateError(''); }}
            >
              Cancel
            </button>
          </div>
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
        <select className="tl-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['OPEN', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RESOLVED', 'CLOSED', 'REOPENED'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="tl-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All Priorities</option>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
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

