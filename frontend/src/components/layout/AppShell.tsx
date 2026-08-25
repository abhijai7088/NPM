import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import { useAlerts } from '../../hooks/useAlerts';
import { useAppStore } from '../../store/appStore';
import './AppShell.css';

type Role = 'SUPER_ADMIN' | 'MD' | 'PM' | 'PMC' | 'OA';


/**
 * NICSI NPMS RBAC Navigation Model
 * ─────────────────────────────────────────────────────────────────
 * PM (Project Manager) : Dashboard · Projects · Finance · Reports · Notices
 * MD (Managing Director): Dashboard · Project Managers · Projects · Finance · Reports · Notices
 * SUPER_ADMIN           : Dashboard · User Management · Audit Log
 * ─────────────────────────────────────────────────────────────────
 * AI module is deferred — excluded until backend is ready.
 */
const getNavItems = (lang: 'en' | 'hi'): Array<{ to: string; label: string; icon: React.ReactNode; roles: Role[] }> => [
  // ── Dashboard (all roles) ──
  {
    to: '/dashboard',
    label: lang === 'en' ? 'Dashboard' : 'डैशबोर्ड',
    roles: ['SUPER_ADMIN', 'MD', 'PM'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    )
  },
  // ── Project Managers (MD only) — NICSI terminology: shows PM roster under MD ──
  {
    to: '/project-managers',
    label: lang === 'en' ? 'Project Managers' : 'परियोजना प्रबंधक',
    roles: ['MD'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )
  },
  // ── Projects (PM scope; MD accesses via PM Roster cards) ──
  {
    to: '/projects',
    label: lang === 'en' ? 'Projects' : 'परियोजनाएं',
    roles: ['PM'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    )
  },
  // ── Finance (PM scope; MD accesses via PM Roster cards) ──
  {
    to: '/finance',
    label: lang === 'en' ? 'Finance' : 'वित्त',
    roles: ['PM'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/>
      </svg>
    )
  },
  // ── Reports (MIS / Utilisation / Status) ──
  {
    to: '/reports',
    label: lang === 'en' ? 'Reports' : 'रिपोर्ट',
    roles: ['MD', 'PM'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    )
  },
  // ── Notices (NICSI term for Notifications/Alerts to field PMs) ──
  {
    to: '/notices',
    label: lang === 'en' ? 'Notices' : 'सूचनाएँ',
    roles: ['MD', 'PM'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    )
  },
  // ── Tickets (MD + PM + PMC — work-item governance) ──
  {
    to: '/tickets',
    label: lang === 'en' ? 'Tickets' : 'टिकट',
    roles: ['MD', 'PM', 'PMC'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    )
  },
  // ── PMC Control Tower (PMC + MD only) ──
  {
    to: '/pmc',
    label: lang === 'en' ? 'PMC Tower' : 'पीएमसी टावर',
    roles: ['PMC', 'MD'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="3" width="15" height="13" rx="1"/>
        <path d="M16 8h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-3"/>
        <path d="M9 10l2 2 4-4"/>
      </svg>
    )
  },
  // ── My Tasks (OA personal queue) ──
  {
    to: '/my-tasks',
    label: lang === 'en' ? 'My Tasks' : 'मेरे कार्य',
    roles: ['OA', 'PM'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    )
  },
];


// System Administration items — Super Admin only
const getAdminItems = (lang: 'en' | 'hi'): Array<{ to: string; label: string; icon: React.ReactNode; roles: Role[] }> => [
  {
    to: '/admin/users',
    label: lang === 'en' ? 'User Management' : 'उपयोगकर्ता प्रबंधन',
    roles: ['SUPER_ADMIN'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
      </svg>
    )
  },

  {
    to: '/admin/audit',
    label: lang === 'en' ? 'Audit Log' : 'ऑडिट लॉग',
    roles: ['SUPER_ADMIN'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
    )
  },
];

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MD: 'Managing Director',
  PM: 'Project Manager',
  PMC: 'Monitoring Cell',
  OA: 'Operational Asst.',
};


