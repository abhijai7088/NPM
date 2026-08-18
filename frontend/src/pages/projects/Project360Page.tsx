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

  const hId = Number(headerId);
  const initialTab = (searchParams.get('tab') as Tab) ?? 'Overview';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Project data
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);

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

  useEffect(() => {
    if (!hId) return;
    setLoading(true);
    axios.get(`/api/v1/projects/${hId}`, { withCredentials: true })
      .then(res => setProject(res.data?.data ?? res.data))
      .catch(() => setError('Failed to load project.'))
      .finally(() => setLoading(false));
  }, [hId]);

  useEffect(() => {
    if (activeTab === 'Tickets' && hId) {
      listTickets({ headerId: hId }).then(r => setTickets(r.data)).catch(() => {});
    }
  }, [activeTab, hId]);

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
          <div className="p360-project-code">{p.projectCode ?? p.project_cd}</div>
          <h1 className="p360-project-name">{p.projectName ?? p.prj_nm}</h1>
          <div className="p360-project-client">{p.customerName ?? p.customer_name}</div>
        </div>
        <div className="p360-hero__stats">
          <div className="p360-stat">
            <label>Budget</label>
            <value>{fmt(p.prjBudgetNo ?? p.prj_budget_no)}</value>
          </div>
          <div className="p360-stat">
            <label>Received</label>
            <value>{fmt(p.amountReceived ?? p.amount_received)}</value>
          </div>
          <div className="p360-stat">
            <label>PO Amount</label>
            <value>{fmt(p.poAmount ?? p.po_amount)}</value>
          </div>
          <div className="p360-stat">
            <label>Open Tickets</label>
            <value className={overdueTickets.length > 0 ? 'warn' : ''}>{openTickets.length}</value>
          </div>
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
                <h3>Project Details</h3>
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
    </div>
  );
};
