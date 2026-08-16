import React, { useState } from 'react';

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
};