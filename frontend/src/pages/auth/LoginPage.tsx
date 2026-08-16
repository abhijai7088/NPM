import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../../store/authStore';
import './LoginPage.css';

/**
 * Extracts a dynamic, human-readable message from any Axios error.
 * Falls back gracefully when the server returns no JSON body at all
 * (e.g. a security-layer 401/403 rejected before reaching the controller),
 * a network failure, or a timeout — so the UI never shows a raw
 * "Request failed with status code XXX" message.
 */
const describeRequestError = (err: any, fallback: string): string => {
  const data = err?.response?.data;
  if (data && typeof data === 'object') {
    if (data.message) return data.message;
    if (data.error) return data.error;
  }

  const status = err?.response?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'Access was denied for this request. Please sign in again.';
  if (status === 404) return 'The requested service could not be found. Please try again later.';
  if (status && status >= 500) return 'The server encountered an error. Please try again in a moment.';

  if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return 'The request timed out. Please check your connection and try again.';
  }
  if (err?.request && !err?.response) {
    return 'Could not reach the server. Please check your connection and try again.';
  }

  return err?.message || fallback;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, changePassword: submitChangePassword, resendOtp: resendSetupOtp, passwordChange, isLoading, isAuthenticated } = useAuthStore();
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Forgot Password State
  const [view, setView] = useState<'login' | 'forgot' | 'verify' | 'reset' | 'changePassword'>('login');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetTokenId, setResetTokenId] = useState('');
  const [resetMfaRequired, setResetMfaRequired] = useState(false);
  const [resetTotpCode, setResetTotpCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown(seconds => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter both your Employee ID and password.');
      return;
    }
    try {
      const result = await login({ username, password });
      if (result === 'PASSWORD_CHANGE') {
        setOtp('');
        setResendCooldown(30);
        setView('changePassword');
      } else if (result === 'MFA') {
        navigate('/mfa');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials. Please try again.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { setError('Please enter your email.'); return; }
    setIsProcessing(true);
    try {
      const res = await axios.post('/api/v1/auth/forgot-password', { email: normalizedEmail });
      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Failed to request OTP.');
      }
      setEmail(normalizedEmail);
      setOtp('');
      setResetMfaRequired(Boolean(res.data?.data?.mfaRequired));
      setResetTotpCode('');
      setResendCooldown(30);
      setSuccess(res.data?.message || 'OTP has been sent to your email.');
      setView('verify');
    } catch (err: any) {
      setError(describeRequestError(err, 'Failed to request OTP.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResendForgotOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setError('');
    setSuccess('');
    setIsResending(true);
    try {
      const res = await axios.post('/api/v1/auth/forgot-password', { email });
      if (!res.data?.success) throw new Error(res.data?.message || 'Could not resend OTP.');
      setOtp('');
      setResendCooldown(30);
      setSuccess('A new OTP has been sent to your registered email.');
    } catch (err: any) {
      setError(describeRequestError(err, 'Could not resend OTP.'));
    } finally {
      setIsResending(false);
    }
  };

  const handleResendSetupOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setError('');
    setSuccess('');
    setIsResending(true);
    try {
      await resendSetupOtp();
      setOtp('');
      setResendCooldown(30);
      setSuccess('A new verification OTP has been sent to your registered email.');
    } catch (err: any) {
      setError(err?.message || 'Could not resend OTP.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const normalizedOtp = otp.replace(/\D/g, '');
    const normalizedTotp = resetTotpCode.replace(/\D/g, '');
    if (normalizedOtp.length !== 6) { setError('Please enter the 6-digit OTP.'); return; }
    if (resetMfaRequired && normalizedTotp.length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app.');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await axios.post('/api/v1/auth/verify-otp', {
        email,
        otp: normalizedOtp,
        totpCode: resetMfaRequired ? Number(normalizedTotp) : undefined,
      });
      const tokenId = res.data?.data?.resetTokenId;
      if (!res.data?.success || !tokenId) {
        throw new Error(res.data?.message || 'Invalid or expired OTP.');
      }
      setResetTokenId(tokenId);
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('OTP verified. Please enter your new password.');
      setView('reset');
    } catch (err: any) {
      setError(describeRequestError(err, 'Invalid OTP.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!resetTokenId) { setError('Your reset session has expired. Please request another OTP.'); return; }
    setIsProcessing(true);
    try {
      const res = await axios.post('/api/v1/auth/reset-password', { resetTokenId, newPassword });
      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Failed to reset password.');
      }
      setSuccess('Password reset successfully! You can now log in.');
      setView('login');
      setPassword('');
      setUsername('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setResetTokenId('');
    } catch (err: any) {
      setError(describeRequestError(err, 'Failed to reset password.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError('Password must include uppercase, lowercase, number, and special character.');
      return;
    }
    if (newPassword === password) { setError('Your new password must be different from the initial password.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    const normalizedOtp = otp.replace(/\D/g, '');
    if (normalizedOtp.length !== 6) { setError('Enter the latest 6-digit OTP sent to your registered email.'); return; }
    
    setIsProcessing(true);
    try {
      await submitChangePassword(newPassword, normalizedOtp);
      setSuccess('Initial password changed successfully! Please log in with your new password.');
      setView('login');
      setPassword('');
      setUsername('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to change password.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`login-page ${mounted ? 'mounted' : ''}`}>
      {/* ── Global Header Strip (Govt Logos) ── */}
      <div className="login-global-header" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '72px', backgroundColor: '#ffffff', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 3rem', borderBottom: '3px solid #FF9933', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <img src="/meity-logo.svg" alt="Ministry of Electronics & Information Technology" style={{ height: '46px', width: 'auto', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <img src="/digital-india.svg" alt="Digital India" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>


      {/* ── Left Panel ── */}
      <div className="login-left" style={{ paddingTop: '72px' }}>
        <div className="login-left__bg-image" style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/login-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}></div>
        <div className="login-left__overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0, 26, 51, 0.85) 0%, rgba(0, 38, 77, 0.4) 100%)', zIndex: 1 }}></div>

        <div className="login-left__content" style={{ zIndex: 2, position: 'relative', color: '#ffffff' }}>
          {/* Title */}
          <div className="login-title">
            <h1 style={{ color: '#ffffff' }}>Project Monitoring<br/>System</h1>
            <p className="login-subtitle" style={{ color: '#d1e3f8' }}>National Informatics Centre Services Inc.</p>
            <div className="login-divider" style={{ background: '#FF9933' }} />
            <p className="login-tagline" style={{ color: '#7EDFA0' }}>Empowering Digital Governance</p>
          </div>

          {/* Feature highlights */}
          <div className="login-features">
            {[
              { 
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>, 
                text: 'Real-time Project Tracking' 
              },
              { 
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>, 
                text: 'Financial Dashboard & Reporting' 
              },
              { 
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, 
                text: 'Smart Alerts & Notifications' 
              },
              { 
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, 
                text: 'Secure Government-grade Access' 
              },
            ].map((f, i) => (
              <div key={i} className="login-feature-item" style={{ color: '#e6f0fa' }}>
                <span className="login-feature-icon" style={{ color: '#66b3ff' }}>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Gradient Mask (Fades out the baked-in Emblem at the bottom) ── */}
        <div className="login-left__bottom-mask" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '140px', background: 'linear-gradient(to top, rgba(0, 18, 38, 1) 0%, rgba(0, 26, 51, 0) 100%)', zIndex: 1 }}></div>
      </div>

      {/* ── Right Panel ── */}
      <div className="login-right" style={{ paddingTop: '72px' }}>
        <div className="login-form-card">
          {/* Header */}
          <div className="login-form-header">
            <div className="login-form-logo-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '0 auto 1.5rem' }}>
              <img src="/emblem-india.svg" alt="State Emblem of India" style={{ height: '48px', width: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div style={{ width: '1px', height: '36px', backgroundColor: '#cbd5e1' }}></div>
              <img src="/nicsi-logo-v2.png" alt="NICSI Logo" style={{ height: '36px', width: 'auto', objectFit: 'contain' }} onError={(e) => {
                (e.target as HTMLImageElement).src = '/nicsi-logo-dark.jpg';
              }} />
            </div>
            <h2>Official Sign-In</h2>
            <p>NICSI Project Monitoring System (NPMS)</p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="login-error" role="status" style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#c8e6c9' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              {success}
            </div>
          )}

          {view === 'login' && (
            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="username">
                  Employee ID / Username
                </label>
                <div className="input-icon-wrapper">
                  <span className="icon-left">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </span>
                  <input
                    id="username"
                    type="text"
                    className="form-input has-icon-left"
                    placeholder="Enter your username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <div className="input-icon-wrapper" style={{ position: 'relative' }}>
                  <span className="icon-left">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input has-icon-left"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{ paddingRight: '3rem' }}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="login-form-meta" style={{ justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setView('forgot'); setError(''); setSuccess(''); }} className="forgot-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Forgot Password?</button>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg login-submit-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="btn-spinner" />
                    Authenticating…
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                      <polyline points="10 17 15 12 10 7"/>
                      <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Sign In to Portal
                  </>
                )}
              </button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Registered Email</label>
                <input id="email" type="email" className="form-input" placeholder="Enter your registered email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary btn-lg login-submit-btn" disabled={isProcessing}>
                {isProcessing ? 'Sending...' : 'Send OTP'}
              </button>
              <div className="login-form-meta" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                <button type="button" onClick={() => setView('login')} className="forgot-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Back to Login</button>
              </div>
            </form>
          )}

          {view === 'verify' && (
            <form onSubmit={handleVerifyOtp} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="otp">Email OTP</label>
                <input id="otp" type="text" inputMode="numeric" maxLength={6} className="form-input" placeholder="6-digit code sent to email" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              </div>
              {resetMfaRequired && (
                <div className="form-group">
                  <label className="form-label" htmlFor="resetTotpCode">Authenticator Code</label>
                  <input id="resetTotpCode" type="text" inputMode="numeric" maxLength={6} className="form-input" placeholder="6-digit code from authenticator app" value={resetTotpCode} onChange={e => setResetTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
                </div>
              )}
              <button type="submit" className="btn btn-primary btn-lg login-submit-btn" disabled={isProcessing}>
                {isProcessing ? 'Verifying...' : 'Verify OTP'}
              </button>
              <div className="login-form-meta" style={{ justifyContent: 'center', marginTop: '1rem', gap: '1rem' }}>
                <button type="button" onClick={handleResendForgotOtp} disabled={resendCooldown > 0 || isResending} className="forgot-link" style={{ background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', opacity: resendCooldown > 0 ? 0.65 : 1 }}>
                  {isResending ? 'Sending…' : resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </button>
                <button type="button" onClick={() => setView('login')} className="forgot-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Back to Login</button>
              </div>
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className="login-form" noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="newPassword">New Password</label>
                <input id="newPassword" type="password" className="form-input" placeholder="At least 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="resetConfirmPassword">Confirm New Password</label>
                <input id="resetConfirmPassword" type="password" className="form-input" placeholder="Retype new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <button type="submit" className="btn btn-primary btn-lg login-submit-btn" disabled={isProcessing}>
                {isProcessing ? 'Resetting...' : 'Reset Password'}
              </button>
              <div className="login-form-meta" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                <button type="button" onClick={() => { setView('forgot'); setError(''); setSuccess(''); }} className="forgot-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Request another OTP</button>
              </div>
            </form>
          )}

          {view === 'changePassword' && passwordChange && (
            <form onSubmit={handleChangePassword} className="login-form" noValidate>
              <div className="login-security-note" style={{ marginBottom: '1.5rem', background: '#fff8e1', color: '#f57c00', border: '1px solid #ffe082' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>
                  <strong>Welcome, {passwordChange.fullName}!</strong><br/>
                  For security reasons, you are required to change your initial {passwordChange.roleLabel} password before accessing the system.<br/>
                  <span style={{ fontSize: '0.78rem' }}>Verification OTP sent to <strong>{passwordChange.maskedEmail}</strong></span>
                </span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="firstNewPassword">New Secure Password</label>
                <input id="firstNewPassword" type="password" className="form-input" placeholder="Create a strong password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                <small style={{ color: '#64748b', lineHeight: 1.4 }}>At least 8 characters with uppercase, lowercase, number and special character. It must differ from the initial password.</small>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">Confirm New Password</label>
                <input id="confirmPassword" type="password" className="form-input" placeholder="Retype new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="changePasswordOtp">Verification OTP</label>
                <input id="changePasswordOtp" type="text" inputMode="numeric" className="form-input" placeholder="Newest 6-digit OTP" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required maxLength={6} autoComplete="one-time-code" />
                <small style={{ color: '#64748b', lineHeight: 1.4 }}>Use only the newest NPMS email. Signing in again or resending invalidates every earlier OTP.</small>
              </div>
              <div className="login-form-meta" style={{ justifyContent: 'flex-end', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                <button type="button" onClick={handleResendSetupOtp} disabled={resendCooldown > 0 || isResending} className="forgot-link" style={{ background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', opacity: resendCooldown > 0 ? 0.65 : 1 }}>
                  {isResending ? 'Sending…' : resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
              <button type="submit" className="btn btn-primary btn-lg login-submit-btn" disabled={isProcessing}>
                {isProcessing ? 'Saving...' : 'Set New Password & Continue'}
              </button>
              <div className="login-form-meta" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                <button type="button" onClick={() => { setView('login'); useAuthStore.setState({ passwordChange: null, tempToken: null }); }} className="forgot-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          )}

          {/* Authorized access notice */}
          <div className="login-security-note">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>
              Restricted access. Authorised NICSI officials only. All sign-in activity is logged and
              monitored. Access is granted by the system administrator.
            </span>
          </div>

          <div className="login-form-footer">
            <div className="login-help">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Need help? Contact <a href="mailto:helpdesk@nicsi.com">helpdesk@nicsi.com</a>
            </div>
            <div className="login-version">NPMS v2.0.0 · Secure Portal · © 2026 NICSI</div>
          </div>
        </div>
      </div>
    </div>
  );
};