import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import './LoginPage.css';

export const MfaPage: React.FC = () => {
  const navigate = useNavigate();
  const { mfa, verifyMfa, resendMfaOtp, isLoading, isAuthenticated } = useAuthStore();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [seconds, setSeconds] = useState(300);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  // No pending challenge -> back to login
  useEffect(() => {
    if (!mfa) navigate('/login', { replace: true });
  }, [mfa, navigate]);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  // Countdown
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const submitOtp = async (code: string) => {
    setError('');
    try {
      await verifyMfa(code);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired OTP.');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    }
  };

  const handleChange = (i: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) inputs.current[i + 1]?.focus();
    if (next.every((d) => d !== '')) submitOtp(next.join(''));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      submitOtp(pasted);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      await resendMfaOtp();
      setSeconds(300);
      setInfo('A new OTP has been sent to your registered email.');
    } catch (err: any) {
      setError(err?.message || 'Could not resend OTP.');
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="login-page mounted">
      <div className="login-left__bg" />

      <div className="login-right" style={{ width: '100%' }}>
        <div className="login-form-card">
          <div className="login-form-header">
            <div className="login-form-emblem" style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Emblem of India" width="48" style={{ filter: 'grayscale(100%) contrast(1.2)' }} />
            </div>
            <h2>Two-Factor Verification</h2>
            <p>
              Enter the 6-digit OTP sent to <strong>{mfa?.maskedEmail}</strong>
              {mfa?.roleLabel ? <> · signing in as <strong>{mfa.roleLabel}</strong></> : null}
            </p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              {error}
            </div>
          )}
          {info && !error && (
            <div className="login-error" role="status" style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#c8e6c9' }}>
              {info}
            </div>
          )}

          <div className="otp-inputs" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="otp-box"
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={isLoading}
                aria-label={`OTP digit ${i + 1}`}
              />
            ))}
          </div>

          <div className="otp-meta">
            {seconds > 0 ? (
              <span className="otp-timer">OTP expires in <strong>{mm}:{ss}</strong></span>
            ) : (
              <span className="otp-timer otp-timer--expired">OTP expired</span>
            )}
            <button type="button" className="otp-resend" onClick={handleResend} disabled={isLoading}>
              Resend OTP
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg login-submit-btn"
            disabled={isLoading || digits.some((d) => d === '')}
            onClick={() => submitOtp(digits.join(''))}
          >
            {isLoading ? (<><span className="btn-spinner" /> Verifying…</>) : 'Verify & Sign In'}
          </button>

          <div className="login-form-footer">
            <div className="login-help">
              <button
                type="button"
                onClick={() => navigate('/login')}
                style={{ background: 'none', border: 'none', color: 'var(--nicsi-teal)', cursor: 'pointer', fontSize: '0.8125rem', padding: 0 }}
              >
                ← Back to sign in
              </button>
            </div>
            <div className="login-version">NPMS v2.0.0 · Secure Portal · © 2026 NICSI</div>
          </div>
        </div>
      </div>
    </div>
  );
};
