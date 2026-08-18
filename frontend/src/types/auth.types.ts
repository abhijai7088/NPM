export interface LoginRequest {
  username: string;
  password: string;
}

/** RBAC roles for NPMS. */
export type Role = 'SUPER_ADMIN' | 'MD' | 'PM' | 'PMC' | 'OA';


export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  /** Primary RBAC role driving the UI. */
  role: Role;
  /** Project Manager ID — only set for PM role; scopes all data. */
  prjMgrId?: number | null;
  prjMgrName?: string;
  zone?: string;
  designation?: string;
  ministryId?: string;
  departmentId?: string;
  mfaEnabled: boolean;
}

export interface LoginResponse {
  mfaRequired: boolean;
  tempToken?: string;
  user?: UserProfile;
}

export interface MfaChallenge {
  tempToken: string;
  maskedEmail: string;
  roleLabel: string;
  fullName: string;
}

export interface AuthState {
  user: UserProfile | null;
  roles: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once a /auth/me call has been made this session. Prevents flashing the loading screen on every navigation. */
  authChecked: boolean;
  tempToken: string | null;
  /** Pending MFA challenge details shown on the OTP screen. */
  mfa: MfaChallenge | null;
  passwordChange: {
    tempToken: string;
    fullName: string;
    roleLabel: string;
    maskedEmail: string;
  } | null;

  /** Step 1: submit credentials → backend emails OTP. Returns flow type. */
  login: (credentials: LoginRequest) => Promise<'SUCCESS' | 'MFA' | 'PASSWORD_CHANGE'>;
  /** Step 2: verify the 6-digit Email OTP sent by the backend. */
  verifyMfa: (code: string) => Promise<void>;
  changePassword: (newPassword: string, otp: string) => Promise<void>;
  /** Re-send OTP for the MFA login challenge (MFA_PENDING token). */
  resendMfaOtp: () => Promise<void>;
  /** Re-send OTP for the first-login password change challenge (PASSWORD_CHANGE_REQUIRED token). */
  resendOtp: () => Promise<void>;
  logout: () => Promise<void>;
  /** Validates the server-side cookie session. Called once on app mount via ProtectedRoute. */
  checkAuth: () => Promise<void>;
}
