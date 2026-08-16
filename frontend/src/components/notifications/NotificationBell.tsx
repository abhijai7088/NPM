import React, { useState, useEffect } from 'react';

export const NotificationBell = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Simulate SSE connection
    const interval = setInterval(() => {
      setUnreadCount(prev => prev < 5 ? prev + 1 : prev);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', fontSize: '1.5rem' }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, background: 'red', color: 'white', 
            borderRadius: '50%', padding: '2px 6px', fontSize: '0.75rem', fontWeight: 'bold'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, width: '300px', background: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px', zIndex: 1000, padding: '1rem'
        }}>
          <h4 style={{ margin: '0 0 1rem 0', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Notifications</h4>
          {unreadCount === 0 ? (
            <p style={{ color: '#666', textAlign: 'center' }}>No new notifications</p>
          ) : (
            <div>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>✅ PO-MOD-2026-0001 Approved</p>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>⚠️ ERP Sync Stale Alert</p>
            </div>
          )}
          <button style={{ width: '100%', padding: '0.5rem', marginTop: '1rem', background: '#f3f4f6', border: 'none', cursor: 'pointer' }}>
            Mark all read
          </button>
        </div>
      )}
    </div>
  );
};