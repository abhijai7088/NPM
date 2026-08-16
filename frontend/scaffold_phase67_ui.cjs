const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src';

const dirs = [
    'components/notifications', 'pages/notifications', 'components/ai', 'pages/ai'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'components/notifications/NotificationBell.tsx': `import React, { useState, useEffect } from 'react';

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
};`,

  'pages/notifications/NotificationsPage.tsx': `import React, { useState } from 'react';

export const NotificationsPage = () => {
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Notification Center</h2>
        <button style={{ padding: '0.5rem 1rem' }}>Mark all as read</button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', margin: '1.5rem 0', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
        <button onClick={() => setFilter('ALL')} style={{ fontWeight: filter === 'ALL' ? 'bold' : 'normal' }}>All</button>
        <button onClick={() => setFilter('UNREAD')} style={{ fontWeight: filter === 'UNREAD' ? 'bold' : 'normal' }}>Unread</button>
        <button onClick={() => setFilter('READ')} style={{ fontWeight: filter === 'READ' ? 'bold' : 'normal' }}>Read</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', background: '#f9fafb' }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>📄 Project Submitted</h4>
          <p style={{ margin: 0, color: '#444' }}>Project "NH-48 Widening" has been submitted for approval.</p>
          <small style={{ color: '#888', display: 'block', marginTop: '0.5rem' }}>2 hours ago</small>
        </div>
      </div>
    </div>
  );
};`,

  'components/ai/AiChatWidget.tsx': `import React, { useState } from 'react';

export const AiChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'ai', text: 'Based on the NPMS documents, the data suggests...' }]);
    }, 1000);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          background: '#3b82f6', color: 'white', border: 'none', borderRadius: '50%',
          width: '60px', height: '60px', fontSize: '1.5rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
      >
        🧠
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '6rem', right: '2rem', width: '380px', height: '520px',
          background: 'white', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ background: '#1e3a8a', color: 'white', padding: '1rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>NPMS AI Assistant</h3>
            <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer' }}>✖</button>
          </div>
          <div style={{ background: '#fef3c7', padding: '0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>
            ⚠️ Advisory only. Verify data.
          </div>
          <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#dbeafe' : '#f3f4f6', padding: '0.75rem', borderRadius: '8px', maxWidth: '80%' }}>
                {m.text}
              </div>
            ))}
          </div>
          <div style={{ padding: '1rem', borderTop: '1px solid #eee' }}>
            <small style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>Queries remaining: 19/20 today</small>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} style={{ flex: 1, padding: '0.5rem' }} placeholder="Ask a question..." />
              <button onClick={handleSend} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px' }}>Send</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};`,

  'pages/ai/AiChatPage.tsx': `import React from 'react';
import { AiChatWidget } from '../../components/ai/AiChatWidget';

export const AiChatPage = () => {
  return (
    <div style={{ padding: '2rem', display: 'flex', gap: '2rem', height: 'calc(100vh - 100px)' }}>
      <div style={{ flex: 1, background: '#f9fafb', padding: '1.5rem', borderRadius: '8px' }}>
        <h3>Suggested Queries</h3>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <li><button style={{ width: '100%', padding: '1rem', textAlign: 'left', background: 'white', border: '1px solid #ccc', borderRadius: '4px' }}>Summarize my pending approvals</button></li>
          <li><button style={{ width: '100%', padding: '1rem', textAlign: 'left', background: 'white', border: '1px solid #ccc', borderRadius: '4px' }}>Which projects are over budget?</button></li>
          <li><button style={{ width: '100%', padding: '1rem', textAlign: 'left', background: 'white', border: '1px solid #ccc', borderRadius: '4px' }}>List unpaid invoices over ₹10 lakhs</button></li>
        </ul>
      </div>
      <div style={{ flex: 2, background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Chat Session</h3>
        <div style={{ flex: 1, border: '1px solid #eee', background: '#f3f4f6', borderRadius: '8px', padding: '1rem' }}>
          <p style={{ color: '#666', textAlign: 'center' }}>AI Chat History Will Appear Here</p>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
          <input style={{ flex: 1, padding: '0.75rem' }} placeholder="Type your advanced analytical query..." />
          <button style={{ padding: '0.75rem 2rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>Analyze</button>
        </div>
      </div>
    </div>
  );
};`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 6 & 7 Frontend UI scaffolded.');
