const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src/pages/admin';

const files = {
  'CreateUserModal.tsx': `import React, { useState } from 'react';
import { axiosInstance } from '../../api/axiosInstance';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const CreateUserModal = ({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) => {
  const [formData, setFormData] = useState({
    fullName: '', email: '', username: '', mobile: '', ministryId: '', departmentId: '', tempPassword: ''
  });
  
  const queryClient = useQueryClient();

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      // The API requires role and designation. We set default to 'PM' since that's what we usually provision here
      const payload = { ...data, role: 'PM', designation: 'Project Manager' };
      const response = await axiosInstance.post('/users', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
      onClose();
    },
    onError: (error) => {
      console.error('Failed to create user:', error);
      alert('Failed to create user. Please try again.');
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', width: '400px' }}>
        <h2>Create New User</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input required placeholder="Full Name" onChange={e => setFormData({...formData, fullName: e.target.value})} />
          <input required type="email" placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})} />
          <input required placeholder="Username" onChange={e => setFormData({...formData, username: e.target.value})} />
          <input required type="password" placeholder="Temp Password" onChange={e => setFormData({...formData, tempPassword: e.target.value})} />
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" onClick={onClose} disabled={createUserMutation.isPending}>Cancel</button>
            <button type="submit" disabled={createUserMutation.isPending}>{createUserMutation.isPending ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};`,

  'MasterDataPage.tsx': `import React, { useState } from 'react';
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
};`,

  'UserManagementPage.tsx': `import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '../../api/axiosInstance';
import { CreateUserModal } from './CreateUserModal';

export const UserManagementPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: usersResponse, isLoading, isError } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: async () => {
      // The backend /users endpoint doesn't currently take search param, it just returns visible users
      const response = await axiosInstance.get('/users');
      return response.data;
    }
  });

  const users = usersResponse?.data || [];
  // Client-side search filtering since API returns all
  const filteredUsers = searchTerm 
    ? users.filter((u: any) => 
        u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : users;

  return (
    <div>
      <h2>User Management</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <input 
          type="text" 
          placeholder="Search by name, username, or email..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '300px', padding: '0.5rem' }}
        />
        <button onClick={() => setIsModalOpen(true)} style={{ padding: '0.5rem 1rem' }}>New User</button>
      </div>
      
      {isLoading ? (
        <p>Loading users...</p>
      ) : isError ? (
        <p style={{ color: 'red' }}>Error loading users. Please try again.</p>
      ) : (
        <table border={1} cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
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
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                  No users found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user: any) => (
                <tr key={user.id || user.username}>
                  <td>{user.fullName}</td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>{user.zone || user.designation || 'N/A'}</td>
                  <td>{user.roleLabel || user.role || 'N/A'}</td>
                  <td>{user.isActive ? 'Active' : 'Disabled'}</td>
                  <td>
                    <button style={{ marginRight: '0.5rem' }}>Edit</button>
                    <button style={{ color: 'red' }}>Disable</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <CreateUserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => alert('User created successfully')} 
      />
    </div>
  );
};`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Admin Frontend UI scaffolded.');
