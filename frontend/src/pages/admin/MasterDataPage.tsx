import React, { useState } from 'react';
import { useMinistries, useDepartments } from '../../hooks/useMasterData';

export const MasterDataPage = () => {
  const [activeTab, setActiveTab] = useState<'ministries' | 'departments'>('ministries');
  const { data: ministries, isLoading: loadingMinistries } = useMinistries();
  const { data: departments, isLoading: loadingDepartments } = useDepartments();

  return (
    <div>
      <h2>Master Data Management</h2>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button onClick={() => setActiveTab('ministries')} style={{ fontWeight: activeTab === 'ministries' ? 'bold' : 'normal' }}>Ministries</button>
        <button onClick={() => setActiveTab('departments')} style={{ fontWeight: activeTab === 'departments' ? 'bold' : 'normal' }}>Departments</button>
      </div>
      
      {activeTab === 'ministries' && (
        <div>
          <h3>Ministries (Read-only for Demo)</h3>
          {loadingMinistries ? <p>Loading...</p> : (
            <ul>
              {ministries?.map((m: any) => <li key={m.id}>{m.code} - {m.name}</li>)}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'departments' && (
        <div>
          <h3>Departments (Read-only for Demo)</h3>
          {loadingDepartments ? <p>Loading...</p> : (
            <ul>
              {departments?.map((d: any) => <li key={d.id}>{d.code} - {d.name}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};