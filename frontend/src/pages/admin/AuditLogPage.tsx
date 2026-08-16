import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import './AuditLogPage.css';

const API = '/api/v1/audit/logs';

/** Human-readable label for every action code the backend can emit. */
const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Successful Login',
  LOGIN_FAILED: 'Failed Login Attempt',
  LOGIN_MFA_REQUIRED: 'MFA Challenge Issued',
  LOGIN_PASSWORD_CHANGE_REQUIRED: 'First-Login Verification Started',
  LOGOUT: 'Logout',
  ACCOUNT_LOCKED: 'Account Locked',
  PASSWORD_RESET_REQUESTED: 'Password Reset Requested',
  PASSWORD_RESET_OTP_VERIFIED: 'Password Reset OTP Verified',
  PASSWORD_RESET_COMPLETED: 'Password Reset Completed',
  PASSWORD_CHANGED_INITIAL: 'Initial Password Set',
  PASSWORD_SETUP_OTP_RESENT: 'Setup OTP Resent',
  USER_CREATED: 'User Account Created',
  USER_ACTIVATED: 'User Account Activated',
  USER_DEACTIVATED: 'User Account Deactivated',
  USER_DELETED: 'User Account Deleted',
};

const describeAction = (action: string) => ACTION_LABELS[action] || action.replace(/_/g, ' ');

/** Parses a JSON string safely; the backend stores old/new value as JSONB text. */
const safeParseJson = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

/** Builds a field-by-field before/after diff so changes are legible without reading raw JSON. */
const buildFieldDiff = (
  before: Record<string, any> | null,
  after: Record<string, any> | null
): Array<{ field: string; before: unknown; after: unknown; changed: boolean }> => {
  if (!before || !after) return [];
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return fields
    .map(field => ({
      field,
      before: before[field],
      after: after[field],
      changed: JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    }))
    .sort((a, b) => (a.changed === b.changed ? a.field.localeCompare(b.field) : a.changed ? -1 : 1));
};

