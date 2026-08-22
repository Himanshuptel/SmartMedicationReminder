import React, { useState, useRef, useEffect, useCallback } from 'react';
import ProgressBar from '../components/ProgressBar';

const OTP_LEN = 6;
const DEMO_OTP = '123456';
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

export default function OtpScreen({ authData, onVerified }) {
  const [digits, setDigits] = useState(Array(OTP_LEN).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);

  // Start countdown on mount
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const contact = authData?.type === 'signup'
    ? (authData.data?.phone || authData.data?.email)
    : authData?.data?.identifier;

  const maskedContact = maskContact(contact);

  const handleChange = (idx, val) => {
    const digit = val.replace(/\D/, '').slice(-1);
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    setError('');

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

  const handleResend = () => {
    if (!canResend) return;
    setDigits(Array(OTP_LEN).fill(''));
    setError('');
    setCountdown(COUNTDOWN_SECS);
    setCanResend(false);
    inputRefs.current[0]?.focus();
  };

  const handleVerify = async e => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < OTP_LEN) {
      setError('Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 900)); // Simulated network delay
    setLoading(false);

    if (otp === DEMO_OTP) {
      onVerified();
    } else {
      setError('Invalid or expired OTP. Try 123456 for demo.');
      setDigits(Array(OTP_LEN).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  const hasError = !!error;

  return (
    <main className="page" id="otp-screen">
      <div className="card">
        <ProgressBar currentStep={2} />

        {/* ── Logo strip ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: 'center', marginBottom: 24,
        }}>
          <img src="/logo.png" alt="" width={40} height={40}
            style={{ borderRadius: 10, boxShadow: '0 2px 10px rgba(20,184,166,.2)' }} />
          <span style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text-primary)' }}>
            Smart Medication Reminder
          </span>
        </div>

        <h1 className="card-title">Verify your identity</h1>
        <p className="card-subtitle">
          Enter the 6-digit code we just sent to:
        </p>

        <div className="masked-contact" aria-live="polite">
          Code sent to <strong>{maskedContact}</strong>
        </div>

        {hasError && (
          <div className="alert alert-error" role="alert">
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleVerify} noValidate aria-label="OTP verification form">
          <div className="otp-wrap" role="group" aria-label="One-time password input">
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={el => (inputRefs.current[idx] = el)}
                id={`otp-${idx}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className={`otp-input${d ? ' filled' : ''}${hasError ? ' error' : ''}`}
                value={d}
                onChange={e => handleChange(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(idx, e)}
                onPaste={idx === 0 ? handlePaste : undefined}
                aria-label={`Digit ${idx + 1}`}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          <div className="countdown-row" aria-live="polite">
            {canResend ? (
              <>
                Didn&apos;t get the code?{' '}
                <button type="button" className="resend-btn" onClick={handleResend} id="resend-otp">
                  Resend OTP
                </button>
              </>
            ) : (
              <>
                Resend OTP in{' '}
                <strong style={{ color: 'var(--primary)' }}>
                  0:{String(countdown).padStart(2, '0')}
                </strong>
              </>
            )}
          </div>

          <div style={{ marginTop: 28 }}>
            <button
              id="verify-otp"
              type="submit"
              className="btn btn-primary"
              disabled={loading || digits.join('').length < OTP_LEN}
            >
              {loading ? (
                <>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Verifying…
                </>
              ) : (
                'Verify & Continue →'
              )}
            </button>
          </div>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: '.8rem', color: 'var(--text-muted)' }}>
            💡 Demo hint: enter <strong>1 2 3 4 5 6</strong> to verify
          </p>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
