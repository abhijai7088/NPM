import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '../../api/axiosInstance';
import { CreateUserModal } from './CreateUserModal';
import { Search, UserPlus, Edit2, Ban, CheckCircle2, Shield, Filter } from 'lucide-react';

export const UserManagementPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: usersResponse, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await axiosInstance.get('/users');
      return response.data;
    }
  });

  const users = usersResponse?.data || [];

  const filteredUsers = users.filter((u: any) => {
    const matchesSearch = 
      !searchTerm ||
      u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = 
      !statusFilter || 
      (statusFilter === 'active' ? u.isActive === true : u.isActive === false);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const uniqueRoles = Array.from(new Set(users.map((u: any) => u.role))).filter(Boolean) as string[];

  const getRoleBadge = (roleCode: string, label: string) => {
    let badgeClass = 'badge-primary';
    if (roleCode === 'SUPER_ADMIN') badgeClass = 'badge-danger';
    if (roleCode === 'MD') badgeClass = 'badge-success';
    if (roleCode === 'PM') badgeClass = 'badge-info';
    if (roleCode === 'PMC') badgeClass = 'badge-warning';
    if (roleCode === 'OA') badgeClass = 'badge-secondary';
    
    return (
      <span className={`badge ${badgeClass}`}>
        <Shield size={12} />
        {label || roleCode}
      </span>
    );
  };


  return (
    <div className="page-container animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>User Management</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Manage organizational access, roles, and system permissions.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <UserPlus size={18} />
          New User
        </button>
      </div>

      <div className="card shadow-sm">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem', background: '#f8f9fa' }}>
          
          <div style={{ display: 'flex', gap: '1rem', flex: '1 1 auto', flexWrap: 'wrap' }}>
            <div className="input-icon-wrapper" style={{ flex: '1 1 250px', minWidth: '200px' }}>
              <Search className="icon-left" size={18} />
              <input 
                type="text" 
                className="form-input has-icon-left"
                placeholder="Search name, username, or email..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="input-icon-wrapper" style={{ flex: '0 0 200px' }}>
              <Filter className="icon-left" size={18} />
              <select 
                className="form-input has-icon-left"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                style={{ appearance: 'auto' }}
              >
                <option value="">All Roles</option>
                {uniqueRoles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="input-icon-wrapper" style={{ flex: '0 0 150px' }}>
              <Filter className="icon-left" size={18} />
              <select 
                className="form-input has-icon-left"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ appearance: 'auto' }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>

        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>User Details</th>
                <th>Directory Info</th>
                <th>System Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="skeleton" style={{ height: '24px', width: '50%', margin: '0 auto', borderRadius: '4px' }}></div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-danger)' }}>
                    Failed to load users. Please check your connection.
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}><Search size={48} opacity={0.2} /></div>
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user: any) => (
                  <tr key={user.username}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--nicsi-navy)' }}>{user.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>{user.email}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{user.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                        {user.designation || 'N/A'} • {user.zone || 'N/A'}
                      </div>
                    </td>
                    <td>
                      {getRoleBadge(user.role, user.roleLabel)}
                    </td>
                    <td>
                      {user.isActive ? (
                        <span className="badge badge-success"><CheckCircle2 size={12} /> Active</span>
                      ) : (
                        <span className="badge badge-danger"><Ban size={12} /> Disabled</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" title="Edit User">
                        <Edit2 size={16} />
                      </button>
                      <button className="btn btn-ghost btn-sm" title={user.isActive ? "Disable User" : "Enable User"} style={{ color: user.isActive ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {user.isActive ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {!isLoading && !isError && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border-light)', fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Showing {filteredUsers.length} of {users.length} total users</span>
          </div>
        )}
      </div>

      <CreateUserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {}} 
      />
    </div>
  );
};