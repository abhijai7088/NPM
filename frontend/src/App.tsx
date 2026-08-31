import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { MfaPage } from './pages/auth/MfaPage';
import './api/delegatedContext';

const DashboardPage = lazy(() => import('./pages/dashboard/RoleDashboardPage').then(m => ({ default: m.RoleDashboardPage })));
const ProjectListPage = lazy(() => import('./pages/projects/ProjectListPage').then(m => ({ default: m.ProjectListPage })));
const Project360Page = lazy(() => import('./pages/projects/Project360Page').then(m => ({ default: m.Project360Page })));
const FinancePage = lazy(() => import('./pages/finance/FinancePage').then(m => ({ default: m.FinancePage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));
const NoticesPage = lazy(() => import('./pages/notifications/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const ProjectManagersPage = lazy(() => import('./pages/team/ProjectManagersPage').then(m => ({ default: m.ProjectManagersPage })));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const PmcTowerPage = lazy(() => import('./pages/pmc/PmcTowerPage').then(m => ({ default: m.PmcTowerPage })));
const TicketListPage = lazy(() => import('./pages/tickets/TicketListPage').then(m => ({ default: m.TicketListPage })));
const OaTaskDashboard = lazy(() => import('./pages/oa/OaTaskDashboard').then(m => ({ default: m.OaTaskDashboard })));
const PoExpiryAlertsPage = lazy(() => import('./pages/projects/PoExpiryAlertsPage').then(m => ({ default: m.PoExpiryAlertsPage })));

const PageLoader = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'400px', flexDirection:'column', gap:'1rem' }}>
    <div style={{ width:40, height:40, border:'3px solid #e8edf3', borderTop:'3px solid #003366', borderRadius:'50%', animation:'spin-slow 0.8s linear infinite' }} />
    <p style={{ color:'#6c757d', fontSize:'0.875rem' }}>Loading…</p>
  </div>
);

const PlaceholderPage = ({ title, note }: { title:string; note?:string }) => (
  <div style={{ padding:'3rem', textAlign:'center' }}><h2 style={{ color:'#003366', fontFamily:'Poppins, sans-serif' }}>{title}</h2><p style={{ color:'#6c757d', marginTop:'0.5rem' }}>{note ?? 'Coming soon…'}</p></div>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN','MD','PM','PMC','OA']} />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['MD','PM']} />}>
          <Route element={<AppShell />}>
            <Route path="/projects" element={<Suspense fallback={<PageLoader />}><ProjectListPage /></Suspense>} />
            <Route path="/finance" element={<Suspense fallback={<PageLoader />}><FinancePage /></Suspense>} />
            <Route path="/reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
            <Route path="/notices" element={<Suspense fallback={<PageLoader />}><NoticesPage /></Suspense>} />
            <Route path="/notifications" element={<Navigate to="/notices" replace />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['MD','PM','PMC','SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route path="/po-expiry-alerts" element={<Suspense fallback={<PageLoader />}><PoExpiryAlertsPage /></Suspense>} />
            <Route path="/projects/:headerId" element={<Suspense fallback={<PageLoader />}><Project360Page /></Suspense>} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['MD','PM','PMC','OA','SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<Suspense fallback={<PageLoader />}><TicketListPage /></Suspense>} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['PMC','MD','SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route path="/pmc" element={<Suspense fallback={<PageLoader />}><PmcTowerPage /></Suspense>} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['OA']} />}>
          <Route element={<AppShell />}>
            <Route path="/my-tasks" element={<Suspense fallback={<PageLoader />}><OaTaskDashboard /></Suspense>} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['MD']} />}>
          <Route element={<AppShell />}>
            <Route path="/project-managers" element={<Suspense fallback={<PageLoader />}><ProjectManagersPage /></Suspense>} />
            <Route path="/team" element={<Navigate to="/project-managers" replace />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route path="/admin/users" element={<Suspense fallback={<PageLoader />}><UserManagementPage /></Suspense>} />
            <Route path="/admin/audit" element={<Suspense fallback={<PageLoader />}><AuditLogPage /></Suspense>} />
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/audit" element={<Navigate to="/admin/audit" replace />} />
          </Route>
        </Route>

        <Route path="/403" element={<PlaceholderPage title="403 — Access Denied" note="You are not authorised to view this page." />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
