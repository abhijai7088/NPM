import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ProjectLifecyclePanel } from '../../components/lifecycle/ProjectLifecyclePanel';
import { TicketDetailModal } from '../../components/tickets/TicketDetailModal';
import { listTickets, createTicket, PRIORITY_COLORS, STATUS_COLORS, TICKET_TYPE_LABELS, type ProjectTicket } from '../../api/tickets';
import { useAuthStore } from '../../store/authStore';
import './Project360Page.css';

const TABS = ['Overview', 'Lifecycle', 'Tickets', 'Audit'] as const;
type Tab = typeof TABS[number];

function fmt(n?: number): string {
  if (!n) return '₹0';
  return '₹' + (n / 1e7).toFixed(2) + ' Cr';
}

export const Project360Page: React.FC = () => {
  const { headerId } = useParams<{ headerId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const role = user?.role ?? 'PM';
  const isMdOrAdmin = role === 'MD' || role === 'SUPER_ADMIN';

  const hId = Number(headerId);
  const initialTab = (searchParams.get('tab') as Tab) ?? 'Overview';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Project data
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);

  // PM Reassignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [pmRoster, setPmRoster] = useState<any[]>([]);
  const [pmRosterLoading, setPmRosterLoading] = useState(false);
  const [selectedNewPmId, setSelectedNewPmId] = useState('');
  const [assignRemarks, setAssignRemarks] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Tickets
  const [tickets, setTickets]       = useState<ProjectTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  // Create ticket form
  const [showCreate, setShowCreate]   = useState(false);
  const [newTitle, setNewTitle]       = useState('');
  const [newType, setNewType]         = useState('GENERAL');
  const [newPriority, setNewPriority] = useState('MEDIUM');
  const [newDesc, setNewDesc]         = useState('');
  const [creating, setCreating]       = useState(false);

  const loadProjectData = () => {
    if (!hId) return;
    setLoading(true);
    axios.get(`/api/v1/projects/${hId}`, { withCredentials: true })
      .then(res => setProject(res.data?.data ?? res.data))
      .catch(() => setError('Failed to load project.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProjectData();
  }, [hId]);

  useEffect(() => {
    if (activeTab === 'Tickets' && hId) {
      listTickets({ headerId: hId }).then(r => setTickets(r.data)).catch(() => {});
    }
  }, [activeTab, hId]);

  // Load PM roster for reassignment
  const openAssignModal = () => {
    setShowAssignModal(true);
    setAssignMsg(null);
    setSelectedNewPmId(project?.prjMgrId ? String(project.prjMgrId) : '');
    setAssignRemarks('');
    if (pmRoster.length === 0) {
      setPmRosterLoading(true);
      axios.get('/api/v1/project-managers')
        .then(res => {
          if (res.data?.success) {
            setPmRoster(res.data.data ?? []);
          }
        })
        .catch(() => {})
        .finally(() => setPmRosterLoading(false));
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    setAssignMsg(null);
    try {
      const res = await axios.put(`/api/v1/projects/${hId}/assign`, {
        newPrjMgrId: selectedNewPmId || null,
        remarks: assignRemarks || 'Assigned via Project 360° Management View',
      }, { withCredentials: true });

      if (res.data?.success) {
        setAssignMsg({ text: res.data.message || 'Project successfully assigned!', type: 'success' });
        loadProjectData();
        setTimeout(() => {
          setShowAssignModal(false);
          setAssignMsg(null);
        }, 1200);
      } else {
        setAssignMsg({ text: res.data?.message || 'Assignment failed.', type: 'error' });
      }
    } catch (err: any) {
      setAssignMsg({ text: err?.response?.data?.message || 'Failed to reassign project.', type: 'error' });
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createTicket({ headerId: hId, title: newTitle, description: newDesc, ticketType: newType, priority: newPriority });
      setShowCreate(false); setNewTitle(''); setNewDesc('');
      listTickets({ headerId: hId }).then(r => setTickets(r.data));
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  if (loading) return (
    <div className="p360-loading"><div className="p360-spinner"/><span>Loading project…</span></div>
  );
  if (error || !project) return (
    <div className="p360-error">{error ?? 'Project not found.'}</div>
  );

  const p = project;
  const openTickets   = tickets.filter(t => !['RESOLVED','CLOSED'].includes(t.status));
  const overdueTickets= tickets.filter(t => t.isOverdue);

  return (
    <div className="p360-container">
      {/* Back nav */}
      <div className="p360-nav">
        <button className="p360-back" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="p360-breadcrumb">
          <span>Projects</span><span className="p360-sep">/</span>
          <span className="p360-current">{p.projectCode ?? p.project_cd ?? `#${hId}`}</span>
        </div>
      </div>

      {/* Project Header */}
      <div className="p360-hero">
        <div className="p360-hero__main">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="p360-project-code">{p.projectCode ?? p.project_cd}</div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: p.prjMgrId ? '#e0f2fe' : '#fef3c7', color: p.prjMgrId ? '#0369a1' : '#92400e' }}>
              {p.prjMgrId ? `Managed by PM #${p.prjMgrId}` : 'Corporate Unassigned Pool'}
            </span>
          </div>
          <h1 className="p360-project-name">{p.projectName ?? p.prj_nm}</h1>
          <div className="p360-project-client">{p.customerName ?? p.customer_name}</div>
        </div>
        <div className="p360-hero__stats">
          <div className="p360-stat">
            <label>Budget</label>
            <span className="p360-value">{fmt(p.prjBudgetNo ?? p.prj_budget_no)}</span>
          </div>
          <div className="p360-stat">
            <label>Received</label>
            <span className="p360-value">{fmt(p.amountReceived ?? p.amount_received)}</span>
          </div>
          <div className="p360-stat">
            <label>PO Amount</label>
            <span className="p360-value">{fmt(p.poAmount ?? p.po_amount)}</span>
          </div>
          <div className="p360-stat">
            <label>Open Tickets</label>
            <span className={`p360-value ${overdueTickets.length > 0 ? 'warn' : ''}`}>{openTickets.length}</span>
          </div>
          {isMdOrAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '0.5rem' }}>
              <button
                type="button"
                className="p360-btn"
                style={{
                  background: 'linear-gradient(135deg, #003366, #0284c7)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 0.85rem',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(0,51,102,0.2)'
                }}
                onClick={openAssignModal}
              >
                🔄 Assign PM
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="p360-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`p360-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === 'Tickets' && openTickets.length > 0 && (
              <span className={`p360-tab-badge ${overdueTickets.length > 0 ? 'warn' : ''}`}>
                {openTickets.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p360-tab-content">
        {/* ── Overview ── */}
        {activeTab === 'Overview' && (
          <div className="p360-overview">
            <div className="p360-info-grid">
              <div className="p360-info-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0 }}>Project Governance</h3>
                  {isMdOrAdmin && (
                    <button
                      type="button"
                      onClick={openAssignModal}
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        border: '1px solid #bae6fd',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Change PM Assignment
                    </button>
                  )}
                </div>
                <div className="p360-field">
                  <label>Assigned PM</label>
                  <span style={{ fontWeight: 700, color: '#003366' }}>
                    {p.prjMgrName || (p.prjMgrId ? `Project Manager #${p.prjMgrId}` : 'Unassigned (Central Corporate Pool)')}
                  </span>
                </div>
                <div className="p360-field"><label>Category</label><span>{p.projectCategory ?? p.project_category ?? '—'}</span></div>
                <div className="p360-field"><label>Type</label><span>{p.prjType ?? p.prj_type ?? '—'}</span></div>
                <div className="p360-field"><label>State Code</label><span>{p.stateCode ?? p.state_code ?? '—'}</span></div>
                <div className="p360-field"><label>Ministry</label><span>{p.ministry ?? '—'}</span></div>
                <div className="p360-field"><label>Department</label><span>{p.department ?? '—'}</span></div>
              </div>
              <div className="p360-info-card">
                <h3>Financial Summary</h3>
                <div className="p360-field"><label>Total Invoiced</label><span>{fmt(p.totalInvoiceAmount ?? p.total_invoice_amount)}</span></div>
                <div className="p360-field"><label>Amount Paid</label><span>{fmt(p.totalAmountPaid ?? p.total_amount_paid)}</span></div>
                <div className="p360-field"><label>Tax Invoices</label><span>{fmt(p.totalTaxInvoiceAmount ?? p.total_tax_invocie_amount)}</span></div>
                <div className="p360-field"><label>NICSI Commission</label><span>{fmt(p.nicsiCommission ?? p.nicsi_commission)}</span></div>
                <div className="p360-field"><label>Penalty</label><span>{fmt(p.totalPenaltyAmt ?? p.total_penalty_amt)}</span></div>
              </div>
              <div className="p360-info-card">
                <h3>Contact Information</h3>
                <div className="p360-field"><label>User Email</label><span>{p.userEmail ?? p.user_email ?? '—'}</span></div>
                <div className="p360-field"><label>HOD Email</label><span>{p.hodEmail ?? p.hod_email ?? '—'}</span></div>
                <div className="p360-field"><label>NIC Coordinator</label><span>{p.nicCoordEmail ?? p.nic_cord_emailid ?? '—'}</span></div>
                <div className="p360-field"><label>PM Staff Email</label><span>{p.staffEmailId ?? p.staff_email_id ?? '—'}</span></div>
                <div className="p360-field"><label>Mobile</label><span>{p.mobileNumber ?? p.mobile_number ?? '—'}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ── Lifecycle ── */}
        {activeTab === 'Lifecycle' && (
          <div className="p360-lifecycle-wrap">
            <ProjectLifecyclePanel
              headerId={hId}
              readonly={role === 'OA'}
            />
          </div>
        )}

        {/* ── Tickets ── */}
        {activeTab === 'Tickets' && (
          <div className="p360-tickets">
            <div className="p360-tickets-header">
              <h3>Tickets ({tickets.length})</h3>
              {(role === 'MD' || role === 'PM' || role === 'PMC' || role === 'SUPER_ADMIN') && (
                <button className="p360-create-btn" onClick={() => setShowCreate(true)}>
                  + Create Ticket
                </button>
              )}
            </div>

            {showCreate && (
              <div className="p360-create-form">
                <h4>New Ticket</h4>
                <input className="p360-input" placeholder="Title *" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <div className="p360-create-row">
                  <select className="p360-select" value={newType} onChange={e => setNewType(e.target.value)}>
                    {Object.entries(TICKET_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="p360-select" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                    {['LOW','MEDIUM','HIGH','CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <textarea className="p360-textarea" rows={3} placeholder="Description…" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                <div className="p360-create-actions">
                  <button className="p360-btn p360-btn--primary" onClick={handleCreateTicket} disabled={creating || !newTitle.trim()}>
                    {creating ? 'Creating…' : 'Create Ticket'}
                  </button>
                  <button className="p360-btn p360-btn--secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </div>
            )}

            {tickets.length === 0 ? (
              <div className="p360-empty">No tickets for this project yet.</div>
            ) : (
              <div className="p360-ticket-list">
                {tickets.map(t => (
                  <div
                    key={t.id}
                    className="p360-ticket-card"
                    onClick={() => setSelectedTicketId(t.id)}
                  >
                    <div className="p360-ticket-card__left">
                      <span className="p360-ticket-code">{t.ticketCode}</span>
                      <span className="p360-ticket-title">{t.title}</span>
                      {t.stageRef && <span className="p360-ticket-stage">{t.stageRef}</span>}
                    </div>
                    <div className="p360-ticket-card__right">
                      <span className="p360-chip" style={{ color: PRIORITY_COLORS[t.priority], background: PRIORITY_COLORS[t.priority] + '18' }}>
                        {t.priority}
                      </span>
                      <span className="p360-chip" style={{ color: STATUS_COLORS[t.status], background: STATUS_COLORS[t.status] + '18' }}>
                        {t.status.replace('_',' ')}
                      </span>
                      {t.isOverdue && <span className="p360-chip p360-chip--warn">OVERDUE</span>}
                      {t.assignedTo && <span className="p360-assignee">@{t.assignedTo}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Audit ── */}
        {activeTab === 'Audit' && (
          <div className="p360-audit">
            <p className="p360-audit-note">
              The lifecycle audit trail is embedded in the <strong>Lifecycle</strong> tab below each stage transition.
              All entries are immutable and cannot be modified or deleted.
            </p>
            <button className="p360-btn p360-btn--secondary" onClick={() => setActiveTab('Lifecycle')}>
              View Lifecycle Audit Trail →
            </button>
          </div>
        )}
      </div>

      {/* Ticket detail modal */}
      {selectedTicketId && (
        <TicketDetailModal
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          onRefresh={() => listTickets({ headerId: hId }).then(r => setTickets(r.data))}
        />
      )}

      {/* Assign / Reassign PM Modal */}
      {showAssignModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #003366, #0284c7)', color: '#fff',
              padding: '1.2rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Assign / Reassign Project</h3>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                  Project: <strong>{p.projectCode}</strong> (#{p.headerId})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
              >✕</button>
            </div>

            <form onSubmit={handleAssignSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {assignMsg && (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                  background: assignMsg.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  color: assignMsg.type === 'success' ? '#065f46' : '#991b1b',
                  border: `1px solid ${assignMsg.type === 'success' ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {assignMsg.text}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Current Management Scope
                </label>
                <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.85rem' }}>
                  {p.prjMgrId ? `Assigned to PM ID #${p.prjMgrId}` : 'Unassigned · Central Corporate Pool'}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Select New Project Manager *
                </label>
                <select
                  value={selectedNewPmId}
                  onChange={e => setSelectedNewPmId(e.target.value)}
                  disabled={pmRosterLoading || assigning}
                  style={{
                    width: '100%', padding: '0.65rem 0.75rem', borderRadius: 6,
                    border: '1px solid #cbd5e1', fontSize: '0.875rem', background: '#fff'
                  }}
                >
                  <option value="">— Unassign (Return to Central Corporate Pool) —</option>
                  {pmRoster.map((pm: any) => (
                    <option key={pm.prjMgrId} value={String(pm.prjMgrId)}>
                      {pm.fullName} ({pm.zone || 'Zone'}) — PRJ_MGR_ID: {pm.prjMgrId} ({pm.projectCount || 0} active projects)
                    </option>
                  ))}
                </select>
                {pmRosterLoading && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>Loading PM list…</div>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Reason / Governance Remarks
                </label>
                <textarea
                  rows={3}
                  value={assignRemarks}
                  onChange={e => setAssignRemarks(e.target.value)}
                  placeholder="e.g. Zonal workload rebalancing, specialized technical domain handover, regional realignment..."
                  style={{
                    width: '100%', padding: '0.65rem 0.75rem', borderRadius: 6,
                    border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  disabled={assigning}
                  style={{
                    padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #cbd5e1',
                    background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || pmRosterLoading}
                  style={{
                    padding: '0.5rem 1.25rem', borderRadius: 6, border: 'none',
                    background: 'linear-gradient(135deg, #003366, #0284c7)', color: '#fff',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  {assigning ? 'Assigning…' : 'Confirm Assignment 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