export const AppShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { lang, setLang } = useAppStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { alerts, unreadCount, markRead } = useAlerts(user);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setMobileOpen(false);
  }, [navigate]);

  const currentRole: Role = (user?.role as Role) ?? 'PM';
  const roleLabel = ROLE_LABELS[currentRole] ?? currentRole;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ── Secure Session Management (Idle Timeout) ──
  useEffect(() => {
    let timeoutId: number;

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      // 15 minutes idle timeout (900,000 ms) for secure environment
      timeoutId = window.setTimeout(() => {
        handleLogout();
      }, 900000);
    };

    // Listen to user activity to keep session alive
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(evt => document.addEventListener(evt, resetTimer));

    resetTimer(); // Initialize timer on mount

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach(evt => document.removeEventListener(evt, resetTimer));
    };
  }, []);

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      {/* ── Mobile Overlay ── */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Mobile Hamburger ── */}
      <button
        className="sidebar-hamburger"
        onClick={() => setMobileOpen(v => !v)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        title={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        <span className="sidebar-hamburger__bar" style={{ transform: mobileOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
        <span className="sidebar-hamburger__bar" style={{ opacity: mobileOpen ? 0 : 1 }} />
        <span className="sidebar-hamburger__bar" style={{ transform: mobileOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
      </button>
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div
          className="sidebar-logo"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: collapsed ? '16px 8px' : '24px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            minHeight: 'auto',
            boxSizing: 'border-box',
            width: '100%',
            position: 'relative'
          }}
        >
          <img
            src="/nicsi-logo-v2.png"
            alt="NICSI Logo"
            style={{
              width: '100%',
              maxWidth: collapsed ? '36px' : '220px',
              height: 'auto',
              display: 'block',
              objectFit: 'contain'
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav__section">
            {!collapsed && <span className="sidebar-nav__label">{lang === 'en' ? 'Main' : 'मुख्य'}</span>}
            {getNavItems(lang).filter(item => item.roles.includes(currentRole)).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `sidebar-nav__item ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span className="sidebar-nav__icon">{item.icon}</span>
                {!collapsed && <span className="sidebar-nav__text">{item.label}</span>}
                {!collapsed && <span className="sidebar-nav__indicator" />}
              </NavLink>
            ))}
          </div>

          {getAdminItems(lang).some(item => item.roles.includes(currentRole)) && (
            <div className="sidebar-nav__section">
              {!collapsed && <span className="sidebar-nav__label">{lang === 'en' ? 'System' : 'प्रणाली'}</span>}
              {getAdminItems(lang).filter(item => item.roles.includes(currentRole)).map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sidebar-nav__item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar-nav__icon">{item.icon}</span>
                  {!collapsed && <span className="sidebar-nav__text">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </nav>


      </aside>

      {/* ── Main Area ── */}
      <div className="app-main">
        {/* Government Top Bar - Slim Premium Blue Strip */}
        <div className="govt-bar">
          <div className="govt-bar__left">
            {/* Indian Flag */}
            <img
              src="/flag-india.svg"
              alt="Flag of India"
              className="govt-bar__flag"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="govt-bar__gov-text">भारत सरकार | Government of India</span>
          </div>

          <div className="govt-bar__right">
            <div className="govt-bar__actions">
              <a href="#main-content" className="govt-bar__link" onClick={(e) => { e.preventDefault(); const el = document.getElementById('main-content'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth' }); }}}>{lang === 'en' ? 'Skip to Main Content' : 'मुख्य विषयवस्तु में जाएं'}</a>
              <span className="govt-bar__sep-v"></span>
              <div className="govt-bar__font-group">
                <button className="govt-bar__font-btn" title="Decrease font" onClick={() => { document.documentElement.style.fontSize = '14px'; }}>A<sup>-</sup></button>
                <button className="govt-bar__font-btn govt-bar__font-btn--active" title="Normal font" onClick={() => { document.documentElement.style.fontSize = '16px'; }}>A</button>
                <button className="govt-bar__font-btn" title="Increase font" onClick={() => { document.documentElement.style.fontSize = '18px'; }}>A<sup>+</sup></button>
              </div>
              <span className="govt-bar__sep-v"></span>
              <div id="bhashini-target" className="bhashini-topbar"></div>
            </div>
          </div>
        </div>

        {/* TopBar */}
        <header className="topbar">
          {/* Burger Button for collapsing/expanding sidebar */}
          <button
            className="topbar-hamburger-btn"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? (lang === 'en' ? 'Expand Sidebar' : 'नेविगेशन बढ़ाएं') : (lang === 'en' ? 'Collapse Sidebar' : 'नेविगेशन सिकोड़ें')}
            aria-label="Toggle Sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          {/* Ministry and Digital India logos on the left */}
          <div className="topbar-logos">
            <img
              src="/meity-logo.svg"
              alt="Ministry of Electronics & Information Technology"
              className="topbar-logo-img topbar-logo-img--meity"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="topbar-logos__divider"></span>
            <img
              src="/digital-india.svg"
              alt="Digital India"
              className="topbar-logo-img topbar-logo-img--di"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>

          <span className="topbar__sep-v"></span>

          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              <span className="topbar-breadcrumb__home">NPMS</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="topbar-breadcrumb__current">{lang === 'en' ? 'Overview' : 'अवलोकन'}</span>
            </div>
          </div>


          <div className="topbar-right">
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button
                className="topbar-icon-btn"
                title="Notifications"
                onClick={() => { setShowNotif(v => !v); setShowHelp(false); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && <span className="topbar-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {showNotif && (
                <div className="topbar-dropdown" style={{ width: '360px' }}>
                  <div className="topbar-dropdown__header">
                    <span>{lang === 'en' ? 'System Alerts' : 'सिस्टम अलर्ट'}</span>
                    {unreadCount > 0 && <span className="badge badge-danger" style={{ fontSize: '0.625rem' }}>{unreadCount} Unread</span>}
                  </div>
                  <div className="topbar-dropdown__body" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                    {alerts.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6c757d', fontSize: '0.85rem' }}>No active alerts</div>
                    ) : alerts.slice(0, 5).map(a => (
                      <div
                        key={a.id}
                        className={`notif-item ${!a.isRead ? 'unread' : ''}`}
                        onClick={() => { markRead(a.id); }}
                        style={{ cursor: 'pointer', borderLeft: !a.isRead ? `3px solid ${a.type === 'CRITICAL' ? '#DC3545' : a.type === 'WARNING' ? '#FFC107' : '#17a2b8'}` : 'none' }}
                      >
                        <div className={`notif-icon ${a.type === 'CRITICAL' ? 'danger' : a.type === 'WARNING' ? 'warning' : 'info'}`}>
                          {a.type === 'CRITICAL' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          ) : a.type === 'WARNING' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                          )}
                        </div>
                        <div>
                          <span className="notif-content__title">{a.title}</span>
                          <span className="notif-content__desc" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid #e8edf3', padding: '0.65rem 1rem', textAlign: 'center' }}>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--nicsi-teal)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                      onClick={() => { setShowNotif(false); navigate('/notifications'); }}
                    >
                      View All Alerts ({alerts.length})
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button className="topbar-icon-btn" title="Help" onClick={() => { setShowHelp(!showHelp); setShowNotif(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </button>
              {showHelp && (
                <div className="topbar-dropdown">
                  <div className="topbar-dropdown__header">
                    <span>{lang === 'en' ? 'NICSI Helpdesk & Support' : 'NICSI सहायता डेस्क'}</span>
                  </div>
                  <div className="topbar-dropdown__body">
                    <div className="help-section">
                      <h4>Contact Support</h4>
                      <div className="help-contact-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        <span>+91-11-22900525 / 523</span>
                      </div>
                      <div className="help-contact-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        <span>8527625551 (WhatsApp)</span>
                      </div>
                      <div className="help-contact-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        <a href="mailto:info-nicsi@nic.in" style={{ color: 'var(--nicsi-teal)', textDecoration: 'none' }}>info-nicsi@nic.in</a>
                      </div>
                    </div>
                    <div className="help-section">
                      <h4>Corporate Office</h4>
                      <div className="help-contact-item" style={{ alignItems: 'flex-start' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginTop: '2px' }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span style={{ lineHeight: 1.4 }}>National Informatics Centre Services Inc.<br/>Hall No. 2 & 3, 6th Floor, NBCC Tower,<br/>15 Bhikaji Cama Place, New Delhi – 110066</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Search Pill Input on the right, beside user card */}
            <div className="topbar-search-pill">
              <input
                type="text"
                className="topbar-search-pill__input"
                placeholder={lang === 'en' ? 'Search here...' : 'यहाँ खोजें...'}
              />
              <span className="topbar-search-pill__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
            </div>

            <div className="topbar-user">
              <div className="topbar-user__avatar">
                {user?.fullName?.[0] ?? 'A'}
              </div>
              <div className="topbar-user__info">
                <span className="topbar-user__name">{user?.fullName ?? (lang === 'en' ? 'Admin User' : 'एडमिन यूजर')}</span>
                <span className="topbar-user__org">
                  {roleLabel}{user?.zone ? ` · ${user.zone}` : ' · NICSI'}
                  {currentRole === 'PM' && <span style={{ opacity: 0.8 }}> · ID: {user?.prjMgrId || 'XX'}</span>}
                  {currentRole === 'MD' && <span style={{ opacity: 0.8 }}> · Org View</span>}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button className="topbar-logout-button" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>{lang === 'en' ? 'Logout' : 'लॉग आउट'}</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="app-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div className="app-footer__left">
            <img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Emblem of India" className="app-footer__emblem" />
            <div className="app-footer__text">
              <span className="app-footer__copy">{lang === 'en' ? '© 2026 National Informatics Centre Services Inc. (NICSI)' : '© 2026 नेशनल इन्फॉर्मेटिक्स सेंटर सर्विसेज इंक. (NICSI)'}</span>
              <span className="app-footer__desc">{lang === 'en' ? 'A Government of India Enterprise under NIC, MeitY' : 'एनआईसी, माइटी के अंतर्गत भारत सरकार का उद्यम'}</span>
            </div>
          </div>
          <div className="app-footer__right">
            <div className="app-footer__links">
              <a href="#">{lang === 'en' ? 'Terms & Conditions' : 'नियम और शर्तें'}</a>
              <a href="#">{lang === 'en' ? 'Privacy Policy' : 'गोपनीयता नीति'}</a>
              <a href="#">{lang === 'en' ? 'Copyright Policy' : 'कॉपीराइट नीति'}</a>
              <a href="#">{lang === 'en' ? 'Hyperlinking Policy' : 'हाइपरलिंकिंग नीति'}</a>
            </div>
            <span className="app-footer__version">NPMS v2.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
