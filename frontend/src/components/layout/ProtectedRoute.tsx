import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface Props {
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<Props> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, authChecked, roles, checkAuth } = useAuthStore();

  useEffect(() => {
    // Only call checkAuth if we haven't yet confirmed the session this load.
    // This avoids a network round-trip on every internal navigation.
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show a minimal loading state only while the very first /auth/me call is in-flight.
  if (!authChecked || isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: '1rem',
        background: '#f8f9fa',
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid #e8edf3',
          borderTop: '3px solid #003366',
          borderRadius: '50%',
          animation: 'spin-slow 0.8s linear infinite',
        }} />
        <p style={{ color: '#6c757d', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
          Verifying session…
        </p>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = allowedRoles.some(role => roles.includes(role));
    if (!hasRole) return <Navigate to="/403" replace />;
  }

  return <Outlet />;
};