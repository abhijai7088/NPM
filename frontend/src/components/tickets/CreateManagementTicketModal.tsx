import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  X, CheckCircle, AlertCircle, ShieldAlert, Clock, UserCheck, FileText,
  Building2, DollarSign, Calendar, Layers, Link as LinkIcon, AlertTriangle, ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface Project {
  headerId: number;
  projectCode: string;
  projectName: string;
  customerName?: string;
  prjMgrId?: number;
  prjMgrName?: string;
  poAmount?: number;
  amountReceived?: number;
  projectCategory?: string;
  expiryStatus?: string;
}

interface ProjectManager {
  prjMgrId: number;
  fullName: string;
  zone?: string;
  username?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultHeaderId?: number | null;
  userRole?: string;
}

export const CreateManagementTicketModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultHeaderId,
  userRole = 'MD'
}) => {
  if (!isOpen) return null;

  // ── Form State ──
  const [scope, setScope] = useState<'PROJECT' | 'PM_PORTFOLIO' | 'ORGANISATION'>('PROJECT');
  
  // Section A: Project & Context
  const [projectSearch, setProjectSearch] = useState('');
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [relatedRecordType, setRelatedRecordType] = useState<string>('PROJECT');
  const [relatedRecordRef, setRelatedRecordRef] = useState<string>('');

  // Section B: Action Details
  const [ticketCategory, setTicketCategory] = useState<string>('PO_EXPIRY');
  const [actionType, setActionType] = useState<string>('Follow-Up');
  const [priority, setPriority] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [title, setTitle] = useState('');
  
  // Structured Details
  const [reasonIssue, setReasonIssue] = useState('');
  const [requiredAction, setRequiredAction] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');

  // Section C: Ownership & SLA
  const [responsibleRole, setResponsibleRole] = useState<'PM' | 'PMC' | 'OA'>('PM');
  const [pmList, setPmList] = useState<ProjectManager[]>([]);
  const [assignedToPmId, setAssignedToPmId] = useState<number | ''>('');
  const [reviewer, setReviewer] = useState<string>('PMC Control Tower');
  
  const [dueDate, setDueDate] = useState<string>('');

  // Section D: Governance & Impact
  const [trigger, setTrigger] = useState<string>('Management Review Meeting');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [impacts, setImpacts] = useState<string[]>(['Financial', 'Schedule']);
  const [amountAtRisk, setAmountAtRisk] = useState<string>('');
  const [blockerDependency, setBlockerDependency] = useState<string>('');

  // Section E: Documents & Notes
  const [evidenceNote, setEvidenceNote] = useState<string>('');

  // UI / Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  // Initial Data Fetching
  useEffect(() => {
    // Fetch PM roster for controlled assignment
    axios.get('/api/v1/pms')
      .then(res => {
        if (res.data?.success) {
          const list = (res.data.data || []).map((pm: any) => ({
            prjMgrId: pm.prjMgrId,
            fullName: pm.fullName || pm.username,
            zone: pm.zone,
            username: pm.username
          }));
          setPmList(list);
        }
      })
      .catch(() => {});

    // Pre-fetch initial project list
    setLoadingProjects(true);
    axios.get('/api/v1/projects/advanced-search?size=50')
      .then(res => {
        if (res.data?.success) {
          setProjectList(res.data.data || []);
          if (defaultHeaderId) {
            const found = (res.data.data || []).find((p: Project) => p.headerId === defaultHeaderId);
            if (found) setSelectedProject(found);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [defaultHeaderId]);

  // SLA Calculation based on Priority
  useEffect(() => {
    const now = new Date();
    let hoursToAdd = 24;
    if (priority === 'CRITICAL') hoursToAdd = 8;
    else if (priority === 'HIGH') hoursToAdd = 24;
    else if (priority === 'MEDIUM') hoursToAdd = 72; // 3 days
    else if (priority === 'LOW') hoursToAdd = 168; // 7 days

    const targetDate = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
    setDueDate(targetDate.toISOString().slice(0, 16));
  }, [priority]);

  // Project Search Filter
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projectList;
    const q = projectSearch.toLowerCase();
    return projectList.filter(p =>
      p.projectCode?.toLowerCase().includes(q) ||
      p.projectName?.toLowerCase().includes(q) ||
      p.customerName?.toLowerCase().includes(q) ||
      String(p.headerId).includes(q)
    );
  }, [projectList, projectSearch]);

  // Auto-fill templates when clicking suggestion chips
  const applyTitleTemplate = (tmpl: string) => {
    setTitle(tmpl);
  };

  // Toggle Impact check tag
  const toggleImpact = (tag: string) => {
    setImpacts(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (scope === 'PROJECT' && !selectedProject) {
      setErrorMsg('Please select a target Project for this Management Ticket.');
      return;
    }

    if (!title.trim()) {
      setErrorMsg('Please provide a Ticket Title / Subject.');
      return;
    }

    if (!reasonIssue.trim()) {
      setErrorMsg('Please specify the Reason / Issue for raising this ticket.');
      return;
    }

    if (!requiredAction.trim()) {
      setErrorMsg('Please specify the Required Action / Instructions.');
      return;
    }

    setSubmitting(true);

    try {
      // Build structured description combining governance sections
      const fullDescription = `
### REASON / ISSUE
${reasonIssue}

### REQUIRED ACTION & INSTRUCTIONS
${requiredAction}

### EXPECTED OUTCOME
${expectedOutcome || 'Resolution & project continuity confirmation'}

### GOVERNANCE & IMPACT
- Trigger: ${trigger}
- Action Type: ${actionType}
- Reviewer: ${reviewer}
- Business Impacts: ${impacts.join(', ') || 'General'}
${amountAtRisk ? `- Amount at Risk: ₹${amountAtRisk} Cr` : ''}
${blockerDependency ? `- Blocker / Dependency: ${blockerDependency}` : ''}
${referenceNo ? `- Reference MOM / Document: ${referenceNo}` : ''}
${evidenceNote ? `- Supporting Note: ${evidenceNote}` : ''}
      `.trim();

      // Find assigned PM username if assignedToPmId selected
      let targetAssignee = '';
      if (assignedToPmId) {
        const foundPm = pmList.find(p => p.prjMgrId === Number(assignedToPmId));
        if (foundPm) targetAssignee = foundPm.username || `pm_${foundPm.prjMgrId}`;
      } else if (selectedProject?.prjMgrId) {
        const foundPm = pmList.find(p => p.prjMgrId === selectedProject.prjMgrId);
        if (foundPm) targetAssignee = foundPm.username || `pm_${foundPm.prjMgrId}`;
      }

      const payload: any = {
        headerId: selectedProject?.headerId || 101, // fallback to portfolio
        title: title.trim(),
        description: fullDescription,
        ticketType: ticketCategory,
        priority: priority,
        assignedTo: targetAssignee,
        stageRef: selectedProject?.projectCategory || 'PO Generation'
      };

      const res = await axios.post('/api/v1/tickets', payload);

      if (res.data?.success) {
        setCreatedResult({
          ticket: res.data.data,
          ticketCode: res.data.data?.ticketCode || `TKT-${Date.now().toString().slice(-6)}`,
          projectCode: selectedProject?.projectCode || 'ORGANISATION',
          pmName: selectedProject?.prjMgrName || 'Assigned PM',
          slaDeadline: dueDate
        });
        onSuccess();
      } else {
        setErrorMsg(res.data?.message || 'Failed to raise ticket.');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error communicating with ticket server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', overflowY: 'auto'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '860px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0, 51, 102, 0.25)', border: '1px solid #cbd5e1',
        overflow: 'hidden'
      }}>

        {/* ── Modal Top Header Bar ── */}
        <div style={{
          background: 'linear-gradient(135deg, #003366, #00509d)',
          color: '#ffffff', padding: '1.25rem 1.75rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ShieldAlert size={22} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em', color: '#ffffff' }}>
                Create Management Ticket
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#cbd5e1' }}>
                Create a tracked action for a project, including the responsible person, deadline, and required outcome.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', opacity: 0.8, cursor: 'pointer', padding: 4 }}
          >
            <X size={22} />
          </button>
        </div>

        {/* ── Modal Content Body (Scrollable 6 Sections) ── */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
          
          {/* Post-Creation Success Screen */}
          {createdResult ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', margin: '0 auto 1rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={36} />
              </div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#003366', margin: 0 }}>
                Management Ticket Created Successfully!
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                Governed work item has been dispatched and logged in the NPMS audit stream.
              </p>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.25rem', margin: '1.5rem auto', maxWidth: '520px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Ticket ID Reference:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#00509d', fontSize: '0.95rem' }}>
                    {createdResult.ticketCode}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8rem' }}>
                  <div><strong>Target Project:</strong> {createdResult.projectCode}</div>
                  <div><strong>Assigned PM:</strong> {createdResult.pmName}</div>
                  <div><strong>Target SLA:</strong> {new Date(createdResult.slaDeadline).toLocaleString('en-IN')}</div>
                  <div><strong>Status:</strong> <span style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>OPEN / ASSIGNED</span></div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <button
                  onClick={onClose}
                  style={{ background: '#003366', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Close & Return to List
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* ── Section 1: Project & Context ── */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#003366', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={16} style={{ color: '#00509d' }} />
                  1. Ticket Scope & Project
                </div>

                {/* Scope Selector */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Scope *
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['PROJECT', 'PM_PORTFOLIO', 'ORGANISATION'] as const).map(sc => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => setScope(sc)}
                        style={{
                          flex: 1, padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700,
                          borderRadius: '8px', border: scope === sc ? '2px solid #003366' : '1px solid #cbd5e1',
                          background: scope === sc ? '#eff6ff' : '#ffffff',
                          color: scope === sc ? '#003366' : '#64748b',
                          cursor: 'pointer'
                        }}
                      >
                        {sc === 'PROJECT' ? '🏢 Single Project' : sc === 'PM_PORTFOLIO' ? "👤 Project Manager's Projects" : '🌐 All Projects'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Project Search Autocomplete */}
                {scope === 'PROJECT' && (
                  <div style={{ marginBottom: '1rem', position: 'relative' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                      Select Project *
                    </label>
                    <input
                      type="text"
                      placeholder="Search by project code, customer, department name or ID..."
                      value={projectSearch}
                      onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                      onFocus={() => setShowProjectDropdown(true)}
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                    />

                    {showProjectDropdown && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                        background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px',
                        maxHeight: '220px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', marginTop: 4
                      }}>
                        {filteredProjects.map(p => (
                          <div
                            key={p.headerId}
                            onClick={() => { setSelectedProject(p); setShowProjectDropdown(false); setProjectSearch(''); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem' }}
                            className="table-row-hover"
                          >
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#00509d', marginRight: 8 }}>
                              {p.projectCode}
                            </span>
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{p.customerName || p.projectName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-Populated Project Summary Info Box */}
                {selectedProject && (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#0369a1', fontSize: '0.9rem' }}>
                        {selectedProject.projectCode} — {selectedProject.projectName}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: 4 }}>
                        {selectedProject.projectCategory || 'GN'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.78rem', color: '#334155' }}>
                      <div><strong>Assigned PM:</strong> {selectedProject.prjMgrName || 'Atul Rastogi'}</div>
                      <div><strong>Current Stage:</strong> <span style={{ color: '#0284c7', fontWeight: 700 }}>PO Generation</span></div>
                      <div><strong>Customer:</strong> {selectedProject.customerName || 'N/A'}</div>
                      <div><strong>PO Value:</strong> {formatCurrency(selectedProject.poAmount || 0)}</div>
                    </div>
                  </div>
                )}

                {/* Related ERP Record Reference */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Related Record
                    </label>
                    <select
                      value={relatedRecordType}
                      onChange={e => setRelatedRecordType(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="PROJECT">Project Record</option>
                      <option value="PO">Purchase Order (PO)</option>
                      <option value="INVOICE">GST Tax Invoice</option>
                      <option value="BILL_DESK">Bill Desk Ledger</option>
                      <option value="TICKET">Related Management Ticket</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Related Document / Record Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PO #O250123 or Invoice #80554250064"
                      value={relatedRecordRef}
                      onChange={e => setRelatedRecordRef(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 2: Action & Details ── */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#003366', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={16} style={{ color: '#00509d' }} />
                  2. Issue & Required Action
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  {/* Category */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Issue Category *
                    </label>
                    <select
                      value={ticketCategory}
                      onChange={e => setTicketCategory(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <optgroup label="Financial & Commercial">
                        <option value="PO_EXPIRY">📅 PO Expiry / Renewal Action</option>
                        <option value="PO_FOLLOW_UP">📄 PO Follow-Up & Procurement</option>
                        <option value="BILL_SUBMISSION">🧾 Bill Submission & Verification</option>
                        <option value="GST_INVOICE">🏛️ GST Tax Invoice Compliance</option>
                        <option value="PENALTY_WAIVER">⚖️ Penalty / Waiver Request</option>
                        <option value="NICSI_HOLD_RELEASE">🔓 NICSI Cash Hold Release</option>
                      </optgroup>
                      <optgroup label="Operations & Field">
                        <option value="SITE_VISIT">🏗️ Site / Field Visit Action</option>
                        <option value="CLIENT_COORDINATION">🤝 Client Coordination</option>
                        <option value="VENDOR_REMINDER">🔔 Vendor Escalation</option>
                      </optgroup>
                      <optgroup label="Governance & Audit">
                        <option value="COMPLIANCE_AUDIT">✅ Compliance & Audit</option>
                        <option value="INTERNAL_APPROVAL">🔏 Internal NICSI Approval</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Action Type */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Required Action *
                    </label>
                    <select
                      value={actionType}
                      onChange={e => setActionType(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="Follow-Up">Follow-Up Action</option>
                      <option value="Review">Executive Review</option>
                      <option value="Approval">Formal Approval</option>
                      <option value="Correction">Data / Record Correction</option>
                      <option value="Escalation">Management Escalation</option>
                      <option value="Verification">Compliance Verification</option>
                      <option value="Decision Required">Decision Required</option>
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Priority & Response Time *
                    </label>
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value as any)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="CRITICAL">🔴 Critical — Response within 8 hours</option>
                      <option value="HIGH">🟠 High — Response within 24 hours</option>
                      <option value="MEDIUM">🟡 Medium — Response within 3 days</option>
                      <option value="LOW">🟢 Low — Response within 7 days</option>
                    </select>
                  </div>
                </div>

                {/* Title */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    Ticket Subject *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Urgent Purchase Order extension required before expiration date"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />

                  {/* Template Chips */}
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      '📄 Urgent Purchase Order renewal required before expiry',
                      '🧾 Vendor invoice submission follow-up against active PO',
                      '💰 Payment milestone verification for NICSI cash hold release',
                      '📢 Operational compliance action required per weekly review'
                    ].map((tmpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyTitleTemplate(tmpl)}
                        style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                      >
                        💡 {tmpl.slice(0, 45)}...
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason vs Required Action vs Expected Outcome */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', display: 'block', marginBottom: 4 }}>
                      Issue Details — Why is this ticket being created? *
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. PO validity expires on 31 Aug 2026 and renewal proposal has not yet been initiated."
                      value={reasonIssue}
                      onChange={e => setReasonIssue(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fff5f5' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 4 }}>
                      What Needs to Be Done? *
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Review PO status, coordinate with client procurement, and submit extension proposal."
                      value={requiredAction}
                      onChange={e => setRequiredAction(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #7dd3fc', background: '#f0f9ff' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', display: 'block', marginBottom: 4 }}>
                      Expected Outcome *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Renewed PO copy uploaded and confirmation of project continuity."
                      value={expectedOutcome}
                      onChange={e => setExpectedOutcome(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #86efac', background: '#f0fdf4' }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 3: Ownership & SLA ── */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#003366', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={16} style={{ color: '#00509d' }} />
                  3. Assignment & Review
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '0.75rem' }}>
                  {/* Role */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Responsible Person's Role *
                    </label>
                    <select
                      value={responsibleRole}
                      onChange={e => setResponsibleRole(e.target.value as any)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="PM">Project Manager (PM)</option>
                      <option value="PMC">PMC Control Tower</option>
                      <option value="OA">Operations Officer (OA)</option>
                    </select>
                  </div>

                  {/* Assignee Dropdown */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Assign To *
                    </label>
                    <select
                      value={assignedToPmId}
                      onChange={e => setAssignedToPmId(Number(e.target.value))}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="">
                        {selectedProject ? `Default: ${selectedProject.prjMgrName || 'Project PM'}` : 'Choose a person'}
                      </option>
                      {pmList.map(pm => (
                        <option key={pm.prjMgrId} value={pm.prjMgrId}>
                          {pm.fullName} ({pm.zone || 'NICSI'} - ID: {pm.prjMgrId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reviewer */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                      Reviewing Authority
                    </label>
                    <select
                      value={reviewer}
                      onChange={e => setReviewer(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="PMC Control Tower">PMC Control Tower</option>
                      <option value="MD Office">Managing Director Office</option>
                      <option value="Zone Head">Zone Head Executive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Removed: Section 4 Governance Trigger & Business Impact */}

              {/* Error Message display */}
              {errorMsg && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.82rem', fontWeight: 700 }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* ── Section 6: Actions & Submission ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '9px 20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: 'linear-gradient(135deg, #003366, #00509d)',
                    color: '#ffffff', border: 'none', borderRadius: '8px',
                    padding: '10px 28px', fontSize: '0.88rem', fontWeight: 800,
                    cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,51,102,0.25)',
                    display: 'inline-flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  {submitting ? 'Raising Ticket…' : 'Raise a ticket →'}
                </button>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
};
