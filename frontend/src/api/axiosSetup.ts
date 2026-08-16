import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

/**
 * Every backend RBAC check (see core-service's ScopeResolver) depends on
 * the access_token cookie actually reaching the request. Several pages
 * historically called axios without passing { withCredentials: true }
 * per-request, which happened to still work while those endpoints were
 * unauthenticated (permitAll). Now that core-service requires a valid
 * session on every /api/v1/** route, every request must carry the cookie —
 * so this is set globally, once, instead of relying on each call site to
 * remember it.
 */
axios.defaults.withCredentials = true;

/**
 * Global 401 recovery.
 *
 * The access-token cookie is short-lived (15 minutes, see JwtService in
 * auth-service). Every page in this app fetches its own data independently
 * (dashboards, user lists, project lists, audit logs, etc.) and each one
 * only logs failures to the console — so once the access token expires,
 * every screen silently renders empty/zeroed data while localStorage still
 * says the user is "authenticated". This looks exactly like "no data is
 * shown" even though the database is full and every endpoint works.
 *
 * Fix: intercept any 401, attempt ONE silent refresh via the httpOnly
 * refresh_token cookie (POST /api/v1/auth/refresh, valid for days), then
 * transparently retry the original request. If the refresh itself fails
 * (refresh token also expired/revoked), clear the stale local session so
 * the UI correctly redirects to the login screen instead of showing an
 * "authenticated" shell with no real data.
 *
 * This module has no exports that need to be called — importing it once
 * from main.tsx registers the interceptor globally for every axios call
 * made anywhere in the app, without changing any individual page.
 */

let refreshPromise: Promise<boolean> | null = null;

const AUTH_REFRESH_URL = '/api/v1/auth/refresh';

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(AUTH_REFRESH_URL, {}, { withCredentials: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

axios.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    // Never try to refresh for the auth endpoints themselves (login, refresh,
    // change-password, etc.) — a 401 there is a real, final answer.
    const isAuthEndpoint = config?.url?.includes('/api/v1/auth/');

    if (status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true;
      const refreshed = await refreshSession();
      if (refreshed) {
        return axios({ ...config, withCredentials: true });
      }
      // Refresh token is also expired/invalid — the session is genuinely
      // over. Clear stale local state so the UI stops pretending to be
      // logged in with empty data and instead routes back to login.
      useAuthStore.setState({
        user: null,
        roles: [],
        isAuthenticated: false,
        tempToken: null,
        mfa: null,
        passwordChange: null,
      });
    }

    return Promise.reject(error);
  }
);
