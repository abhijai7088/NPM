import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import './SuperAdminDashboard.css';

export const SuperAdminDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  useEffect(() => {
    // Fetch all users using the same endpoint as User Management
    axios.get(`/api/v1/users?actingRole=${user?.role || ''}&actingUser=${user?.username || ''}`)
      .then(res => {
        if (res.data.success) {
          setUsers(res.data.data);
        }
      })
      .catch(err => console.error("Error fetching users", err))
      .finally(() => setLoading(false));
  }, [user]);

  // Derived statistics
  const totalUsers = users.length;
  const mds = users.filter(u => u.role === 'MD').length;
  const pms = users.filter(u => u.role === 'PM').length;
  const admins = users.filter(u => u.role === 'SUPER_ADMIN').length;
  const activeCount = users.filter(u => u.isActive).length;
  const lockedCount = users.filter(u => !u.isActive).length;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return <span className="sa-role sa-role--admin">Super Admin</span>;
      case 'MD': return <span className="sa-role sa-role--md">Managing Director</span>;
      case 'PM': return <span className="sa-role sa-role--pm">Project Manager</span>;
      default: return <span className="sa-role sa-role--default">{role}</span>;
    }
  };

  return (
    <div className="sa-dashboard page-container animate-fade-in-up">
      <div className="sa-header">
        <div>
          <h2 className="sa-title">System Overview</h2>
          <p className="sa-sub">Real-time user directory, role distribution, and system access status</p>
        </div>
        <div className="sa-actions">
          <button className="btn btn-primary" onClick={() => navigate('/admin/users')}>
            Manage Users →
          </button>
        </div>
      </div>

      <div className="sa-kpi-grid">
        <div className="sa-kpi-card">
          <div className="sa-kpi-icon sa-kpi-icon--blue">👥</div>
          <div className="sa-kpi-content">
            <div className="sa-kpi-value">{totalUsers}</div>
            <div className="sa-kpi-label">Total System Users</div>
          </div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-icon sa-kpi-icon--orange">👔</div>
          <div className="sa-kpi-content">
            <div className="sa-kpi-value">{mds}</div>
            <div className="sa-kpi-label">Managing Directors</div>
          </div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-icon sa-kpi-icon--teal">📊</div>
          <div className="sa-kpi-content">
            <div className="sa-kpi-value">{pms}</div>
            <div className="sa-kpi-label">Project Managers</div>
          </div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-icon sa-kpi-icon--red">🔒</div>
          <div className="sa-kpi-content">
            <div className="sa-kpi-value">{lockedCount}</div>
            <div className="sa-kpi-label">Inactive/Locked Accounts</div>
          </div>
        </div>
      </div>

      <div className="sa-layout">
        <div className="card sa-table-container">
          <div className="card-header">
            <h3 className="sa-chart-title">User Directory</h3>
            <p className="sa-chart-sub">Click on a user to view their complete profile and access hierarchy</p>
          </div>
          <div className="sa-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>Username</th>
                  <th>System Role</th>
                  <th>Zone / Region</th>
                  <th>Reports To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Loading user directory...</td></tr>
                ) : users.map(u => (
                  <tr key={u.id || u.username} 
                      className={`table-row-hover ${selectedUser?.username === u.username ? 'sa-row-selected' : ''}`}
                      onClick={() => setSelectedUser(u)}>
                    <td>
                      <div className="sa-user-cell">
                        <div className="sa-avatar">
                          {(u.fullName || u.username).substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="sa-user-name">{u.fullName || '—'}</div>
                          <div className="sa-user-email">{u.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td><code className="sa-code">{u.username}</code></td>
                    <td>{getRoleBadge(u.role)}</td>
                    <td>{u.zone || 'Global'}</td>
                    <td>{u.role === 'PM' ? (u.managedBy || 'Unassigned') : '—'}</td>
                    <td>
                      <span className={`badge badge-${u.isActive ? 'success' : 'danger'}`}>
                        {u.isActive ? 'Active' : 'Locked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedUser && (
          <div className="sa-drawer card animate-fade-in-up">
            <div className="sa-drawer__header">
              <h3>User Profile Details</h3>
              <button className="btn-close" onClick={() => setSelectedUser(null)}>×</button>
            </div>
            
            <div className="sa-drawer__profile">
              <div className="sa-drawer__avatar-large">
                {(selectedUser.fullName || selectedUser.username).substring(0, 2).toUpperCase()}
              </div>
              <h4>{selectedUser.fullName || '—'}</h4>
              <p>{selectedUser.email || '—'}</p>
              <div style={{ marginTop: '0.5rem' }}>{getRoleBadge(selectedUser.role)}</div>
            </div>

            <div className="sa-drawer__body">
              <div className="sa-detail-group">
                <div className="sa-detail-row">
                  <span>Username:</span> <strong>{selectedUser.username}</strong>
                </div>
                <div className="sa-detail-row">
                  <span>Designation:</span> <strong>{selectedUser.designation || '—'}</strong>
                </div>
                {selectedUser.role === 'PM' && (
                  <div className="sa-detail-row">
                    <span>PM ID:</span> <strong>{selectedUser.prjMgrId || '—'}</strong>
                  </div>
                )}
                <div className="sa-detail-row">
                  <span>Zone:</span> <strong>{selectedUser.zone || 'Global'}</strong>
                </div>
                <div className="sa-detail-row">
                  <span>Reporting Manager:</span> <strong>{selectedUser.managedBy || (selectedUser.role === 'PM' ? 'Unassigned' : 'N/A')}</strong>
                </div>
                <div className="sa-detail-row">
                  <span>Account Status:</span> 
                  <strong style={{ color: selectedUser.isActive ? 'var(--success-color)' : 'var(--danger-color)' }}>
                    {selectedUser.isActive ? 'Active & Permitted' : 'Locked / Deactivated'}
                  </strong>
                </div>
              </div>

              <div className="sa-drawer__actions">
                <button className="btn btn-outline" style={{ width: '100%', marginBottom: '0.5rem' }} onClick={() => navigate('/admin/users')}>
                  Edit Permissions
                </button>
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => navigate(`/admin/audit?username=${selectedUser.username}`)}>
                  View Audit History
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
