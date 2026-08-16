import React from 'react';

export const BudgetUtilizationBar = ({ approved, spent, committed }: { approved: number, spent: number, committed: number }) => {
  const available = approved - spent - committed;
  const spentPct = (spent / approved) * 100;
  const committedPct = (committed / approved) * 100;
  const availablePct = (available / approved) * 100;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${spentPct}%`, backgroundColor: '#4ade80' }} title="Spent" />
        <div style={{ width: `${committedPct}%`, backgroundColor: '#fbbf24' }} title="Committed" />
        <div style={{ width: `${availablePct}%`, backgroundColor: '#e5e7eb' }} title="Available" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginTop: '0.5rem' }}>
        <span>Spent: ₹{spent.toLocaleString('en-IN')}</span>
        <span>Committed: ₹{committed.toLocaleString('en-IN')}</span>
        <span>Available: ₹{available.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
};