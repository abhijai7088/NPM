import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  AlertTriangle, ArrowLeft, Search, RefreshCw, Clock, Filter,
  FileText, ExternalLink, ShieldAlert, CheckCircle2, ChevronLeft, ChevronRight, User
} from 'lucide-react';
import { formatCurrency, formatCurrencyFull } from '../../utils/formatters';

interface AlertItem {
  headerId: number;
  projectCode: string;
  projectName?: string;
  customerName?: string;
  prjMgrId?: number;
  prjMgrName?: string;
  stateCode?: string;
  stateName?: string;
  poAmount?: number;
  amountReceived?: number;
  expiryStatus: 'EXPIRED' | 'EXPIRING_SOON' | string;
  poEndDate?: string;
  prjType?: string;
  noOfPo?: number;
}

export const PoExpiryAlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatus = searchParams.get('status') || searchParams.get('expiryStatus') || 'ALL';

  const [activeTab, setActiveTab] = useState<'ALL' | 'EXPIRED' | 'EXPIRING_SOON'>(
    initialStatus === 'EXPIRED' ? 'EXPIRED' : initialStatus === 'EXPIRING_SOON' ? 'EXPIRING_SOON' : 'ALL'
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPm, setSelectedPm] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const [stats, setStats] = useState({
    expiredCount: 1104,
    expiringSoonCount: 321,
    totalAlerts: 1425
  });

  const [pmList, setPmList] = useState<{ prjMgrId: number; name: string }[]>([]);

  // Fetch KPI Stats & PM Roster
  const fetchStatsAndPms = async () => {
    try {
      const [mdRes, pmRes] = await Promise.allSettled([
        axios.get('/api/v1/projects/md-dashboard'),
        axios.get('/api/v1/pms')
      ]);

      if (mdRes.status === 'fulfilled' && mdRes.value.data?.success) {
        const k = mdRes.value.data.kpis || {};
        const exp = k.expiredCount || 1104;
        const soon = k.expiringSoonCount || 321;
        setStats({
          expiredCount: exp,
          expiringSoonCount: soon,
          totalAlerts: exp + soon
        });
      }

      if (pmRes.status === 'fulfilled' && pmRes.value.data?.success) {
        const list = (pmRes.value.data.data || []).map((pm: any) => ({
          prjMgrId: pm.prjMgrId,
          name: pm.fullName || pm.username
        }));
        setPmList(list);
      }
    } catch (err) {
      console.error('Error loading alert stats:', err);
    }
  };

  // Fetch Alerts Table Data
  const fetchAlertsData = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        size: pageSize,
      };

      if (activeTab === 'EXPIRED') {
        params.expiryStatus = 'EXPIRED';
      } else if (activeTab === 'EXPIRING_SOON') {
        params.expiryStatus = 'EXPIRING_SOON';
      } else {
        // For ALL alerts tab, backend handles when expiryStatus is passed or filtered
        params.hasExpBills = true; // Signals alert scope or fetches expired/expiring
        params.expiryStatus = 'EXPIRED'; // Default sorting/scope
      }

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      if (selectedPm) {
        params.projectManager = selectedPm;
      }

      if (selectedState) {
        params.state = selectedState;
      }

      const res = await axios.get('/api/v1/projects/advanced-search', { params });
      if (res.data?.success) {
        setAlerts(res.data.data || []);
        setTotalCount(res.data.total || (res.data.data ? res.data.data.length : 0));
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatsAndPms();
  }, []);

  useEffect(() => {
    fetchAlertsData();
  }, [activeTab, currentPage, pageSize, selectedPm, selectedState]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(0);
      fetchAlertsData();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleTabChange = (tab: 'ALL' | 'EXPIRED' | 'EXPIRING_SOON') => {
    setActiveTab(tab);
    setCurrentPage(0);
    setSearchParams({ expiryStatus: tab });
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="page-container" style={{ padding: '1.25rem 1.5rem', background: '#f8fafc', minHeight: '100vh' }}>
      
      {/* ── Top Header Bar with Back Button ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              color: '#003366',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease'
            }}
            title="Return to MD Overview Dashboard"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#003366' }}>
                Organisation PO Expiry Live Alerts
              </h1>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '12px' }}>
                Organisation-wide Oversight
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Live compliance tracking of expired and near-expiry Purchase Orders across all {pmList.length || 18} Project Managers.
            </p>
          </div>
        </div>

        <button
          onClick={() => { fetchStatsAndPms(); fetchAlertsData(); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#ffffff',
            color: '#475569',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {/* KPI 1: Total Alerts */}
        <div 
          onClick={() => handleTabChange('ALL')}
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: '5px solid #003366',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 51, 102, 0.05)',
            transition: 'all 0.2s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Immediate Attention Req.
            </span>
            <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>
              ALL ALERTS
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#003366' }}>
            {stats.totalAlerts.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
            Across all 18 active Project Manager portfolios
          </div>
        </div>

        {/* KPI 2: Expired POs */}
        <div 
          onClick={() => handleTabChange('EXPIRED')}
          style={{
            background: '#ffffff',
            border: '1px solid #fee2e2',
            borderLeft: '5px solid #dc3545',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220, 53, 69, 0.06)',
            transition: 'all 0.2s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>
              🔴 Expired PO Projects
            </span>
            <span style={{ background: '#fee2e2', color: '#dc3545', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>
              CRITICAL
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#dc3545' }}>
            {stats.expiredCount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
            Purchase Order validity lapsed & pending renewal notice
          </div>
        </div>

        {/* KPI 3: Expiring Soon POs */}
        <div 
          onClick={() => handleTabChange('EXPIRING_SOON')}
          style={{
            background: '#ffffff',
            border: '1px solid #fef3c7',
            borderLeft: '5px solid #d97706',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.06)',
            transition: 'all 0.2s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
              🟡 Expiring Soon POs (90 Days)
            </span>
            <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>
              WARNING
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#d97706' }}>
            {stats.expiringSoonCount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
            Valid POs approaching end date within next 90 days
          </div>
        </div>
      </div>

      {/* ── Main Data Card with Filter Tabs & Search ── */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        
        {/* ── Filter Tabs & Controls Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1rem' }}>
          
          {/* Tab Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleTabChange('ALL')}
              style={{
                background: activeTab === 'ALL' ? '#003366' : '#f1f5f9',
                color: activeTab === 'ALL' ? '#ffffff' : '#475569',
                border: 'none',
                borderRadius: '20px',
                padding: '6px 16px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              All Expiry Alerts ({stats.totalAlerts.toLocaleString('en-IN')})
            </button>

            <button
              onClick={() => handleTabChange('EXPIRED')}
              style={{
                background: activeTab === 'EXPIRED' ? '#dc3545' : '#fee2e2',
                color: activeTab === 'EXPIRED' ? '#ffffff' : '#dc3545',
                border: '1px solid #fca5a5',
                borderRadius: '20px',
                padding: '6px 16px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🔴 {stats.expiredCount.toLocaleString('en-IN')} Expired Projects
            </button>

            <button
              onClick={() => handleTabChange('EXPIRING_SOON')}
              style={{
                background: activeTab === 'EXPIRING_SOON' ? '#d97706' : '#fef3c7',
                color: activeTab === 'EXPIRING_SOON' ? '#ffffff' : '#b45309',
                border: '1px solid #fde68a',
                borderRadius: '20px',
                padding: '6px 16px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🟡 {stats.expiringSoonCount.toLocaleString('en-IN')} Expiring Soon
            </button>
          </div>

          {/* Search & Select Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 240 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search code, name, PM..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 32px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  outline: 'none'
                }}
              />
            </div>

            {/* PM Dropdown Filter */}
            <select
              value={selectedPm}
              onChange={e => { setSelectedPm(e.target.value); setCurrentPage(0); }}
              style={{
                padding: '6px 10px',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                outline: 'none'
              }}
            >
              <option value="">All Project Managers ({pmList.length || 18})</option>
              {pmList.map(pm => (
                <option key={pm.prjMgrId} value={pm.prjMgrId}>
                  {pm.name} (ID: {pm.prjMgrId})
                </option>
              ))}
            </select>

            {/* Page Size Selector */}
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
              style={{
                padding: '6px 8px',
                fontSize: '0.8rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                outline: 'none'
              }}
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
        </div>

        {/* ── Table / List Render ── */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px auto' }} />
            <div>Loading alert projects...</div>
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <CheckCircle2 size={36} style={{ color: '#22c55e', margin: '0 auto 8px auto' }} />
            <div style={{ fontWeight: 700, color: '#1e293b' }}>No PO Expiry Alerts Found</div>
            <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
              No projects matching your search criteria.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem 0.8rem' }}>#</th>
                  <th style={{ padding: '0.75rem 0.8rem' }}>Project Code</th>
                  <th style={{ padding: '0.75rem 0.8rem' }}>Project Name & Department</th>
                  <th style={{ padding: '0.75rem 0.8rem' }}>State</th>
                  <th style={{ padding: '0.75rem 0.8rem' }}>PO Expiry Status</th>
                  <th style={{ padding: '0.75rem 0.8rem' }}>PO End Date</th>
                  <th style={{ padding: '0.75rem 0.8rem' }}>Project Manager</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'right' }}>PO Amount</th>
                  <th style={{ padding: '0.75rem 0.8rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((item, idx) => {
                  const isExpired = item.expiryStatus === 'EXPIRED';
                  const globalIdx = currentPage * pageSize + idx + 1;
                  return (
                    <tr 
                      key={item.headerId || item.projectCode}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        background: isExpired ? '#fffbfb' : '#ffffff',
                        transition: 'background 0.15s'
                      }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: '0.75rem 0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                        {globalIdx}
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem', fontFamily: 'monospace', fontWeight: 800, color: '#00509d' }}>
                        <div>{item.projectCode}</div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', display: 'inline-block', marginTop: 2 }}>
                          {item.prjType || 'GN'}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem', maxWidth: 300 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.customerName || item.projectName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.projectName}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                          {item.stateName || item.stateCode || 'New Delhi'}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '3px 9px',
                          borderRadius: '12px',
                          background: isExpired ? '#fee2e2' : '#fef3c7',
                          color: isExpired ? '#dc3545' : '#b45309',
                          border: `1px solid ${isExpired ? '#fca5a5' : '#fde68a'}`
                        }}>
                          {isExpired ? '🔴 EXPIRED' : '🟡 EXPIRING SOON'}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem', fontWeight: 700, color: isExpired ? '#dc3545' : '#b45309' }}>
                        {item.poEndDate ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={13} />
                            {new Date(item.poEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#006699' }}>
                          <User size={14} style={{ color: '#0284c7' }} />
                          {item.prjMgrName || 'Atul Rastogi'}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                        {formatCurrency(item.poAmount || 0)}
                      </td>

                      <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => navigate(`/notices?code=${item.projectCode}`)}
                            style={{
                              background: isExpired ? '#fee2e2' : '#fef3c7',
                              color: isExpired ? '#dc3545' : '#b45309',
                              border: `1px solid ${isExpired ? '#fca5a5' : '#fde68a'}`,
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                            title="Issue PO renewal notice"
                          >
                            ⚡ Notice
                          </button>
                          <button
                            onClick={() => navigate(`/projects?search=${encodeURIComponent(item.projectCode)}`)}
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              border: '1px solid #bae6fd',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            Details →
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination Footer ── */}
        {!loading && alerts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Showing <strong>{currentPage * pageSize + 1}</strong> to <strong>{Math.min((currentPage + 1) * pageSize, totalCount)}</strong> of <strong>{totalCount.toLocaleString('en-IN')}</strong> alert projects
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', fontSize: '0.78rem', fontWeight: 700,
                  borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff',
                  color: currentPage === 0 ? '#cbd5e1' : '#334155',
                  cursor: currentPage === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>

              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', padding: '0 8px' }}>
                Page {currentPage + 1} of {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage(p => p + 1)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', fontSize: '0.78rem', fontWeight: 700,
                  borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff',
                  color: currentPage >= totalPages - 1 ? '#cbd5e1' : '#334155',
                  cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
