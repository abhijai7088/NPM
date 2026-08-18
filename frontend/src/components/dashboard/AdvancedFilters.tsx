import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import { SearchableSelect, type SelectOption } from './SearchableSelect';
import './AdvancedFilters.css';

export interface AdvancedFilterState {
  search: string;
  commissionRate: string;
  financialStatus: string;
  hasVendorPendingBills: boolean;
  vendorBillNotSubmitted: boolean;
  projectManager: string;
  state: string;
  expiryStatus: string;
  expiryDays: string;
  nicsiHoldLessThan20: boolean;
  hasVendorBilled?: boolean;
  hasExpBills?: boolean;
  hasPOs?: boolean;
  hasInvoiced?: boolean;
}

interface AdvancedFiltersProps {
  filters: AdvancedFilterState;
  setFilters: React.Dispatch<React.SetStateAction<AdvancedFilterState>>;
  onApply: () => void;
  onClear: () => void;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({ filters, setFilters, onApply, onClear }) => {
  const { user } = useAuthStore();
  const [projectOptions, setProjectOptions] = useState<SelectOption[]>([]);
  const [stateOptions, setStateOptions] = useState<SelectOption[]>([]);
  const [commissionOptions, setCommissionOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    // 1. Fetch States
    axios.get('/api/v1/master/states')
      .then(res => {
        if (res.data && res.data.data && Array.isArray(res.data.data)) {
          const fetched: SelectOption[] = res.data.data.map((st: any) => ({
            value: st.name || st.code,
            label: st.name,
            subLabel: st.code !== st.name ? st.code : undefined,
          }));
          setStateOptions(fetched);
        }
      })
      .catch(() => {
        setStateOptions(INDIAN_STATES.map(s => ({ value: s, label: s })));
      });

    // 2. Fetch Projects for dynamic options
    axios.get('/api/v1/projects/advanced-search?page=0&size=1000')
      .then(res => {
        if (res.data && res.data.data) {
          const prjSet = new Map<string, SelectOption>();
          const stateSet = new Set<string>();
          const rateSet = new Set<number>([0, 5, 7, 9]);

          res.data.data.forEach((p: any) => {
            if (p.customerName && !prjSet.has(p.customerName)) {
              prjSet.set(p.customerName, { value: p.customerName, label: p.customerName, badge: 'Customer' });
            }
            if (p.projectName && !prjSet.has(p.projectName)) {
              prjSet.set(p.projectName, { value: p.projectName, label: p.projectName, subLabel: p.projectCode, badge: 'Project' });
            }
            if (p.projectCode && !prjSet.has(p.projectCode)) {
              prjSet.set(p.projectCode, { value: p.projectCode, label: p.projectCode, badge: 'Code' });
            }

            if (p.stateCode) stateSet.add(p.stateCode);

            if (p.amountReceived && p.amountReceived > 0 && p.nicsiCommission != null) {
              const calcRate = Math.round((p.nicsiCommission / p.amountReceived) * 100);
              if (calcRate >= 0 && calcRate <= 30) rateSet.add(calcRate);
            } else if (p.nicsiCommission === 0) {
              rateSet.add(0);
            }
          });

          setProjectOptions(Array.from(prjSet.values()));

          setStateOptions(prev => {
            const existing = new Set(prev.map(s => s.value.toLowerCase()));
            const newStates = Array.from(stateSet)
              .filter(st => !existing.has(st.toLowerCase()))
              .map(st => ({ value: st, label: st }));
            return [...prev, ...newStates];
          });

          const sortedRates = Array.from(rateSet).sort((a, b) => a - b);
          setCommissionOptions(sortedRates.map(r => ({
            value: String(r),
            label: `${r}% Tier`,
            badge: `${r}%`,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFilters(prev => ({ ...prev, [name]: checked }));
    } else {
      setFilters(prev => ({ ...prev, [name]: value }));
    }
  };

  // Count active filters
  const activeCount = useMemo(() => {
    let cnt = 0;
    if (filters.search) cnt++;
    if (filters.projectManager) cnt++;
    if (filters.state) cnt++;
    if (filters.commissionRate) cnt++;
    if (filters.financialStatus) cnt++;
    if (filters.expiryStatus) cnt++;
    if (filters.hasVendorPendingBills) cnt++;
    if (filters.vendorBillNotSubmitted) cnt++;
    if (filters.nicsiHoldLessThan20) cnt++;
    return cnt;
  }, [filters]);

  return (
    <div className="af-container">
      {/* Header */}
      <div className="af-header">
        <div className="af-header-left">
          <div className="af-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#003366" strokeWidth="2.5">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter Projects
          </div>
          {activeCount > 0 && (
            <span className="af-active-badge">{activeCount} active filter{activeCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button type="button" className="af-clear-btn" onClick={onClear}>
          Clear All
        </button>
      </div>

      {/* Grid Inputs */}
      <div className="af-grid">

        {/* 1. Search Project */}
        <div className="af-field">
          <label className="af-label">Search Project / Customer</label>
          <SearchableSelect
            value={filters.search}
            onChange={(val) => setFilters(prev => ({ ...prev, search: val }))}
            options={projectOptions}
            placeholder="Name, Code, Customer..."
            searchPlaceholder="Search project, customer or code..."
            allOptionLabel="All Projects"
            allowNa={true}
            naLabel="N/A (Missing Project Data)"
          />
        </div>

        {/* 2. Project Manager */}
        {user?.role !== 'PM' && (
          <div className="af-field">
            <label className="af-label">Project Manager / Assigned To</label>
            <input
              type="text"
              name="projectManager"
              className="af-input"
              placeholder="Email ID or Officer Name..."
              value={filters.projectManager}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
        )}

        {/* 3. State / Region */}
        <div className="af-field">
          <label className="af-label">State / Region</label>
          <SearchableSelect
            value={filters.state}
            onChange={(val) => setFilters(prev => ({ ...prev, state: val }))}
            options={stateOptions.length > 0 ? stateOptions : INDIAN_STATES.map(s => ({ value: s, label: s }))}
            placeholder="e.g. Delhi, WB, UP..."
            searchPlaceholder="Search state or region..."
            allOptionLabel="All States / Regions"
            allowNa={true}
            naLabel="N/A (Unspecified State)"
          />
        </div>

        {/* 4. NICSI Service Charge Rate */}
        <div className="af-field">
          <label className="af-label">NICSI Service Charge Tier</label>
          <SearchableSelect
            value={filters.commissionRate}
            onChange={(val) => setFilters(prev => ({ ...prev, commissionRate: val }))}
            options={commissionOptions.length > 0 ? commissionOptions : [
              { value: '0', label: '0% Tier', badge: '0%' },
              { value: '5', label: '5% Tier', badge: '5%' },
              { value: '7', label: '7% Tier', badge: '7%' },
              { value: '9', label: '9% Tier', badge: '9%' },
            ]}
            placeholder="All Tiers"
            searchPlaceholder="Search rate tier..."
            allOptionLabel="All Tiers"
            allowNa={true}
            naLabel="N/A (No Commission)"
          />
        </div>

        {/* 5. Financial Status Toggle Pills */}
        <div className="af-field">
          <label className="af-label">Financial Status</label>
          <div className="af-radio-pills">
            <label className={`af-radio-pill ${filters.financialStatus === '' ? 'af-radio-pill--active' : ''}`}>
              <input type="radio" name="financialStatus" value="" checked={filters.financialStatus === ''} onChange={handleChange} />
              <span>All</span>
            </label>
            <label className={`af-radio-pill af-radio-pill--profit ${filters.financialStatus === 'PROFIT' ? 'af-radio-pill--active-profit' : ''}`}>
              <input type="radio" name="financialStatus" value="PROFIT" checked={filters.financialStatus === 'PROFIT'} onChange={handleChange} />
              <span>Profit</span>
            </label>
            <label className={`af-radio-pill af-radio-pill--loss ${filters.financialStatus === 'LOSS' ? 'af-radio-pill--active-loss' : ''}`}>
              <input type="radio" name="financialStatus" value="LOSS" checked={filters.financialStatus === 'LOSS'} onChange={handleChange} />
              <span>Loss</span>
            </label>
          </div>
        </div>

        {/* 6. Project Expiry */}
        <div className="af-field">
          <label className="af-label">PO Term Expiry</label>
          <div className="af-expiry-wrap">
            <select name="expiryStatus" className="af-select" value={filters.expiryStatus} onChange={handleChange}>
              <option value="">All PO Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRING_SOON">Expiring Soon</option>
              <option value="EXPIRED">Expired</option>
              <option value="NO_PO">No PO</option>
            </select>
            {filters.expiryStatus === 'EXPIRING_SOON' && (
              <div className="af-days-input-wrap">
                <input
                  type="number"
                  name="expiryDays"
                  className="af-input af-days-input"
                  placeholder="Days"
                  value={filters.expiryDays}
                  onChange={handleChange}
                  min="1"
                />
                <span className="af-days-suffix">days</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Toggles Row */}
      <div className="af-toggles-row">
        <label className="af-switch-card" title="Vendor has submitted a bill, but NICSI has not fully paid it yet.">
          <div className="af-switch">
            <input
              type="checkbox"
              name="hasVendorPendingBills"
              checked={filters.hasVendorPendingBills}
              onChange={handleChange}
            />
            <span className="af-slider"></span>
          </div>
          <span className="af-switch-title">Bills Not Paid To Vendor</span>
        </label>

        <label className="af-switch-card" title="An active PO exists, but the vendor has not submitted any bill against it yet.">
          <div className="af-switch">
            <input
              type="checkbox"
              name="vendorBillNotSubmitted"
              checked={filters.vendorBillNotSubmitted}
              onChange={handleChange}
            />
            <span className="af-slider"></span>
          </div>
          <span className="af-switch-title">Vendor Has Not Submitted Bill</span>
        </label>

        <label className="af-switch-card" title="NICSI Hold % below 20% of PO amount — cash cushion is thin.">
          <div className="af-switch">
            <input
              type="checkbox"
              name="nicsiHoldLessThan20"
              checked={filters.nicsiHoldLessThan20}
              onChange={handleChange}
            />
            <span className="af-slider"></span>
          </div>
          <span className="af-switch-title">NICSI Hold &lt; 20%</span>
        </label>
      </div>

      {/* Footer Actions */}
      <div className="af-footer">
        <div className="af-footer-hint">
          {activeCount > 0 ? `${activeCount} filter condition${activeCount !== 1 ? 's' : ''} set` : 'Showing all projects'}
        </div>
        <div className="af-footer-btns">
          {activeCount > 0 && (
            <button type="button" className="af-btn-secondary" onClick={onClear}>Reset</button>
          )}
          <button type="button" className="af-btn-primary" onClick={onApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};
