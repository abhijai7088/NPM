import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { UserCheck, CheckCircle, AlertCircle, RefreshCw, ShieldCheck, UserPlus, Search, Building2, Check, ShieldAlert } from 'lucide-react';

interface ProjectItem {
  headerId: number;
  projectCode: string;
  projectName: string;
  customerName: string;
  poAmount: number;
  amountReceived: number;
  prjMgrId: number | null;
  prjType: string;
  stateCode?: string;
  isPmcMonitored?: boolean;
}

interface ProjectManagerItem {
  prjMgrId: number;
  fullName: string;
  zone?: string;
  totalProjects?: number;
}

interface Props {
  onAssigned?: () => void;
}

export const UnassignedProjectsSection: React.FC<Props> = ({ onAssigned }) => {
  const [activeTab, setActiveTab] = useState<'unassigned' | 'reassign'>('unassigned');
  const [unassignedProjects, setUnassignedProjects] = useState<ProjectItem[]>([]);
  const [activeProjects, setActiveProjects] = useState<ProjectItem[]>([]);
  const [projectManagers, setProjectManagers] = useState<ProjectManagerItem[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [selectedPmMap, setSelectedPmMap] = useState<Record<number, number>>({});
  const [selectedHeaderIds, setSelectedHeaderIds] = useState<number[]>([]);
  const [bulkPmId, setBulkPmId] = useState<number | ''>('');
  
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [togglingPmcId, setTogglingPmcId] = useState<number | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // 1. Fetch PM List
      const pmRes = await axios.get('/api/v1/project-managers');
      if (pmRes.data?.success) {
        setProjectManagers(pmRes.data.data || []);
      }

      if (activeTab === 'unassigned') {
        // 2. Fetch unassigned projects
        const projRes = await axios.get('/api/v1/projects/advanced-search?projectManager=UNASSIGNED&size=200');
        if (projRes.data?.success) {
          setUnassignedProjects(projRes.data.data || []);
        }
      } else {
        // Fetch active projects for reassignment
        const activeRes = await axios.get('/api/v1/projects/advanced-search?size=200');
        if (activeRes.data?.success) {
          setActiveProjects(activeRes.data.data || []);
        }
      }
    } catch (err: any) {
      console.error('Failed to load project allocation desk:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentList = activeTab === 'unassigned' ? unassignedProjects : activeProjects;

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return currentList;
    const q = searchQuery.toLowerCase();
    return currentList.filter(p =>
      (p.projectCode && p.projectCode.toLowerCase().includes(q)) ||
      (p.projectName && p.projectName.toLowerCase().includes(q)) ||
      (p.customerName && p.customerName.toLowerCase().includes(q)) ||
      (p.prjType && p.prjType.toLowerCase().includes(q))
    );
  }, [currentList, searchQuery]);

  const handleSingleAssign = async (headerId: number) => {
    const pmId = selectedPmMap[headerId];
    if (!pmId) {
      setMessage({ type: 'error', text: 'Please select a Project Manager from the dropdown list first.' });
      return;
    }

    setAssigningId(headerId);
    setMessage(null);
    try {
      const targetPm = projectManagers.find(p => p.prjMgrId === pmId);
      const pmName = targetPm ? targetPm.fullName : `PM #${pmId}`;

      const res = await axios.put(`/api/v1/projects/${headerId}/assign-pm`, {
        prjMgrId: pmId,
        remarks: 'Assigned via Executive Allocation Panel'
      });

      if (res.data?.success) {
        setMessage({ type: 'success', text: `Project successfully assigned to ${pmName}!` });
        if (activeTab === 'unassigned') {
          setUnassignedProjects(prev => prev.filter(p => p.headerId !== headerId));
        } else {
          setActiveProjects(prev => prev.map(p => p.headerId === headerId ? { ...p, prjMgrId: pmId } : p));
        }
        if (onAssigned) onAssigned();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to assign Project Manager.' });
    } finally {
      setAssigningId(null);
    }
  };

  const handleTogglePmc = async (headerId: number) => {
    setTogglingPmcId(headerId);
    setMessage(null);
    try {
      const res = await axios.put(`/api/v1/projects/${headerId}/toggle-pmc`);
      if (res.data?.success) {
        const isMonitored = res.data.isPmcMonitored;
        setMessage({ type: 'success', text: res.data.message });
        const updateList = (prev: ProjectItem[]) =>
          prev.map(p => p.headerId === headerId ? { ...p, isPmcMonitored: isMonitored } : p);

        if (activeTab === 'unassigned') {
          setUnassignedProjects(updateList);
        } else {
          setActiveProjects(updateList);
        }
        if (onAssigned) onAssigned();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update PMC Tower status.' });
    } finally {
      setTogglingPmcId(null);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedHeaderIds.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one project using checkboxes.' });
      return;
    }
    if (!bulkPmId) {
      setMessage({ type: 'error', text: 'Please select a target Project Manager for bulk assignment.' });
      return;
    }

    setBulkAssigning(true);
    setMessage(null);
    try {
      const targetPm = projectManagers.find(p => p.prjMgrId === Number(bulkPmId));
      const pmName = targetPm ? targetPm.fullName : `PM #${bulkPmId}`;

      const res = await axios.post('/api/v1/projects/bulk-assign-pm', {
        headerIds: selectedHeaderIds,
        prjMgrId: Number(bulkPmId)
      });

      if (res.data?.success) {
        setMessage({ type: 'success', text: `Successfully assigned ${selectedHeaderIds.length} project(s) to ${pmName}!` });
        if (activeTab === 'unassigned') {
          setUnassignedProjects(prev => prev.filter(p => !selectedHeaderIds.includes(p.headerId)));
        } else {
          setActiveProjects(prev => prev.map(p => selectedHeaderIds.includes(p.headerId) ? { ...p, prjMgrId: Number(bulkPmId) } : p));
        }
        setSelectedHeaderIds([]);
        setBulkPmId('');
        if (onAssigned) onAssigned();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed bulk assignment.' });
    } finally {
      setBulkAssigning(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedHeaderIds.length === filteredProjects.length) {
      setSelectedHeaderIds([]);
    } else {
      setSelectedHeaderIds(filteredProjects.map(p => p.headerId));
    }
  };

  const toggleSelectHeaderId = (id: number) => {
    setSelectedHeaderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const getPmName = (pmId: number | null) => {
    if (!pmId) return 'Unassigned Pool';
    const found = projectManagers.find(p => p.prjMgrId === pmId);
    return found ? found.fullName : `PM #${pmId}`;
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '1.25rem',
      boxShadow: '0 4px 20px rgba(0, 51, 102, 0.08)',
      color: '#1e293b',
      marginBottom: '1.5rem',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus style={{ width: 18, height: 18, color: '#00509d' }} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#003366', margin: 0, letterSpacing: '-0.01em' }}>
              NICSI PM Allocation & PMC Tower Desk
            </h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: '9999px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
              {unassignedProjects.length} Unassigned In Pool
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '6px 0 0 0' }}>
            Executive Oversight: Allocate projects to PMs or add to PMC Control Tower oversight with end-to-end database synchronization.
          </p>
        </div>

        {/* Tab Switcher & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '3px' }}>
            <button
              onClick={() => { setActiveTab('unassigned'); setSelectedHeaderIds([]); }}
              style={{
                fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.85rem', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'unassigned' ? '#003366' : 'transparent',
                color: activeTab === 'unassigned' ? '#ffffff' : '#64748b'
              }}
            >
              Unassigned Pool ({unassignedProjects.length})
            </button>
            <button
              onClick={() => { setActiveTab('reassign'); setSelectedHeaderIds([]); }}
              style={{
                fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.85rem', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'reassign' ? '#006699' : 'transparent',
                color: activeTab === 'reassign' ? '#ffffff' : '#64748b'
              }}
            >
              Reassign Active Portfolio
            </button>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.45rem 0.75rem', cursor: 'pointer' }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {message && (
        <div style={{
          marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600,
          background: message.type === 'success' ? '#ecfdf5' : '#fff1f2',
          color: message.type === 'success' ? '#047857' : '#be123c',
          border: message.type === 'success' ? '1px solid #a7f3d0' : '1px solid #fecdd3'
        }}>
          {message.type === 'success' ? <CheckCircle style={{ width: 16, height: 16, color: '#059669', flexShrink: 0 }} /> : <AlertCircle style={{ width: 16, height: 16, color: '#e11d48', flexShrink: 0 }} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Search & Bulk Action Bar */}
      <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.75rem', flexGrow: 1, maxWidth: '360px' }}>
          <Search style={{ width: 15, height: 15, color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by project code, name, customer..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#1e293b', fontSize: '0.8rem', width: '100%' }}
          />
        </div>

        {/* Bulk Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={selectedHeaderIds.length > 0 && selectedHeaderIds.length === filteredProjects.length}
              onChange={toggleSelectAll}
              style={{ width: 15, height: 15, accentColor: '#003366', cursor: 'pointer' }}
            />
            <span>Select All ({selectedHeaderIds.length} of {filteredProjects.length})</span>
          </label>

          <select
            value={bulkPmId}
            onChange={e => setBulkPmId(e.target.value ? Number(e.target.value) : '')}
            style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#1e293b', fontSize: '0.8rem', borderRadius: '6px', padding: '0.4rem 0.75rem', outline: 'none', width: '220px' }}
          >
            <option value="">-- Bulk Select PM --</option>
            {projectManagers.map(pm => (
              <option key={pm.prjMgrId} value={pm.prjMgrId}>
                {pm.fullName} ({pm.zone || 'North Zone'} - ID: {pm.prjMgrId})
              </option>
            ))}
          </select>

          <button
            onClick={handleBulkAssign}
            disabled={bulkAssigning || selectedHeaderIds.length === 0 || !bulkPmId}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, padding: '0.45rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: selectedHeaderIds.length > 0 && bulkPmId ? '#003366' : '#cbd5e1',
              color: selectedHeaderIds.length > 0 && bulkPmId ? '#ffffff' : '#64748b',
              opacity: selectedHeaderIds.length === 0 || !bulkPmId ? 0.6 : 1
            }}
          >
            {bulkAssigning ? <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <UserCheck style={{ width: 14, height: 14 }} />}
            Assign Selected ({selectedHeaderIds.length})
          </button>
        </div>
      </div>

      {/* Projects Table */}
      {loading ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <RefreshCw style={{ width: 18, height: 18, color: '#00509d', animation: 'spin 1s linear infinite' }} />
          Loading project allocation data from database...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '2.5rem 1rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
          <ShieldCheck style={{ width: 36, height: 36, color: '#059669', margin: '0 auto 8px auto', opacity: 0.9 }} />
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#003366', margin: 0 }}>
            {activeTab === 'unassigned' ? 'All Pool Projects Assigned!' : 'No Matching Projects Found'}
          </h4>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 0 0' }}>
            {activeTab === 'unassigned'
              ? 'There are currently no unassigned projects in the pool. Toggle to Reassign Active Portfolio to reallocate projects.'
              : 'Try clearing your search query or choosing a different filter.'}
          </p>
        </div>
      ) : (
        <div style={{ marginTop: '1rem', overflowX: 'auto', maxHeight: '440px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: 'inset 0 0 6px rgba(0,0,0,0.03)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
              <tr style={{ background: '#f8fafc', color: '#475569', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 0.85rem', width: 36 }}>#</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Project Code</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Project Name & Department</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Type</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>PO Value</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Current PM</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>PMC Tower Status</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Select New Project Manager</th>
                <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((p, idx) => (
                <tr key={p.headerId} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  <td style={{ padding: '0.75rem 0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedHeaderIds.includes(p.headerId)}
                      onChange={() => toggleSelectHeaderId(p.headerId)}
                      style={{ width: 14, height: 14, accentColor: '#003366', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem', fontFamily: 'monospace', fontWeight: 700, color: '#00509d' }}>
                    {p.projectCode}
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem', maxWidth: '260px' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.projectName}>
                      {p.projectName}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.customerName}>
                      {p.customerName}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', color: '#334155' }}>
                      {p.prjType || 'GN'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#1e293b' }}>
                    ₹{((p.poAmount || 0) / 100000).toFixed(2)} L
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '9999px',
                      background: p.prjMgrId ? '#ecfdf5' : '#fef2f2',
                      color: p.prjMgrId ? '#047857' : '#b91c1c',
                      border: p.prjMgrId ? '1px solid #a7f3d0' : '1px solid #fecaca'
                    }}>
                      {getPmName(p.prjMgrId)}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem' }}>
                    <button
                      onClick={() => handleTogglePmc(p.headerId)}
                      disabled={togglingPmcId === p.headerId}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                        background: p.isPmcMonitored ? '#dcfce7' : '#f1f5f9',
                        color: p.isPmcMonitored ? '#15803d' : '#64748b',
                        border: p.isPmcMonitored ? '1px solid #bbf7d0' : '1px solid #cbd5e1'
                      }}
                      title="Click to toggle PMC Control Tower oversight"
                    >
                      {togglingPmcId === p.headerId ? (
                        <RefreshCw style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
                      ) : p.isPmcMonitored ? (
                        <>🏰 In PMC</>
                      ) : (
                        <>+ Add to PMC</>
                      )}
                    </button>
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem' }}>
                    <select
                      value={selectedPmMap[p.headerId] || ''}
                      onChange={e => setSelectedPmMap({
                        ...selectedPmMap,
                        [p.headerId]: Number(e.target.value)
                      })}
                      style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#1e293b', fontSize: '0.78rem', borderRadius: '6px', padding: '0.35rem 0.6rem', outline: 'none', width: '100%', maxWidth: '220px' }}
                    >
                      <option value="">-- Choose PM --</option>
                      {projectManagers.map(pm => (
                        <option key={pm.prjMgrId} value={pm.prjMgrId}>
                          {pm.fullName} ({pm.zone || 'North Zone'} - ID: {pm.prjMgrId})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                    <button
                      onClick={() => handleSingleAssign(p.headerId)}
                      disabled={assigningId === p.headerId || !selectedPmMap[p.headerId]}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: selectedPmMap[p.headerId] ? '#059669' : '#e2e8f0',
                        color: selectedPmMap[p.headerId] ? '#ffffff' : '#94a3b8',
                        opacity: !selectedPmMap[p.headerId] ? 0.6 : 1
                      }}
                    >
                      {assigningId === p.headerId ? (
                        <RefreshCw style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <UserCheck style={{ width: 12, height: 12 }} />
                      )}
                      Assign PM
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
