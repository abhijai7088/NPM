import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import { SearchableSelect, type SelectOption } from './SearchableSelect';
import './AdvancedFilters.css';

export interface AdvancedFilterState {
  search: string;
  commissionRate: string;
  financialStatus: string;
  /** Vendor HAS submitted a bill, but NICSI has not fully paid it yet. */
  hasVendorPendingBills: boolean;
  /** An active PO exists but the vendor has not submitted any bill at all. */
  vendorBillNotSubmitted: boolean;
  projectManager: string;
  state: string;
  expiryStatus: string;
  expiryDays: string;
  /** NICSI's retained cash cushion is below 20% of the outstanding PO commitment. */
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

// Indian States & Union Territories Master Fallback List
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
    // 1. Fetch States from Master Data API
    axios.get('/api/v1/master/states')
      .then(res => {
        if (res.data && res.data.data && Array.isArray(res.data.data)) {
          const fetchedStates: SelectOption[] = res.data.data.map((st: any) => ({
            value: st.name || st.code,
            label: st.name,
            subLabel: st.code !== st.name ? st.code : undefined,
          }));
          setStateOptions(fetchedStates);
        }
      })
      .catch(() => {
        // Fallback to static Indian States list if master endpoint is loading
        const fallbackStates: SelectOption[] = INDIAN_STATES.map(s => ({ value: s, label: s }));
        setStateOptions(fallbackStates);
      });

    // 2. Fetch Projects to populate dynamic dropdowns
    axios.get('/api/v1/projects/advanced-search?page=0&size=1000')
      .then(res => {
        if (res.data && res.data.data) {
          const prjSet = new Map<string, SelectOption>();
          const stateSet = new Set<string>();
          const rateSet = new Set<number>([0, 5, 7, 9]); // Always include 0, 5, 7, 9 %

          res.data.data.forEach((p: any) => {
            // Customer / Project Options
            if (p.customerName && !prjSet.has(p.customerName)) {
              prjSet.set(p.customerName, { value: p.customerName, label: p.customerName, badge: 'Customer' });
            }
            if (p.projectName && !prjSet.has(p.projectName)) {
              prjSet.set(p.projectName, { value: p.projectName, label: p.projectName, subLabel: p.projectCode, badge: 'Project' });
            }
            if (p.projectCode && !prjSet.has(p.projectCode)) {
              prjSet.set(p.projectCode, { value: p.projectCode, label: p.projectCode, badge: 'Code' });
            }

            // State Options from project data
            if (p.stateCode) {
              stateSet.add(p.stateCode);
            }

            // Dynamic Commission Rates from project data
            if (p.amountReceived && p.amountReceived > 0 && p.nicsiCommission != null) {
              const calcRate = Math.round((p.nicsiCommission / p.amountReceived) * 100);
              if (calcRate >= 0 && calcRate <= 30) {
                rateSet.add(calcRate);
              }
            } else if (p.nicsiCommission === 0) {
              rateSet.add(0);
            }
          });

          setProjectOptions(Array.from(prjSet.values()));

          // Merge states from master & project dataset
          setStateOptions(prev => {
            const existingValues = new Set(prev.map(s => s.value.toLowerCase()));
            const newStates = Array.from(stateSet)
              .filter(st => !existingValues.has(st.toLowerCase()))
              .map(st => ({ value: st, label: st }));
            return [...prev, ...newStates];
          });

          // Build dynamic commission options sorted by rate
          const sortedRates = Array.from(rateSet).sort((a, b) => a - b);
          const commOpts: SelectOption[] = sortedRates.map(r => ({
            value: String(r),
            label: `${r}% Tier`,
            badge: `${r}%`,
          }));
          setCommissionOptions(commOpts);
        }
      })
      .catch(err => console.error('Failed to load project options for filters', err));
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

