import React, { useState } from 'react';

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
};