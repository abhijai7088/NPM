const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src';

const dirs = [
    'hooks', 'pages/admin'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'hooks/useMasterData.ts': `import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '../api/axiosInstance';

const fetchMinistries = async () => (await axiosInstance.get('/master/ministries')).data.data;
const fetchDepartments = async (ministryId?: string) => {
  const url = ministryId ? \`/master/departments?ministryId=\${ministryId}\` : '/master/departments';
  return (await axiosInstance.get(url)).data.data;
};

export const useMinistries = () => useQuery({ 
  queryKey: ['ministries'], 
  queryFn: fetchMinistries, 
  staleTime: 900_000 
});

export const useDepartments = (ministryId?: string) => useQuery({ 
  queryKey: ['departments', ministryId], 
  queryFn: () => fetchDepartments(ministryId), 
  enabled: !!ministryId 
});
`,
  'pages/admin/UserManagementPage.tsx': `import React, { useState } from 'react';

export const UserManagementPage = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div>
      <h2>User Management</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <input 
          type="text" 
          placeholder="Search by name, username, or email..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <button onClick={() => console.log('Open modal')}>New User</button>
      </div>
      <table border={1} cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Username</th>
            <th>Email</th>
            <th>Ministry</th>
            <th>Roles</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={7} style={{ textAlign: 'center' }}>No users found (implementing API fetch)</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Frontend Master hooks and pages scaffolded.');
