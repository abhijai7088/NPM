// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { formatCurrency, formatCurrencyFull, STATE_MAP, extractStateCode, getStateName } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import './ReportsPage.css';

const today = new Date();
const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

type ReportType = 'CONSOLIDATED' | 'PO_ALLOCATION' | 'VENDOR_PAYMENTS' | 'SERVICE_CHARGE' | 'TAX_INVOICES' | 'EXCEPTIONS';

export const ReportsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [poList, setPoList] = useState<any[]>([]);
  const [taxInvList, setTaxInvList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeInfo, setScopeInfo] = useState<any>(null);

  // ─── Active Report Type & Multi-Dimensional Filters ────────────────
  const [reportType, setReportType] = useState<ReportType>('CONSOLIDATED');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [expiryFilter, setExpiryFilter] = useState('ALL');
  const [rateFilter, setRateFilter] = useState('ALL');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // UC Modal state
  const [ucModalProject, setUcModalProject] = useState<any | null>(null);

  useEffect(() => {
    const pmId = user?.prjMgrId || (user?.role === 'PM' ? 1626 : null);
    const scopeParam = user?.role === 'PM' && pmId
      ? `&prjMgrId=${pmId}`
      : (user?.role === 'MD' ? `&managedBy=${encodeURIComponent(user?.username || '')}` : '');

    setLoading(true);

    Promise.allSettled([
      axios.get(`/api/v1/projects/advanced-search?page=0&size=3000${scopeParam}`),
      axios.get(`/api/v1/finance/purchase-orders?page=0&size=15000${scopeParam}`),
      axios.get(`/api/v1/finance/tax-invoices?page=0&size=45000${scopeParam}`)
    ])
      .then(([projRes, poRes, tiRes]) => {
        if (projRes.status === 'fulfilled' && projRes.value.data?.success) {
          const resData = projRes.value.data;
          const mapped = (resData.data || []).map((p: any) => {
            let status = 'pending';
            const penaltyFines = p.totalPenaltyAmt || 0;
            const effectivePoAmt = Math.max(0, (p.poAmount || 0) - penaltyFines);
            if (effectivePoAmt > 0 && (p.totalAmountPaid || 0) >= effectivePoAmt) status = 'cleared';
            else if ((p.totalAmountPaid || 0) > 0) status = 'partial';

            const sc = p.stateCode || extractStateCode(p.projectCode);
            const stateName = getStateName(p.projectCode || sc);

            const vendorPending = Math.max(0, effectivePoAmt - (p.totalAmountPaid || 0));
            const vendorUtilPct = effectivePoAmt > 0 ? Math.round(((p.totalAmountPaid || 0) / effectivePoAmt) * 100) : 0;

            return {
              ...p,
              noOfPO: p.noOfPo || 0,
              paymentStatus: status,
              stateCode: stateName,
              effectivePoAmount: effectivePoAmt,
              vendorPendingPayment: vendorPending,
              vendorUtilPct
            };
          });
          setProjects(mapped);
          if (resData.scope) setScopeInfo(resData.scope);
        }
        if (poRes.status === 'fulfilled' && poRes.value.data?.success) {
          setPoList(poRes.value.data.data || []);
        }
        if (tiRes.status === 'fulfilled' && tiRes.value.data?.success) {
          setTaxInvList(tiRes.value.data.data || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.role, user?.username, user?.prjMgrId]);

  const uniqueStates = useMemo(() => Array.from(new Set(projects.map(p => p.stateCode).filter(Boolean))).sort(), [projects]);

  // Filtered Projects
  const filteredProjects = useMemo(() => projects.filter(p => {
    if (statusFilter !== 'ALL' && p.paymentStatus !== statusFilter) return false;
    if (stateFilter !== 'ALL' && p.stateCode !== stateFilter) return false;
    if (expiryFilter !== 'ALL' && p.expiryStatus !== expiryFilter) return false;
    
    if (rateFilter !== 'ALL') {
      const pct = p.commissionPct || p.commissionPercentage || 0;
      if (rateFilter === '0' && pct !== 0) return false;
      if (rateFilter === '5' && (pct < 4 || pct > 6)) return false;
      if (rateFilter === '7' && (pct < 6 || pct > 8)) return false;
      if (rateFilter === '9' && (pct < 8 || pct > 10)) return false;
      if (rateFilter === '10+' && pct <= 10) return false;
    }

    if (minAmount && (p.amountReceived || 0) < Number(minAmount)) return false;
    if (maxAmount && (p.amountReceived || 0) > Number(maxAmount)) return false;

    if (dateFrom && p.createdOn && p.createdOn < dateFrom) return false;
    if (dateTo && p.createdOn && p.createdOn > dateTo) return false;

    if (search) {
      const q = search.toLowerCase();
      const matchCode = p.projectCode?.toLowerCase().includes(q);
      const matchCust = p.customerName?.toLowerCase().includes(q);
      if (!matchCode && !matchCust) return false;
    }

    if (reportType === 'EXCEPTIONS') {
      return (p.totalPenaltyAmt && p.totalPenaltyAmt > 0) || (p.vendorPendingPayment && p.vendorPendingPayment > 0);
    }

    return true;
  }), [projects, search, statusFilter, stateFilter, expiryFilter, rateFilter, minAmount, maxAmount, dateFrom, dateTo, reportType]);

  // Filtered PO Records
  const filteredPOs = useMemo(() => poList.filter(po => {
    if (search) {
      const q = search.toLowerCase();
      const matchPoNo = po.finalPoNo?.toLowerCase().includes(q);
      const matchPrjNo = po.projectNo?.toLowerCase().includes(q);
      const matchVendor = po.vendorName?.toLowerCase().includes(q);
      if (!matchPoNo && !matchPrjNo && !matchVendor) return false;
    }
    if (statusFilter !== 'ALL' && String(po.approvalStatus || 'DISPATCHED').toUpperCase() !== statusFilter.toUpperCase()) return false;
    return true;
  }), [poList, search, statusFilter]);

  // Filtered Tax Invoice Records
  const filteredTaxInvoices = useMemo(() => taxInvList.filter(ti => {
    if (search) {
      const q = search.toLowerCase();
      const matchBillNo = ti.userBillNo?.toLowerCase().includes(q);
      const matchPrjNo = ti.projectNo?.toLowerCase().includes(q);
      const matchIrn = ti.irnNo?.toLowerCase().includes(q);
      if (!matchBillNo && !matchPrjNo && !matchIrn) return false;
    }
    if (statusFilter !== 'ALL' && String(ti.billStatus || 'FINAL').toUpperCase() !== statusFilter.toUpperCase()) return false;
    return true;
  }), [taxInvList, search, statusFilter]);

  // Summary statistics for current filtered view
  const stats = useMemo(() => {
    let cleared = 0, partial = 0, pending = 0, amt = 0, po = 0, paid = 0, comm = 0, penalty = 0, dues = 0;
    filteredProjects.forEach(p => {
      amt += p.amountReceived || 0;
      po += p.poAmount || 0;
      paid += p.totalAmountPaid || 0;
      comm += p.nicsiCommission || 0;
      penalty += p.totalPenaltyAmt || 0;
      dues += p.vendorPendingPayment || 0;

      if (p.paymentStatus === 'cleared') cleared++;
      else if (p.paymentStatus === 'partial') partial++;
      else pending++;
    });
    return {
      total: filteredProjects.length,
      amountReceived: amt,
      poAmount: po,
      paid,
      comm,
      penalty,
      dues,
      cleared,
      partial,
      pending
    };
  }, [filteredProjects]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setStateFilter('ALL');
    setExpiryFilter('ALL');
    setRateFilter('ALL');
    setMinAmount('');
    setMaxAmount('');
    setDateFrom('');
    setDateTo('');
  };

  const activeFilterCount = [search, statusFilter !== 'ALL', stateFilter !== 'ALL', expiryFilter !== 'ALL', rateFilter !== 'ALL', minAmount, maxAmount, dateFrom, dateTo].filter(Boolean).length;

  // ─── Exports & Printing ────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  const exportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];

    if (reportType === 'PO_ALLOCATION') {
      headers = ['S.No.', 'Project Code', 'PO Number', 'PO Issue Date', 'PO Valid From', 'PO Valid Until', 'Vendor Name', 'PO Amount', 'Approval Status'];
      rows = filteredPOs.map((p, i) => [
        i + 1, p.projectNo, p.finalPoNo, p.poDate || '—', p.frdate || '—', p.todate || '—',
        `"${p.vendorName || ''}"`, p.total || 0, p.approvalStatus || 'DISPATCHED'
      ]);
    } else if (reportType === 'TAX_INVOICES') {
      headers = ['S.No.', 'Project Code', 'Tax Invoice No', 'Bill Date', 'Place of Supply / State', 'Billing Period', 'Invoice Value Submitted (INR)', 'Bill Status', 'IRN Status'];
      rows = filteredTaxInvoices.map((ti, i) => [
        i + 1, ti.projectNo, ti.userBillNo || '—', ti.billDate || '—', `"${ti.stateDescription || ''}"`,
        `"${ti.billingPeriodFrom || ''} - ${ti.billingPeriodTo || ''}"`, ti.totalAmount || 0, ti.billStatus || 'FINAL', ti.irnNo ? 'Generated' : 'Pending'
      ]);
    } else {
      headers = ['S.No.', 'Project Code', 'Department / Customer', 'State', 'Project Funds Received (INR)', 'Total PO Value (INR)', 'Effective PO (INR)', 'Amount Paid (INR)', 'Pending Dues (INR)', 'Penalty Deductions (INR)', 'NICSI Commission (INR)', 'Payment Status'];
      rows = filteredProjects.map((p, i) => [
        i + 1, p.projectCode, `"${p.customerName}"`, p.stateCode,
        p.amountReceived, p.poAmount, p.effectivePoAmount,
        p.totalAmountPaid, p.vendorPendingPayment, p.totalPenaltyAmt || 0,
        p.nicsiCommission || 0, p.paymentStatus
      ]);
    }

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NICSI_${reportType}_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportPaymentUtility = () => {
    const headers = ['Project Code', 'Department / Customer', 'Total PO Value', 'Effective PO Amt', 'Amount Paid', 'Pending Dues', 'Penalty Deductions'];
    const rows = filteredProjects.map(p => [
      p.projectCode, `"${p.customerName}"`, p.poAmount,
      p.effectivePoAmount, p.totalAmountPaid, p.vendorPendingPayment,
      p.totalPenaltyAmt || 0
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `NICSI_Payment_Utility_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const generateUC = (project: any) => {
    setUcModalProject(project);
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'PO_ALLOCATION': return 'PO & Work Order Allocation Register';
      case 'VENDOR_PAYMENTS': return 'Vendor Expenditure & Payment Dues Report';
      case 'SERVICE_CHARGE': return 'NICSI Service Charge & Gross Margin Report';
      case 'TAX_INVOICES': return 'GST Tax Invoice & e-Invoicing Compliance Report';
      case 'EXCEPTIONS': return 'Vendor Penalty & Compliance Hold Exception Report';
      default: return 'Consolidated Project Monitoring & Audit Report';
    }
  };

  return (
    <div className="reports-page page-container">
      {/* ── Screen Header & Actions (Hidden during PDF print) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }} className="animate-fade-in-up no-print">
        <div>
          <h2 style={{ color: 'var(--nicsi-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Reports & Executive Controls</h2>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            Official NICSI ERP project monitoring registers, auditing, & Form GFR 12-A compliance · {fmt(today)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ borderColor: '#17a2b8', color: '#17a2b8', fontSize: '0.85rem' }} onClick={exportPaymentUtility}>
            Payment Utility CSV
          </button>
          <button className="btn btn-outline" style={{ fontSize: '0.85rem' }} onClick={exportCSV}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Report CSV
          </button>
          <button className="btn btn-primary" style={{ fontSize: '0.85rem' }} onClick={handlePrint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print PDF Report
          </button>
        </div>
      </div>

      {/* ── Scope Banner ── */}
      {scopeInfo && !scopeInfo.unrestricted && (
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eef6ff', border: '1px solid #cfe3fb', borderRadius: 8, padding: '0.65rem 1rem', fontSize: '0.8125rem', color: '#0b4a8f' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            {scopeInfo.role === 'PM' 
              ? <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
              : <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}
          </svg>
          {scopeInfo.role === 'PM'
            ? <><strong>Portfolio Scope:</strong>&nbsp;Displaying data for your assigned projects only &mdash; {user?.fullName} &middot; {user?.zone || 'All Zones'} &middot; PRJ_MGR_ID: {user?.prjMgrId || 'N/A'}</>
            : <><strong>Organisational Scope:</strong>&nbsp;Showing all report records under PMs provisioned for {user?.fullName}</>}
        </div>
      )}

      {/* ── Report Type Selection Cards (Screen Only) ── */}
      <div className="card no-print animate-fade-in-up" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '0.75rem' }}>
          Select Report Register Category
        </div>
        <div className="report-type-grid">
          {[
            { type: 'CONSOLIDATED', icon: '📊', title: 'Consolidated Report', sub: 'Full executive audit overview' },
            { type: 'PO_ALLOCATION', icon: '📦', title: 'PO & Work Orders', sub: 'Oracle ERP PO register & validity' },
            { type: 'VENDOR_PAYMENTS', icon: '💳', title: 'Vendor Payments', sub: 'Expenditure & pending dues' },
            { type: 'SERVICE_CHARGE', icon: '💰', title: 'NICSI Service Charge', sub: 'Margin breakdown & rates' },
            { type: 'TAX_INVOICES', icon: '🏛️', title: 'GST Tax Invoices', sub: 'User Dept billing & IRN' },
            { type: 'EXCEPTIONS', icon: '⚠️', title: 'Penalty & Exceptions', sub: 'Deductions & hold alerts' },
          ].map(r => (
            <button
              key={r.type}
              className={`report-type-btn ${reportType === r.type ? 'report-type-btn--active' : ''}`}
              onClick={() => setReportType(r.type as ReportType)}
            >
              <span className="report-type-btn__icon">{r.icon}</span>
              <span className="report-type-btn__text">
                <span className="report-type-btn__title">{r.title}</span>
                <span className="report-type-btn__sub">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter Controls Panel (Screen Only) ── */}
      <div className="card no-print animate-fade-in-up" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Search project code, department / customer, PO, vendor..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={{ width: '100%', paddingLeft: '2.25rem', boxSizing: 'border-box' }} 
            />
            <svg style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#adb5bd' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <select className="input-field" style={{ flex: '0 1 160px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            <option value="cleared">Cleared / Approved</option>
            <option value="partial">Partial Payment</option>
            <option value="pending">Pending Dues</option>
          </select>
          <select className="input-field" style={{ flex: '0 1 160px' }} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="ALL">All States</option>
            {uniqueStates.map(st => <option key={st as string} value={st as string}>{st as string}</option>)}
          </select>
          <button
            className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            onClick={() => setShowFilters(v => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            More Filters {activeFilterCount > 0 && <span style={{ marginLeft: 4, background: '#DC3545', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: '0.65rem' }}>{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: '#dc3545', flex: '0 0 auto', fontWeight: 600 }}>Clear</button>
          )}
        </div>

        {showFilters && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e8edf3', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>PO Expiry Status</label>
              <select className="input-field" style={{ width: '100%' }} value={expiryFilter} onChange={e => setExpiryFilter(e.target.value)}>
                <option value="ALL">All Expiry States</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="EXPIRING_SOON">EXPIRING SOON (&lt;30 Days)</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="NO_PO">NO PO</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Service Charge Rate</label>
              <select className="input-field" style={{ width: '100%' }} value={rateFilter} onChange={e => setRateFilter(e.target.value)}>
                <option value="ALL">All Rates</option>
                <option value="0">0% Tier</option>
                <option value="5">5% Tier (4-6%)</option>
                <option value="7">7% Tier (6-8%)</option>
                <option value="9">9% Tier (8-10%)</option>
                <option value="10+">&gt;10% Tier</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Sanction Date From</label>
              <input type="date" className="input-field" style={{ width: '100%' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Sanction Date To</label>
              <input type="date" className="input-field" style={{ width: '100%' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Min Amount (₹)</label>
              <input type="number" className="input-field" placeholder="Min ₹" value={minAmount} onChange={e => setMinAmount(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Max Amount (₹)</label>
              <input type="number" className="input-field" placeholder="Max ₹" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN PRINTABLE REPORT CONTAINER ── */}
      <div id="printable-report-area">

        {/* Official Printable Government Header (Visible in Print / PDF Export) */}
        <div className="print-official-header">
          <div className="print-official-header-left">
            <img src="/nicsi-logo.png" alt="NICSI Logo" onError={(e: any) => { e.target.style.display = 'none'; }} />
            <div>
              <div className="print-official-title">NATIONAL INFORMATICS CENTRE SERVICES INC. (NICSI)</div>
              <div className="print-official-sub">Ministry of Electronics & Information Technology, Government of India</div>
              <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2px' }}>A Government of India Enterprise under NIC, MeitY</div>
            </div>
          </div>
          <div className="print-official-meta">
            <div><strong>Report:</strong> {getReportTitle()}</div>
            <div><strong>Generated:</strong> {fmt(today)} at {fmtTime(today)}</div>
            <div><strong>Generated By:</strong> {user?.fullName || 'Atul Rastogi'} ({user?.role || 'PM'})</div>
            <div><strong>Official Ref:</strong> NICSI/PMD/2026/AUDIT</div>
          </div>
        </div>

        {/* ── Report Summary Banner Card ── */}
        <div className="card animate-fade-in-up delay-100" style={{ marginBottom: '1.25rem' }}>
          <div style={{ background: 'var(--gradient-primary)', padding: '1.25rem 1.5rem', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ color: 'white', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', marginBottom: '0.2rem' }}>
                NICSI — {getReportTitle()}
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>
                {user?.role === 'PM' && user?.prjMgrId ? `Zonal Office · Assigned Projects · PRJ_MGR_ID: ${user.prjMgrId}` : user?.role === 'MD' ? 'Managing Director View' : 'Organisation-wide · All Zones'}
                {' · Generated: '}{fmt(today)}
              </p>
            </div>
            <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.9)', fontSize: '0.8rem' }}>
              <div>National Informatics Centre Services Inc.®</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Ministry of Electronics & IT, GoI</div>
            </div>
          </div>

          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: '#f8fbff', border: '1px solid #d0e2f5', borderRadius: 8 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--nicsi-navy)', fontFamily: 'var(--font-heading)' }}>
                  {reportType === 'PO_ALLOCATION' ? filteredPOs.length : reportType === 'TAX_INVOICES' ? filteredTaxInvoices.length : stats.total}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {reportType === 'PO_ALLOCATION' ? 'Total POs' : reportType === 'TAX_INVOICES' ? 'Tax Invoices Raised' : 'Total Projects'}
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '0.75rem', background: '#f8fbff', border: '1px solid #d0e2f5', borderRadius: 8 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#006699', fontFamily: 'var(--font-heading)' }}>
                  {formatCurrencyFull(stats.amountReceived)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Project Funds Received
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fffcf5', border: '1px solid #f6ecc6', borderRadius: 8 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#FF6600', fontFamily: 'var(--font-heading)' }}>
                  {formatCurrencyFull(stats.poAmount)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Total PO Value
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '0.75rem', background: '#f2fcf5', border: '1px solid #cbf6d8', borderRadius: 8 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#28A745', fontFamily: 'var(--font-heading)' }}>
                  {formatCurrencyFull(stats.paid)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Amount Paid
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fdf2f2', border: '1px solid #f9d3d3', borderRadius: 8 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#DC3545', fontFamily: 'var(--font-heading)' }}>
                  {formatCurrencyFull(stats.dues)}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Pending Dues
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Cleared / Fully Paid', count: stats.cleared, color: '#28A745' },
                { label: 'Partial Payment', count: stats.partial, color: '#FFC107' },
                { label: 'Pending Dues', count: stats.pending, color: '#DC3545' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, minWidth: 140, padding: '0.65rem 0.85rem', border: `1px solid ${s.color}44`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${s.color}18`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, flexShrink: 0 }}>{s.count}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: s.color, fontSize: '0.8rem' }}>{s.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{stats.total > 0 ? Math.round(s.count / stats.total * 100) : 0}% of total</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Detailed Data Table Section ───────────────────────────── */}
        <div className="card animate-fade-in-up delay-200" style={{ overflow: 'hidden' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--nicsi-navy)' }}>
              {getReportTitle()} — Detailed Audit Records
            </h3>
            <span className="badge badge-primary">
              {reportType === 'PO_ALLOCATION' ? filteredPOs.length : reportType === 'TAX_INVOICES' ? filteredTaxInvoices.length : filteredProjects.length} Records
            </span>
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {/* 1. PO Allocation Register View */}
            {reportType === 'PO_ALLOCATION' && (
              <table className="data-table" style={{ fontSize: '0.78rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Project Code</th>
                    <th>PO Number</th>
                    <th>PO Issue Date</th>
                    <th>PO Valid From</th>
                    <th>PO Valid Until</th>
                    <th>Vendor Name</th>
                    <th>PO Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPOs.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No Purchase Orders found.</td></tr>
                  ) : filteredPOs.map((po: any, i: number) => {
                    const isExpired = po.todate && new Date(po.todate) < new Date();
                    return (
                      <tr key={po.headerId || i}>
                        <td style={{ color: '#6c757d', fontWeight: 600 }}>{i + 1}</td>
                        <td><code style={{ fontSize: '0.7rem', background: '#e8f4fd', color: '#003366', padding: '1px 5px', borderRadius: 3 }}>{po.projectNo}</code></td>
                        <td style={{ fontWeight: 700, color: '#003366' }}>{po.finalPoNo}</td>
                        <td>{po.poDate || '—'}</td>
                        <td>{po.frdate || '—'}</td>
                        <td style={{ fontWeight: 600, color: isExpired ? '#DC3545' : '#155724' }}>{po.todate || '—'}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendorName}</td>
                        <td className="amt-primary" style={{ fontWeight: 700 }}>{formatCurrency(po.total || 0)}</td>
                        <td><span className="badge badge-success">{po.approvalStatus || 'DISPATCHED'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* 2. Tax Invoices Register View */}
            {reportType === 'TAX_INVOICES' && (
              <table className="data-table" style={{ fontSize: '0.78rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Project Code</th>
                    <th>Tax Invoice No</th>
                    <th>Bill Date</th>
                    <th>Place of Supply / State</th>
                    <th>Billing Period</th>
                    <th style={{ textAlign: 'right' }}>Invoice Value Submitted</th>
                    <th>Bill Status</th>
                    <th>IRN Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTaxInvoices.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No Tax Invoices found.</td></tr>
                  ) : filteredTaxInvoices.map((ti: any, i: number) => (
                    <tr key={ti.headerId || i}>
                      <td style={{ color: '#6c757d', fontWeight: 600 }}>{i + 1}</td>
                      <td><code style={{ fontSize: '0.7rem', background: '#e8f4fd', color: '#003366', padding: '1px 5px', borderRadius: 3 }}>{ti.projectNo}</code></td>
                      <td style={{ fontWeight: 700, color: '#003366' }}>{ti.userBillNo || '—'}</td>
                      <td>{ti.billDate || '—'}</td>
                      <td>{ti.stateDescription || '—'}</td>
                      <td>{ti.billingPeriodFrom && ti.billingPeriodTo ? `${ti.billingPeriodFrom} → ${ti.billingPeriodTo}` : '—'}</td>
                      <td className="amt-primary" style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(ti.totalAmount || 0)}</td>
                      <td><span className="badge badge-success">{ti.billStatus || 'FINAL'}</span></td>
                      <td>
                        {ti.irnNo ? <span style={{ color: '#28A745', fontWeight: 700 }}>✓ Generated</span> : <span style={{ color: '#856404' }}>Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 3. Consolidated & Other Project Registers */}
            {reportType !== 'PO_ALLOCATION' && reportType !== 'TAX_INVOICES' && (
              <table className="data-table" style={{ fontSize: '0.78rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Project Code</th>
                    <th>Department / Customer</th>
                    <th>State</th>
                    <th>Project Funds Received</th>
                    <th>Total PO Value</th>
                    <th>Amount Paid</th>
                    <th>Pending Dues</th>
                    <th>Status</th>
                    <th className="no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>Loading report data…</td></tr>
                  ) : filteredProjects.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No records match the selected filters.</td></tr>
                  ) : filteredProjects.map((p: any, i: number) => {
                    return (
                      <tr key={p.headerId || i}>
                        <td style={{ color: '#6c757d', fontWeight: 600 }}>{i + 1}</td>
                        <td><code style={{ fontSize: '0.7rem', background: '#e8f4fd', color: '#003366', padding: '1px 5px', borderRadius: 3 }}>{p.projectCode}</code></td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={p.customerName}>{p.customerName}</td>
                        <td><span style={{ background: '#f0f4f8', color: 'var(--nicsi-teal)', padding: '1px 6px', borderRadius: 3, fontSize: '0.68rem', fontWeight: 700 }}>{p.stateCode}</span></td>
                        <td style={{ fontWeight: 700, color: '#003366' }}>{formatCurrency(p.amountReceived)}</td>
                        <td style={{ color: '#FF6600', fontWeight: 600 }}>{formatCurrency(p.effectivePoAmount)}</td>
                        <td style={{ fontWeight: 700, color: '#28A745' }}>{p.totalAmountPaid > 0 ? formatCurrency(p.totalAmountPaid) : <span style={{ color: '#adb5bd' }}>—</span>}</td>
                        <td style={{ color: p.vendorPendingPayment > 0 ? '#DC3545' : '#28A745', fontWeight: 700 }}>{p.vendorPendingPayment > 0 ? formatCurrency(p.vendorPendingPayment) : '✓ Clear'}</td>
                        <td>
                          <span className={`badge badge-${p.paymentStatus === 'cleared' ? 'success' : p.paymentStatus === 'partial' ? 'warning' : 'danger'}`} style={{ textTransform: 'capitalize' }}>{p.paymentStatus}</span>
                        </td>
                        <td className="no-print">
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => generateUC(p)} title="Preview Form GFR 12-A Utilization Certificate" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>UC</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid var(--color-border-light)', background: '#f8fbff', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            <strong>Official Government Disclaimer:</strong> This report is generated from the National Informatics Centre Services Inc. Project Monitoring System (NPMS). All financial figures are in Indian Rupees (₹) sourced live from Oracle ERP. For official audit & administrative use only.
          </div>
        </div>

        {/* Official Print Footer & Signature Blocks (Visible ONLY in PDF / Printout) */}
        <div className="print-footer-signatures">
          <div>
            <div>_______________________________</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>Finance & Accounts Officer</div>
            <div>NICSI HQ, New Delhi</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div>_______________________________</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>Project Manager / Nodal Officer</div>
            <div>NICSI Zonal Project Monitoring Cell</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>_______________________________</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>Head of Department / Director</div>
            <div>Client User Department</div>
          </div>
        </div>

      </div>

      {/* ── Form GFR 12-A Utilization Certificate Modal ── */}
      {ucModalProject && (
        <div className="uc-modal-overlay no-print" onClick={() => setUcModalProject(null)}>
          <div className="uc-modal-container" onClick={e => e.stopPropagation()}>
            <div className="uc-modal-header">
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Form GFR 12-A — Utilization Certificate (UC)</div>
              <button onClick={() => setUcModalProject(null)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div className="uc-modal-body">
{[
  '================================================================================',
  '                    FORM GFR 12-A (See Rule 238 (1))',
  '                      UTILIZATION CERTIFICATE (UC)',
  '================================================================================',
  `1. Name of Scheme / Project    : IT Infrastructure & Portal Services`,
  `2. Project Code / Reference    : ${ucModalProject.projectCode}`,
  `3. Grantee Dept / Customer     : ${ucModalProject.customerName}`,
  `4. Location / State            : ${ucModalProject.stateCode}`,
  `5. Sanction Date               : ${ucModalProject.createdOn || 'N/A'}`,
  `6. Available Project Balance    : INR ${ucModalProject.amountReceived?.toLocaleString('en-IN')}`,
  '--------------------------------------------------------------------------------',
  '           STATEMENT OF GRANTS-IN-AID / PROJECT FUNDS RECEIVED',
  '--------------------------------------------------------------------------------',
  `S.No.  Sanction Ref No.                       Date         Amount (INR)`,
  '--------------------------------------------------------------------------------',
  ` 1.    NICSI/PMD/${ucModalProject.projectCode}              ${ucModalProject.createdOn || 'N/A'}   ₹${(ucModalProject.amountReceived || 0).toLocaleString('en-IN')}`,
  '--------------------------------------------------------------------------------',
  `       Total Project Funds Received by NICSI           ₹${(ucModalProject.amountReceived || 0).toLocaleString('en-IN')}`,
  '--------------------------------------------------------------------------------',
  '',
  '--------------------------------------------------------------------------------',
  '                       UTILIZATION CERTIFICATION',
  '--------------------------------------------------------------------------------',
  `Certified that out of INR ${(ucModalProject.amountReceived || 0).toLocaleString('en-IN')} of Grants-in-Aid / Funds`,
  `received during the financial period in favour of ${ucModalProject.customerName} under`,
  `NICSI Project Ref ${ucModalProject.projectCode}, a sum of INR ${(ucModalProject.totalAmountPaid || 0).toLocaleString('en-IN')} has been`,
  `utilized for the sanctioned purpose for which it was intended.`,
  '',
  `The financial summary of utilization is certified below:`,
  ` - Total Project Funds Received from Client : INR ${(ucModalProject.amountReceived || 0).toLocaleString('en-IN')}`,
  ` - Total Disbursements / Amount Paid : INR ${(ucModalProject.totalAmountPaid || 0).toLocaleString('en-IN')}`,
  ` - NICSI Retained Service Charge      : INR ${(ucModalProject.nicsiCommission || 0).toLocaleString('en-IN')}`,
  ` - Unspent Balance Remaining          : INR ${Math.max(0, (ucModalProject.amountReceived || 0) - (ucModalProject.totalAmountPaid || 0) - (ucModalProject.nicsiCommission || 0)).toLocaleString('en-IN')}`,
  '',
  `1. Certified that I have satisfied myself that the conditions on which the`,
  `   grants-in-aid was sanctioned have been duly fulfilled / are being fulfilled`,
  `   and that I have exercised checks to see that the money was actually utilized`,
  `   for the purpose for which it was sanctioned.`,
  '',
  `2. Kinds of checks exercised:`,
  `   (i) Verification of Purchase Orders (POs) issued to empanelled vendors.`,
  `  (ii) Inspection & verification of expenditure bills submitted via Bill Desk.`,
  ` (iii) Reconciliation of client receipts and GST Tax Invoices.`,
  '',
  `Date        : ${fmt(today)}`,
  `Generated By: NICSI Project Monitoring System (NPMS)`,
  '',
  `_______________________                    _______________________`,
  `Finance Officer / Accounts                 Project Manager (PM)`,
  `NICSI New Delhi                            NICSI Zonal Office`,
  '================================================================================',
].join('\n')}
            </div>
            <div className="uc-modal-footer">
              <button className="btn btn-outline" onClick={() => setUcModalProject(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => {
                const blob = new Blob([document.querySelector('.uc-modal-body')?.innerText || ''], { type: 'text/plain;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `Form_GFR12A_UC_${ucModalProject.projectCode}.txt`; a.click();
              }}>
                Download UC Text File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
