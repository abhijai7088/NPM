const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src';

const dirs = [
    'pages/finance', 'components/shared'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'components/shared/BudgetUtilizationBar.tsx': `import React from 'react';

export const BudgetUtilizationBar = ({ approved, spent, committed }: { approved: number, spent: number, committed: number }) => {
  const available = approved - spent - committed;
  const spentPct = (spent / approved) * 100;
  const committedPct = (committed / approved) * 100;
  const availablePct = (available / approved) * 100;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: \`\${spentPct}%\`, backgroundColor: '#4ade80' }} title="Spent" />
        <div style={{ width: \`\${committedPct}%\`, backgroundColor: '#fbbf24' }} title="Committed" />
        <div style={{ width: \`\${availablePct}%\`, backgroundColor: '#e5e7eb' }} title="Available" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginTop: '0.5rem' }}>
        <span>Spent: ₹{spent.toLocaleString('en-IN')}</span>
        <span>Committed: ₹{committed.toLocaleString('en-IN')}</span>
        <span>Available: ₹{available.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
};`,

  'pages/finance/POFormPage.tsx': `import React, { useState } from 'react';
import { BudgetUtilizationBar } from '../../components/shared/BudgetUtilizationBar';

export const POFormPage = () => {
  const [poAmount, setPoAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);

  // Mock project budget data
  const project = { approvedBudget: 50000000, spentAmount: 10000000, committedAmount: 5000000 };
  const remaining = project.approvedBudget - project.spentAmount - project.committedAmount;

  return (
    <div>
      <h2>Create Purchase Order</h2>
      
      <div style={{ padding: '1rem', background: '#f9fafb', marginBottom: '2rem' }}>
        <h3>Budget Overview</h3>
        <BudgetUtilizationBar 
          approved={project.approvedBudget} 
          spent={project.spentAmount} 
          committed={project.committedAmount} 
        />
        {poAmount > remaining && (
          <div style={{ color: 'red', marginTop: '1rem' }}>
            ⚠️ Warning: PO Amount exceeds available budget!
          </div>
        )}
      </div>

      <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
        <input placeholder="Vendor Name" required />
        <input placeholder="Vendor GSTIN (e.g. 07AAAAA0000A1Z5)" />
        <input 
          type="number" 
          placeholder="PO Amount (INR)" 
          onChange={e => setPoAmount(Number(e.target.value))} 
          required 
        />
        <input 
          type="number" 
          placeholder="Tax Amount (INR)" 
          onChange={e => setTaxAmount(Number(e.target.value))} 
          required 
        />
        <div>
          <strong>Total Amount: </strong> 
          ₹{(poAmount + taxAmount).toLocaleString('en-IN')}
        </div>
        <button type="submit" disabled={poAmount > remaining}>Submit PO</button>
      </form>
    </div>
  );
};`,

  'pages/finance/InvoiceFormPage.tsx': `import React, { useState } from 'react';

export const InvoiceFormPage = () => {
  const [amount, setAmount] = useState(0);
  const [tax, setTax] = useState(0);
  const [tds, setTds] = useState(0);

  // Mock Three-way Match state
  const matchState = {
    poApproved: true,
    grnRecorded: false
  };

  return (
    <div>
      <h2>Create Invoice</h2>
      
      <div style={{ padding: '1rem', background: '#fef3c7', marginBottom: '2rem' }}>
        <h3>Three-Way Match Status</h3>
        <p>PO #PO-MOD-2026-0001: {matchState.poApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}</p>
        <p>GRN: {matchState.grnRecorded ? '✅ RECORDED' : '❌ PENDING (Required)'}</p>
      </div>

      <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
        <input placeholder="Vendor Invoice Number" required disabled={!matchState.grnRecorded} />
        <input type="number" placeholder="Invoice Amount" onChange={e => setAmount(Number(e.target.value))} disabled={!matchState.grnRecorded} />
        <input type="number" placeholder="Tax Amount" onChange={e => setTax(Number(e.target.value))} disabled={!matchState.grnRecorded} />
        <input type="number" placeholder="TDS Amount" onChange={e => setTds(Number(e.target.value))} disabled={!matchState.grnRecorded} />
        
        <div style={{ padding: '1rem', background: '#e0e7ff' }}>
          <strong>Net Payable (Server-Calculated Simulation): </strong> 
          ₹{(amount + tax - tds).toLocaleString('en-IN')}
        </div>
        
        <button type="submit" disabled={!matchState.grnRecorded}>Submit Invoice</button>
      </form>
    </div>
  );
};`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 4 Frontend Finance UI scaffolded.');
