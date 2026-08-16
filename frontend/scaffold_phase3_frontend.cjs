const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src';

const dirs = [
    'types', 'pages/projects'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'types/project.types.ts': `export type ProjectStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  projectCode: string;
  title: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  ministryId: string;
  ministryName: string;
  departmentId: string;
  departmentName: string;
  stateName?: string;
  districtName?: string;
  status: ProjectStatus;
  approvedBudget: number;
  spentAmount: number;
  startDate: string;
  expectedEndDate: string;
  actualEndDate?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}`,

  'pages/projects/ProjectsListPage.tsx': `import React, { useState } from 'react';

export const ProjectsListPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Projects</h2>
        <button onClick={() => window.location.href = '/projects/new'}>New Project</button>
      </div>
      
      <div style={{ margin: '1rem 0' }}>
        <input 
          type="text" 
          placeholder="Search projects..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '0.5rem' }}
        />
      </div>

      <table border={1} cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th>Code</th>
            <th>Title</th>
            <th>Ministry</th>
            <th>Category</th>
            <th>Status</th>
            <th>Budget</th>
            <th>Start Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
              No projects match your filters.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};`,

  'pages/projects/ProjectFormPage.tsx': `import React, { useState } from 'react';

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
            <input type="number" placeholder="Approved Budget (INR)" style={{ display: 'block', margin: '1rem 0', padding: '0.5rem' }} />
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
};`,

  'pages/projects/ProjectDetailPage.tsx': `import React, { useState } from 'react';

export const ProjectDetailPage = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'audit'>('overview');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Project: NPMS-MOD-2026-0001</h2>
        <span style={{ padding: '0.25rem 0.75rem', background: '#ccc', borderRadius: '999px', fontSize: '0.875rem' }}>DRAFT</span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
        <button onClick={() => setActiveTab('overview')} style={{ fontWeight: activeTab === 'overview' ? 'bold' : 'normal' }}>Overview</button>
        <button onClick={() => setActiveTab('documents')} style={{ fontWeight: activeTab === 'documents' ? 'bold' : 'normal' }}>Documents</button>
        <button onClick={() => setActiveTab('audit')} style={{ fontWeight: activeTab === 'audit' ? 'bold' : 'normal' }}>Audit Trail</button>
      </div>

      {activeTab === 'overview' && (
        <div>
          <h3>Overview</h3>
          <p><strong>Title:</strong> Example Project</p>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button>Edit Project</button>
            <button>Submit for Approval</button>
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div>
          <h3>Documents</h3>
          <div style={{ padding: '2rem', border: '2px dashed #ccc', textAlign: 'center' }}>
            <p>Drag and drop files here, or click to select files</p>
            <small>Max 20MB. PDF, DOCX, XLSX</small>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div>
          <h3>Audit Trail</h3>
          <ul>
            <li>[2026-07-05 10:00] PROJECT_CREATED by John Smith</li>
          </ul>
        </div>
      )}
    </div>
  );
};`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Project Frontend scaffolded.');
