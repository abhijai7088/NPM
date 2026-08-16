import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, LabelList, ComposedChart, Line } from 'recharts';
import { formatCurrency, formatCurrencyFull, STATE_MAP, computeGst } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import './FinancePage.css';

type ViewMode = 'summary' | 'commission' | 'vendor' | 'invoices' | 'poRegister' | 'billDesk' | 'taxInvoices';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        borderRadius: '8px',
        padding: '12px 16px',
        color: '#003366',
        fontFamily: "'Inter', sans-serif"
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.9rem', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ margin: '4px 0', color: entry.color, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span>{entry.name}:</span>
            <span style={{ fontWeight: 600 }}>
              {entry.name === 'NICSI Service Charge' && entry.payload.pct 
                ? `₹${Number(entry.value).toFixed(2)}L (${entry.payload.pct}%)` 
                : `₹${Number(entry.value).toFixed(2)}L`}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

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

export const FinancePage: React.FC = () => {
  const { user } = useAuthStore();
  // RBAC scope: PM sees only their own finance data; MD sees only the data of
  // Project Managers they've provisioned; Super Admin sees everything.
  const pmScope = user?.role === 'PM' && user?.prjMgrId
    ? `&prjMgrId=${user.prjMgrId}`
    : (user?.role === 'MD' ? `&managedBy=${encodeURIComponent(user?.username || '')}` : '');
  const [view, setView] = useState<ViewMode>('summary');
  const [search, setSearch] = useState('');
  const [sortCommissionDesc, setSortCommissionDesc] = useState(true);
  const [sortInvoiceDesc, setSortInvoiceDesc] = useState(true);
  // New inline chart filters
  const [utilizationSort, setUtilizationSort] = useState<'top' | 'bottom' | 'unused'>('top');
  const [duesSort, setDuesSort] = useState<'top10' | 'top20'>('top10');
  const [stateChartSort, setStateChartSort] = useState<'top' | 'bottom'>('top');
  
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<{poData: any[], billDeskData: any[], taxInvData: any[], loading: boolean}>({ poData: [], billDeskData: [], taxInvData: [], loading: false });
  const [activeModalTab, setActiveModalTab] = useState<'overview' | 'pos' | 'billdesk' | 'tax'>('overview');

  const openProjectModal = (project: any, initialTab: 'overview' | 'pos' | 'billdesk' | 'tax' = 'overview') => {
    setActiveModalTab(initialTab);
    setSelectedProject(project);
  };
  const [filterMode, setFilterMode] = useState<'ALL' | 'PENDING' | 'CLEARED' | 'HIGH_VALUE'>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');

  // ── Section-Specific Filter States for Finance Register Views ──
  // 1. Service Charge Register
  const [showServiceFilters, setShowServiceFilters] = useState(false);
  const [serviceFilter, setServiceFilter] = useState({
    search: '',
    rateTier: '',
    financialStatus: '',
    minCommission: '',
    maxCommission: '',
  });

  // 2. Vendor Ledger
  const [showVendorFilters, setShowVendorFilters] = useState(false);
  const [vendorFilter, setVendorFilter] = useState({
    search: '',
    paymentStatus: '',
    progressTier: '',
    minDues: '',
    maxDues: '',
  });

  // 3. Invoice Register
  const [showInvoiceRegFilters, setShowInvoiceRegFilters] = useState(false);
  const [invoiceRegFilter, setInvoiceRegFilter] = useState({
    search: '',
    paymentStatus: '',
    expStatus: '',
    minInvoiced: '',
    maxInvoiced: '',
  });

  // 4. PO Register
  const [showPoRegFilters, setShowPoRegFilters] = useState(false);
  const [poRegFilter, setPoRegFilter] = useState({
    search: '',
    approvalStatus: '',
    expiryStatus: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  // 5. BillDesk Register
  const [showBdRegFilters, setShowBdRegFilters] = useState(false);
  const [bdRegFilter, setBdRegFilter] = useState({
    search: '',
    status: '',
    objectionOnly: false,
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  // 6. Tax Invoices Register
  const [showTiRegFilters, setShowTiRegFilters] = useState(false);
  const [tiRegFilter, setTiRegFilter] = useState({
    search: '',
    status: '',
    irnStatus: '',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });
  
  const [apiProjects, setApiProjects] = useState<any[]>([]);
  const [poData, setPoData] = useState<any[]>([]);
  const [billDeskData, setBillDeskData] = useState<any[]>([]);
  const [taxInvData, setTaxInvData] = useState<any[]>([]);
  const [poPage, setPoPage] = useState(0);
  const [poTotal, setPoTotal] = useState(0);
  const [bdPage, setBdPage] = useState(0);
  const [bdTotal, setBdTotal] = useState(0);
  const [tiPage, setTiPage] = useState(0);
  const [tiTotal, setTiTotal] = useState(0);
  const [apiStats, setApiStats] = useState({
    totalAmountReceived: 0,
    totalABP: 0,
    totalClientPending: 0,
    totalCommission: 0,
    totalPOAmount: 0,
    totalPOs: 0,
    totalPaid: 0,
    totalVendorPending: 0,
    totalInvoiced: 0,
    totalExpInvoices: 0,
    totalTaxInvoices: 0,
    totalBillDeskInvoices: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/v1/projects/advanced-search?page=0&size=200${pmScope}`)
      .then(res => {
        if (res.data.success) {
          const projs = res.data.data;
          
          let totalPOs = 0, totalBillDesk = 0, totalExp = 0, totalTaxInvoices = 0;
          let totalABP = 0, totalInvoiced = 0, totalPaid = 0;

          const mappedProjs = projs.map((p: any) => {
            const noOfPo = p.noOfPo || 0;
            const projectAbp = p.projectAbp || p.amountReceived || 0;
            
            totalPOs += noOfPo;
            totalBillDesk += p.noOfInvBilldesk || 0;
            totalExp += p.noOfExpInvoice || 0;
            totalTaxInvoices += p.noOfTaxInvoice || 0;
            totalABP += projectAbp;
            totalInvoiced += p.totalInvoiceAmount || 0;
            totalPaid += p.totalAmountPaid || 0;

            let vendorPendingPayment = 0;
            let vendorUtilPct = 0;
            const penaltyFines = p.totalPenaltyAmt || 0;
            const effectivePoAmount = Math.max(0, (p.poAmount || 0) - penaltyFines);

            if (effectivePoAmount > 0) {
              vendorPendingPayment = effectivePoAmount - (p.totalAmountPaid || 0);
              vendorUtilPct = Math.round(((p.totalAmountPaid || 0) / effectivePoAmount) * 100);
            }
            
            let paymentStatus = 'pending';
            if (effectivePoAmount > 0 && (p.totalAmountPaid || 0) >= effectivePoAmount) paymentStatus = 'cleared';
            else if ((p.totalAmountPaid || 0) > 0) paymentStatus = 'partial';
            
            let stateCode = 'NA';
            if (p.projectCode) {
              const match = p.projectCode.match(/ZO([A-Z]{2})/);
              if (match) stateCode = match[1];
            }

            return {
              ...p,
              noOfPO: noOfPo,
              projectABP: projectAbp,
              commissionPct: p.commissionPercentage || 0,
              totalPenaltyAmt: penaltyFines,
              effectivePoAmount: effectivePoAmount,
              vendorPendingPayment: Math.max(0, vendorPendingPayment),
              vendorUtilPct,
              paymentStatus,
              stateCode: STATE_MAP[stateCode] || stateCode
            };
          });

          setApiProjects(mappedProjs);
          
          const kpis = res.data.kpis || {};
          
          setApiStats({
            totalAmountReceived: kpis.totalReceived || 0,
            totalCommission: kpis.totalCommission || 0,
            totalPOAmount: kpis.totalPo || 0,
            totalPaid: totalPaid,
            totalVendorPending: kpis.totalVendorPending || 0,
            totalPOs,
            totalBillDeskInvoices: totalBillDesk,
            totalExpInvoices: totalExp,
            totalTaxInvoices,
            totalInvoiced,
            totalABP,
            totalClientPending: Math.max(0, totalABP - (kpis.totalReceived || 0))
          });
        }
      })
      .catch(err => {
        console.error("Error fetching finance data", err);
        if (err?.response?.status === 403) {
          setLoadError(err?.response?.data?.message || 'You are not authorised to view this financial data.');
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.username, user?.prjMgrId]);

  // Fetch PO data when poRegister tab is active
  useEffect(() => {
    if (view === 'poRegister') {
      axios.get(`/api/v1/finance/purchase-orders?page=${poPage}&size=50${pmScope}`)
        .then(res => {
          if (res.data.success) {
            setPoData(res.data.data);
            setPoTotal(res.data.total);
          }
        })
        .catch(err => console.error("Error fetching PO data", err));
    }
  }, [view, poPage]);

  // Fetch BillDesk data when billDesk tab is active
  useEffect(() => {
    if (view === 'billDesk') {
      axios.get(`/api/v1/finance/bill-desk?page=${bdPage}&size=50${pmScope}`)
        .then(res => {
          if (res.data.success) {
            setBillDeskData(res.data.data);
            setBdTotal(res.data.total);
          }
        })
        .catch(err => console.error("Error fetching BillDesk data", err));
    }
  }, [view, bdPage]);

  // Fetch Tax Invoice data when taxInvoices tab is active
  useEffect(() => {
    if (view === 'taxInvoices') {
      axios.get(`/api/v1/finance/tax-invoices?page=${tiPage}&size=50${pmScope}`)
        .then(res => {
          if (res.data.success) {
            setTaxInvData(res.data.data);
            setTiTotal(res.data.total);
          }
        })
        .catch(err => console.error("Error fetching Tax Invoice data", err));
    }
  }, [view, tiPage]);

  // Fetch detailed data when a project is selected
  useEffect(() => {
    if (selectedProject?.projectCode) {
      setSelectedProjectDetails(prev => ({ ...prev, loading: true }));
      const pCode = selectedProject.projectCode;
      Promise.all([
        axios.get(`/api/v1/finance/purchase-orders/by-project/${pCode}`),
        axios.get(`/api/v1/finance/bill-desk/by-project/${pCode}`),
        axios.get(`/api/v1/finance/tax-invoices/by-project/${pCode}`)
      ]).then(([poRes, bdRes, tiRes]) => {
        setSelectedProjectDetails({
          poData: poRes.data.success ? poRes.data.data : [],
          billDeskData: bdRes.data.success ? bdRes.data.data : [],
          taxInvData: tiRes.data.success ? tiRes.data.data : [],
          loading: false
        });
      }).catch(err => {
        console.error("Error fetching project details", err);
        setSelectedProjectDetails(prev => ({ ...prev, loading: false }));
      });
    }
  }, [selectedProject]);

  const filtered = useMemo(() =>
    apiProjects.filter((p: any) => {
      if (search && !(p?.customerName?.toLowerCase().includes(search.toLowerCase()) || p?.projectCode?.toLowerCase().includes(search.toLowerCase()))) {
        return false;
      }
      if (stateFilter !== 'ALL' && p?.stateCode !== stateFilter) {
        return false;
      }
      if (filterMode === 'PENDING') {
        if (view === 'vendor') return p?.vendorPendingPayment > 0;
        if (view === 'invoices') return p?.totalAmountPaid < p?.totalInvoiceAmount;
        return p?.paymentStatus !== 'cleared';
      }
      if (filterMode === 'CLEARED') {
        if (view === 'vendor') return p?.poAmount > 0 && p?.vendorPendingPayment === 0;
        if (view === 'invoices') return p?.totalInvoiceAmount > 0 && p?.totalAmountPaid >= p?.totalInvoiceAmount;
        return p?.paymentStatus === 'cleared';
      }
      if (filterMode === 'HIGH_VALUE') {
        return p?.amountReceived > 10000000;
      }
      return true;
    }),
    [search, apiProjects, filterMode, view, stateFilter]
  );

  // 1. Filtered Service Charge Register Projects
  const filteredServiceProjs = useMemo(() => {
    return filtered.filter((p: any) => {
      if (serviceFilter.search) {
        const q = serviceFilter.search.toLowerCase().trim();
        const matchCode = String(p?.projectCode ?? '').toLowerCase().includes(q);
        const matchCust = String(p?.customerName ?? '').toLowerCase().includes(q);
        if (!matchCode && !matchCust) return false;
      }
      if (serviceFilter.rateTier) {
        const pct = p?.commissionPct || 0;
        if (serviceFilter.rateTier === '0' && pct !== 0) return false;
        if (serviceFilter.rateTier === '5' && (pct < 4 || pct > 6)) return false;
        if (serviceFilter.rateTier === '7' && (pct < 6 || pct > 8)) return false;
        if (serviceFilter.rateTier === '9' && (pct < 8 || pct > 10)) return false;
        if (serviceFilter.rateTier === '10+' && pct <= 10) return false;
      }
      if (serviceFilter.financialStatus) {
        if (String(p?.paymentStatus || p?.financialStatus || '').toUpperCase() !== serviceFilter.financialStatus.toUpperCase()) return false;
      }
      const comm = p?.nicsiCommission || 0;
      if (serviceFilter.minCommission && comm < Number(serviceFilter.minCommission)) return false;
      if (serviceFilter.maxCommission && comm > Number(serviceFilter.maxCommission)) return false;
      return true;
    });
  }, [filtered, serviceFilter]);

  // 2. Filtered Vendor Ledger Projects
  const filteredVendorProjs = useMemo(() => {
    return filtered.filter((p: any) => {
      if (vendorFilter.search) {
        const q = vendorFilter.search.toLowerCase().trim();
        const matchCode = String(p?.projectCode ?? '').toLowerCase().includes(q);
        const matchCust = String(p?.customerName ?? '').toLowerCase().includes(q);
        if (!matchCode && !matchCust) return false;
      }
      if (vendorFilter.paymentStatus) {
        if (String(p?.paymentStatus || '').toLowerCase() !== vendorFilter.paymentStatus.toLowerCase()) return false;
      }
      if (vendorFilter.progressTier) {
        const pct = p?.vendorUtilPct || 0;
        if (vendorFilter.progressTier === '0' && pct !== 0) return false;
        if (vendorFilter.progressTier === '1-50' && (pct < 1 || pct > 50)) return false;
        if (vendorFilter.progressTier === '51-99' && (pct < 51 || pct > 99)) return false;
        if (vendorFilter.progressTier === '100' && pct < 100) return false;
      }
      const dues = p?.vendorPendingPayment || 0;
      if (vendorFilter.minDues && dues < Number(vendorFilter.minDues)) return false;
      if (vendorFilter.maxDues && dues > Number(vendorFilter.maxDues)) return false;
      return true;
    });
  }, [filtered, vendorFilter]);

  // 3. Filtered Invoice Register Projects
  const filteredInvoiceProjs = useMemo(() => {
    return filtered.filter((p: any) => {
      if (invoiceRegFilter.search) {
        const q = invoiceRegFilter.search.toLowerCase().trim();
        const matchCode = String(p?.projectCode ?? '').toLowerCase().includes(q);
        const matchCust = String(p?.customerName ?? '').toLowerCase().includes(q);
        if (!matchCode && !matchCust) return false;
      }
      if (invoiceRegFilter.paymentStatus) {
        if (String(p?.paymentStatus || '').toLowerCase() !== invoiceRegFilter.paymentStatus.toLowerCase()) return false;
      }
      if (invoiceRegFilter.expStatus) {
        const expCount = p?.noOfExpInvoice || 0;
        if (invoiceRegFilter.expStatus === 'PROCESSED' && expCount === 0) return false;
        if (invoiceRegFilter.expStatus === 'NONE' && expCount > 0) return false;
      }
      const invAmt = p?.totalInvoiceAmount || 0;
      if (invoiceRegFilter.minInvoiced && invAmt < Number(invoiceRegFilter.minInvoiced)) return false;
      if (invoiceRegFilter.maxInvoiced && invAmt > Number(invoiceRegFilter.maxInvoiced)) return false;
      return true;
    });
  }, [filtered, invoiceRegFilter]);

  // 4. Filtered PO Register Records
  const filteredPoRegData = useMemo(() => {
    return poData.filter((po: any) => {
      if (poRegFilter.search) {
        const q = poRegFilter.search.toLowerCase().trim();
        const matchPoNo = String(po?.finalPoNo ?? po?.poNo ?? '').toLowerCase().includes(q);
        const matchPrjNo = String(po?.projectNo ?? '').toLowerCase().includes(q);
        const matchVendor = String(po?.vendorName ?? '').toLowerCase().includes(q);
        if (!matchPoNo && !matchPrjNo && !matchVendor) return false;
      }
      if (poRegFilter.approvalStatus) {
        if (String(po?.approvalStatus || 'DISPATCHED').toUpperCase() !== poRegFilter.approvalStatus.toUpperCase()) return false;
      }
      if (poRegFilter.expiryStatus) {
        const isExpired = po.todate && new Date(po.todate) < new Date();
        const isExpiringSoon = po.todate && !isExpired && new Date(po.todate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (poRegFilter.expiryStatus === 'EXPIRED' && !isExpired) return false;
        if (poRegFilter.expiryStatus === 'EXPIRING' && !isExpiringSoon) return false;
        if (poRegFilter.expiryStatus === 'ACTIVE' && (isExpired || isExpiringSoon)) return false;
      }
      const poDateIso = parseDateForCompare(po?.poDate || po?.frdate);
      if (poRegFilter.dateFrom && poDateIso && poDateIso < poRegFilter.dateFrom) return false;
      if (poRegFilter.dateTo && poDateIso && poDateIso > poRegFilter.dateTo) return false;

      const val = Number(po?.total) || 0;
      if (poRegFilter.minAmount && val < Number(poRegFilter.minAmount)) return false;
      if (poRegFilter.maxAmount && val > Number(poRegFilter.maxAmount)) return false;
      return true;
    });
  }, [poData, poRegFilter]);

  // 5. Filtered BillDesk Register Records
  const filteredBdRegData = useMemo(() => {
    return billDeskData.filter((bd: any) => {
      if (bdRegFilter.search) {
        const q = bdRegFilter.search.toLowerCase().trim();
        const matchInvNo = String(bd?.invoiceNum ?? bd?.invoiceNo ?? '').toLowerCase().includes(q);
        const matchPoNo = String(bd?.finalPoNo ?? '').toLowerCase().includes(q);
        const matchPrjNo = String(bd?.projectNo ?? '').toLowerCase().includes(q);
        const matchVendor = String(bd?.vendorName ?? '').toLowerCase().includes(q);
        if (!matchInvNo && !matchPoNo && !matchPrjNo && !matchVendor) return false;
      }
      if (bdRegFilter.status) {
        const st = String(bd?.status || 'Pending').toLowerCase();
        if (bdRegFilter.status === 'PAID' && !st.includes('done') && !st.includes('paid')) return false;
        if (bdRegFilter.status === 'PENDING' && (st.includes('done') || st.includes('paid'))) return false;
        if (bdRegFilter.status === 'OBJECTION' && !bd?.objectionRemarks) return false;
      }
      if (bdRegFilter.objectionOnly && !bd?.objectionRemarks) return false;

      const invDateIso = parseDateForCompare(bd?.invoiceDate || bd?.receivedDate);
      if (bdRegFilter.dateFrom && invDateIso && invDateIso < bdRegFilter.dateFrom) return false;
      if (bdRegFilter.dateTo && invDateIso && invDateIso > bdRegFilter.dateTo) return false;

      const amt = Number(bd?.invoiceAmount) || 0;
      if (bdRegFilter.minAmount && amt < Number(bdRegFilter.minAmount)) return false;
      if (bdRegFilter.maxAmount && amt > Number(bdRegFilter.maxAmount)) return false;
      return true;
    });
  }, [billDeskData, bdRegFilter]);

  // 6. Filtered Tax Invoices Records
  const filteredTiRegData = useMemo(() => {
    return taxInvData.filter((ti: any) => {
      if (tiRegFilter.search) {
        const q = tiRegFilter.search.toLowerCase().trim();
        const matchBillNo = String(ti?.userBillNo ?? '').toLowerCase().includes(q);
        const matchPrjNo = String(ti?.projectNo ?? '').toLowerCase().includes(q);
        const matchIrn = String(ti?.irnNo ?? '').toLowerCase().includes(q);
        if (!matchBillNo && !matchPrjNo && !matchIrn) return false;
      }
      if (tiRegFilter.status) {
        if (String(ti?.billStatus || 'FINAL').toUpperCase() !== tiRegFilter.status.toUpperCase()) return false;
      }
      if (tiRegFilter.irnStatus) {
        const hasIrn = !!ti?.irnNo;
        if (tiRegFilter.irnStatus === 'GENERATED' && !hasIrn) return false;
        if (tiRegFilter.irnStatus === 'PENDING' && hasIrn) return false;
      }

      const billDateIso = parseDateForCompare(ti?.billDate);
      if (tiRegFilter.dateFrom && billDateIso && billDateIso < tiRegFilter.dateFrom) return false;
      if (tiRegFilter.dateTo && billDateIso && billDateIso > tiRegFilter.dateTo) return false;

      const amt = Number(ti?.totalAmount) || 0;
      if (tiRegFilter.minAmount && amt < Number(tiRegFilter.minAmount)) return false;
      if (tiRegFilter.maxAmount && amt > Number(tiRegFilter.maxAmount)) return false;
      return true;
    });
  }, [taxInvData, tiRegFilter]);

  // Distinct states present in the data (for the state filter dropdown).
  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    apiProjects.forEach((p: any) => { if (p?.stateCode) set.add(p.stateCode); });
    return Array.from(set).sort();
  }, [apiProjects]);

  // ── Summary insights (respect the active filters) ──
  const summary = useMemo(() => {
    const rows = filtered;
    const received = rows.reduce((s, p) => s + (p?.amountReceived || 0), 0);
    const abp = rows.reduce((s, p) => s + (p?.projectABP || 0), 0);
    const commission = rows.reduce((s, p) => s + (p?.nicsiCommission || 0), 0);
    const po = rows.reduce((s, p) => s + (p?.poAmount || 0), 0);
    const paid = rows.reduce((s, p) => s + (p?.totalAmountPaid || 0), 0);
    const vendorPending = rows.reduce((s, p) => s + (p?.vendorPendingPayment || 0), 0);
    const cleared = rows.filter(p => p?.paymentStatus === 'cleared').length;
    const partial = rows.filter(p => p?.paymentStatus === 'partial').length;
    const pending = rows.filter(p => p?.paymentStatus === 'pending').length;
    const withDues = rows.filter(p => p?.vendorPendingPayment > 0).length;
    return {
      count: rows.length,
      received, abp, commission, po, paid, vendorPending,
      collectionPct: abp > 0 ? Math.round((received / abp) * 100) : 0,
      marginPct: received > 0 ? ((commission / received) * 100) : 0,
      vendorUtilPct: po > 0 ? Math.round((paid / po) * 100) : 0,
      cleared, partial, pending, withDues,
    };
  }, [filtered]);

  // Payment status distribution for the donut
  const statusData = useMemo(() => ([
    { name: 'Cleared', value: summary.cleared, color: '#28A745' },
    { name: 'Partial', value: summary.partial, color: '#FFC107' },
    { name: 'Pending', value: summary.pending, color: '#DC3545' },
  ].filter(d => d.value > 0)), [summary]);

  // State-wise receipts (top 8) from filtered data
  const stateData = useMemo(() => {
    const acc: Record<string, number> = {};
    filtered.forEach((p: any) => {
      const st = p?.stateCode || 'Others';
      acc[st] = (acc[st] || 0) + (p?.amountReceived || 0);
    });
    return Object.entries(acc)
      .map(([name, value]) => ({ name, value: Math.round((value as number) / 100000) }))
      .sort((a, b) => stateChartSort === 'top' ? b.value - a.value : a.value - b.value)
      .slice(0, 8);
  }, [filtered, stateChartSort]);

  const resetFilters = () => { setSearch(''); setFilterMode('ALL'); setStateFilter('ALL'); };

  // Utilization Chart Data (Funds vs PO vs Paid)
  const utilizationData = useMemo(() => {
    return [...filtered]
      .filter((p: any) => p?.amountReceived > 0)
      .sort((a, b) => {
        if (utilizationSort === 'top') return (b?.amountReceived || 0) - (a?.amountReceived || 0);
        if (utilizationSort === 'bottom') return (a?.amountReceived || 0) - (b?.amountReceived || 0);
        // unused: Highest (amountReceived - poAmount)
        return ((b?.amountReceived || 0) - (b?.effectivePoAmount || b?.poAmount || 0)) - ((a?.amountReceived || 0) - (a?.effectivePoAmount || a?.poAmount || 0));
      })
      .slice(0, 10)
      .map((p: any) => ({
        name: p?.customerName?.length > 20 ? p?.customerName.substring(0, 20) + '…' : (p?.customerName || 'N/A'),
        received: p?.amountReceived / 100000,
        po: (p?.effectivePoAmount || p?.poAmount || 0) / 100000,
        paid: p?.totalAmountPaid / 100000,
        unused: (p?.amountReceived - (p?.effectivePoAmount || p?.poAmount || 0)) / 100000
      }));
  }, [filtered, utilizationSort]);

  // Action Required: Vendor Dues Pipeline
  const duesData = useMemo(() => {
    const sliceCount = duesSort === 'top10' ? 10 : 20;
    return [...filtered]
      .filter((p: any) => p?.vendorPendingPayment > 0)
      .sort((a, b) => b.vendorPendingPayment - a.vendorPendingPayment)
      .slice(0, sliceCount)
      .map((p: any) => ({
        name: p?.customerName?.length > 18 ? p?.customerName.substring(0, 18) + '…' : (p?.customerName || 'N/A'),
        dues: p?.vendorPendingPayment / 100000,
        invoiced: p?.totalInvoiceAmount / 100000,
        paid: p?.totalAmountPaid / 100000,
      }));
  }, [filtered, duesSort]);

  const totalCommissionPct = apiStats.totalAmountReceived > 0 
    ? ((apiStats.totalCommission / apiStats.totalAmountReceived) * 100).toFixed(2) 
    : '0.00';

  if (loading) {
    return <div className="finance-page page-container"><div className="loading-spinner">Loading...</div></div>;
  }

  return (
    <div className="finance-page page-container">
      {/* Header */}
      <div className="finance-header animate-fade-in-up">
        <div>
          <h2 className="finance-title">
            {user?.role === 'PM' ? 'Financial Management Dashboard' : user?.role === 'MD' ? 'Divisional Financial Management' : 'Financial Management Dashboard'}
          </h2>
          <p className="finance-sub">
            NICSI service charge tracking · Purchase Order allocation · Phased invoice management · GST compliance
          </p>
        </div>
        
        {(user?.role === 'PM' || user?.role === 'MD') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eef6ff', border: '1px solid #cfe3fb', borderRadius: 8, padding: '0.6rem 1rem', fontSize: '0.8125rem', color: '#0b4a8f', marginBottom: '1rem', width: 'fit-content' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              {user?.role === 'PM' 
                ? <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
                : <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}
            </svg>
            {user?.role === 'PM'
              ? <><strong>Portfolio Scope:</strong>&nbsp;Displaying data for your assigned projects only &mdash; {user?.fullName} &middot; {user?.zone || 'All Zones'} &middot; PRJ_MGR_ID: {user?.prjMgrId || 'N/A'}</>
              : <><strong>Organisational Scope:</strong>&nbsp;Showing all financial records under PMs provisioned for {user?.fullName}</>}
          </div>
        )}
        {loadError && (
          <div style={{ background: '#fde8e8', color: '#8a1515', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '0.875rem', fontWeight: 600, border: '1px solid #f5c2c7', marginBottom: '1rem', width: 'fit-content' }}>
            Error: {loadError}
          </div>
        )}

        <div className="fin-filter-bar">
          <div className="input-icon-wrapper" style={{ width: 160 }}>
            <span className="icon-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            </span>
            <select className="form-input has-icon-left" value={filterMode} onChange={e => setFilterMode(e.target.value as any)} style={{ paddingLeft: '2rem' }}>
              <option value="ALL">All Projects</option>
              <option value="PENDING">Pending Dues</option>
              <option value="CLEARED">Fully Cleared</option>
              <option value="HIGH_VALUE">High Value (&gt;1Cr)</option>
            </select>
          </div>
          <div className="input-icon-wrapper" style={{ width: 150 }}>
            <span className="icon-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <select className="form-input has-icon-left" value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={{ paddingLeft: '2rem' }}>
              <option value="ALL">All States</option>
              {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-icon-wrapper" style={{ width: 220 }}>
            <span className="icon-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="text" className="form-input has-icon-left"
              placeholder="Search projects…" value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {(search || filterMode !== 'ALL' || stateFilter !== 'ALL') && (
            <button className="fin-filter-clear" onClick={resetFilters} title="Clear filters">✕ Clear</button>
          )}
        </div>
      </div>

      {/* Money Flow Summary */}
      <div className="money-summary-grid animate-fade-in-up delay-100">
        <div className="money-card money-card--govt">
          <div className="money-card__icon money-card__icon--govt">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/><path d="M9 9h.01M12 9h.01M15 9h.01"/></svg>
          </div>
          <div className="money-card__body">
            <div className="money-card__title">Funds Received (Client)</div>
            <div className="money-card__primary">{formatCurrencyFull(apiStats.totalAmountReceived)}</div>
            <div className="money-card__secondary">of Approved Budget Provision (ABP): {formatCurrencyFull(apiStats.totalABP)}</div>
            <div className="money-card__tag">
              {formatCurrency(apiStats.totalClientPending)} still to be received from User Department
            </div>
          </div>
        </div>

        <div className="money-flow-arrow">→</div>

        <div className="money-card money-card--nicsi">
          <div className="money-card__icon money-card__icon--nicsi">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12"/><path d="M6 8h12"/><path d="M6 13h3c2.5 0 5-1.5 5-4s-2.5-4-5-4H6"/><path d="M11 13l6 8"/>
            </svg>
          </div>
          <div className="money-card__body">
            <div className="money-card__title">NICSI Service Charge</div>
            <div className="money-card__primary" style={{ color: '#FF6600' }}>{formatCurrencyFull(apiStats.totalCommission)}</div>
            <div className="money-card__secondary">Avg. rate: {totalCommissionPct}% of funds received</div>
            <div className="money-card__tag money-card__tag--orange">
              Retained across {apiProjects.filter((p: any) => p?.nicsiCommission > 0).length} projects
            </div>
          </div>
        </div>

        <div className="money-flow-arrow">→</div>

        <div className="money-card money-card--vendor">
          <div className="money-card__icon money-card__icon--vendor">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="18" height="14" rx="1.5"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div className="money-card__body">
            <div className="money-card__title">PO Amount Allotted</div>
            <div className="money-card__primary" style={{ color: '#006699' }}>{formatCurrencyFull(apiStats.totalPOAmount)}</div>
            <div className="money-card__secondary">{apiStats.totalPOs} Purchase Orders issued to vendor(s)</div>
            <div className="money-card__tag money-card__tag--blue">
              {formatCurrency(apiStats.totalPaid)} paid · {formatCurrency(apiStats.totalVendorPending)} pending to vendor
            </div>
          </div>
        </div>

        <div className="money-flow-arrow">⇅</div>

        <div className="money-card money-card--invoices">
          <div className="money-card__icon money-card__icon--doc">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div className="money-card__body">
            <div className="money-card__title">Vendor Expenditure (Bill Desk)</div>
            <div className="money-card__primary" style={{ color: '#17a2b8' }}>{formatCurrencyFull(apiStats.totalInvoiced)}</div>
            <div className="money-card__secondary">{apiStats.totalBillDeskInvoices} bills submitted by vendor · {apiStats.totalExpInvoices} processed as expenditure</div>
            <div className="money-card__tag money-card__tag--teal">
              {apiStats.totalTaxInvoices} GST tax invoices raised on User Department (separate register)
            </div>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="finance-tabs animate-fade-in-up delay-100">
        {([
          ['summary',    'Executive Summary'],
          ['commission', 'Service Charge Register'],
          ['vendor',     'Vendor Ledger'],
          ['invoices',   'Invoice Register'],
          ['poRegister', 'PO Register'],
          ['billDesk',   'BillDesk Register'],
          ['taxInvoices','Tax Invoices'],
        ] as [ViewMode, string][]).map(([v, label]) => (
          <button
            key={v}
            className={`finance-tab ${view === v ? 'finance-tab--active' : ''}`}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Summary View ── */}
      {view === 'summary' && (
        <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Result context line */}
          <div className="fin-result-line">
            Showing <strong>{summary.count}</strong> project{summary.count !== 1 ? 's' : ''}
            {stateFilter !== 'ALL' ? <> in <strong>{stateFilter}</strong></> : null}
            {filterMode !== 'ALL' ? <> · filter: <strong>{filterMode.replace('_', ' ').toLowerCase()}</strong></> : null}
            {search ? <> · matching “<strong>{search}</strong>”</> : null}
          </div>

          {/* Insight tiles */}
          <div className="fin-insight-grid">
            <div className="fin-insight" style={{ '--fin-accent': '#003366' } as any}>
              <div className="fin-insight__label">Collection Efficiency</div>
              <div className="fin-insight__value">{summary.collectionPct}%</div>
              <div className="fin-insight__bar"><span style={{ width: `${Math.min(summary.collectionPct, 100)}%`, background: '#003366' }} /></div>
              <div className="fin-insight__sub">{formatCurrency(summary.received)} of {formatCurrency(summary.abp)} ABP</div>
            </div>
            <div className="fin-insight" style={{ '--fin-accent': '#FF6600' } as any}>
              <div className="fin-insight__label">Avg. Service Charge</div>
              <div className="fin-insight__value" style={{ color: '#FF6600' }}>{summary.marginPct.toFixed(2)}%</div>
              <div className="fin-insight__bar"><span style={{ width: `${Math.min(summary.marginPct * 5, 100)}%`, background: '#FF6600' }} /></div>
              <div className="fin-insight__sub">{formatCurrency(summary.commission)} retained margin</div>
            </div>
            <div className="fin-insight" style={{ '--fin-accent': '#28A745' } as any}>
              <div className="fin-insight__label">Vendor Utilisation</div>
              <div className="fin-insight__value" style={{ color: '#28A745' }}>{summary.vendorUtilPct}%</div>
              <div className="fin-insight__bar"><span style={{ width: `${Math.min(summary.vendorUtilPct, 100)}%`, background: '#28A745' }} /></div>
              <div className="fin-insight__sub">{formatCurrency(summary.paid)} paid of {formatCurrency(summary.po)} PO</div>
            </div>
            <div className="fin-insight" style={{ '--fin-accent': '#DC3545' } as any}>
              <div className="fin-insight__label">Vendor Dues Outstanding</div>
              <div className="fin-insight__value" style={{ color: '#DC3545' }}>{formatCurrency(summary.vendorPending)}</div>
              <div className="fin-insight__bar"><span style={{ width: `${summary.count ? (summary.withDues / summary.count) * 100 : 0}%`, background: '#DC3545' }} /></div>
              <div className="fin-insight__sub">{summary.withDues} of {summary.count} projects have dues</div>
            </div>
          </div>

          {/* Charts row 1: Operating margin + payment status donut */}
          <div className="chart-row-finance">
            <div className="card" style={{ flex: 2 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 className="fin-chart-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    Budget Utilization & Commitments
                    <select 
                      value={utilizationSort} 
                      onChange={(e) => setUtilizationSort(e.target.value as any)}
                      style={{ padding: '2px 6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #ddd', background: '#f8f9fa', color: '#003366', fontWeight: 600, cursor: 'pointer' }}
                    >
                      <option value="top">Top 10 Largest Budgets</option>
                      <option value="bottom">Bottom 10 Budgets</option>
                      <option value="unused">Highest Unused Funds</option>
                    </select>
                  </h3>
                  <p className="fin-chart-sub">Funds Received vs Purchase Orders (PO) vs Paid (₹ Lakhs)</p>
                </div>
              </div>
              <div className="card-body">
                {utilizationData.length === 0 ? (
                  <div className="fin-empty">No matching projects for the selected filters.</div>
                ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={utilizationData} margin={{ top: 8, right: 12, left: -4, bottom: 85 }}>
                    <defs>
                      <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#003366" stopOpacity={0.9}/>
                        <stop offset="95%" stopColor="#004b96" stopOpacity={0.7}/>
                      </linearGradient>
                      <linearGradient id="colorPo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6600" stopOpacity={0.9}/>
                        <stop offset="95%" stopColor="#ff8533" stopOpacity={0.7}/>
                      </linearGradient>
                      <linearGradient id="colorPd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#28A745" stopOpacity={0.9}/>
                        <stop offset="95%" stopColor="#34d058" stopOpacity={0.7}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#4a5568', fontWeight: 500 }} angle={-35} textAnchor="end" interval={0} tickMargin={8} />
                    <YAxis tick={{ fontSize: 10, fill: '#6c757d' }} tickFormatter={v => `₹${v}L`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingBottom: '24px', fontWeight: 600 }} verticalAlign="top" />
                    <Bar dataKey="received" name="Funds Received" fill="url(#colorRec)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="po" name="Purchase Order (PO)" fill="url(#colorPo)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="paid" name="Amount Paid" fill="url(#colorPd)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </ComposedChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card" style={{ flex: 1 }}>
              <div className="card-header">
                <h3 className="fin-chart-title">Payment Status</h3>
                <p className="fin-chart-sub">Vendor settlement across {summary.count} projects</p>
              </div>
              <div className="card-body">
                {statusData.length === 0 ? (
                  <div className="fin-empty">No data.</div>
                ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <defs>
                      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" />
                      </filter>
                    </defs>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value"
                      labelLine={false}
                      stroke="none"
                      style={{ filter: 'url(#shadow)' }}
                      label={({ cx, cy, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 }: any) => {
                        const RADIAN = Math.PI / 180;
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        if (percent < 0.05) return null;
                        return (
                          <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700">
                            {`${(percent * 100).toFixed(0)}%`}
                          </text>
                        );
                      }}
                    >
                      {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-5" fontSize="28" fontWeight="800" fill="#003366">{summary.count}</tspan>
                      <tspan x="50%" dy="22" fontSize="12" fontWeight="600" fill="#8a94a0" letterSpacing="0.5px">PROJECTS</tspan>
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                )}
                <div className="fin-status-legend">
                  {statusData.map((d, i) => (
                    <div key={i} className="fin-status-legend__row">
                      <span className="fin-status-legend__dot" style={{ background: d.color }} />
                      <span className="fin-status-legend__name">{d.name}</span>
                      <span className="fin-status-legend__count">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Charts row 2: State-wise receipts + Invoice vs Paid */}
          <div className="chart-row-finance">
            <div className="card" style={{ flex: 1 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 className="fin-chart-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    Funds Received by State
                    <select 
                      value={stateChartSort} 
                      onChange={(e) => setStateChartSort(e.target.value as any)}
                      style={{ padding: '2px 6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #ddd', background: '#f8f9fa', color: '#003366', fontWeight: 600, cursor: 'pointer' }}
                    >
                      <option value="top">Top 8 States</option>
                      <option value="bottom">Bottom 8 States</option>
                    </select>
                  </h3>
                  <p className="fin-chart-sub">Client receipts distribution · ₹ Lakhs</p>
                </div>
              </div>
              <div className="card-body">
                {stateData.length === 0 ? (
                  <div className="fin-empty">No data.</div>
                ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stateData} layout="vertical" margin={{ top: 4, right: 36, left: 40, bottom: 4 }}>
                    <defs>
                      <linearGradient id="colorState" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#006699" stopOpacity={0.8}/>
                        <stop offset="100%" stopColor="#004b96" stopOpacity={1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}L`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#4a5568', fontWeight: 500 }} width={90} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Received" fill="url(#colorState)" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      <LabelList dataKey="value" position="right" formatter={(v: any) => `₹${v}L`} style={{ fontSize: '10px', fill: '#6c757d', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card" style={{ flex: 1 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 className="fin-chart-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    Action Required: Vendor Dues
                    <select 
                      value={duesSort} 
                      onChange={(e) => setDuesSort(e.target.value as any)}
                      style={{ padding: '2px 6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #ddd', background: '#f8f9fa', color: '#DC3545', fontWeight: 600, cursor: 'pointer' }}
                    >
                      <option value="top10">Top 10 Highest Dues</option>
                      <option value="top20">Top 20 Highest Dues</option>
                    </select>
                  </h3>
                  <p className="fin-chart-sub">Projects with highest pending vendor payments · ₹ Lakhs</p>
                </div>
              </div>
              <div className="card-body">
                {duesData.length === 0 ? (
                  <div className="fin-empty">No pending dues found for the selected criteria.</div>
                ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={duesData} layout="vertical" margin={{ top: 4, right: 36, left: 120, bottom: 4 }}>
                    <defs>
                      <linearGradient id="colorDues" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#DC3545" stopOpacity={0.9}/>
                        <stop offset="100%" stopColor="#ff4d5e" stopOpacity={0.7}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f4f8" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}L`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#4a5568', fontWeight: 500 }} width={115} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="dues" name="Pending Dues" fill="url(#colorDues)" radius={[0, 4, 4, 0]} maxBarSize={16}>
                       <LabelList dataKey="dues" position="right" formatter={(v: any) => `₹${Number(v).toFixed(1)}L`} style={{ fontSize: '9px', fill: '#DC3545', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Charge Register View ── */}
      {view === 'commission' && (
        <div className="card animate-fade-in-up">
          <div className="card-header sub-register-bar-header">
            <div>
              <h3 className="fin-chart-title">NICSI Service Charge Tracker</h3>
              <p className="fin-chart-sub">
                Service Charge = Funds Received from User Dept − PO value allotted to Vendor · Total: {formatCurrencyFull(apiStats.totalCommission)} ({totalCommissionPct}% avg)
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className={`btn btn-sm ${showServiceFilters ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowServiceFilters(prev => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                <span>{showServiceFilters ? 'Hide Filters' : 'Filter Service Charges'}</span>
              </button>
            </div>
          </div>

          {showServiceFilters && (
            <div className="sub-register-filter-panel">
              <div className="sub-filter-grid">
                <div className="sub-filter-item">
                  <label>Search Project / Department / Customer</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm" 
                    placeholder="Project Code / Dept / Customer..." 
                    value={serviceFilter.search} 
                    onChange={e => setServiceFilter(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Service Charge Rate %</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={serviceFilter.rateTier} 
                    onChange={e => setServiceFilter(f => ({ ...f, rateTier: e.target.value }))}
                  >
                    <option value="">All Service Rates</option>
                    <option value="0">0% Tier</option>
                    <option value="5">5% Tier (4-6%)</option>
                    <option value="7">7% Tier (6-8%)</option>
                    <option value="9">9% Tier (8-10%)</option>
                    <option value="10+">&gt;10% Tier</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Financial Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={serviceFilter.financialStatus} 
                    onChange={e => setServiceFilter(f => ({ ...f, financialStatus: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="CLEARED">CLEARED / PROFIT</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Min Retained (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Min ₹" 
                    value={serviceFilter.minCommission} 
                    onChange={e => setServiceFilter(f => ({ ...f, minCommission: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Max Retained (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Max ₹" 
                    value={serviceFilter.maxCommission} 
                    onChange={e => setServiceFilter(f => ({ ...f, maxCommission: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-actions">
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ color: '#dc3545', fontWeight: 600 }}
                    onClick={() => setServiceFilter({ search: '', rateTier: '', financialStatus: '', minCommission: '', maxCommission: '' })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table fin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project Code</th>
                  <th>Department / Customer</th>
                  <th>State</th>
                  <th>Project Funds Received (A)</th>
                  <th>Total PO Value (B)</th>
                  <th>NICSI Service Charge (A−B)</th>
                  <th>Rate %</th>
                  <th>Available Project Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredServiceProjs.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No projects match the selected criteria.</td></tr>
                ) : filteredServiceProjs.map((p: any, i) => (
                  <tr key={p?.headerId}>
                    <td style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{i + 1}</td>
                    <td><code className="proj-code-fin">{p?.projectCode}</code></td>
                    <td className="org-name-fin">{p?.customerName}</td>
                    <td><span className="state-fin">{p?.stateCode}</span></td>
                    <td className="amt-primary">{formatCurrency(p?.amountReceived)}</td>
                    <td className="amt-po">{p?.noOfPO > 0 ? formatCurrency(p?.poAmount) : <span className="no-val">No PO</span>}</td>
                    <td>
                      <div className="commission-display">
                        <span className="commission-display__amt">{formatCurrency(p?.nicsiCommission)}</span>
                        <div className="commission-bar-mini">
                          <div className="commission-bar-mini__fill" style={{ width: `${Math.min(p?.commissionPct * 5, 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`rate-badge ${p?.commissionPct > 10 ? 'rate-badge--high' : p?.commissionPct > 5 ? 'rate-badge--mid' : 'rate-badge--low'}`}>
                        {p?.commissionPct}%
                      </span>
                    </td>
                    <td className="amt-muted">{formatCurrency(p?.projectABP)}</td>
                    <td>
                      <span className={`badge badge-${p?.paymentStatus === 'cleared' ? 'success' : p?.paymentStatus === 'partial' ? 'warning' : 'danger'}`}>
                        {p?.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="fin-table-total">
                  <td colSpan={4}>Total ({filteredServiceProjs.length} projects)</td>
                  <td>{formatCurrency(filteredServiceProjs.reduce((s, p) => s + (p?.amountReceived || 0), 0))}</td>
                  <td>{formatCurrency(filteredServiceProjs.reduce((s, p) => s + (p?.poAmount || 0), 0))}</td>
                  <td className="amt-commission">{formatCurrency(filteredServiceProjs.reduce((s, p) => s + (p?.nicsiCommission || 0), 0))}</td>
                  <td>{filteredServiceProjs.length > 0 ? (filteredServiceProjs.reduce((s, p) => s + (p?.commissionPct || 0), 0) / filteredServiceProjs.length).toFixed(1) : '0.0'}% avg</td>
                  <td>{formatCurrency(filteredServiceProjs.reduce((s, p) => s + (p?.projectABP || 0), 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Vendor Payments View ── */}
      {view === 'vendor' && (
        <div className="card animate-fade-in-up">
          <div className="card-header sub-register-bar-header">
            <div>
              <h3 className="fin-chart-title">Vendor Payment Register</h3>
              <p className="fin-chart-sub">PO allotment vs actual payments vs pending dues to vendors</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className={`btn btn-sm ${showVendorFilters ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowVendorFilters(prev => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                <span>{showVendorFilters ? 'Hide Filters' : 'Filter Vendor Ledger'}</span>
              </button>
            </div>
          </div>

          {showVendorFilters && (
            <div className="sub-register-filter-panel">
              <div className="sub-filter-grid">
                <div className="sub-filter-item">
                  <label>Search Project / Department / Customer</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm" 
                    placeholder="Project Code / Dept / Customer..." 
                    value={vendorFilter.search} 
                    onChange={e => setVendorFilter(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Vendor Payment Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={vendorFilter.paymentStatus} 
                    onChange={e => setVendorFilter(f => ({ ...f, paymentStatus: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="cleared">CLEARED / FULLY PAID</option>
                    <option value="partial">PARTIALLY PAID</option>
                    <option value="pending">PENDING DUES</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Vendor Billed Progress %</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={vendorFilter.progressTier} 
                    onChange={e => setVendorFilter(f => ({ ...f, progressTier: e.target.value }))}
                  >
                    <option value="">All Progress Tiers</option>
                    <option value="0">0% (Unbilled)</option>
                    <option value="1-50">1% - 50% Billed</option>
                    <option value="51-99">51% - 99% Billed</option>
                    <option value="100">100% Fully Billed</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Min Pending Dues (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Min Dues ₹" 
                    value={vendorFilter.minDues} 
                    onChange={e => setVendorFilter(f => ({ ...f, minDues: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Max Pending Dues (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Max Dues ₹" 
                    value={vendorFilter.maxDues} 
                    onChange={e => setVendorFilter(f => ({ ...f, maxDues: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-actions">
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ color: '#dc3545', fontWeight: 600 }}
                    onClick={() => setVendorFilter({ search: '', paymentStatus: '', progressTier: '', minDues: '', maxDues: '' })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table fin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project Code</th>
                  <th>Department / Customer</th>
                  <th>Total POs</th>
                  <th>Total PO Value</th>
                  <th>Expected Bills</th>
                  <th>Invoice Value Submitted</th>
                  <th>Amount Paid</th>
                  <th>Pending to Vendor</th>
                  <th>Vendor Progress</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredVendorProjs.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No records match vendor criteria.</td></tr>
                ) : filteredVendorProjs.map((p: any, i) => (
                  <tr key={p?.headerId} onClick={() => openProjectModal(p, 'overview')} style={{ cursor: 'pointer' }} className="table-row-hover">
                    <td style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{i + 1}</td>
                    <td><code className="proj-code-fin">{p?.projectCode}</code></td>
                    <td className="org-name-fin">{p?.customerName}</td>
                    <td 
                      style={{ textAlign: 'center', fontWeight: 700, color: p?.noOfPO > 0 ? 'var(--nicsi-teal)' : '#adb5bd', cursor: 'pointer', textDecoration: p?.noOfPO > 0 ? 'underline' : 'none' }}
                      onClick={(e) => { e.stopPropagation(); openProjectModal(p, 'pos'); }}
                      title="Click to view Purchase Orders"
                    >
                      {p?.noOfPO || '—'}
                    </td>
                    <td className="amt-po">{p?.noOfPO > 0 ? formatCurrency(p?.poAmount) : <span className="no-val">No PO issued</span>}</td>
                    <td 
                      style={{ textAlign: 'center', fontWeight: 600, cursor: 'pointer', color: p?.noOfExpInvoice > 0 ? '#006699' : 'inherit', textDecoration: p?.noOfExpInvoice > 0 ? 'underline' : 'none' }}
                      onClick={(e) => { e.stopPropagation(); openProjectModal(p, 'billdesk'); }}
                      title="Click to view Expected Expenditure Bills"
                    >
                      {p?.noOfExpInvoice || <span className="no-val">—</span>}
                    </td>
                    <td>{p?.totalInvoiceAmount > 0 ? formatCurrency(p?.totalInvoiceAmount) : <span className="no-val">—</span>}</td>
                    <td className="amt-paid">{p?.totalAmountPaid > 0 ? formatCurrency(p?.totalAmountPaid) : <span className="no-val">—</span>}</td>
                    <td className={p?.vendorPendingPayment > 0 ? 'amt-pending' : 'amt-paid'}>
                      {p?.vendorPendingPayment > 0 ? formatCurrency(p?.vendorPendingPayment) : '✓ Clear'}
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <div className="progress-cell">
                        <div className="progress-cell__bar">
                          <div className="progress-cell__fill"
                            style={{ width: `${Math.min(p?.vendorUtilPct, 100)}%`, background: p?.vendorUtilPct > 80 ? '#28A745' : p?.vendorUtilPct > 40 ? '#FFC107' : '#DC3545' }} />
                        </div>
                        <span className="progress-cell__pct">{p?.vendorUtilPct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${p?.paymentStatus === 'cleared' ? 'success' : p?.paymentStatus === 'partial' ? 'warning' : 'danger'}`}>
                        {p?.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="fin-table-total">
                  <td colSpan={4}>Total ({filteredVendorProjs.length} projects)</td>
                  <td>{formatCurrency(filteredVendorProjs.reduce((s, p) => s + (p?.poAmount || 0), 0))}</td>
                  <td style={{ textAlign: 'center' }}>{filteredVendorProjs.reduce((s, p) => s + (p?.noOfExpInvoice || 0), 0)}</td>
                  <td>{formatCurrency(filteredVendorProjs.reduce((s, p) => s + (p?.totalInvoiceAmount || 0), 0))}</td>
                  <td className="amt-paid">{formatCurrency(filteredVendorProjs.reduce((s, p) => s + (p?.totalAmountPaid || 0), 0))}</td>
                  <td className="amt-pending">{formatCurrency(filteredVendorProjs.reduce((s, p) => s + (p?.vendorPendingPayment || 0), 0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Invoice Register View ── */}
      {view === 'invoices' && (
        <div className="card animate-fade-in-up">
          <div className="card-header sub-register-bar-header">
            <div>
              <h3 className="fin-chart-title">Invoice Register</h3>
              <p className="fin-chart-sub">Vendor bills via Bill Desk · Expenditure processing status · GST tax invoices raised on User Department</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className={`btn btn-sm ${showInvoiceRegFilters ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowInvoiceRegFilters(prev => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                <span>{showInvoiceRegFilters ? 'Hide Filters' : 'Filter Invoices'}</span>
              </button>
            </div>
          </div>

          {showInvoiceRegFilters && (
            <div className="sub-register-filter-panel">
              <div className="sub-filter-grid">
                <div className="sub-filter-item">
                  <label>Search Project / Department / Customer</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm" 
                    placeholder="Project Code / Dept / Customer..." 
                    value={invoiceRegFilter.search} 
                    onChange={e => setInvoiceRegFilter(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Payment Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={invoiceRegFilter.paymentStatus} 
                    onChange={e => setInvoiceRegFilter(f => ({ ...f, paymentStatus: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="cleared">CLEARED</option>
                    <option value="partial">PARTIAL</option>
                    <option value="pending">PENDING</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Expenditure Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={invoiceRegFilter.expStatus} 
                    onChange={e => setInvoiceRegFilter(f => ({ ...f, expStatus: e.target.value }))}
                  >
                    <option value="">All Expenditure</option>
                    <option value="PROCESSED">Bills Approved / Processed</option>
                    <option value="NONE">No Bills Approved</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Min Invoiced (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Min Invoiced ₹" 
                    value={invoiceRegFilter.minInvoiced} 
                    onChange={e => setInvoiceRegFilter(f => ({ ...f, minInvoiced: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Max Invoiced (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Max Invoiced ₹" 
                    value={invoiceRegFilter.maxInvoiced} 
                    onChange={e => setInvoiceRegFilter(f => ({ ...f, maxInvoiced: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-actions">
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ color: '#dc3545', fontWeight: 600 }}
                    onClick={() => setInvoiceRegFilter({ search: '', paymentStatus: '', expStatus: '', minInvoiced: '', maxInvoiced: '' })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table fin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project Code</th>
                  <th>Department / Customer</th>
                  <th title="Bills the vendor has submitted into NICSI's Bill Desk">Bills Submitted</th>
                  <th title="Of those Bill Desk bills, how many have been fully processed as expenditure">Expected Bills</th>
                  <th>Invoice Value Submitted</th>
                  <th>Amount Paid</th>
                  <th title="GST tax invoices">Tax Invoices Raised</th>
                  <th>Tax Invoice Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoiceProjs.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No records match invoice criteria.</td></tr>
                ) : filteredInvoiceProjs.map((p: any, i) => (
                  <tr key={p?.headerId} onClick={() => openProjectModal(p, 'overview')} style={{ cursor: 'pointer' }} className="table-row-hover">
                    <td style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{i + 1}</td>
                    <td><code className="proj-code-fin">{p?.projectCode}</code></td>
                    <td className="org-name-fin">{p?.customerName}</td>
                    <td 
                      style={{ cursor: 'pointer' }} 
                      onClick={(e) => { e.stopPropagation(); openProjectModal(p, 'billdesk'); }}
                      title="Click to view BillDesk Invoices submitted by vendor"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <span className="inv-count-badge inv-count-badge--client" style={{ cursor: 'pointer' }}>{p?.noOfInvBilldesk || 0}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>submitted by vendor</span>
                      </div>
                    </td>
                    <td 
                      style={{ cursor: 'pointer' }} 
                      onClick={(e) => { e.stopPropagation(); openProjectModal(p, 'billdesk'); }}
                      title="Click to view Processed Expenditure Bills"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <span className={`inv-count-badge ${p?.noOfExpInvoice > 0 ? 'inv-count-badge--vendor' : ''}`} style={{ cursor: 'pointer' }}>{p?.noOfExpInvoice || 0}</span>
                        {p?.noOfExpInvoice > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>approved</span>}
                      </div>
                    </td>
                    <td className="amt-po">{p?.totalInvoiceAmount > 0 ? formatCurrencyFull(p?.totalInvoiceAmount) : <span className="no-val">—</span>}</td>
                    <td className="amt-paid">{p?.totalAmountPaid > 0 ? formatCurrencyFull(p?.totalAmountPaid) : <span className="no-val">—</span>}</td>
                    <td 
                      style={{ cursor: 'pointer', textAlign: 'center' }} 
                      onClick={(e) => { e.stopPropagation(); openProjectModal(p, 'tax'); }}
                      title="Click to view GST Tax Invoices"
                    >
                      <span className={`inv-count-badge ${p?.noOfTaxInvoice > 0 ? 'inv-count-badge--tax' : ''}`} style={{ cursor: 'pointer' }}>{p?.noOfTaxInvoice || 0}</span>
                    </td>
                    <td>{p?.totalTaxInvoiceAmount > 0 ? formatCurrencyFull(p?.totalTaxInvoiceAmount) : <span className="no-val">—</span>}</td>
                    <td>
                      <span className={`badge badge-${p?.paymentStatus === 'cleared' ? 'success' : p?.paymentStatus === 'partial' ? 'warning' : 'danger'}`}>
                        {p?.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="fin-table-total">
                  <td colSpan={3}>Total ({filteredInvoiceProjs.length} projects)</td>
                  <td style={{ textAlign: 'center' }}>{filteredInvoiceProjs.reduce((s, p) => s + (p?.noOfInvBilldesk || 0), 0)}</td>
                  <td style={{ textAlign: 'center' }}>{filteredInvoiceProjs.reduce((s, p) => s + (p?.noOfExpInvoice || 0), 0)}</td>
                  <td>{formatCurrencyFull(filteredInvoiceProjs.reduce((s, p) => s + (p?.totalInvoiceAmount || 0), 0))}</td>
                  <td className="amt-paid">{formatCurrencyFull(filteredInvoiceProjs.reduce((s, p) => s + (p?.totalAmountPaid || 0), 0))}</td>
                  <td style={{ textAlign: 'center' }}>{filteredInvoiceProjs.reduce((s, p) => s + (p?.noOfTaxInvoice || 0), 0)}</td>
                  <td>{formatCurrencyFull(filteredInvoiceProjs.reduce((s, p) => s + (p?.totalTaxInvoiceAmount || 0), 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── PO Register View ── */}
      {view === 'poRegister' && (
        <div className="card animate-fade-in-up">
          <div className="card-header sub-register-bar-header">
            <div>
              <h3 className="fin-chart-title">Purchase Order Register (ERP Data)</h3>
              <p className="fin-chart-sub">All POs from Oracle ERP · Showing {filteredPoRegData.length} of {poTotal} records</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className={`btn btn-sm ${showPoRegFilters ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowPoRegFilters(prev => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                <span>{showPoRegFilters ? 'Hide Filters' : 'Filter PO Register'}</span>
              </button>
            </div>
          </div>

          {showPoRegFilters && (
            <div className="sub-register-filter-panel">
              <div className="sub-filter-grid">
                <div className="sub-filter-item">
                  <label>Search PO / Project / Vendor</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm" 
                    placeholder="PO No / Project / Vendor..." 
                    value={poRegFilter.search} 
                    onChange={e => setPoRegFilter(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Approval Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={poRegFilter.approvalStatus} 
                    onChange={e => setPoRegFilter(f => ({ ...f, approvalStatus: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="DISPATCHED">DISPATCHED</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Expiry Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={poRegFilter.expiryStatus} 
                    onChange={e => setPoRegFilter(f => ({ ...f, expiryStatus: e.target.value }))}
                  >
                    <option value="">All Expiry States</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="EXPIRING">EXPIRING SOON (&lt;30 Days)</option>
                    <option value="EXPIRED">EXPIRED</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>PO Date From</label>
                  <input 
                    type="date" 
                    className="form-control form-control-sm" 
                    value={poRegFilter.dateFrom} 
                    onChange={e => setPoRegFilter(f => ({ ...f, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>PO Date To</label>
                  <input 
                    type="date" 
                    className="form-control form-control-sm" 
                    value={poRegFilter.dateTo} 
                    onChange={e => setPoRegFilter(f => ({ ...f, dateTo: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Min PO Amount (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Min Amt ₹" 
                    value={poRegFilter.minAmount} 
                    onChange={e => setPoRegFilter(f => ({ ...f, minAmount: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Max PO Amount (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Max Amt ₹" 
                    value={poRegFilter.maxAmount} 
                    onChange={e => setPoRegFilter(f => ({ ...f, maxAmount: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-actions">
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ color: '#dc3545', fontWeight: 600 }}
                    onClick={() => setPoRegFilter({ search: '', approvalStatus: '', expiryStatus: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table fin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project No</th>
                  <th>PO Number</th>
                  <th>PO Date</th>
                  <th>From Date</th>
                  <th>To Date</th>
                  <th>Vendor</th>
                  <th>PO Amount</th>
                  <th>Status</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {filteredPoRegData.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No Purchase Orders match filter criteria.</td></tr>
                ) : filteredPoRegData.map((po: any, i: number) => {
                  const isExpired = po.todate && new Date(po.todate) < new Date();
                  const isExpiringSoon = po.todate && !isExpired && new Date(po.todate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                  return (
                    <tr key={po.headerId} className={isExpired ? 'table-row-expired' : ''}>
                      <td style={{ color: '#6c757d', fontWeight: 600 }}>{poPage * 50 + i + 1}</td>
                      <td><code className="proj-code-fin">{po.projectNo}</code></td>
                      <td style={{ fontWeight: 700, color: '#003366' }}>{po.finalPoNo}</td>
                      <td>{po.poDate || '—'}</td>
                      <td>{po.frdate || '—'}</td>
                      <td style={{ fontWeight: 600, color: isExpired ? '#DC3545' : isExpiringSoon ? '#856404' : '#155724' }}>{po.todate || '—'}</td>
                      <td style={{ fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendorName}</td>
                      <td className="amt-primary">{formatCurrency(po.total || 0)}</td>
                      <td><span className="badge badge-success">{po.approvalStatus}</span></td>
                      <td>
                        {isExpired && <span style={{ background: '#fde8e8', color: '#DC3545', padding: '2px 8px', borderRadius: '99px', fontSize: '0.625rem', fontWeight: 800 }}>EXPIRED</span>}
                        {isExpiringSoon && <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '99px', fontSize: '0.625rem', fontWeight: 800 }}>EXPIRING</span>}
                        {!isExpired && !isExpiringSoon && po.todate && <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '99px', fontSize: '0.625rem', fontWeight: 800 }}>ACTIVE</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {poTotal > 50 && (
            <div className="table-pagination">
              <span style={{ fontSize: '0.8125rem', color: '#6c757d' }}>Page {poPage + 1} of {Math.ceil(poTotal / 50)}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={poPage === 0} onClick={() => setPoPage(p => p - 1)}>Prev</button>
                <button className="btn btn-ghost btn-sm" disabled={(poPage + 1) * 50 >= poTotal} onClick={() => setPoPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BillDesk Invoices View ── */}
      {view === 'billDesk' && (
        <div className="card animate-fade-in-up">
          <div className="card-header sub-register-bar-header">
            <div>
              <h3 className="fin-chart-title">BillDesk Invoice Register (ERP Data)</h3>
              <p className="fin-chart-sub">Vendor invoices processed through BillDesk · Showing {filteredBdRegData.length} of {bdTotal} records</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button 
                className={`btn btn-sm ${showBdRegFilters ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowBdRegFilters(prev => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                <span>{showBdRegFilters ? 'Hide Filters' : 'Filter BillDesk'}</span>
              </button>
            </div>
          </div>

          {showBdRegFilters && (
            <div className="sub-register-filter-panel">
              <div className="sub-filter-grid">
                <div className="sub-filter-item">
                  <label>Search Invoice / PO / Vendor</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm" 
                    placeholder="Invoice No / PO / Vendor..." 
                    value={bdRegFilter.search} 
                    onChange={e => setBdRegFilter(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Payment Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={bdRegFilter.status} 
                    onChange={e => setBdRegFilter(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="PAID">PAYMENT DONE</option>
                    <option value="PENDING">PENDING PAYMENT</option>
                    <option value="OBJECTION">OBJECTION RAISED</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Invoice Date From</label>
                  <input 
                    type="date" 
                    className="form-control form-control-sm" 
                    value={bdRegFilter.dateFrom} 
                    onChange={e => setBdRegFilter(f => ({ ...f, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Invoice Date To</label>
                  <input 
                    type="date" 
                    className="form-control form-control-sm" 
                    value={bdRegFilter.dateTo} 
                    onChange={e => setBdRegFilter(f => ({ ...f, dateTo: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Min Invoice Amt (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Min Amt ₹" 
                    value={bdRegFilter.minAmount} 
                    onChange={e => setBdRegFilter(f => ({ ...f, minAmount: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Max Invoice Amt (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Max Amt ₹" 
                    value={bdRegFilter.maxAmount} 
                    onChange={e => setBdRegFilter(f => ({ ...f, maxAmount: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item" style={{ justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 700, color: '#dc3545' }}>
                    <input 
                      type="checkbox" 
                      checked={bdRegFilter.objectionOnly} 
                      onChange={e => setBdRegFilter(f => ({ ...f, objectionOnly: e.target.checked }))}
                    />
                    Only Objections
                  </label>
                </div>
                <div className="sub-filter-actions">
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ color: '#dc3545', fontWeight: 600 }}
                    onClick={() => setBdRegFilter({ search: '', status: '', objectionOnly: false, dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table fin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project No</th>
                  <th>PO No</th>
                  <th>Invoice No</th>
                  <th>Invoice Date</th>
                  <th>Received Date</th>
                  <th>Invoice Amt</th>
                  <th>Amount Paid</th>
                  <th>Objection</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBdRegData.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No BillDesk records match filter criteria.</td></tr>
                ) : filteredBdRegData.map((bd: any, i: number) => (
                  <tr key={bd.headerId}>
                    <td style={{ color: '#6c757d', fontWeight: 600 }}>{bdPage * 50 + i + 1}</td>
                    <td><code className="proj-code-fin">{bd.projectNo}</code></td>
                    <td style={{ fontWeight: 600, color: '#003366' }}>{bd.finalPoNo}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{bd.invoiceNum || bd.invoiceNo}</td>
                    <td>{bd.invoiceDate || '—'}</td>
                    <td>{bd.receivedDate || '—'}</td>
                    <td className="amt-primary">{formatCurrency(bd.invoiceAmount || 0)}</td>
                    <td className="amt-paid">{formatCurrency(bd.amountPaid || 0)}</td>
                    <td>
                      {bd.objectionRemarks ? (
                        <span style={{ background: '#fde8e8', color: '#DC3545', padding: '2px 6px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 600 }} title={bd.objectionRemarks}>
                          Objection
                        </span>
                      ) : (
                        <span style={{ color: '#adb5bd', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${bd.status === 'Payment Done' ? 'success' : 'warning'}`}>
                        {bd.status || 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bdTotal > 50 && (
            <div className="table-pagination">
              <span style={{ fontSize: '0.8125rem', color: '#6c757d' }}>Page {bdPage + 1} of {Math.ceil(bdTotal / 50)}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={bdPage === 0} onClick={() => setBdPage(p => p - 1)}>Prev</button>
                <button className="btn btn-ghost btn-sm" disabled={(bdPage + 1) * 50 >= bdTotal} onClick={() => setBdPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tax Invoices View (Authentic NICSI ERP Register Data) ── */}
      {view === 'taxInvoices' && (() => {
        const sumTotal = filteredTiRegData.reduce((s: number, ti: any) => s + (Number(ti.totalAmount) || 0), 0);
        return (
        <div className="card animate-fade-in-up">
          <div className="card-header sub-register-bar-header">
            <div>
              <h3 className="fin-chart-title">GST Tax Invoice Register</h3>
              <p className="fin-chart-sub">
                Invoices raised on User Departments · Showing {filteredTiRegData.length} of {tiTotal} total records
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#003366', background: '#eef6ff', padding: '6px 14px', borderRadius: '6px', border: '1px solid #cfe3fb' }}>
                Filtered Total: {formatCurrency(sumTotal)}
              </div>
              <button 
                className={`btn btn-sm ${showTiRegFilters ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowTiRegFilters(prev => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                <span>{showTiRegFilters ? 'Hide Filters' : 'Filter Tax Invoices'}</span>
              </button>
            </div>
          </div>

          {showTiRegFilters && (
            <div className="sub-register-filter-panel">
              <div className="sub-filter-grid">
                <div className="sub-filter-item">
                  <label>Search Bill / Project / IRN</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm" 
                    placeholder="Bill No / Project / IRN..." 
                    value={tiRegFilter.search} 
                    onChange={e => setTiRegFilter(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Bill Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={tiRegFilter.status} 
                    onChange={e => setTiRegFilter(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="FINAL">FINAL</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>IRN Status</label>
                  <select 
                    className="form-control form-control-sm" 
                    value={tiRegFilter.irnStatus} 
                    onChange={e => setTiRegFilter(f => ({ ...f, irnStatus: e.target.value }))}
                  >
                    <option value="">All IRN States</option>
                    <option value="GENERATED">IRN Generated</option>
                    <option value="PENDING">IRN Pending</option>
                  </select>
                </div>
                <div className="sub-filter-item">
                  <label>Bill Date From</label>
                  <input 
                    type="date" 
                    className="form-control form-control-sm" 
                    value={tiRegFilter.dateFrom} 
                    onChange={e => setTiRegFilter(f => ({ ...f, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Bill Date To</label>
                  <input 
                    type="date" 
                    className="form-control form-control-sm" 
                    value={tiRegFilter.dateTo} 
                    onChange={e => setTiRegFilter(f => ({ ...f, dateTo: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Min Total Amt (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Min Total ₹" 
                    value={tiRegFilter.minAmount} 
                    onChange={e => setTiRegFilter(f => ({ ...f, minAmount: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-item">
                  <label>Max Total Amt (₹)</label>
                  <input 
                    type="number" 
                    className="form-control form-control-sm" 
                    placeholder="Max Total ₹" 
                    value={tiRegFilter.maxAmount} 
                    onChange={e => setTiRegFilter(f => ({ ...f, maxAmount: e.target.value }))}
                  />
                </div>
                <div className="sub-filter-actions">
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ color: '#dc3545', fontWeight: 600 }}
                    onClick={() => setTiRegFilter({ search: '', status: '', irnStatus: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table fin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project Code</th>
                  <th>Tax Invoice No</th>
                  <th>Bill Date</th>
                  <th>Place of Supply / State</th>
                  <th>Billing Period</th>
                  <th style={{ textAlign: 'right' }}>Total Invoice Amount</th>
                  <th>Bill Status</th>
                  <th>IRN Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTiRegData.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>No Tax Invoices match filter criteria.</td></tr>
                ) : filteredTiRegData.map((ti: any, i: number) => {
                  const totalAmt = Number(ti.totalAmount) || 0;
                  const billingPeriod = ti.billingPeriodFrom && ti.billingPeriodTo 
                    ? `${ti.billingPeriodFrom} → ${ti.billingPeriodTo}` 
                    : (ti.billingPeriodFrom || ti.billingPeriodTo || '—');

                  return (
                    <tr key={ti.headerId}>
                      <td style={{ color: '#6c757d', fontWeight: 600 }}>{tiPage * 50 + i + 1}</td>
                      <td><code className="proj-code-fin">{ti.projectNo}</code></td>
                      <td style={{ fontSize: '0.78rem', fontWeight: 700, color: '#003366' }}>{ti.userBillNo || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{ti.billDate || '—'}</td>
                      <td><span className="state-fin">{ti.stateDescription || '—'}</span></td>
                      <td style={{ fontSize: '0.78rem', color: '#555' }}>{billingPeriod}</td>
                      <td className="amt-primary" style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(totalAmt)}</td>
                      <td>
                        <span className={`badge badge-${ti.billStatus === 'FINAL' || ti.billStatus === 'APPROVED' ? 'success' : 'warning'}`}>
                          {ti.billStatus || 'FINAL'}
                        </span>
                      </td>
                      <td>
                        {ti.irnNo ? (
                          <span style={{ background: '#d4edda', color: '#155724', padding: '2px 6px', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700 }} title={ti.irnNo}>
                            ✓ IRN
                          </span>
                        ) : (
                          <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 6px', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700 }} title="e-Invoice IRN not generated">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="gst-note">
            <strong>Authentic ERP Data Notice:</strong> Figures are displayed directly from the NICSI ERP Tax Invoice Register (`tax_inv_list`). Total Invoice Amount represents the complete billing value raised on the User Department.
          </p>
          {tiTotal > 50 && (
            <div className="table-pagination">
              <span style={{ fontSize: '0.8125rem', color: '#6c757d' }}>Page {tiPage + 1} of {Math.ceil(tiTotal / 50)}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={tiPage === 0} onClick={() => setTiPage(p => p - 1)}>Prev</button>
                <button className="btn btn-ghost btn-sm" disabled={(tiPage + 1) * 50 >= tiTotal} onClick={() => setTiPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Detail Modal */}
      {selectedProject && (
        <div className="modal-overlay" onClick={() => setSelectedProject(null)} style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="detail-modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: '2rem', borderRadius: '8px', maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="detail-modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div>
                <button 
                  className="btn btn-outline btn-sm" 
                  onClick={() => setSelectedProject(null)} 
                  style={{ marginBottom: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#003366', borderColor: '#003366', fontSize: '0.8rem' }}
                >
                  ← Back to Register
                </button>
                <h3 style={{ margin: '0 0 0.4rem 0', color: '#003366' }}>{selectedProject.projectName || selectedProject.customerName}</h3>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', color: '#666' }}>
                  <span>Code: <strong>{selectedProject.projectCode}</strong></span>
                  <span>State: <strong>{selectedProject.stateCode}</strong></span>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setSelectedProject(null)} style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            
            <div className="finance-tabs" style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0' }}>
              <button className={`finance-tab ${activeModalTab === 'overview' ? 'finance-tab--active' : ''}`} onClick={() => setActiveModalTab('overview')}>Overview</button>
              <button className={`finance-tab ${activeModalTab === 'pos' ? 'finance-tab--active' : ''}`} onClick={() => setActiveModalTab('pos')}>Purchase Orders ({selectedProjectDetails.poData.length})</button>
              <button className={`finance-tab ${activeModalTab === 'billdesk' ? 'finance-tab--active' : ''}`} onClick={() => setActiveModalTab('billdesk')}>BillDesk Invoices ({selectedProjectDetails.billDeskData.length})</button>
              <button className={`finance-tab ${activeModalTab === 'tax' ? 'finance-tab--active' : ''}`} onClick={() => setActiveModalTab('tax')}>Tax Invoices ({selectedProjectDetails.taxInvData.length})</button>
            </div>

            {selectedProjectDetails.loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading details...</div>
            ) : (
              <>
                {activeModalTab === 'overview' && (
                  <>
                    <div className="quick-stats-grid" style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                      <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>PO Amount</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#006699' }}>{formatCurrencyFull(selectedProject.poAmount)}</div>
                      </div>
                      <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Vendor Paid</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#28A745' }}>{formatCurrencyFull(selectedProject.totalAmountPaid)}</div>
                      </div>
                      <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Pending Dues</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#DC3545' }}>{formatCurrencyFull(selectedProject.vendorPendingPayment)}</div>
                      </div>
                      <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Invoiced</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#17a2b8' }}>{formatCurrencyFull(selectedProject.totalInvoiceAmount)}</div>
                      </div>
                    </div>

                    <div style={{ border: '1px solid #e1e9fb', borderRadius: '8px', padding: '1.5rem', background: '#f8fbff' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: '#003366', borderBottom: '1px solid #d0e4f7', paddingBottom: '0.5rem' }}>Detailed GST & Invoice Breakdown</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                          <h5 style={{ margin: '0 0 0.5rem 0', color: '#555' }}>Tax & Invoicing</h5>
                          <table style={{ width: '100%', fontSize: '0.9rem' }}>
                            <tbody>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Tax Invoices (Count)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{selectedProject.noOfTaxInvoice || 0}</td></tr>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Total Tax Invoice Value</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrencyFull(selectedProject.totalTaxInvoiceAmount)}</td></tr>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Vendor Bills (Bill Desk)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{selectedProject.noOfInvBilldesk || 0}</td></tr>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Processed as Expenditure</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{selectedProject.noOfExpInvoice || 0}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <h5 style={{ margin: '0 0 0.5rem 0', color: '#555' }}>Estimated GST Allocations</h5>
                          <table style={{ width: '100%', fontSize: '0.9rem' }}>
                            <tbody>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Est. Base Value (PO)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrencyFull(selectedProject.poAmount / 1.18)}</td></tr>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Est. GST on PO (18%)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrencyFull(selectedProject.poAmount - (selectedProject.poAmount / 1.18))}</td></tr>
                              <tr><td style={{ padding: '0.5rem 0', color: '#666' }}>Est. GST on Invoiced (18%)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrencyFull(selectedProject.totalInvoiceAmount - (selectedProject.totalInvoiceAmount / 1.18))}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                
                {activeModalTab === 'pos' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table fin-table">
                      <thead>
                        <tr><th>PO Number</th><th>Date</th><th>From Date</th><th>To Date</th><th>Vendor</th><th>PO Amount</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {selectedProjectDetails.poData.length === 0 ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '1rem'}}>No Purchase Orders found</td></tr> : 
                          selectedProjectDetails.poData.map((po: any) => (
                            <tr key={po.headerId}>
                              <td style={{ fontWeight: 700, color: '#003366' }}>{po.finalPoNo}</td>
                              <td>{po.poDate || '—'}</td>
                              <td>{po.frdate || '—'}</td>
                              <td>{po.todate || '—'}</td>
                              <td style={{ fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.vendorName}</td>
                              <td className="amt-primary">{formatCurrency(po.total || 0)}</td>
                              <td><span className="badge badge-success">{po.approvalStatus}</span></td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                )}
                
                {activeModalTab === 'billdesk' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table fin-table">
                      <thead>
                        <tr><th>PO No</th><th>Invoice No</th><th>Date</th><th>Received Date</th><th>Invoice Amt</th><th>Amount Paid</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {selectedProjectDetails.billDeskData.length === 0 ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '1rem'}}>No BillDesk Invoices found</td></tr> : 
                          selectedProjectDetails.billDeskData.map((bd: any) => (
                            <tr key={bd.headerId}>
                              <td style={{ fontWeight: 600, color: '#003366' }}>{bd.finalPoNo}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{bd.invoiceNum || bd.invoiceNo}</td>
                              <td>{bd.invoiceDate || '—'}</td>
                              <td>{bd.receivedDate || '—'}</td>
                              <td className="amt-primary">{formatCurrency(bd.invoiceAmount || 0)}</td>
                              <td className="amt-paid">{formatCurrency(bd.amountPaid || 0)}</td>
                              <td><span className={`badge badge-${bd.status === 'Payment Done' ? 'success' : 'warning'}`}>{bd.status || 'Pending'}</span></td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                )}
                
                {activeModalTab === 'tax' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table fin-table">
                      <thead>
                        <tr><th>Tax Invoice No</th><th>Date</th><th>Place of Supply</th><th>Taxable Value</th><th>Invoice Value</th><th>Type</th><th>IRN</th></tr>
                      </thead>
                      <tbody>
                        {selectedProjectDetails.taxInvData.length === 0 ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '1rem'}}>No Tax Invoices found</td></tr> : 
                          selectedProjectDetails.taxInvData.map((ti: any) => {
                            const g = computeGst(ti.totalAmount || 0, ti.prjGstnNo, ti.custGstinNo);
                            return (
                              <tr key={ti.headerId}>
                                <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{ti.userBillNo || '—'}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{ti.billDate || '—'}</td>
                                <td><span className="state-fin">{ti.stateDescription || g.recipientState}</span></td>
                                <td>{formatCurrency(g.taxableValue)}</td>
                                <td className="amt-primary">{formatCurrency(g.totalAmount)}</td>
                                <td><span className={`gst-type-badge ${g.intraState ? 'gst-type-badge--intra' : 'gst-type-badge--inter'}`}>{g.intraState ? 'Intra-State' : 'Inter-State'}</span></td>
                                <td>
                                  {ti.irnNo ? <span style={{ background: '#d4edda', color: '#155724', padding: '2px 6px', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700 }} title={ti.irnNo}>✓ IRN</span>
                                  : <span style={{ background: '#fff3cd', color: '#856404', padding: '2px 6px', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 700 }}>Pending</span>}
                                </td>
                              </tr>
                            );
                          })
                        }
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

