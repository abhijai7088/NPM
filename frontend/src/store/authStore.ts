import { create } from 'zustand';
import axios from 'axios';
import type { AuthState, LoginRequest, UserProfile } from '../types/auth.types';

// Relative path — routed by the Vite dev proxy to the auth service (port 8081).
// Using a relative URL keeps requests same-origin so httpOnly cookies work without CORS.
const AUTH_BASE = '/api/v1/auth';

// The backend wraps every response as { success, data, error, message, timestamp }.
// The user object uses `id` + `roles[]`; the frontend expects `userId` + a primary `role`.
const normalizeUser = (u: any): UserProfile => ({
  ...u,
  userId: u.userId ?? u.id,
  role: u.role ?? (Array.isArray(u.roles) ? u.roles[0] : undefined),
  roles: u.roles ?? (u.role ? [u.role] : []),
});

/**
 * Extracts a human-readable, dynamic message from any Axios error.
 * Falls back gracefully when the server returns no JSON body at all.
 */
const describeAuthError = (error: any, fallback: string): string => {
  const data = error?.response?.data;
  if (data && typeof data === 'object') {
    if (data.message) return data.message;
    if (data.error) return data.error;
  }

  const status = error?.response?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'Access was denied for this request. Please sign in again.';
  if (status === 404) return 'The requested service could not be found. Please try again later.';
  if (status && status >= 500) return 'The server encountered an error. Please try again in a moment.';

  if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    return 'The request timed out. Please check your connection and try again.';
  }
  if (error?.request && !error?.response) {
    return 'Could not reach the server. Please check your connection and try again.';
  }

  return fallback;
};

// ─── Store ────────────────────────────────────────────────────────────────────
// NO persist middleware — session is entirely server-side (httpOnly cookies).
// The access_token cookie is short-lived; the refresh_token cookie is long-lived.
// The axios interceptor in axiosSetup.ts silently refreshes on 401 automatically.
// authChecked prevents loading flash on every route change after first validation.