  return (
    <div className="advanced-filters-glass">
      <div className="filters-header">
        <h3 className="filters-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          Filters
        </h3>
        <button className="btn-glass-clear" onClick={onClear}>Clear All</button>
      </div>

      <div className="filters-grid">
        {/* 1. Search Project */}
        <div className="filter-group">
          <label className="filter-label">Search Project</label>
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

        {/* Project Manager */}
        {user?.role !== 'PM' && (
          <div className="filter-group">
            <label className="filter-label">Project Manager / Assigned To</label>
            <input
              type="text"
              name="projectManager"
              className="glass-input"
              placeholder="Email ID or Name..."
              value={filters.projectManager}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
        )}

        {/* 2. State / Region */}
        <div className="filter-group">
          <label className="filter-label">State / Region</label>
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

        {/* 3. NICSI Service Charge Rate */}
        <div className="filter-group">
          <label className="filter-label">NICSI Service Charge Rate</label>
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
            naLabel="N/A (No Commission / Free)"
          />
        </div>

        {/* Financial Status */}
        <div className="filter-group">
          <label className="filter-label">Financial Status</label>
          <div className="glass-radio-group">
            <label className="glass-radio">
              <input type="radio" name="financialStatus" value="" checked={filters.financialStatus === ''} onChange={handleChange} />
              <span>All</span>
            </label>
            <label className="glass-radio profit">
              <input type="radio" name="financialStatus" value="PROFIT" checked={filters.financialStatus === 'PROFIT'} onChange={handleChange} />
              <span>Profit</span>
            </label>
            <label className="glass-radio loss">
              <input type="radio" name="financialStatus" value="LOSS" checked={filters.financialStatus === 'LOSS'} onChange={handleChange} />
              <span>Loss</span>
            </label>
          </div>
        </div>

        {/* Date / Expiry Range */}
        <div className="filter-group amount-range">
          <label className="filter-label">Project Expiry</label>
          <div className="amount-inputs" style={{ gap: '0.5rem' }}>
            <select name="expiryStatus" className="glass-input" value={filters.expiryStatus} onChange={handleChange} style={{ flex: 1 }}>
              <option value="">All PO Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRING_SOON">Expiring Soon</option>
              <option value="EXPIRED">Expired</option>
              <option value="NO_PO">No PO</option>
            </select>
            {filters.expiryStatus === 'EXPIRING_SOON' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <input
                  type="number"
                  name="expiryDays"
                  className="glass-input"
                  placeholder="Days"
                  value={filters.expiryDays}
                  onChange={handleChange}
                  min="1"
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#666' }}>days</span>
              </div>
            )}
          </div>
        </div>

        {/* Toggles */}
        <div className="filter-group toggle-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="glass-switch-label" title="Vendor has submitted at least one bill, but NICSI has not fully paid it yet.">
            <div className="glass-switch">
              <input
                type="checkbox"
                name="hasVendorPendingBills"
                checked={filters.hasVendorPendingBills}
                onChange={handleChange}
              />
              <span className="slider round"></span>
            </div>
            <span className="toggle-text">Bills Not Paid To Vendor</span>
          </label>

          <label className="glass-switch-label" title="An active Purchase Order exists, but the vendor has not submitted any bill against it yet.">
            <div className="glass-switch">
              <input
                type="checkbox"
                name="vendorBillNotSubmitted"
                checked={filters.vendorBillNotSubmitted}
                onChange={handleChange}
              />
              <span className="slider round"></span>
            </div>
            <span className="toggle-text">Vendor Has Not Submitted Bill</span>
          </label>

          <label className="glass-switch-label" title="NICSI Hold % = (Amount Received − Amount Paid to Vendor) ÷ PO Amount. Below 20% means NICSI's cash cushion is thin and it should request more funds from the client/government before the remaining vendor bills fall due.">
            <div className="glass-switch">
              <input
                type="checkbox"
                name="nicsiHoldLessThan20"
                checked={filters.nicsiHoldLessThan20}
                onChange={handleChange}
              />
              <span className="slider round"></span>
            </div>
            <span className="toggle-text">NICSI Hold &lt; 20%</span>
          </label>
        </div>
      </div>

      <div className="filters-footer">
        <button className="btn-glass-apply" onClick={onApply}>Apply Filters</button>
      </div>
    </div>
  );
};
