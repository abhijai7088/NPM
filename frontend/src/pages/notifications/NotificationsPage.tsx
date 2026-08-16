import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAlerts, type EAlert } from '../../hooks/useAlerts';

const typeStyle = (type: EAlert['type']) => ({
  bg: type === 'CRITICAL' ? '#DC354518' : type === 'WARNING' ? '#FFC10722' : '#00669918',
  color: type === 'CRITICAL' ? '#DC3545' : type === 'WARNING' ? '#D39E00' : '#006699',
  border: type === 'CRITICAL' ? '#DC3545' : type === 'WARNING' ? '#FFC107' : '#17a2b8',
});

function AlertCard({ a, onToggleRead }: { a: EAlert & { isRead: boolean }; onToggleRead: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const s = typeStyle(a.type);

  return (
    <div
      style={{
        background: a.isRead ? '#fff' : '#f4fafe',
        border: `1px solid ${a.isRead ? '#e8edf3' : s.border + '55'}`,
        borderLeft: `4px solid ${s.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Row */}
      <div
        style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', padding: '1rem 1.25rem', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {a.type === 'CRITICAL' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ) : a.type === 'WARNING' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--nicsi-navy)', fontSize: '0.95rem' }}>{a.title}</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>{a.type}</span>
              {!a.isRead && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--nicsi-teal)', display: 'inline-block' }} />}
            </div>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: '#4a5568', fontSize: '0.875rem', lineHeight: 1.5 }}>{a.message}</p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" strokeWidth="2"
          style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginTop: 2 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid #e8edf3', padding: '1rem 1.25rem', background: '#f8fbff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {a.projectCode && (
              <div>
                <div style={{ fontSize: '0.72rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase' }}>Project Code</div>
                <div style={{ fontWeight: 700, color: '#003366', marginTop: 2 }}>
                  <code style={{ fontSize: '0.8rem', background: '#e8f4fd', padding: '1px 5px', borderRadius: 3 }}>{a.projectCode}</code>
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.72rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase' }}>Alert Severity</div>
              <div style={{ fontWeight: 700, color: s.color, marginTop: 2 }}>{a.type}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontWeight: 700, color: a.isRead ? '#28A745' : 'var(--nicsi-teal)', marginTop: 2 }}>{a.isRead ? 'Read' : 'Unread'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              style={{
                padding: '0.4rem 1rem', borderRadius: 6, border: `1px solid ${s.border}`,
                background: 'white', color: s.color, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer'
              }}
              onClick={(e) => { e.stopPropagation(); onToggleRead(); }}
            >
              {a.isRead ? 'Mark as Unread' : 'Mark as Read'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const NotificationsPage = () => {
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');
  const { alerts, unreadCount, loading, markRead, markAllRead } = useAlerts(user);

  const toggleRead = (a: EAlert & { isRead: boolean }) => {
    if (!a.isRead) markRead(a.id);
    // Note: markAllRead covers all; single unmark would need to remove from set.
    // For simplicity, clicking "Mark as Unread" refreshes localStorage by removing the ID.
    else {
      try {
        const key = `read_alerts_${user?.userId}`;
        const raw = localStorage.getItem(key);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        const next = ids.filter((id: string) => id !== a.id);
        localStorage.setItem(key, JSON.stringify(next));
        window.location.reload(); // simplest refresh approach
      } catch {}
    }
  };

  const filtered = alerts.filter(a => {
    if (filter === 'UNREAD') return !a.isRead;
    if (filter === 'READ') return a.isRead;
    if (filter === 'CRITICAL') return a.type === 'CRITICAL';
    if (filter === 'WARNING') return a.type === 'WARNING';
    if (filter === 'INFO') return a.type === 'INFO';
    return true;
  });

  const tabs: { key: typeof filter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'UNREAD', label: 'Unread' },
    { key: 'READ', label: 'History' },
    { key: 'CRITICAL', label: 'Critical' },
    { key: 'WARNING', label: 'Warning' },
    { key: 'INFO', label: 'Info' },
  ];

  return (
    <div className="page-container animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '840px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ color: 'var(--nicsi-navy)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Notification Centre</h2>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Live alerts derived from ERP project data. Click any alert to expand details.</p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-outline btn-sm" onClick={markAllRead} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Mark All as Read ({unreadCount})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '0' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background: 'none', border: 'none',
              borderBottom: filter === tab.key ? '3px solid var(--nicsi-teal)' : '3px solid transparent',
              padding: '0.65rem 0.875rem',
              color: filter === tab.key ? 'var(--nicsi-navy)' : 'var(--color-text-muted)',
              fontWeight: filter === tab.key ? 700 : 500,
              fontSize: '0.875rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.key === 'UNREAD' && unreadCount > 0 && (
              <span style={{ background: '#DC3545', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 700 }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>Loading live alerts from ERP…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', background: '#f8fbff', borderRadius: 12, border: '1px dashed #cfe3fb' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0b4a8f" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.5 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h3 style={{ color: 'var(--nicsi-navy)', fontSize: '1.05rem' }}>No alerts in this category</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>All systems are operating normally for the selected filter.</p>
          </div>
        ) : (
          filtered.map(a => (
            <AlertCard key={a.id} a={a} onToggleRead={() => toggleRead(a)} />
          ))
        )}
      </div>

      {/* Count Footer */}
      {!loading && filtered.length > 0 && (
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
          Showing {filtered.length} of {alerts.length} total alerts
        </div>
      )}
    </div>
  );
};