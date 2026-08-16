const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src';

const dirs = [
    'types', 'store', 'api', 'pages/auth', 'components/layout', 'components/ui'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'types/auth.types.ts': `export interface LoginRequest { 
  username: string; 
  password: string 
}

export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  ministryId?: string;
  departmentId?: string;
  mfaEnabled: boolean;
}

export interface LoginResponse {
  mfaRequired: boolean;
  tempToken?: string;
  user?: UserProfile;
}

export interface AuthState {
  user: UserProfile | null;
  roles: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  tempToken: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}`,

  'store/authStore.ts': `import { create } from 'zustand';
import { AuthState, LoginRequest } from '../types/auth.types';
// import { authApi } from '../api/authApi';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  roles: [],
  isAuthenticated: false,
  isLoading: false,
  tempToken: null,

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true });
    try {
      // const res = await authApi.login(credentials);
      // Mock logic
      const isMfaRequired = false;
      if (isMfaRequired) {
        set({ tempToken: 'mock-temp-token', isAuthenticated: false });
      } else {
        set({
          user: { userId: '1', username: credentials.username, email: 'test@nic.in', fullName: 'Test User', roles: ['SUPER_ADMIN'], mfaEnabled: false },
          roles: ['SUPER_ADMIN'],
          isAuthenticated: true,
          tempToken: null
        });
      }
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  verifyMfa: async (code: string) => {
    set({ isLoading: true });
    // Mock verify
    set({
      user: { userId: '1', username: 'admin', email: 'test@nic.in', fullName: 'Test User', roles: ['SUPER_ADMIN'], mfaEnabled: true },
      roles: ['SUPER_ADMIN'],
      isAuthenticated: true,
      tempToken: null,
      isLoading: false
    });
  },

  logout: async () => {
    set({ user: null, roles: [], isAuthenticated: false, tempToken: null });
  },

  checkAuth: async () => {
    // Check if user is authenticated via API
    set({ isLoading: false });
  }
}));`,

  'api/axiosInstance.ts': `import axios from 'axios';

export const axiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);`,

  'components/layout/ProtectedRoute.tsx': `import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface Props {
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<Props> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, roles, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) return <div>Loading...</div>;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = allowedRoles.some(role => roles.includes(role));
    if (!hasRole) return <Navigate to="/403" replace />;
  }

  return <Outlet />;
};`,

  'pages/auth/LoginPage.tsx': `import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password });
      window.location.href = '/dashboard';
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, backgroundColor: '#003366', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1>NPMS - NICSI</h1>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', width: '300px', gap: '1rem' }}>
          <h2>Login</h2>
          <input 
            type="text" 
            placeholder="Username" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};`,

  'App.tsx': `import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

// Dummy components for routing
const Dashboard = () => <div>Dashboard</div>;
const MfaPage = () => <div>MFA Required</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaPage />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Frontend Auth components scaffolded successfully.');
