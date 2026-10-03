import React, { useState, useRef, useEffect } from 'react';
import ProgressBar from '../components/ProgressBar';
import { api } from '../services/api';
import { LockIcon, AlertCircleIcon, RefreshIcon, ArrowRightIcon, CheckCircleIcon } from '../components/Icons';

const OTP_LEN = 6;
const COUNTDOWN_SECS = 30;

function maskContact(str) {
  if (!str) return '***';
  const isEmail = str.includes('@');
  if (isEmail) {
    const [local, domain] = str.split('@');
    return local.slice(0, 2) + '***@' + domain;
  }
  return str.replace(/\d(?=\d{4})/g, '*');
}

export default function OtpScreen({ authData, onVerified, onBack }) {
  const [digits, setDigits] = useState(Array(OTP_LEN).fill(''));
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [canResend, setCanResend] = useState(false);
  const [totpQr, setTotpQr] = useState(authData?.totpQr || authData?.data?.totpQr || '');
  const [totpSecret, setTotpSecret] = useState(authData?.totpSecret || authData?.data?.totpSecret || '');
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [loadingTotp, setLoadingTotp] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (authData?.totpQr) {
      setTotpQr(authData.totpQr);
    }
    if (authData?.totpSecret) {
      setTotpSecret(authData.totpSecret);
    }
  }, [authData]);

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const contactEmail = authData?.email || authData?.data?.email || authData?.data?.identifier || '';
  const maskedContact = maskContact(contactEmail);
  const pendingSessionOtp = authData?.otpCode || authData?.demo_otp || (
    typeof sessionStorage !== 'undefined' && contactEmail
      ? sessionStorage.getItem('pending_otp_' + contactEmail.toLowerCase())
      : null
  );

  // If TOTP QR isn't available yet, fetch it from backend
  useEffect(() => {
    if (!totpQr && contactEmail) {
      setLoadingTotp(true);
      api.getTotpSetup({ email: contactEmail })
        .then(res => {
          if (res?.totp_qr) setTotpQr(res.totp_qr);
          if (res?.totp_secret) setTotpSecret(res.totp_secret);
        })
        .catch(() => {})
        .finally(() => setLoadingTotp(false));
    }
  }, [contactEmail, totpQr]);

  const handleCopySecret = () => {
    if (!totpSecret) return;
    navigator.clipboard.writeText(totpSecret).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    });
  };

  const handleChange = (idx, val) => {
    const digit = val.replace(/\D/, '').slice(-1);
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    setError('');
    setSuccessMsg('');

    if (digit && idx < OTP_LEN - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]; next[idx] = '';
        setDigits(next);
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus();
        const next = [...digits]; next[idx - 1] = '';
        setDigits(next);
      }
    }
    if (e.key === 'ArrowLeft' && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < OTP_LEN - 1) inputRefs.current[idx + 1]?.focus();
  };

  const handlePaste = e => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN);
    const next = Array(OTP_LEN).fill('');
    pasted.split('').forEach((d, i) => { next[i] = d; });
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, OTP_LEN - 1)]?.focus();
  };

  const handleResend = async () => {
    if (!canResend) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.resendOtp({ email: contactEmail });
      setDigits(Array(OTP_LEN).fill(''));
      setCountdown(COUNTDOWN_SECS);
      setCanResend(false);
      if (res?.totp_qr) {
        setTotpQr(res.totp_qr);
      }
      if (res?.totp_secret) {
        setTotpSecret(res.totp_secret);
      }
      setSuccessMsg('A new verification code has been dispatched.');
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    }
  };

  const handleVerify = async e => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < OTP_LEN) {
      setError('Please enter all 6 digits.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await api.verifyOtp({ email: contactEmail, otp });
      setLoading(false);
      onVerified(res.user, res.token);
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Invalid verification code.');
      setDigits(Array(OTP_LEN).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const hasError = !!error;

  return (
    <main className="page" id="otp-screen">
      <div className="card">
        <ProgressBar currentStep={2} />

        <div className="logo-strip">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={32} height={32} />
          <span className="logo-strip__name">Smart Medication Reminder</span>
        </div>

        <h1 className="screen-title">Two-Step Verification</h1>
        <p className="screen-subtitle">
          Enter the 6-digit numeric verification code sent to your registered contact.
        </p>

        <div className="masked-contact-box" aria-live="polite">
          <span>Verification code sent to</span>
          <strong>{maskedContact}</strong>
        </div>

        {pendingSessionOtp && (
          <div style={{
            background: 'var(--color-primary-soft, rgba(14, 165, 233, 0.1))',
            border: '1px solid rgba(14, 165, 233, 0.25)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: '0.84rem',
            color: 'var(--color-primary, #0ea5e9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <span>Session Verification Code: <strong>{pendingSessionOtp}</strong></span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              style={{ fontWeight: 700, textDecoration: 'underline', color: 'inherit' }}
              onClick={() => {
                const arr = pendingSessionOtp.split('').slice(0, OTP_LEN);
                setDigits(arr);
              }}
            >
              Autofill
            </button>
          </div>
        )}

        {/* 📱 Free Google Authenticator (TOTP MFA) Integration */}
        <div style={{
          marginBottom: 18,
          background: 'var(--color-bg-secondary, #f8fafc)',
          border: '1px solid var(--color-border, #e2e8f0)',
          borderRadius: 12,
          padding: '12px 16px',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.3rem' }}>📱</span>
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block', color: 'var(--color-text, #1e293b)' }}>
                  Google Authenticator (Free MFA)
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary, #64748b)' }}>
                  Scan with Google or Microsoft Authenticator
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline-primary btn-xs"
              onClick={() => setShowTotpModal(prev => !prev)}
              style={{ fontWeight: 600, borderRadius: 8, whiteSpace: 'nowrap' }}
            >
              {showTotpModal ? '✕ Close QR' : '📷 Show QR Code'}
            </button>
          </div>

          {showTotpModal && (
            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px dashed var(--color-border, #cbd5e1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              {totpQr ? (
                <>
                  <div style={{
                    background: '#ffffff',
                    padding: 8,
                    borderRadius: 10,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                    display: 'inline-block'
                  }}>
                    <img
                      src={totpQr}
                      alt="Google Authenticator QR Code"
                      width={170}
                      height={170}
                      style={{ display: 'block', borderRadius: 6 }}
                    />
                  </div>
                  <p style={{ fontSize: '0.8rem', marginTop: 10, marginBottom: 8, color: 'var(--color-text, #334155)', maxWidth: 280 }}>
                    Scan with <strong>Google Authenticator</strong>, then type the 6-digit rolling code below.
                  </p>
                  {totpSecret && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(0,0,0,0.04)',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}>
                      <span>Key: <strong>{totpSecret}</strong></span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                        onClick={handleCopySecret}
                        title="Copy secret key to clipboard"
                      >
                        {copiedKey ? '✓ Copied' : 'Copy Key'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {loadingTotp ? 'Generating Google Authenticator QR...' : 'Authenticator setup ready.'}
                </span>
              )}
            </div>
          )}
        </div>

        {hasError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}>
            <CheckCircleIcon size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleVerify} aria-label="OTP verification form">
          <div className="otp-row otp-group" role="group" aria-label="Enter 6-digit verification code">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={el => { inputRefs.current[idx] = el; }}
                id={`otp-${idx}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                className={`otp-cell otp-digit${hasError ? ' otp-error input-error' : ''}${digit ? ' filled' : ''}`}
                value={digit}
                onChange={e => handleChange(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(idx, e)}
                onPaste={idx === 0 ? handlePaste : undefined}
                autoComplete="one-time-code"
                aria-label={`Digit ${idx + 1}`}
                aria-invalid={hasError}
              />
            ))}
          </div>

          <button
            id="otp-submit"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 24 }}
            disabled={loading || digits.join('').length < OTP_LEN}
          >
            {loading ? (
              <span>Verifying code...</span>
            ) : (
              <>
                <span>Confirm & Sign In</span>
                <ArrowRightIcon size={16} />
              </>
            )}
          </button>
        </form>

        <div className="otp-resend">
          {canResend ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleResend}
            >
              <RefreshIcon size={14} />
              <span>Resend Verification Code</span>
            </button>
          ) : (
            <p className="resend-countdown">
              Resend code in <strong>{countdown}s</strong>
            </p>
          )}
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-muted"
            onClick={onBack}
            disabled={loading}
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    </main>
  );
}