export const AuditLogPage: React.FC = () => {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const size = 25;

  const [filters, setFilters] = useState({
    username: '',
    action: '',
    entityType: '',
    status: '',
    from: '',
    to: ''
  });

  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = (currentPage = 0) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.append('page', currentPage.toString());
    params.append('size', size.toString());
    if (filters.username) params.append('username', filters.username);
    if (filters.action) params.append('action', filters.action);
    if (filters.entityType) params.append('entityType', filters.entityType);
    if (filters.status) params.append('status', filters.status);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);

    axios.get(`${API}?${params.toString()}`, { withCredentials: true })
      .then(res => {
        if (res.data.success) {
          setLogs(res.data.data.data);
          setTotal(res.data.data.total);
          setPage(res.data.data.page);
        }
      })
      .catch(err => console.error('Error fetching audit logs', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(0);
  };

  const handleReset = () => {
    setFilters({ username: '', action: '', entityType: '', status: '', from: '', to: '' });
    setTimeout(() => fetchLogs(0), 0);
  };

  const getActionColor = (action: string, status: string) => {
    if (status === 'FAILURE' || action.includes('LOCK') || action.includes('FAIL') || action.includes('DEACTIVATED') || action === 'USER_DELETED') return 'var(--danger-color)';
    if (action.includes('SUCCESS') || action.includes('CREATED') || action.includes('ACTIVATED') || action.includes('COMPLETED')) return 'var(--success-color)';
    if (action.includes('RESET') || action.includes('RESENT')) return 'var(--warning-color)';
    if (action === 'LOGOUT') return 'var(--primary-color)';
    return '#6c757d';
  };

  const totalPages = Math.ceil(total / size);

  return (
    <div className="audit-page page-container">
      <div className="audit-header">
        <div>
          <h2 className="audit-title">System Audit Log</h2>
          <p className="audit-sub">Immutable record of all system events — CERT-In compliant</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
          Export CSV
        </button>
      </div>

      <div className="card audit-filters">
        <form onSubmit={handleSearch} className="audit-filters__form">
          <label className="audit-filters__field">
            <span>Username</span>
            <input value={filters.username} onChange={e => setFilters({...filters, username: e.target.value})} placeholder="Filter by username" />
          </label>
          <label className="audit-filters__field">
            <span>Action Type</span>
            <select value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})}>
              <option value="">All Actions</option>
              <option value="LOGIN_SUCCESS">Login Success</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="ACCOUNT_LOCKED">Account Locked</option>
              <option value="LOGOUT">Logout</option>
              <option value="USER_CREATED">User Created</option>
              <option value="USER_ACTIVATED">User Activated</option>
              <option value="USER_DEACTIVATED">User Deactivated</option>
              <option value="USER_DELETED">User Deleted</option>
              <option value="PASSWORD_RESET_REQUESTED">Password Reset Requested</option>
              <option value="PASSWORD_RESET_COMPLETED">Password Reset Completed</option>
              <option value="PASSWORD_CHANGED_INITIAL">Initial Password Set</option>
            </select>
          </label>
          <label className="audit-filters__field">
            <span>Status</span>
            <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">All</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failure</option>
            </select>
          </label>
          <label className="audit-filters__field">
            <span>From Date</span>
            <input type="datetime-local" value={filters.from} onChange={e => setFilters({...filters, from: e.target.value})} />
          </label>
          <label className="audit-filters__field">
            <span>To Date</span>
            <input type="datetime-local" value={filters.to} onChange={e => setFilters({...filters, to: e.target.value})} />
          </label>
          <div className="audit-filters__actions">
            <button type="submit" className="btn btn-primary btn-sm">Search</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>Reset</button>
          </div>
        </form>
      </div>

      <div className="audit-layout">
        <div className="card audit-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No audit logs found for the given filters.</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="table-row-hover" onClick={() => setSelectedLog(log)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{new Date(log.createdAt).toLocaleString()}</td>
                    <td><strong>{log.username || 'System'}</strong></td>
                    <td>
                      <span className="audit-badge" style={{ background: `${getActionColor(log.action, log.status)}18`, color: getActionColor(log.action, log.status) }}>
                        {describeAction(log.action)}
                      </span>
                    </td>
                    <td>{log.entityType || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{log.ipAddress || '—'}</td>
                    <td>
                      <span className={`badge badge-${log.status === 'SUCCESS' ? 'success' : 'danger'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="audit-pagination">
              <button disabled={page === 0} onClick={() => fetchLogs(page - 1)}>Previous</button>
              <span>Page {page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => fetchLogs(page + 1)}>Next</button>
            </div>
          )}
        </div>

        {selectedLog && (
          <div className="audit-drawer card">
            <div className="audit-drawer__header">
              <h3>{describeAction(selectedLog.action)}</h3>
              <button className="btn-close" onClick={() => setSelectedLog(null)}>×</button>
            </div>
            <div className="audit-drawer__body">
              <div className="detail-row">
                <span>Log ID:</span> <strong style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{selectedLog.id}</strong>
              </div>
              <div className="detail-row">
                <span>Timestamp:</span> <strong>{new Date(selectedLog.createdAt).toLocaleString()}</strong>
              </div>
              <div className="detail-row">
                <span>Performed By:</span> <strong>{selectedLog.username || 'System'}</strong>
                {selectedLog.userId && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>({selectedLog.userId})</span>}
              </div>
              <div className="detail-row">
                <span>Action:</span> <strong>{selectedLog.action}</strong>
              </div>
              <div className="detail-row">
                <span>Entity Type:</span> <strong>{selectedLog.entityType || '—'}</strong>
                {selectedLog.entityId && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>({selectedLog.entityId})</span>}
              </div>
              <div className="detail-row">
                <span>Status:</span> <strong style={{ color: selectedLog.status === 'SUCCESS' ? 'var(--success-color)' : 'var(--danger-color)' }}>{selectedLog.status}</strong>
              </div>
              <div className="detail-row">
                <span>IP Address:</span> <strong>{selectedLog.ipAddress || '—'}</strong>
              </div>
              <div className="detail-row">
                <span>User Agent:</span> <span style={{ fontSize: '0.8rem', color: '#666', wordBreak: 'break-word' }}>{selectedLog.userAgent || '—'}</span>
              </div>
              {selectedLog.errorMessage && (
                <div className="detail-row error-msg">
                  <span>Details:</span> <strong>{selectedLog.errorMessage}</strong>
                </div>
              )}

              {(() => {
                const oldParsed = safeParseJson(selectedLog.oldValue);
                const newParsed = safeParseJson(selectedLog.newValue);
                const fieldDiff = buildFieldDiff(oldParsed, newParsed);

                if (!oldParsed && !newParsed) return null;

                return (
                  <div className="audit-diff">
                    <h4>What Changed</h4>
                    {fieldDiff.length > 0 ? (
                      <table className="data-table" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
                        <thead>
                          <tr><th>Field</th><th>Before</th><th>After</th></tr>
                        </thead>
                        <tbody>
                          {fieldDiff.map(row => (
                            <tr key={row.field}>
                              <td>{row.field}</td>
                              <td style={{ color: row.changed ? 'var(--danger-color)' : '#94a3b8' }}>{formatValue(row.before)}</td>
                              <td style={{ color: row.changed ? 'var(--success-color)' : '#94a3b8', fontWeight: row.changed ? 600 : 400 }}>{formatValue(row.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: '#666' }}>
                        {newParsed && !oldParsed ? 'Record created — no prior state.' : oldParsed && !newParsed ? 'Record removed — no resulting state.' : 'No field-level differences recorded.'}
                      </p>
                    )}
                    <div className="audit-diff-raw">
                      {oldParsed && (
                        <div className="diff-box diff-old">
                          <div className="diff-label">Raw Before</div>
                          <pre>{JSON.stringify(oldParsed, null, 2)}</pre>
                        </div>
                      )}
                      {newParsed && (
                        <div className="diff-box diff-new">
                          <div className="diff-label">Raw After</div>
                          <pre>{JSON.stringify(newParsed, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
