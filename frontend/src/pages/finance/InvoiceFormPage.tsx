import React, { useState } from 'react';

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
};