import React, { useState } from 'react';
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
          placeholder="PO Amount (₹)" 
          onChange={e => setPoAmount(Number(e.target.value))} 
          required 
        />
        <input 
          type="number" 
          placeholder="Tax Amount (₹)" 
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
};