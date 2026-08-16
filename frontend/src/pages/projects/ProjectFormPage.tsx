import React, { useState } from 'react';

export const ProjectFormPage = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});

  const handleNext = () => setStep(s => Math.min(3, s + 1));
  const handleBack = () => setStep(s => Math.max(1, s - 1));

  return (
    <div>
      <h2>Create New Project - Step {step} of 3</h2>
      <div style={{ padding: '2rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        {step === 1 && (
          <div>
            <h3>Basic Information</h3>
            <input type="text" placeholder="Project Title" style={{ display: 'block', margin: '1rem 0', padding: '0.5rem', width: '100%' }} />
            <textarea placeholder="Description" rows={4} style={{ display: 'block', margin: '1rem 0', padding: '0.5rem', width: '100%' }} />
          </div>
        )}
        
        {step === 2 && (
          <div>
            <h3>Location & Timeline</h3>
            <input type="date" placeholder="Start Date" style={{ display: 'block', margin: '1rem 0' }} />
            <input type="date" placeholder="Expected End Date" style={{ display: 'block', margin: '1rem 0' }} />
          </div>
        )}
        
        {step === 3 && (
          <div>
            <h3>Financial Details</h3>
            <input type="number" placeholder="Approved Budget (₹)" style={{ display: 'block', margin: '1rem 0', padding: '0.5rem' }} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
          <button onClick={handleBack} disabled={step === 1}>Back</button>
          <div>
            <button style={{ marginRight: '1rem' }}>Save as Draft</button>
            {step < 3 ? (
              <button onClick={handleNext}>Next</button>
            ) : (
              <button onClick={() => alert('Submitted!')}>Submit</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};