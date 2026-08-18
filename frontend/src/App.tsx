import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { MfaPage } from './pages/auth/MfaPage';

// Axios interceptor: appends X-Acting-As-Pm header for MD delegated context
import './api/delegatedContext';

// Lazy-loaded pages for code splitting
const DashboardPage    = lazy(() => import('./pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProjectListPage  = lazy(() => import('./pages/projects/ProjectListPage').then(m => ({ default: m.ProjectListPage })));
const Project360Page   = lazy(() => import('./pages/projects/Project360Page').then(m => ({ default: m.Project360Page })));
const FinancePage      = lazy(() => import('./pages/finance/FinancePage').then(m => ({ default: m.FinancePage })));
const ReportsPage      = lazy(() => import('./pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));
const NoticesPage      = lazy(() => import('./pages/notifications/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const ProjectManagersPage = lazy(() => import('./pages/team/ProjectManagersPage').then(m => ({ default: m.ProjectManagersPage })));
const UserManagementPage  = lazy(() => import('./pages/admin/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const AuditLogPage        = lazy(() => import('./pages/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const PmcTowerPage        = lazy(() => import('./pages/pmc/PmcTowerPage').then(m => ({ default: m.PmcTowerPage })));
const TicketListPage      = lazy(() => import('./pages/tickets/TicketListPage').then(m => ({ default: m.TicketListPage })));
const OaTaskDashboard     = lazy(() => import('./pages/oa/OaTaskDashboard').then(m => ({ default: m.OaTaskDashboard })));

// Loading spinner
const PageLoader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '400px', flexDirection: 'column', gap: '1rem'
  }}>
    <div style={{
      width: 40, height: 40,
      border: '3px solid #e8edf3',
      borderTop: '3px solid #003366',
      borderRadius: '50%',
      animation: 'spin-slow 0.8s linear infinite'
    }} />
    <p style={{ color: '#6c757d', fontSize: '0.875rem' }}>Loading…</p>
  </div>
);

// Placeholder for pages under active development
const PlaceholderPage = ({ title, note }: { title: string; note?: string }) => (
  <div style={{ padding: '3rem', textAlign: 'center' }}>
    <h2 style={{ color: '#003366', fontFamily: 'Poppins, sans-serif' }}>{title}</h2>
    <p style={{ color: '#6c757d', marginTop: '0.5rem' }}>{note ?? 'Coming soon…'}</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public routes ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ────────────────────────────────────────────────────────────────
         *  ALL authenticated roles: Dashboard
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'MD', 'PM', 'PMC', 'OA']} />}>
          <Route element={<AppShell />}>
            <Route
              path="/dashboard"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPage />
                </Suspense>
              }
            />
          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  MD + PM: Project operations
         *  – MD sees ALL projects (server-side scope filter: no prjMgrId)
         *  – PM sees OWN projects (server-side scope filter: prjMgrId)
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['MD', 'PM']} />}>
          <Route element={<AppShell />}>

            {/* Projects (incl. Purchase Orders (POs), Bill Desk, GST Tax Invoices sub-tabs) */}
            <Route
              path="/projects"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ProjectListPage />
                </Suspense>
              }
            />

            {/* Finance – GST register, PO sub-register, Bill Desk ledger */}
            <Route
              path="/finance"
              element={
                <Suspense fallback={<PageLoader />}>
                  <FinancePage />
                </Suspense>
              }
            />

            {/* Reports – MIS / Utilisation / Status reports */}
            <Route
              path="/reports"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ReportsPage />
                </Suspense>
              }
            />

            {/* Notices – NICSI terminology for in-app notifications / alerts */}
            <Route
              path="/notices"
              element={
                <Suspense fallback={<PageLoader />}>
                  <NoticesPage />
                </Suspense>
              }
            />

            {/* Legacy redirect: old /notifications path → /notices */}
            <Route path="/notifications" element={<Navigate to="/notices" replace />} />

          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  Project 360° — MD + PM + PMC: full project lifecycle view
         *  Route: /projects/:headerId
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['MD', 'PM', 'PMC', 'SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route
              path="/projects/:headerId"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Project360Page />
                </Suspense>
              }
            />
          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  Tickets — MD + PM + PMC + OA
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['MD', 'PM', 'PMC', 'SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route
              path="/tickets"
              element={
                <Suspense fallback={<PageLoader />}>
                  <TicketListPage />
                </Suspense>
              }
            />
          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  PMC Control Tower — PMC + MD + SUPER_ADMIN
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['PMC', 'MD', 'SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route
              path="/pmc"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PmcTowerPage />
                </Suspense>
              }
            />
          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  OA Task Dashboard — OA + PM + MD + SUPER_ADMIN
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['OA', 'PM', 'MD', 'SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>
            <Route
              path="/my-tasks"
              element={
                <Suspense fallback={<PageLoader />}>
                  <OaTaskDashboard />
                </Suspense>
              }
            />
          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  MD only: Project Managers roster
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['MD']} />}>
          <Route element={<AppShell />}>
            <Route
              path="/project-managers"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ProjectManagersPage />
                </Suspense>
              }
            />
            {/* Legacy redirect: old /team path → /project-managers */}
            <Route path="/team" element={<Navigate to="/project-managers" replace />} />
          </Route>
        </Route>

        {/* ────────────────────────────────────────────────────────────────
         *  SUPER ADMIN only: System Administration
         *  – User Management

         *  – Audit Log
         * ──────────────────────────────────────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
          <Route element={<AppShell />}>

            {/* User Management */}
            <Route
              path="/admin/users"
              element={
                <Suspense fallback={<PageLoader />}>
                  <UserManagementPage />
                </Suspense>
              }
            />



            {/* Audit Log */}
            <Route
              path="/admin/audit"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AuditLogPage />
                </Suspense>
              }
            />

            {/* Legacy redirects */}
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/audit" element={<Navigate to="/admin/audit" replace />} />

          </Route>
        </Route>

        {/* ── Error pages ── */}
        <Route path="/403" element={<PlaceholderPage title="403 — Access Denied" note="You are not authorised to view this page." />} />

        {/* ── Catch-all ── */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;