export const useAuthStore = create<AuthState & { authChecked: boolean }>()(
  (set, get) => ({
    user: null,
    roles: [],
    isAuthenticated: false,
    isLoading: false,
    authChecked: false,
    tempToken: null,
    mfa: null,
    passwordChange: null,

    /**
     * Step 1 — validate credentials.
     * Returns flow state: 'MFA', 'PASSWORD_CHANGE', or 'SUCCESS'.
     */
    login: async (credentials: LoginRequest): Promise<'SUCCESS' | 'MFA' | 'PASSWORD_CHANGE'> => {
      set({ isLoading: true });
      try {
        const res = await axios.post(`${AUTH_BASE}/login`, credentials, { withCredentials: true });
        const body = res.data;
        const data = body?.data ?? {};

        // ── First-login: must change initial password ─────────────────────
        if (body?.success && data.passwordChangeRequired) {
          set({
            tempToken: data.tempToken,
            passwordChange: {
              tempToken: data.tempToken,
              fullName: data.user?.fullName ?? '',
              roleLabel: data.user?.roleLabel ?? '',
              maskedEmail: data.user?.maskedEmail ?? 'your registered email',
            },
            mfa: null,
            isAuthenticated: false,
            authChecked: false,
          });
          return 'PASSWORD_CHANGE';
        }

        // ── MFA required: backend sent Email OTP, redirect to /mfa ────────
        if (body?.success && data.mfaRequired) {
          set({
            tempToken: data.tempToken,
            mfa: {
              tempToken: data.tempToken,
              maskedEmail: data.maskedEmail ?? '',
              roleLabel: data.roleLabel ?? '',
              fullName: data.fullName ?? '',
            },
            passwordChange: null,
            isAuthenticated: false,
            authChecked: false,
          });
          return 'MFA';
        }

        // ── No MFA: cookies set by backend, user returned directly ────────
        if (body?.success && data.user) {
          const user = normalizeUser(data.user);
          set({
            user,
            roles: user.roles ?? [user.role],
            isAuthenticated: true,
            authChecked: true,
            tempToken: null,
            mfa: null,
            passwordChange: null,
          });
          return 'SUCCESS';
        }

        throw new Error(body?.message || 'Login failed');
      } catch (error: any) {
        throw new Error(describeAuthError(error, 'Invalid credentials. Please try again.'));
      } finally {
        set({ isLoading: false });
      }
    },

    /**
     * Step 2 — verify the 6-digit Email OTP sent during MFA challenge.
     * On success, the backend sets full access + refresh cookies.
     */
    verifyMfa: async (code: string) => {
      const { tempToken } = get();
      if (!tempToken) throw new Error('Session expired. Please sign in again.');
      set({ isLoading: true });
      try {
        const res = await axios.post(
          `${AUTH_BASE}/mfa/verify`,
          { tempToken, totpCode: Number(code) },
          { withCredentials: true }
        );
        const body = res.data;
        const data = body?.data ?? {};
        if (body?.success && data.user) {
          const user = normalizeUser(data.user);
          set({
            user,
            roles: user.roles ?? [user.role],
            isAuthenticated: true,
            authChecked: true,
            tempToken: null,
            mfa: null,
          });
        } else {
          throw new Error(body?.message || 'Invalid code');
        }
      } catch (error: any) {
        throw new Error(describeAuthError(error, 'Invalid or expired code.'));
      } finally {
        set({ isLoading: false });
      }
    },

    /** Re-send the Email OTP during an active MFA login challenge (MFA_PENDING token). */
    resendMfaOtp: async () => {
      const { tempToken } = get();
      if (!tempToken) throw new Error('Session expired. Please sign in again.');
      try {
        const res = await axios.post(
          `${AUTH_BASE}/mfa/resend-otp`,
          { tempToken },
          { withCredentials: true }
        );
        if (!res.data?.success) {
          throw new Error(res.data?.message || 'Could not resend OTP.');
        }
      } catch (error: any) {
        throw new Error(describeAuthError(error, 'Could not resend OTP.'));
      }
    },

    /** Change password on first login (PASSWORD_CHANGE_REQUIRED flow). */
    changePassword: async (newPassword: string, otp: string) => {
      const { tempToken } = get();
      if (!tempToken) throw new Error('Session expired. Please sign in again to request a new OTP.');
      set({ isLoading: true });
      try {
        const res = await axios.post(
          `${AUTH_BASE}/change-password`,
          { tempToken, newPassword, otp },
          { withCredentials: true }
        );
        if (!res.data?.success) {
          throw new Error(res.data?.message || res.data?.error || 'Failed to change password.');
        }
        set({ tempToken: null, passwordChange: null });
      } catch (error: any) {
        throw new Error(describeAuthError(error, 'Could not change password. Please check your connection and try again.'));
      } finally {
        set({ isLoading: false });
      }
    },

    /** Re-send the first-login setup OTP (PASSWORD_CHANGE_REQUIRED flow). */
    resendOtp: async () => {
      const { tempToken } = get();
      if (!tempToken) throw new Error('Session expired. Please sign in again.');
      try {
        const res = await axios.post(
          `${AUTH_BASE}/resend-setup-otp`,
          { tempToken },
          { withCredentials: true }
        );
        if (!res.data?.success) {
          throw new Error(res.data?.message || 'Could not resend OTP.');
        }
      } catch (error: any) {
        throw new Error(describeAuthError(error, 'Could not resend OTP.'));
      }
    },

    logout: async () => {
      try {
        await axios.post(`${AUTH_BASE}/logout`, {}, { withCredentials: true });
      } catch {
        // ignore — clear local state regardless
      }
      set({
        user: null,
        roles: [],
        isAuthenticated: false,
        authChecked: false,
        tempToken: null,
        mfa: null,
        passwordChange: null,
      });
    },

    /**
     * Validates the server-side session via GET /auth/me.
     * Called once on app mount (ProtectedRoute). Uses authChecked to prevent
     * flashing a loading spinner on every internal navigation after the first check.
     */
    checkAuth: async () => {
      const { isAuthenticated, authChecked, user } = get();

      // Already validated this session and PM metadata is present — skip network call.
      if (authChecked && isAuthenticated && user && (user.role !== 'PM' || user.prjMgrId)) return;

      set({ isLoading: true });
      try {
        const res = await axios.get(`${AUTH_BASE}/me`, { withCredentials: true, timeout: 8000 });
        const body = res.data;
        if (body?.success && body?.data) {
          const user = normalizeUser(body.data);
          set({
            user,
            roles: user.roles ?? [user.role],
            isAuthenticated: true,
            authChecked: true,
          });
        } else {
          set({ user: null, roles: [], isAuthenticated: false, authChecked: true });
        }
      } catch (error: any) {
        // 401 = no valid session. Network errors: don't nuke auth state
        // (backend might just be slow to start).
        if (error?.response?.status === 401) {
          set({ user: null, roles: [], isAuthenticated: false, authChecked: true });
        } else {
          set({ authChecked: true });
        }
      } finally {
        set({ isLoading: false });
      }
    },
  })
);
