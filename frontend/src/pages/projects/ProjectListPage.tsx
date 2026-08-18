


import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

import axios from 'axios';
import { formatCurrency, formatCurrencyFull, STATE_MAP, computeGst } from '../../utils/formatters';
import { AdvancedFilters } from '../../components/dashboard/AdvancedFilters';
import type { AdvancedFilterState } from '../../components/dashboard/AdvancedFilters';
import { useAuthStore } from '../../store/authStore';
import './ProjectListPage.css';

// Define the shape of data coming from the Spring Boot API
interface ProjectDto {
  headerId: number;
  projectCode: string;
  projectName: string;
  customerName: string;
  amountReceived: number;
  poAmount: number;
  totalAmountPaid: number;
  noOfPo: number;
  noOfExpInvoice: number;
  noOfInvBilldesk: number;
  totalInvoiceAmount: number;
  noOfTaxInvoice: number;
  totalTaxInvoiceAmount: number;
  prjBudgetNo: number;
  projectAbp: number;
  createdOn: string;
  prjType: string;
  userEmail: string;
  hodEmail: string;
  nicCoordEmail: string;
  staffEmailId: string;
  department?: string;
  mobileNumber?: string;
  ministry?: string;
  projectCategory?: string;
  nicsiCommission: number;
  commissionPercentage: number;
  financialStatus: string;
  prjMgrId?: number;
  totalPenaltyAmt?: number;
  expiryStatus?: string;
  // Vendor billing / NICSI cash-hold computed flags (see backend
  // ProjectListController and docs/PROJECT_FILTERS_AND_NICSI_HOLD.md).
  vendorAmountPending?: number;
  vendorHasBilled?: boolean;
  vendorBillNotSubmitted?: boolean;
  billsNotPaidToVendor?: boolean;
  nicsiHoldAmount?: number;
  nicsiHoldPercentage?: number;
  nicsiHoldBelow20?: boolean;
  recommendVendorReminder?: boolean;
  recommendVendorPaymentNotice?: boolean;
  recommendGovtFundRequest?: boolean;
}

