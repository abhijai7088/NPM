import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { MdDashboard } from './MdDashboard';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { OaExecutionDashboard } from './OaExecutionDashboard';
import { PmcControlTowerDashboard } from './PmcControlTowerDashboard';
import { PmPortfolioDashboard } from './PmPortfolioDashboard';
import './RoleDashboards.css';

/**
 * Single dashboard entry point. The authenticated role is the only source of
 * truth for which workspace is rendered. Users never select a role in the UI.
 */
export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const role = user?.role;

  switch (role) {
    case 'SUPER_ADMIN': return <SuperAdminDashboard />;
    case 'MD': return <MdDashboard />;
    case 'PM': return <PmPortfolioDashboard />;
    case 'PMC': return <PmcControlTowerDashboard />;
    case 'OA': return <OaExecutionDashboard />;
    default:
      return (
        <div className="role-empty" style={{ margin: 24 }}>
          <h3>Role configuration required</h3>
          <p>Your account has no recognised NPMS workspace role. Contact the system administrator.</p>
        </div>
      );
  }
};