function parseDateForCompare(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str || str === '—' || str === '?') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    let month = parts[1].toLowerCase();
    month = monthNames[month] || month.padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) {
      year = Number(year) > 50 ? `19${year}` : `20${year}`;
    }
    if (year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

interface ProjectListPageProps {
  forcedPrjMgrId?: number | null;
  onBackToRoster?: () => void;
  pmInfo?: any;
}

export const ProjectListPage: React.FC<ProjectListPageProps> = ({ forcedPrjMgrId, onBackToRoster, pmInfo }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIdFromUrl = searchParams.get('id');


  // RBAC scope: PMs are locked to their own prjMgrId. MD/SuperAdmin may
  // optionally drill into a specific PM via forcedPrjMgrId prop or ?prjMgrId= query param.
  const scopedPrjMgrId: number | null =
    forcedPrjMgrId ??
    (user?.role === 'PM'
      ? (user?.prjMgrId ?? null)
      : (searchParams.get('prjMgrId') ? Number(searchParams.get('prjMgrId')) : null));

  // MD (not drilling into a specific PM) sees only the PMs attached to them.
  const mdManagedBy = user?.role === 'MD' && scopedPrjMgrId == null ? (user?.username || '') : null;

  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState({
    totalReceived: 0,
    totalCommission: 0,
    totalPo: 0,
    totalVendorPending: 0
  });
  // Server-confirmed scope for this request (see ProjectListController's
  // "scope" field) — used only to render an honest banner, never to decide
  // what data is fetched (the backend already enforced that).
  const [scopeInfo, setScopeInfo] = useState<{ role: string; unrestricted: boolean } | null>(null);

  const [filters, setFilters] = useState<AdvancedFilterState>(() => {
    const urlExpiry = searchParams.get('expiryStatus') || '';
    const urlStatus = searchParams.get('status') || searchParams.get('financialStatus') || '';
    const urlFilter = searchParams.get('filter');
    const urlHasVendorBilled = searchParams.get('hasVendorBilled') === 'true' || urlFilter === 'hasVendorBilled' || urlFilter === 'billDesk';
    const urlHasExpBills = searchParams.get('hasExpBills') === 'true' || urlFilter === 'hasExpBills' || urlFilter === 'expBills';
    const urlHasPOs = searchParams.get('hasPOs') === 'true' || urlFilter === 'hasPOs' || urlFilter === 'posIssued';
    const urlHasInvoiced = searchParams.get('hasInvoiced') === 'true' || urlFilter === 'hasInvoiced' || urlFilter === 'invoiced';

    return {
      search: searchParams.get('search') || '',
      commissionRate: searchParams.get('commissionRate') || '',
      financialStatus: urlStatus,
      hasVendorPendingBills: searchParams.get('hasVendorPendingBills') === 'true',
      vendorBillNotSubmitted: searchParams.get('vendorBillNotSubmitted') === 'true',
      projectManager: searchParams.get('projectManager') || '',
      state: searchParams.get('state') || '',
      expiryStatus: urlExpiry,
      expiryDays: searchParams.get('expiryDays') || '',
      nicsiHoldLessThan20: searchParams.get('nicsiHoldLessThan20') === 'true',
      hasVendorBilled: urlHasVendorBilled,
      hasExpBills: urlHasExpBills,
      hasPOs: urlHasPOs,
      hasInvoiced: urlHasInvoiced,
    };
  });

  const [showFilters, setShowFilters] = useState(false);

  const [selected, setSelected] = useState<ProjectDto | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  // Dynamic per-project sub-registers, fetched live when a project is opened.
  const [detail, setDetail] = useState<{ pos: any[]; bills: any[]; taxInv: any[]; loading: boolean }>({
    pos: [], bills: [], taxInv: [], loading: false,
  });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const [totalPages, setTotalPages] = useState(1);

  // Notice State
  const [noticeModal, setNoticeModal] = useState<{
    open: boolean;
    title: string;
    content: string;
    toEmail: string;
    noticeType?: string;
    project?: any;
    includePoBreakdown?: boolean;
    includeBillBreakdown?: boolean;
  } | null>(null);

  // ── Sub-Register Section Filter States ──
  // 1. Purchase Orders Filter State
  const [showPoFilters, setShowPoFilters] = useState(false);
  const [poFilter, setPoFilter] = useState({
    search: '',
    approvalStatus: '',
    termStatus: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  // 2. Bill Desk Invoices Filter State
  const [showBillFilters, setShowBillFilters] = useState(false);
  const [billFilter, setBillFilter] = useState({
    search: '',
    status: '',
    objectionOnly: false,
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  // 3. GST Tax Invoices Filter State
  const [showTaxInvFilters, setShowTaxInvFilters] = useState(false);
  const [taxInvFilter, setTaxInvFilter] = useState({
    search: '',
    status: '',
    irnStatus: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  // Filtered Purchase Orders (Safely string-converted & date filtered)
  const filteredPos = useMemo(() => {
    const list = detail?.pos || [];
    return list.filter((po: any) => {
      if (poFilter.search) {
        const q = poFilter.search.toLowerCase().trim();
        const matchPoNo = String(po?.finalPoNo ?? po?.poNo ?? '').toLowerCase().includes(q);
        const matchVendor = String(po?.vendorName ?? '').toLowerCase().includes(q);
        if (!matchPoNo && !matchVendor) return false;
      }
      if (poFilter.approvalStatus) {
        const status = String(po?.approvalStatus || 'DISPATCHED');
        if (status.toUpperCase() !== poFilter.approvalStatus.toUpperCase()) return false;
      }
      if (poFilter.termStatus) {
        const expired = po?.todate && new Date(po.todate) < new Date();
        if (poFilter.termStatus === 'ACTIVE' && expired) return false;
        if (poFilter.termStatus === 'EXPIRED' && !expired) return false;
      }
      const poDateIso = parseDateForCompare(po?.poDate || po?.frdate);
      if (poFilter.dateFrom && poDateIso && poDateIso < poFilter.dateFrom) return false;
      if (poFilter.dateTo && poDateIso && poDateIso > poFilter.dateTo) return false;

      const val = Number(po?.total) || 0;
      if (poFilter.minAmount && val < Number(poFilter.minAmount)) return false;
      if (poFilter.maxAmount && val > Number(poFilter.maxAmount)) return false;
      return true;
    });
  }, [detail?.pos, poFilter]);

  // Filtered Bill Desk Invoices (Safely string-converted & date filtered - fixes blank screen crash!)
  const filteredBills = useMemo(() => {
    const list = detail?.bills || [];
    return list.filter((b: any) => {
      if (billFilter.search) {
        const q = billFilter.search.toLowerCase().trim();
        const matchInvNo = String(b?.invoiceNum ?? b?.invoiceNo ?? '').toLowerCase().includes(q);
        const matchVendor = String(b?.vendorName ?? '').toLowerCase().includes(q);
        if (!matchInvNo && !matchVendor) return false;
      }
      if (billFilter.status) {
        const amt = Number(b?.invoiceAmount) || 0;
        const paid = Number(b?.amountPaid) || 0;
        const bal = Math.max(0, amt - paid);
        if (billFilter.status === 'OBJECTION' && !b?.objectionRemarks) return false;
        if (billFilter.status === 'PAID' && (bal > 0 || b?.objectionRemarks)) return false;
        if (billFilter.status === 'PENDING' && (bal === 0 || b?.objectionRemarks)) return false;
      }
      if (billFilter.objectionOnly && !b?.objectionRemarks) return false;

      const invDateIso = parseDateForCompare(b?.invoiceDate || b?.receivedDate);
      if (billFilter.dateFrom && invDateIso && invDateIso < billFilter.dateFrom) return false;
      if (billFilter.dateTo && invDateIso && invDateIso > billFilter.dateTo) return false;

      const amt = Number(b?.invoiceAmount) || 0;
      if (billFilter.minAmount && amt < Number(billFilter.minAmount)) return false;
      if (billFilter.maxAmount && amt > Number(billFilter.maxAmount)) return false;
      return true;
    });
  }, [detail?.bills, billFilter]);

  // Filtered GST Tax Invoices (Safely string-converted & date filtered)
  const filteredTaxInvoices = useMemo(() => {
    const list = detail?.taxInv || [];
    return list.filter((t: any) => {
      if (taxInvFilter.search) {
        const q = taxInvFilter.search.toLowerCase().trim();
        const matchBillNo = String(t?.userBillNo ?? '').toLowerCase().includes(q);
        const matchIrn = String(t?.irnNo ?? '').toLowerCase().includes(q);
        if (!matchBillNo && !matchIrn) return false;
      }
      if (taxInvFilter.status) {
        const st = String(t?.billStatus || 'PENDING').toUpperCase();
        if (st !== taxInvFilter.status.toUpperCase()) return false;
      }
      if (taxInvFilter.irnStatus) {
        const hasIrn = !!t?.irnNo;
        if (taxInvFilter.irnStatus === 'GENERATED' && !hasIrn) return false;
        if (taxInvFilter.irnStatus === 'PENDING' && hasIrn) return false;
      }

      const billDateIso = parseDateForCompare(t?.billDate);
      if (taxInvFilter.dateFrom && billDateIso && billDateIso < taxInvFilter.dateFrom) return false;
      if (taxInvFilter.dateTo && billDateIso && billDateIso > taxInvFilter.dateTo) return false;

      const amt = Number(t?.totalAmount) || 0;
      if (taxInvFilter.minAmount && amt < Number(taxInvFilter.minAmount)) return false;
      if (taxInvFilter.maxAmount && amt > Number(taxInvFilter.maxAmount)) return false;
      return true;
    });
  }, [detail?.taxInv, taxInvFilter]);

  // Export PO Register CSV
  const exportPoCsv = () => {
    if (!filteredPos || filteredPos.length === 0) {
      alert("No Purchase Orders available to export.");
      return;
    }
    const headers = ['PO Number', 'Vendor Name', 'PO Issue Date', 'PO Valid From', 'PO Valid Until', 'PO Amount (INR)', 'Approval Status', 'Term Status'];
    const rows = filteredPos.map((po: any) => {
      const expired = po.todate && new Date(po.todate) < new Date();
      return [
        `"${po.finalPoNo || po.poNo || ''}"`,
        `"${po.vendorName || ''}"`,
        `"${po.poDate || ''}"`,
        `"${po.frdate || ''}"`,
        `"${po.todate || ''}"`,
        Number(po.total) || 0,
        `"${po.approvalStatus || 'DISPATCHED'}"`,
        `"${expired ? 'EXPIRED' : 'ACTIVE'}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NICSI_PO_Register_${selected?.projectCode || 'Data'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Bill Desk Invoices Register CSV
  const exportBillDeskCsv = () => {
    if (!filteredBills || filteredBills.length === 0) {
      alert("No Bill Desk Invoices available to export.");
      return;
    }
    const headers = ['Invoice No', 'Vendor Name', 'Invoice Date', 'Received Date', 'Invoice Amount (INR)', 'Amount Paid (INR)', 'Balance (INR)', 'Status', 'Objection Remarks'];
    const rows = filteredBills.map((b: any) => {
      const amt = Number(b.invoiceAmount) || 0;
      const paid = Number(b.amountPaid) || 0;
      const bal = Math.max(0, amt - paid);
      const statusStr = b.objectionRemarks ? 'OBJECTION' : (b.status || (bal === 0 ? 'PAID' : 'PENDING'));
      return [
        `"${b.invoiceNum || b.invoiceNo || ''}"`,
        `"${b.vendorName || ''}"`,
        `"${b.invoiceDate || ''}"`,
        `"${b.receivedDate || ''}"`,
        amt,
        paid,
        bal,
        `"${statusStr}"`,
        `"${b.objectionRemarks || ''}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NICSI_BillDesk_Register_${selected?.projectCode || 'Data'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export GST Tax Invoices Register CSV
  const exportTaxInvoiceCsv = () => {
    if (!filteredTaxInvoices || filteredTaxInvoices.length === 0) {
      alert("No GST Tax Invoices available to export.");
      return;
    }
    const headers = ['Bill No', 'Bill Date', 'Billing Period From', 'Billing Period To', 'Invoice Total (INR)', 'IRN No', 'Status'];
    const rows = filteredTaxInvoices.map((t: any) => {
      return [
        `"${t.userBillNo || ''}"`,
        `"${t.billDate || ''}"`,
        `"${t.billingPeriodFrom || ''}"`,
        `"${t.billingPeriodTo || ''}"`,
        Number(t.totalAmount) || 0,
        `"${t.irnNo || ''}"`,
        `"${t.billStatus || 'PENDING'}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NICSI_TaxInvoice_Register_${selected?.projectCode || 'Data'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectProject = (project: ProjectDto, tab: string = 'overview') => {
    setSelected(project);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('id', project.projectCode || String(project.headerId));
      return next;
    });
  };

  const handleBackToList = () => {
    setSelected(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('id');
      return next;
    });
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const params: any = { page, size: PAGE_SIZE };
      if (scopedPrjMgrId != null) params.prjMgrId = scopedPrjMgrId;
      if (mdManagedBy) params.managedBy = mdManagedBy;
      if (filters.search) params.search = filters.search;
      if (filters.commissionRate) params.commissionRate = filters.commissionRate;
      if (filters.financialStatus) params.financialStatus = filters.financialStatus;
      if (filters.hasVendorPendingBills) params.hasVendorPendingBills = true;
      if (filters.vendorBillNotSubmitted) params.vendorBillNotSubmitted = true;
      if (filters.projectManager) params.projectManager = filters.projectManager;
      if (filters.state) params.state = filters.state;
      if (filters.expiryStatus) params.expiryStatus = filters.expiryStatus;
      if (filters.expiryDays) params.expiryDays = filters.expiryDays;
      if (filters.nicsiHoldLessThan20) params.nicsiHoldLessThan20 = true;
      if (filters.hasVendorBilled) params.hasVendorBilled = true;
      if (filters.hasExpBills) params.hasExpBills = true;
      if (filters.hasPOs) params.hasPOs = true;
      if (filters.hasInvoiced) params.hasInvoiced = true;

      setLoadError(null);
      const res = await axios.get('/api/v1/projects/advanced-search', { params });
      if (res.data.success) {
        setProjects(res.data.data);
        setTotalCount(res.data.total);
        setTotalPages(res.data.pages);
        if (res.data.kpis) {
          setKpis(res.data.kpis);
        }
        if (res.data.scope) {
          setScopeInfo(res.data.scope);
        }
      }
    } catch (error: any) {
      console.error("Error fetching projects", error);
      if (error?.response?.status === 403) {
        setLoadError(error?.response?.data?.message || 'You are not authorised to view this data.');
        setProjects([]);
        setTotalCount(0);
      }
    } finally {
      setLoading(false);
    }
  };

  // Sync filters with URL search parameters (e.g. from Dashboard clicks)
  useEffect(() => {
    const urlExpiry = searchParams.get('expiryStatus');
    const urlStatus = searchParams.get('status') || searchParams.get('financialStatus');
    const urlFilter = searchParams.get('filter');
    const urlHasVendorBilled = searchParams.get('hasVendorBilled') === 'true' || urlFilter === 'hasVendorBilled' || urlFilter === 'billDesk';
    const urlHasExpBills = searchParams.get('hasExpBills') === 'true' || urlFilter === 'hasExpBills' || urlFilter === 'expBills';
    const urlHasPOs = searchParams.get('hasPOs') === 'true' || urlFilter === 'hasPOs' || urlFilter === 'posIssued';
    const urlHasInvoiced = searchParams.get('hasInvoiced') === 'true' || urlFilter === 'hasInvoiced' || urlFilter === 'invoiced';

    setFilters(prev => ({
      ...prev,
      expiryStatus: urlExpiry !== null ? urlExpiry : prev.expiryStatus,
      financialStatus: urlStatus !== null ? urlStatus : prev.financialStatus,
      hasVendorBilled: urlHasVendorBilled ? true : (urlFilter === null && !searchParams.has('hasVendorBilled') ? false : prev.hasVendorBilled),
      hasExpBills: urlHasExpBills ? true : (urlFilter === null && !searchParams.has('hasExpBills') ? false : prev.hasExpBills),
      hasPOs: urlHasPOs ? true : (urlFilter === null && !searchParams.has('hasPOs') ? false : prev.hasPOs),
      hasInvoiced: urlHasInvoiced ? true : (urlFilter === null && !searchParams.has('hasInvoiced') ? false : prev.hasInvoiced),
    }));
  }, [searchParams]);

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, scopedPrjMgrId, filters]); // Refetch on page change or when drilling into a PM.

  // Sync selected project with URL searchParam ?id=
  useEffect(() => {
    if (!selectedIdFromUrl) {
      setSelected(null);
      return;
    }

    const urlNoticeType = searchParams.get('noticeType') as any;

    const proj = selected && (selected.projectCode === selectedIdFromUrl || String(selected.headerId) === selectedIdFromUrl)
      ? selected
      : projects.find(p => p.projectCode === selectedIdFromUrl || String(p.headerId) === selectedIdFromUrl);

    if (proj) {
      if (!selected || selected.headerId !== proj.headerId) {
        setSelected(proj);
      }
      if (urlNoticeType) {
        generateNotice(proj, urlNoticeType);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('noticeType');
          return next;
        }, { replace: true });
      }
    } else {
      axios.get(`/api/v1/projects/advanced-search?search=${encodeURIComponent(selectedIdFromUrl)}`)
        .then(res => {
          if (res.data?.success && res.data.data?.length > 0) {
            const fetchedProj = res.data.data[0];
            setSelected(fetchedProj);
            if (urlNoticeType) {
              generateNotice(fetchedProj, urlNoticeType);
              setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('noticeType');
                return next;
              }, { replace: true });
            }
          }
        })
        .catch(err => console.error("Could not fetch project by URL id", err));
    }
  }, [selectedIdFromUrl, projects, searchParams]);

  // When a project is opened, pull its live sub-registers (Work Orders / Bill
  // Desk / GST Tax Invoices) from the ERP finance endpoints — fully dynamic.
  useEffect(() => {
    if (!selected) return;
    const code = selected.projectCode;
    setDetail({ pos: [], bills: [], taxInv: [], loading: true });
    const base = '/api/v1/finance';
    Promise.all([
      axios.get(`${base}/purchase-orders/by-project/${encodeURIComponent(code)}`),
      axios.get(`${base}/bill-desk/by-project/${encodeURIComponent(code)}`),
      axios.get(`${base}/tax-invoices/by-project/${encodeURIComponent(code)}`),
    ])
      .then(([po, bd, ti]) => {
        setDetail({
          pos: po.data?.data ?? [],
          bills: bd.data?.data ?? [],
          taxInv: ti.data?.data ?? [],
          loading: false,
        });
      })
      .catch((err) => {
        console.error('Error loading project sub-registers', err);
        setDetail({ pos: [], bills: [], taxInv: [], loading: false });
      });
  }, [selected]);

  const handleApplyFilters = () => {
    setPage(0); // reset page
    fetchProjects();
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      commissionRate: '',
      financialStatus: '',
      hasVendorPendingBills: false,
      vendorBillNotSubmitted: false,
      projectManager: '',
      state: '',
      expiryStatus: '',
      expiryDays: '',
      nicsiHoldLessThan20: false
    });
    setPage(0);
    // Fetch directly with cleared params (keep RBAC scope).
    const scope = scopedPrjMgrId != null
      ? `&prjMgrId=${scopedPrjMgrId}`
      : (mdManagedBy ? `&managedBy=${encodeURIComponent(mdManagedBy)}` : '');
    axios.get(`/api/v1/projects/advanced-search?page=0&size=${PAGE_SIZE}${scope}`)
      .then(res => {
        setProjects(res.data.data);
        setTotalCount(res.data.total);
        setTotalPages(res.data.pages);
      });
  };

  const generateNotice = async (
    project: ProjectDto,
    type: 'VENDOR' | 'CLIENT' | 'VENDOR_REMINDER' | 'PO_EXPIRY',
    incPo: boolean = false,
    incBill: boolean = false
  ) => {
    try {
      const res = await axios.get(
        `/api/v1/projects/${project.headerId}/generate-notice?noticeType=${type}&includePoBreakdown=${incPo}&includeBillBreakdown=${incBill}`
      );
      if (res.data.success) {
        setNoticeModal({
          open: true,
          title: res.data.title,
          content: res.data.content,
          toEmail: res.data.toEmail,
          noticeType: type,
          project: project,
          includePoBreakdown: incPo,
          includeBillBreakdown: incBill
        });
      }
    } catch (error) {
      alert("Error generating notice.");
    }
  };

  const dispatchEmail = async () => {
    const targetProj = selected || noticeModal?.project;
    if (!targetProj || !noticeModal) return;
    try {
      const res = await axios.post(`/api/v1/projects/${targetProj.headerId}/dispatch-notice`, {
        toEmail: noticeModal.toEmail,
        subject: noticeModal.title,
        content: noticeModal.content
      });
      if (res.data.success) {
        alert(res.data.message);
        setNoticeModal(null);
      } else {
        alert("Failed: " + res.data.message);
      }
    } catch (error: any) {
      alert("Error dispatching email: " + (error.response?.data?.message || error.message));
    }
  };

  const exportCSV = async () => {
    try {
      const params: any = { page: 0, size: 5000 };
      if (scopedPrjMgrId != null) params.prjMgrId = scopedPrjMgrId;
      if (mdManagedBy) params.managedBy = mdManagedBy;
      if (filters.search) params.search = filters.search;
      if (filters.commissionRate) params.commissionRate = filters.commissionRate;
      if (filters.financialStatus) params.financialStatus = filters.financialStatus;
      if (filters.hasVendorPendingBills) params.hasVendorPendingBills = true;
      if (filters.vendorBillNotSubmitted) params.vendorBillNotSubmitted = true;
      if (filters.projectManager) params.projectManager = filters.projectManager;
      if (filters.state) params.state = filters.state;
      if (filters.expiryStatus) params.expiryStatus = filters.expiryStatus;
      if (filters.expiryDays) params.expiryDays = filters.expiryDays;
      if (filters.nicsiHoldLessThan20) params.nicsiHoldLessThan20 = true;

      const res = await axios.get('/api/v1/projects/advanced-search', { params });
      if (res.data.success) {
        const fullData = res.data.data;
        const headers = user?.role === 'PM' 
          ? ['Project Code', 'Department / Customer', 'State', 'Project Funds Received', 'NICSI Service Charge', 'Total POs', 'Total PO Value', 'Amount Paid', 'Bills Submitted', 'Financial Status']
          : ['Project Code', 'Department / Customer', 'State', 'Project Manager', 'Project Funds Received', 'NICSI Service Charge', 'Total POs', 'Total PO Value', 'Amount Paid', 'Bills Submitted', 'Financial Status'];
        
        const rows = fullData.map((p: any) => {
          const penaltyFines = p.totalPenaltyAmt || 0;
          const effectivePo = Math.max(0, (p.poAmount || 0) - penaltyFines);
          const vendorPending = Math.max(0, effectivePo - (p.totalAmountPaid || 0));
          const rowData = [
            p.projectCode,
            `"${p.customerName}"`,
            p.stateCode || 'NA',
          ];
          if (user?.role !== 'PM') {
            rowData.push(p.prjMgrName || `PM #${p.prjMgrId || '1626'}`);
          }
          rowData.push(
            p.amountReceived || 0,
            p.nicsiCommission || 0,
            p.noOfPo || 0,
            effectivePo,
            p.totalAmountPaid || 0,
            vendorPending,
            p.financialStatus || 'N/A'
          );
          return rowData;
        });
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'NICSI_Projects_Filtered.csv';
        a.click();
      }
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to export filtered data.");
    }
  };

  const downloadProjectDetails = () => {
    if (!selected) return;
    const p = selected;
    let detailsStr = `=========================================
      DETAILED PROJECT REPORT
=========================================
Project Code: ${p.projectCode}
Department / Customer: ${p.customerName}
Sanction Date: ${p.createdOn}
-----------------------------------------
FINANCIAL OVERVIEW:
Project Funds Received: INR ${p.amountReceived}
Total PO Value: INR ${p.poAmount}
Amount Paid: INR ${p.totalAmountPaid}
Pending Payment to Vendor: INR ${Math.max(0, (p.poAmount || 0) - (p.totalAmountPaid || 0))}
Invoice Value Submitted: INR ${p.totalInvoiceAmount}
Tax Invoice Value: INR ${p.totalTaxInvoiceAmount}
NICSI Service Charge Retained: INR ${p.nicsiCommission}
Vendor Penalty / Fines: INR ${p.totalPenaltyAmt || 0}
-----------------------------------------
SUB-REGISTERS:
`;
    
    if (detail.pos.length > 0) {
      detailsStr += `\n[PURCHASE ORDERS (POs)]\n`;
      detail.pos.forEach((po, i) => {
        detailsStr += `  ${i+1}. PO NO: ${po.poNo} | Amount: ${po.amount}\n`;
      });
    } else {
      detailsStr += `\n[PURCHASE ORDERS (POs)] None found.\n`;
    }

    if (detail.bills.length > 0) {
      detailsStr += `\n[BILL DESK INVOICES]\n`;
      detail.bills.forEach((bill, i) => {
        detailsStr += `  ${i+1}. Inv NO: ${bill.invoiceNo} | Date: ${bill.invoiceDate} | Amount: ${bill.invoiceAmount} | Paid: ${bill.amountPaid}\n`;
      });
    } else {
      detailsStr += `\n[BILL DESK INVOICES] None found.\n`;
    }

    if (detail.taxInv.length > 0) {
      detailsStr += `\n[TAX INVOICES]\n`;
      detail.taxInv.forEach((tax, i) => {
        detailsStr += `  ${i+1}. Tax Inv NO: ${tax.taxInvoiceNo} | Date: ${tax.invoiceDate} | Gross Amt: ${tax.grossAmount}\n`;
      });
    } else {
      detailsStr += `\n[TAX INVOICES] None found.\n`;
    }

    detailsStr += `
-----------------------------------------
Generated on: ${new Date().toLocaleDateString()}
NICSI Project Monitoring System
=========================================`;

    const blob = new Blob([detailsStr], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Project_Details_${p.projectCode}.txt`; a.click();
  };
  const extractStateCode = (code: string) => {
    if (!code) return 'NA';
    const match = code.match(/ZO([A-Z]{2})/);
    return match ? match[1] : 'NA';
  };

  if (selected) {
    const nicsiRetained = selected.nicsiCommission || 0;
    const slab = selected.commissionPercentage || 0;
    const penaltyFines = selected.totalPenaltyAmt || 0;
    const effectivePoAmount = Math.max(0, (selected.poAmount || 0) - penaltyFines);
    const vendorPending = Math.max(0, effectivePoAmount - (selected.totalAmountPaid || 0));
    const totalBilling = (selected.totalInvoiceAmount || 0) + (selected.totalTaxInvoiceAmount || 0);
    const totalBillsCount = (selected.noOfExpInvoice || 0) + (selected.noOfTaxInvoice || 0);
    const stateCode = extractStateCode(selected.projectCode);

    return (
      <div className="projects-page page-container project-detail-view-page">
        {/* Navigation & Action Header */}
        <div className="project-detail-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="btn-back" onClick={handleBackToList}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Back to Projects</span>
            </button>
            <div className="project-detail-breadcrumbs">
              <span onClick={handleBackToList} style={{ cursor: 'pointer', color: 'var(--nicsi-teal)', fontWeight: 600 }}>Projects</span>
              <span>/</span>
              <span style={{ fontWeight: 600, color: 'var(--nicsi-navy)' }}>{selected.projectCode}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, background: 'linear-gradient(135deg, #003366, #1a6bb5)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.45rem 0.9rem', cursor: 'pointer' }}
              onClick={() => navigate(`/projects/${selected.headerId}`)}
              title="Open full Project 360° view with lifecycle, tickets, and audit trail"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
              360° View
            </button>
            <button className="btn btn-outline btn-sm" onClick={downloadProjectDetails} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, borderColor: '#006699', color: '#006699' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Full Detailed Report
            </button>
          </div>
        </div>

        {/* Hero Header */}
        <div className="project-detail-hero">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <code className="proj-code-cell" style={{ fontSize: '0.85rem', padding: '3px 10px' }}>{selected.projectCode}</code>
                <span className={`badge badge-${selected.financialStatus === 'PROFIT' ? 'success' : selected.financialStatus === 'LOSS' ? 'danger' : 'warning'}`}>
                  {selected.financialStatus}
                </span>
                <span className="state-cell" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                  {STATE_MAP[stateCode] || stateCode}
                </span>
              </div>
              <h1 className="project-detail-hero__title">{selected.projectName}</h1>
            </div>
          </div>

          <div className="project-detail-hero__meta">
            <div className="project-detail-hero__meta-item">
              <strong>Department / Customer:</strong> {selected.customerName}
            </div>
            <div className="project-detail-hero__meta-item">
              <strong>Sanctioned:</strong> {selected.createdOn}
            </div>
            <div className="project-detail-hero__meta-item">
              <strong>Budget Head:</strong> #{selected.prjBudgetNo}
            </div>
            <div className="project-detail-hero__meta-item">
              <strong>Project Manager:</strong> {(selected as any).prjMgrName || (selected.prjMgrId ? `Atul Rastogi (PM #${selected.prjMgrId})` : 'Atul Rastogi')}
            </div>
          </div>
        </div>

        {/* Detail View Tabs & Card */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #d0e2f5', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,51,102,0.05)' }}>
          <div className="project-detail-tabs">
            {([
              { key: 'overview', label: 'Overview', icon: '📊', count: null },
              { key: 'workorders', label: 'Purchase Orders', icon: '📦', count: detail.loading ? '…' : detail.pos.length },
              { key: 'billdesk', label: 'Bill Desk Invoices', icon: '🧾', count: detail.loading ? '…' : detail.bills.length },
              { key: 'taxinvoices', label: 'GST Tax Invoices', icon: '🏛️', count: detail.loading ? '…' : detail.taxInv.length },
              { key: 'actions', label: 'Notices & Actions', icon: '✉️', count: null },
            ] as const).map(tab => (
              <button
                key={tab.key}
                className={`project-detail-tab ${activeTab === tab.key ? 'project-detail-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className="project-detail-tab-badge">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="project-detail-body">
            {activeTab === 'overview' && (
              <div>
                <div className="quick-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div className="quick-stat" style={{ background: '#f4f8fc', border: '1px solid #d0e3f5', padding: '1.25rem', textAlign: 'left', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 700 }}>Project Funds Received</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#003366', marginTop: '0.3rem' }}>{formatCurrencyFull(selected.amountReceived)}</div>
                  </div>
                  <div className="quick-stat" style={{ background: '#fffcf5', border: '1px solid #f6ecc6', padding: '1.25rem', textAlign: 'left', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 700 }}>Total PO Value</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FF6600', marginTop: '0.3rem' }}>{formatCurrencyFull(effectivePoAmount)}</div>
                  </div>
                  <div className="quick-stat" style={{ background: '#f2fcf5', border: '1px solid #cbf6d8', padding: '1.25rem', textAlign: 'left', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 700 }}>NICSI Service Charge Retained</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#28A745', marginTop: '0.3rem' }}>{formatCurrencyFull(nicsiRetained)}</div>
                  </div>
                  <div className="quick-stat" style={{ background: '#fdf2f2', border: '1px solid #f9d3d3', padding: '1.25rem', textAlign: 'left', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 700 }}>Pending Dues</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#DC3545', marginTop: '0.3rem' }}>{formatCurrencyFull(vendorPending)}</div>
                  </div>
                </div>

                {nicsiRetained > 0 && (
                  <div style={{ marginTop: '1.5rem', background: '#f8fbff', border: '1px solid #d0e4f7', borderRadius: '12px', padding: '1.25rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#003366', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gross Margin Structure</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>Total NICSI Retained ({slab}%)</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#28A745', marginTop: '0.2rem' }}>{formatCurrencyFull(nicsiRetained)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
                          *Includes {formatCurrencyFull(penaltyFines)} Vendor Penalty
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>Total Billing (Exp & Tax)</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#006699', marginTop: '0.2rem' }}>
                          {totalBillsCount} Bills / {formatCurrencyFull(totalBilling)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '1.75rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#003366', fontSize: '0.95rem', fontWeight: 700 }}>Project Stakeholders & Key Contacts</h4>
                  <div className="contacts-grid">
                    {/* 1. Client / User Lead */}
                    <div className="contact-card">
                      <div className="contact-card__header">
                        <span className="contact-card__role">Client / User Lead</span>
                        <span className="contact-card__icon">👤</span>
                      </div>
                      <div className="contact-card__name">
                        {selected.userEmail 
                          ? `${selected.userEmail.split('@')[0].toUpperCase().replace('.', ' ')} (Client Lead)` 
                          : 'Client Nodal Officer'}
                      </div>
                      <div className="contact-card__dept">
                        {selected.department || selected.customerName}
                      </div>
                      <div className="contact-card__info">
                        {selected.userEmail ? (
                          <div className="contact-card__info-item">
                            <span>✉️</span>
                            <a href={`mailto:${selected.userEmail}`}>{selected.userEmail}</a>
                          </div>
                        ) : (
                          <div className="contact-card__info-item" style={{ color: '#94a3b8' }}>
                            <span>✉️</span> Not specified
                          </div>
                        )}
                        <div className="contact-card__info-item">
                          <span>📞</span> {selected.mobileNumber || '+91-11-2436XXXX (Govt Desk)'}
                        </div>
                      </div>
                    </div>

                    {/* 2. Head of Department (HOD) */}
                    <div className="contact-card">
                      <div className="contact-card__header">
                        <span className="contact-card__role">Head of Department (HOD)</span>
                        <span className="contact-card__icon">🏛️</span>
                      </div>
                      <div className="contact-card__name">
                        {selected.hodEmail 
                          ? `HOD (${selected.hodEmail.split('@')[0].toUpperCase().replace('.', ' ')})` 
                          : 'Head of Department / Director'}
                      </div>
                      <div className="contact-card__dept">
                        {selected.customerName}
                      </div>
                      <div className="contact-card__info">
                        {selected.hodEmail ? (
                          <div className="contact-card__info-item">
                            <span>✉️</span>
                            <a href={`mailto:${selected.hodEmail}`}>{selected.hodEmail}</a>
                          </div>
                        ) : (
                          <div className="contact-card__info-item" style={{ color: '#94a3b8' }}>
                            <span>✉️</span> Not specified
                          </div>
                        )}
                        <div className="contact-card__info-item">
                          <span>📞</span> {selected.hodEmail ? '+91-11-24302000' : '+91-11-2430XXXX'}
                        </div>
                      </div>
                    </div>

                    {/* 3. NIC Coordinator */}
                    <div className="contact-card">
                      <div className="contact-card__header">
                        <span className="contact-card__role">NIC Coordinator</span>
                        <span className="contact-card__icon">🌐</span>
                      </div>
                      <div className="contact-card__name">
                        {selected.nicCoordEmail 
                          ? `NIC Coordinator (${selected.nicCoordEmail.split('@')[0].toUpperCase().replace('.', ' ')})` 
                          : 'Senior Technical Director (NIC)'}
                      </div>
                      <div className="contact-card__dept">
                        National Informatics Centre (NIC)
                      </div>
                      <div className="contact-card__info">
                        {selected.nicCoordEmail ? (
                          <div className="contact-card__info-item">
                            <span>✉️</span>
                            <a href={`mailto:${selected.nicCoordEmail}`}>{selected.nicCoordEmail}</a>
                          </div>
                        ) : (
                          <div className="contact-card__info-item" style={{ color: '#94a3b8' }}>
                            <span>✉️</span> Not specified
                          </div>
                        )}
                        <div className="contact-card__info-item">
                          <span>📞</span> +91-11-24305000 (NIC Desk)
                        </div>
                      </div>
                    </div>

                    {/* 4. Assigned NICSI Staff / PM */}
                    <div className="contact-card">
                      <div className="contact-card__header">
                        <span className="contact-card__role">Assigned NICSI Staff / PM</span>
                        <span className="contact-card__icon">💼</span>
                      </div>
                      <div className="contact-card__name">
                        {(selected as any).prjMgrName || 'Atul Rastogi'}
                      </div>
                      <div className="contact-card__dept">
                        Senior Project Manager · Staff ID: #{selected.prjMgrId || '1626'}
                      </div>
                      <div className="contact-card__info">
                        <div className="contact-card__info-item">
                          <span>✉️</span>
                          <a href={`mailto:${selected.staffEmailId || 'atul.rastogi@nic.in'}`}>
                            {selected.staffEmailId || 'atul.rastogi@nic.in'}
                          </a>
                        </div>
                        <div className="contact-card__info-item">
                          <span>📞</span> +91-11-22900000 (Ext. {selected.prjMgrId || '1626'})
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                  <button className="btn btn-outline" onClick={downloadProjectDetails} style={{ fontWeight: 600, borderColor: '#006699', color: '#006699' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Full Detailed Report
                  </button>
                </div>
              </div>
            )}

            {/* Purchase Orders */}
            {activeTab === 'workorders' && (
              <div>
                <div className="sub-register-bar-header">
                  <div>
                    <h4 className="sub-register-title">Purchase Orders (POs)</h4>
                    <p className="detail-register__hint" style={{ margin: 0 }}>
                      Purchase Orders (POs) raised on empanelled vendors for this project, sourced live from the NICSI ERP PO register.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="count-pill">
                      Showing {filteredPos.length} of {detail.pos.length} POs
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${showPoFilters ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setShowPoFilters(prev => !prev)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                      </svg>
                      {showPoFilters ? 'Hide PO Filters' : 'Filter POs'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={exportPoCsv}
                      title="Export current PO register to CSV"
                      style={{ borderColor: '#28a745', color: '#28a745', fontWeight: 600 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Export CSV
                    </button>
                  </div>
                </div>

                {showPoFilters && (
                  <div className="sub-register-filter-panel">
                    <div className="sub-filter-grid">
                      <div className="sub-filter-item">
                        <label>Search PO / Vendor</label>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="PO No or Vendor Name..."
                          value={poFilter.search}
                          onChange={e => setPoFilter(prev => ({ ...prev, search: e.target.value }))}
                          autoComplete="off"
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Approval Status</label>
                        <select
                          className="glass-input"
                          value={poFilter.approvalStatus}
                          onChange={e => setPoFilter(prev => ({ ...prev, approvalStatus: e.target.value }))}
                        >
                          <option value="">All Statuses</option>
                          <option value="DISPATCHED">DISPATCHED</option>
                          <option value="APPROVED">APPROVED</option>
                          <option value="PENDING">PENDING</option>
                        </select>
                      </div>

                      <div className="sub-filter-item">
                        <label>Validity / Term</label>
                        <select
                          className="glass-input"
                          value={poFilter.termStatus}
                          onChange={e => setPoFilter(prev => ({ ...prev, termStatus: e.target.value }))}
                        >
                          <option value="">All PO Terms</option>
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="EXPIRED">EXPIRED</option>
                        </select>
                      </div>

                      <div className="sub-filter-item">
                        <label>PO Date From</label>
                        <input
                          type="date"
                          className="glass-input"
                          value={poFilter.dateFrom}
                          onChange={e => setPoFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>PO Date To</label>
                        <input
                          type="date"
                          className="glass-input"
                          value={poFilter.dateTo}
                          onChange={e => setPoFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Min PO Value (₹)</label>
                        <input
                          type="number"
                          className="glass-input"
                          placeholder="e.g. 100000"
                          value={poFilter.minAmount}
                          onChange={e => setPoFilter(prev => ({ ...prev, minAmount: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Max PO Value (₹)</label>
                        <input
                          type="number"
                          className="glass-input"
                          placeholder="e.g. 5000000"
                          value={poFilter.maxAmount}
                          onChange={e => setPoFilter(prev => ({ ...prev, maxAmount: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-actions">
                        <button
                          type="button"
                          className="btn-glass-clear"
                          onClick={() => setPoFilter({ search: '', approvalStatus: '', termStatus: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {detail.loading ? (
                  <div className="detail-register__empty">Loading Purchase Orders…</div>
                ) : detail.pos.length === 0 ? (
                  <div className="detail-register__empty">No Purchase Orders (POs) have been raised for this project.</div>
                ) : filteredPos.length === 0 ? (
                  <div className="detail-register__empty">
                    No Purchase Orders match your search & filter criteria.
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ marginLeft: 10, color: '#006699' }}
                      onClick={() => setPoFilter({ search: '', approvalStatus: '', termStatus: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                    >
                      Reset PO Filters
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table detail-table">
                      <thead>
                        <tr>
                          <th>PO Number</th>
                          <th>Vendor</th>
                          <th>PO Issue Date</th>
                          <th>PO Valid From / Until</th>
                          <th className="ta-r">PO Amount</th>
                          <th>Approval</th>
                          <th>Term Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPos.map((po: any) => {
                          const expired = po.todate && new Date(po.todate) < new Date();
                          return (
                            <tr key={po.headerId}>
                              <td><code className="proj-code-cell">{po.finalPoNo || po.poNo || '—'}</code></td>
                              <td>{po.vendorName || <span className="no-data">—</span>}</td>
                              <td>{po.poDate || '—'}</td>
                              <td style={{ fontSize: '0.8rem', color: '#555' }}>
                                {po.frdate || '?'} → {po.todate || '?'}
                              </td>
                              <td className="ta-r num-cell">{formatCurrencyFull(Number(po.total) || 0)}</td>
                              <td>
                                <span className={`badge badge-${po.approvalStatus === 'APPROVED' || po.approvalStatus === 'DISPATCHED' ? 'success' : 'warning'}`}>
                                  {po.approvalStatus || 'DISPATCHED'}
                                </span>
                              </td>
                              <td>
                                <span className={`expiry-badge ${expired ? 'expiry-badge--expired' : 'expiry-badge--active'}`}>
                                  {expired ? 'EXPIRED' : 'ACTIVE'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bill Desk */}
            {activeTab === 'billdesk' && (
              <div>
                <div className="sub-register-bar-header">
                  <div>
                    <h4 className="sub-register-title">Bill Desk Invoices</h4>
                    <p className="detail-register__hint" style={{ margin: 0 }}>
                      Vendor expenditure bills processed through the NICSI Bill Desk against this project's Purchase Orders (POs).
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="count-pill">
                      Showing {filteredBills.length} of {detail.bills.length} Bills
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${showBillFilters ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setShowBillFilters(prev => !prev)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                      </svg>
                      {showBillFilters ? 'Hide Invoice Filters' : 'Filter Invoices'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={exportBillDeskCsv}
                      title="Export current Bill Desk invoices to CSV"
                      style={{ borderColor: '#28a745', color: '#28a745', fontWeight: 600 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Export CSV
                    </button>
                  </div>
                </div>

                {showBillFilters && (
                  <div className="sub-register-filter-panel">
                    <div className="sub-filter-grid">
                      <div className="sub-filter-item">
                        <label>Search Invoice / Vendor</label>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="Invoice No or Vendor Name..."
                          value={billFilter.search}
                          onChange={e => setBillFilter(prev => ({ ...prev, search: e.target.value }))}
                          autoComplete="off"
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Payment Status</label>
                        <select
                          className="glass-input"
                          value={billFilter.status}
                          onChange={e => setBillFilter(prev => ({ ...prev, status: e.target.value }))}
                        >
                          <option value="">All Statuses</option>
                          <option value="PAID">PAID / PAYMENT DONE</option>
                          <option value="PENDING">PENDING PAYMENT</option>
                          <option value="OBJECTION">OBJECTION RAISED</option>
                        </select>
                      </div>

                      <div className="sub-filter-item">
                        <label>Invoice Date From</label>
                        <input
                          type="date"
                          className="glass-input"
                          value={billFilter.dateFrom}
                          onChange={e => setBillFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Invoice Date To</label>
                        <input
                          type="date"
                          className="glass-input"
                          value={billFilter.dateTo}
                          onChange={e => setBillFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Min Invoice Amt (₹)</label>
                        <input
                          type="number"
                          className="glass-input"
                          placeholder="e.g. 50000"
                          value={billFilter.minAmount}
                          onChange={e => setBillFilter(prev => ({ ...prev, minAmount: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Max Invoice Amt (₹)</label>
                        <input
                          type="number"
                          className="glass-input"
                          placeholder="e.g. 1000000"
                          value={billFilter.maxAmount}
                          onChange={e => setBillFilter(prev => ({ ...prev, maxAmount: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label className="glass-switch-label" style={{ fontSize: '0.85rem', marginTop: '1.4rem' }}>
                          <div className="glass-switch" style={{ width: '38px', height: '20px' }}>
                            <input
                              type="checkbox"
                              checked={billFilter.objectionOnly}
                              onChange={e => setBillFilter(prev => ({ ...prev, objectionOnly: e.target.checked }))}
                            />
                            <span className="slider round"></span>
                          </div>
                          <span className="toggle-text">Only Objections</span>
                        </label>
                      </div>

                      <div className="sub-filter-actions">
                        <button
                          type="button"
                          className="btn-glass-clear"
                          onClick={() => setBillFilter({ search: '', status: '', objectionOnly: false, dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {detail.loading ? (
                  <div className="detail-register__empty">Loading Bill Desk invoices…</div>
                ) : detail.bills.length === 0 ? (
                  <div className="detail-register__empty">No Bill Desk invoices recorded for this project.</div>
                ) : filteredBills.length === 0 ? (
                  <div className="detail-register__empty">
                    No Bill Desk invoices match your search & filter criteria.
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ marginLeft: 10, color: '#006699' }}
                      onClick={() => setBillFilter({ search: '', status: '', objectionOnly: false, dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                    >
                      Reset Invoice Filters
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table detail-table">
                      <thead>
                        <tr>
                          <th>Invoice No</th>
                          <th>Vendor</th>
                          <th>Invoice Date</th>
                          <th>Received</th>
                          <th className="ta-r">Invoice Value Submitted</th>
                          <th className="ta-r">Amount Paid</th>
                          <th className="ta-r">Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBills.map((b: any) => {
                          const amt = Number(b.invoiceAmount) || 0;
                          const paid = Number(b.amountPaid) || 0;
                          const bal = Math.max(0, amt - paid);
                          return (
                            <tr key={b.headerId} title={b.objectionRemarks || ''}>
                              <td><code className="proj-code-cell">{b.invoiceNum || b.invoiceNo || '—'}</code></td>
                              <td>{b.vendorName || <span className="no-data">—</span>}</td>
                              <td>{b.invoiceDate || '—'}</td>
                              <td>{b.receivedDate || '—'}</td>
                              <td className="ta-r num-cell">{formatCurrencyFull(amt)}</td>
                              <td className="ta-r num-cell num-cell--paid">{formatCurrencyFull(paid)}</td>
                              <td className="ta-r num-cell num-cell--pending">{bal > 0 ? formatCurrencyFull(bal) : '—'}</td>
                              <td>
                                {b.objectionRemarks
                                  ? <span className="badge badge-danger" title={b.objectionRemarks}>OBJECTION</span>
                                  : <span className={`badge badge-${bal === 0 && amt > 0 ? 'success' : 'warning'}`}>{b.status || (bal === 0 ? 'PAID' : 'PENDING')}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* GST Tax Invoices */}
            {activeTab === 'taxinvoices' && (
              <div>
                <div className="sub-register-bar-header">
                  <div>
                    <h4 className="sub-register-title">GST Tax Invoices</h4>
                    <p className="detail-register__hint" style={{ margin: 0 }}>
                      GST tax invoices raised by NICSI on the client.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="count-pill">
                      Showing {filteredTaxInvoices.length} of {detail.taxInv.length} Tax Invoices
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${showTaxInvFilters ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setShowTaxInvFilters(prev => !prev)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                      </svg>
                      {showTaxInvFilters ? 'Hide Tax Inv Filters' : 'Filter Tax Invoices'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={exportTaxInvoiceCsv}
                      title="Export current GST Tax Invoices to CSV"
                      style={{ borderColor: '#28a745', color: '#28a745', fontWeight: 600 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Export CSV
                    </button>
                  </div>
                </div>

                {showTaxInvFilters && (
                  <div className="sub-register-filter-panel">
                    <div className="sub-filter-grid">
                      <div className="sub-filter-item">
                        <label>Search Bill No / IRN</label>
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="Bill No or IRN No..."
                          value={taxInvFilter.search}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, search: e.target.value }))}
                          autoComplete="off"
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Bill Status</label>
                        <select
                          className="glass-input"
                          value={taxInvFilter.status}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, status: e.target.value }))}
                        >
                          <option value="">All Statuses</option>
                          <option value="FINAL">FINAL</option>
                          <option value="APPROVED">APPROVED</option>
                          <option value="PENDING">PENDING</option>
                        </select>
                      </div>

                      <div className="sub-filter-item">
                        <label>IRN Status</label>
                        <select
                          className="glass-input"
                          value={taxInvFilter.irnStatus}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, irnStatus: e.target.value }))}
                        >
                          <option value="">All IRN Statuses</option>
                          <option value="GENERATED">IRN Generated</option>
                          <option value="PENDING">Not Generated / Pending</option>
                        </select>
                      </div>

                      <div className="sub-filter-item">
                        <label>Bill Date From</label>
                        <input
                          type="date"
                          className="glass-input"
                          value={taxInvFilter.dateFrom}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Bill Date To</label>
                        <input
                          type="date"
                          className="glass-input"
                          value={taxInvFilter.dateTo}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Min Total (₹)</label>
                        <input
                          type="number"
                          className="glass-input"
                          placeholder="e.g. 10000"
                          value={taxInvFilter.minAmount}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, minAmount: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-item">
                        <label>Max Total (₹)</label>
                        <input
                          type="number"
                          className="glass-input"
                          placeholder="e.g. 500000"
                          value={taxInvFilter.maxAmount}
                          onChange={e => setTaxInvFilter(prev => ({ ...prev, maxAmount: e.target.value }))}
                        />
                      </div>

                      <div className="sub-filter-actions">
                        <button
                          type="button"
                          className="btn-glass-clear"
                          onClick={() => setTaxInvFilter({ search: '', status: '', irnStatus: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {detail.loading ? (
                  <div className="detail-register__empty">Loading GST tax invoices…</div>
                ) : detail.taxInv.length === 0 ? (
                  <div className="detail-register__empty">No GST tax invoices raised for this project.</div>
                ) : filteredTaxInvoices.length === 0 ? (
                  <div className="detail-register__empty">
                    No GST tax invoices match your search & filter criteria.
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      style={{ marginLeft: 10, color: '#006699' }}
                      onClick={() => setTaxInvFilter({ search: '', status: '', irnStatus: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                    >
                      Reset Tax Invoice Filters
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table detail-table">
                      <thead>
                        <tr>
                          <th>Bill No</th>
                          <th>Bill Date</th>
                          <th>Billing Period</th>
                          <th className="ta-r">Tax Invoice Value</th>
                          <th>IRN</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTaxInvoices.map((t: any) => {
                          return (
                            <tr key={t.headerId}>
                              <td><code className="proj-code-cell">{t.userBillNo || '—'}</code></td>
                              <td>{t.billDate || '—'}</td>
                              <td style={{ fontSize: '0.8rem', color: '#555' }}>
                                {t.billingPeriodFrom || '?'} → {t.billingPeriodTo || '?'}
                              </td>
                              <td className="ta-r num-cell num-cell--primary">{formatCurrencyFull(Number(t.totalAmount) || 0)}</td>
                              <td style={{ fontSize: '0.72rem', color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.irnNo || ''}>
                                {t.irnNo ? t.irnNo : <span className="no-data">Not generated</span>}
                              </td>
                              <td>
                                <span className={`badge badge-${t.billStatus === 'APPROVED' || t.billStatus === 'PAID' ? 'success' : 'warning'}`}>
                                  {t.billStatus || 'PENDING'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Actions & Notices */}
            {activeTab === 'actions' && (() => {
              const showVendorReminder = !!selected.recommendVendorReminder;
              const showVendorPaymentNotice = !!selected.recommendVendorPaymentNotice;
              const showGovtFundRequest = !!selected.recommendGovtFundRequest;
              const noActionNeeded = !showVendorReminder && !showVendorPaymentNotice && !showGovtFundRequest;

              return (
                <div style={{ padding: '1rem', display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                  <h4>Generate Official Notices</h4>
                  <p style={{ fontSize: '0.9rem', color: '#666' }}>
                    Notice options below are shown dynamically — only actions that match this project's
                    current billing and cash-hold state appear.
                  </p>

                  {noActionNeeded ? (
                    <div className="detail-register__empty" style={{ textAlign: 'left' }}>
                      No notice is required right now: the vendor has billed and been paid in full
                      (or has no outstanding PO), and NICSI's cash hold is healthy (≥ 20% of the PO value,
                      or nothing is currently owed to the vendor).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {(selected.expiryStatus === 'EXPIRED' || selected.expiryStatus === 'EXPIRING_SOON') && (
                        <button className="btn btn-outline" style={{ borderColor: '#d97706', color: '#d97706', fontWeight: 700 }} onClick={() => generateNotice(selected, 'PO_EXPIRY')} title="Generate official notice requesting PO validity extension / renewal sanction order from client.">
                          📋 Send PO Expiry &amp; Extension Notice
                        </button>
                      )}
                      {showVendorReminder && (
                        <button className="btn btn-outline" onClick={() => generateNotice(selected, 'VENDOR_REMINDER')} title="An active PO exists but the vendor has not submitted any bill yet.">
                          Remind Vendor to Submit Bill
                        </button>
                      )}
                      {showVendorPaymentNotice && (
                        <button className="btn btn-primary" onClick={() => generateNotice(selected, 'VENDOR')} title="The vendor has submitted a bill that NICSI has not fully paid yet.">
                          Send Notice to Vendor (Pending Bills)
                        </button>
                      )}
                      {showGovtFundRequest && (
                        <button className="btn btn-outline" style={{ borderColor: '#8a1515', color: '#8a1515' }} onClick={() => generateNotice(selected, 'CLIENT')} title="NICSI's cash hold has dropped below 20% of the outstanding vendor commitment.">
                          Request Govt/Client (Low NICSI Hold)
                        </button>
                      )}
                    </div>
                  )}

                  {typeof selected.nicsiHoldPercentage === 'number' && (
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                      NICSI Hold: {selected.nicsiHoldPercentage.toFixed(1)}% of PO value
                      {selected.vendorAmountPending ? ` · Vendor amount pending: ${formatCurrency(selected.vendorAmountPending)}` : ''}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Notice Generator Modal */}
        {noticeModal && noticeModal.open && (
          <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setNoticeModal(null)}>
            <div className="detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '840px' }}>
              <div className="detail-modal__header" style={{ borderBottom: 'none' }}>
                <div className="detail-modal__title-row">
                  <h3 style={{ margin: 0 }}>{noticeModal.title}</h3>
                  <button className="modal-close-btn" onClick={() => setNoticeModal(null)}>✕</button>
                </div>
              </div>
              <div className="detail-modal__body">
                <div style={{ background: '#f8f9fa', padding: '12px 16px', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid #cbd5e1' }}>
                  <strong style={{ whiteSpace: 'nowrap' }}>Send To Email:</strong>
                  <input 
                    type="email" 
                    value={noticeModal.toEmail} 
                    onChange={e => setNoticeModal({...noticeModal, toEmail: e.target.value})}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' }}
                    placeholder="Enter vendor or client email address..."
                  />
                </div>

                {/* Dynamic Bifurcation Controls (For Government/Client Fund Request Notices) */}
                {(noticeModal.noticeType === 'CLIENT' || noticeModal.noticeType === 'GOVT') && noticeModal.project && (
                  <div style={{ background: '#eef6ff', border: '1px solid #b8d9f8', padding: '12px 16px', borderRadius: '6px', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#003366', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      Official Bifurcation Attachments (Include when requested by Government):
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
                        <input 
                          type="checkbox"
                          checked={!!noticeModal.includePoBreakdown}
                          onChange={(e) => {
                            const newPo = e.target.checked;
                            const newBill = !!noticeModal.includeBillBreakdown;
                            generateNotice(noticeModal.project, noticeModal.noticeType as any, newPo, newBill);
                          }}
                          style={{ width: '16px', height: '16px', accentColor: '#003366', cursor: 'pointer' }}
                        />
                        <span>Attach <strong>Itemized PO Bifurcation Schedule</strong> (Annexure A)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
                        <input 
                          type="checkbox"
                          checked={!!noticeModal.includeBillBreakdown}
                          onChange={(e) => {
                            const newPo = !!noticeModal.includePoBreakdown;
                            const newBill = e.target.checked;
                            generateNotice(noticeModal.project, noticeModal.noticeType as any, newPo, newBill);
                          }}
                          style={{ width: '16px', height: '16px', accentColor: '#003366', cursor: 'pointer' }}
                        />
                        <span>Attach <strong>Itemized Expenditure Bills Schedule</strong> (Annexure B)</span>
                      </label>
                    </div>
                  </div>
                )}

                <div style={{ border: '1px solid #ddd', padding: '1.5rem', borderRadius: '8px', background: '#fff', maxHeight: '520px', overflowY: 'auto' }} 
                     dangerouslySetInnerHTML={{ __html: noticeModal.content }}>
                </div>
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button className="btn btn-ghost" onClick={() => setNoticeModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={dispatchEmail}>
                    Dispatch Email 🚀
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="projects-page page-container">
      {/* Impersonation / PM Portfolio Drill-down Header */}
      {(onBackToRoster || (user?.role === 'MD' && scopedPrjMgrId != null)) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #003366, #00509d)', color: '#fff',
          borderRadius: '10px', padding: '0.9rem 1.25rem', marginBottom: '1.25rem',
          boxShadow: '0 4px 12px rgba(0,51,102,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#fff', color: '#003366', fontWeight: 700, border: 'none', cursor: 'pointer' }}
              onClick={onBackToRoster || (() => window.history.back())}
            >
              ← Back to PM Roster
            </button>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800 }}>
                Viewing Portfolio as Project Manager: {pmInfo?.fullName || `PM #${scopedPrjMgrId}`}
                {pmInfo?.zone && (
                  <span style={{ marginLeft: 8, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.2)' }}>
                    {pmInfo.zone}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                Full PM access &amp; control mode · Showing projects, financial holds &amp; PO sub-registers for {pmInfo?.fullName || `ID #${scopedPrjMgrId}`}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', background: 'rgba(255,255,255,0.15)', borderRadius: 6 }}>
            MD Control Override Mode
          </div>
        </div>
      )}

      {/* Header */}
      <div className="projects-header">
        <div>
          <h2 className="projects-title">
            {user?.role === 'PM' ? 'My Project Portfolio' : user?.role === 'MD' ? 'Team Projects Registry' : 'Project Dynamic Registry'}
          </h2>
          <p className="projects-subtitle">
            {user?.role === 'PM' 
              ? 'Manage and monitor your assigned projects' 
              : user?.role === 'MD' 
                ? 'Organizational overview of projects managed by your team' 
                : 'Live ERP Data Connection · Formatted Notices · Dynamic Filters'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>Export CSV</button>
          <div className="pl-count-badge">{totalCount} Projects Found</div>
        </div>
      </div>

      {/* Server-confirmed scope banner — reflects what the backend actually
          enforced, not a client-side guess. */}
      {scopeInfo && !scopeInfo.unrestricted && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: '#eef6ff', border: '1px solid #cfe3fb', borderRadius: 8,
          padding: '0.65rem 1rem', fontSize: '0.8125rem', color: '#0b4a8f', marginBottom: '1rem',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>
            <strong>Scoped view (enforced server-side):</strong>{' '}
            {scopeInfo.role === 'PM'
              ? 'showing only your own projects.'
              : 'showing only the Project Managers provisioned under you.'}
          </span>
        </div>
      )}
      {loadError && (
        <div style={{
          background: '#fde8e8', color: '#8a1515', borderRadius: 8, border: '1px solid #f5c2c7',
          padding: '0.75rem 1rem', fontSize: '0.875rem', marginBottom: '1rem', fontWeight: 600,
        }}>
          ⚠ {loadError}
        </div>
      )}

      {/* Global Dashboard KPIs for Advanced Monitoring */}
      <div className="quick-stats-grid" style={{ marginBottom: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
        <div className="quick-stat" style={{ background: '#f8fafe', border: '1px solid #e1e9fb', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          <div className="quick-stat__val" style={{ color: '#003366', fontSize: '1.15rem', fontWeight: 800 }}>{formatCurrencyFull(kpis.totalReceived)}</div>
          <div className="quick-stat__label" style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Filtered Client Paid</div>
        </div>
        <div className="quick-stat" style={{ background: '#fdfaee', border: '1px solid #f6ecc6', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          <div className="quick-stat__val" style={{ color: '#b58500', fontSize: '1.15rem', fontWeight: 800 }}>{formatCurrencyFull(kpis.totalPo)}</div>
          <div className="quick-stat__label" style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Filtered PO Amount</div>
        </div>
        <div className="quick-stat" style={{ background: '#eefcf1', border: '1px solid #cbf6d8', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          <div className="quick-stat__val" style={{ color: '#28A745', fontSize: '1.15rem', fontWeight: 800 }}>{formatCurrencyFull(kpis.totalCommission)}</div>
          <div className="quick-stat__label" style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total NICSI Retained (Base+GST)</div>
        </div>
        <div className="quick-stat" style={{ background: '#fdf0f0', border: '1px solid #f9d3d3', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          <div className="quick-stat__val" style={{ color: '#DC3545', fontSize: '1.15rem', fontWeight: 800 }}>{formatCurrencyFull(kpis.totalVendorPending)}</div>
          <div className="quick-stat__label" style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Filtered Vendor Pending</div>
        </div>
      </div>

      {/* Active Filter Banner */}
      {(filters.expiryStatus || filters.financialStatus || filters.hasVendorBilled || filters.hasExpBills || filters.hasPOs || filters.hasInvoiced || filters.search) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f0f4f8', border: '1px solid #d0dbe5', borderRadius: 8,
          padding: '0.65rem 1rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 700, color: '#003366' }}>Active Filter:</span>
            {filters.expiryStatus && (
              <span className="chip chip--orange" style={{ background: '#fff0e6', color: '#cc5200', border: '1px solid #ffccb3' }}>
                PO Expiry: <strong>{filters.expiryStatus}</strong>
              </span>
            )}
            {filters.financialStatus && (
              <span className="chip chip--navy" style={{ background: '#e6f0fa', color: '#004080', border: '1px solid #b3d1ff' }}>
                Payment Status: <strong>{filters.financialStatus}</strong>
              </span>
            )}
            {filters.hasVendorBilled && (
              <span className="chip chip--teal" style={{ background: '#e6f7ff', color: '#006699', border: '1px solid #99ddff' }}>
                Bill Desk Invoices Only
              </span>
            )}
            {filters.hasExpBills && (
              <span className="chip chip--green" style={{ background: '#e6ffe6', color: '#198754', border: '1px solid #b3ffb3' }}>
                Exp. Bills Processed Only
              </span>
            )}
            {filters.hasPOs && (
              <span className="chip chip--navy" style={{ background: '#f0e6ff', color: '#6600cc', border: '1px solid #d9b3ff' }}>
                POs Issued Only
              </span>
            )}
            {filters.hasInvoiced && (
              <span className="chip chip--teal" style={{ background: '#e6f2ff', color: '#0052cc', border: '1px solid #99c2ff' }}>
                Invoiced Projects Only
              </span>
            )}
            {filters.search && (
              <span className="chip" style={{ background: '#f5f5f5', color: '#333', border: '1px solid #ddd' }}>
                Search: "{filters.search}"
              </span>
            )}
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleClearFilters} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
            Clear Filter (Show All Projects)
          </button>
        </div>
      )}

      {/* Advanced Glassmorphism Filters */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
         <button className="btn btn-outline" onClick={() => setShowFilters(!showFilters)}>
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px', verticalAlign: 'text-bottom'}}>
             <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
           </svg>
           {showFilters ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
         </button>
      </div>
      {showFilters && (
        <AdvancedFilters
          filters={filters}
          setFilters={setFilters}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        />
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project Code</th>
                <th style={{ minWidth: 200 }}>Department / Customer</th>
                <th>State</th>
                <th>PO Expiry</th>
                {user?.role !== 'PM' && <th>Project Manager</th>}
                <th>Project Funds Received</th>
                <th style={{ background: '#1a3d6e' }}>NICSI Service Charge</th>
                <th style={{ background: '#0f294a', textAlign: 'center' }}>Total POs</th>
                <th>Total PO Value</th>
                <th>Amount Paid</th>
                <th>Bills Submitted</th>
                <th>Financial Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={user?.role === 'PM' ? 12 : 13} style={{ textAlign: 'center', padding: '2rem' }}>Loading dynamic ERP data...</td></tr>
              ) : projects.length === 0 ? (
                <tr><td colSpan={user?.role === 'PM' ? 12 : 13} style={{ textAlign: 'center', padding: '3rem' }}>No projects match your advanced filters.</td></tr>
              ) : projects.map(p => {
                const penaltyFines = p.totalPenaltyAmt || 0;
                const effectivePo = Math.max(0, (p.poAmount || 0) - penaltyFines);
                const vendorPending = Math.max(0, effectivePo - (p.totalAmountPaid || 0));
                const stateCode = extractStateCode(p.projectCode);
                const expiryStatus = (p as any).expiryStatus;
                return (
                  <tr key={p.headerId} className={`table-row-hover ${expiryStatus === 'EXPIRED' ? 'table-row-expired' : ''}`} style={{ cursor: 'pointer' }} onClick={() => handleSelectProject(p, 'overview')}>
                    <td><code className="proj-code-cell">{p.projectCode}</code></td>
                    <td>
                      <div className="org-cell">
                        <div className="org-cell__name">{p.customerName}</div>
                      </div>
                    </td>
                    <td><span className="state-cell">{STATE_MAP[stateCode] || stateCode}</span></td>
                    <td>
                      {(() => {
                        const expiry = (p as any).expiryStatus;
                        const poEnd = (p as any).poEndDate;
                        if (expiry === 'EXPIRED') {
                          return (
                            <span className="expiry-badge expiry-badge--expired" title={poEnd ? `PO ended: ${poEnd}` : 'PO expired'}>
                              EXPIRED
                            </span>
                          );
                        }
                        if (expiry === 'EXPIRING_SOON') {
                          return (
                            <span className="expiry-badge expiry-badge--warning" title={poEnd ? `PO ends: ${poEnd}` : 'Expiring soon'}>
                              EXPIRING
                            </span>
                          );
                        }
                        if (expiry === 'NO_PO') {
                          return <span className="expiry-badge expiry-badge--nopo">NO PO</span>;
                        }
                        return (
                          <span className="expiry-badge expiry-badge--active" title={poEnd ? `PO ends: ${poEnd}` : ''}>
                            ACTIVE
                          </span>
                        );
                      })()}
                    </td>
                    {user?.role !== 'PM' && (
                      <td style={{ fontSize: '0.8rem', color: '#003366', fontWeight: 600 }}>
                        {(p as any).prjMgrName || (p.prjMgrId ? `Atul Rastogi (PM #${p.prjMgrId})` : 'Atul Rastogi')}
                      </td>
                    )}
                    <td className="num-cell num-cell--primary">{formatCurrency(p.amountReceived)}</td>
                    <td className="commission-cell">
                      <div className="commission-cell__amt">{formatCurrency(p.nicsiCommission)}</div>
                      <div className="commission-cell__pct">
                        {(() => {
                           if (!p.amountReceived) return '0%';
                           const pct = p.nicsiCommission / p.amountReceived;
                           const diff5 = Math.abs(pct - 0.05);
                           const diff7 = Math.abs(pct - 0.07);
                           const diff9 = Math.abs(pct - 0.09);
                           if (diff5 <= diff7 && diff5 <= diff9) return '5%';
                           if (diff9 <= diff5 && diff9 <= diff7) return '9%';
                           return '7%';
                        })()}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        className="po-count-btn" 
                        style={{
                          background: p.noOfPo ? '#eef6ff' : '#f8f9fa',
                          color: p.noOfPo ? '#004d99' : '#888',
                          border: p.noOfPo ? '1px solid #b8d9f8' : '1px solid #ddd',
                          borderRadius: '16px',
                          padding: '3px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectProject(p, 'workorders');
                        }}
                        title={p.noOfPo ? `Click to view ${p.noOfPo} Purchase Order(s) in full page view` : 'Click to view POs'}
                      >
                        {p.noOfPo || 0} {p.noOfPo === 1 ? 'PO' : 'POs'}
                      </button>
                    </td>
                    <td className="num-cell" style={{ color: '#006699' }}>
                      {effectivePo > 0 ? formatCurrency(effectivePo) : <span className="no-data">No PO</span>}
                    </td>
                    <td className="num-cell num-cell--paid">
                      {p.totalAmountPaid > 0 ? formatCurrency(p.totalAmountPaid) : <span className="no-data">—</span>}
                    </td>
                    <td className="num-cell num-cell--pending">
                      {vendorPending > 0 ? formatCurrency(vendorPending) : <span className="no-data">—</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${p.financialStatus === 'PROFIT' ? 'success' : p.financialStatus === 'LOSS' ? 'danger' : 'warning'}`}>
                        {p.financialStatus}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); handleSelectProject(p, 'overview'); }}>
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="table-pagination">
            <span className="pagination-info">Page {page + 1} of {totalPages}</span>
            <div className="pagination-buttons">
              <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(0)}>« First</button>
              <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
              <button className="btn btn-ghost btn-sm" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
