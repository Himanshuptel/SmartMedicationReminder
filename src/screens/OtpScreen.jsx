import React, { useState, useRef, useEffect } from 'react';
import ProgressBar from '../components/ProgressBar';
import { LockIcon, AlertCircleIcon, RefreshIcon, ArrowRightIcon } from '../components/Icons';

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

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

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
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);

    if (otp === DEMO_OTP) {
      onVerified();
    } else {
      setError('Invalid code. Use 123456 for demo.');
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
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width={32}
            height={32}
          />
          <span className="logo-strip__name">Smart Medication Reminder</span>
        </div>

        <h1 className="screen-title">Verify your identity</h1>
        <p className="screen-subtitle">
          Enter the 6-digit verification code sent to your registered contact.
        </p>

        <div className="masked-contact-box" aria-live="polite">
          <span>Verification code sent to</span>
          <strong>{maskedContact}</strong>
        </div>

        {hasError && (
          <div className="alert alert-error" role="alert">
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleVerify} noValidate aria-label="OTP verification form">
          <div className="otp-row" role="group" aria-label="One-time password input">
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={el => (inputRefs.current[idx] = el)}
                id={`otp-${idx}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className={`otp-cell${d ? ' filled' : ''}${hasError ? ' otp-error' : ''}`}
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
              <button type="button" className="resend-btn" onClick={handleResend} id="resend-otp">
                <RefreshIcon size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Resend Code
              </button>
            ) : (
              <span>
                Resend code in{' '}
                <strong className="countdown-timer">
                  0:{String(countdown).padStart(2, '0')}
                </strong>
              </span>
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
                  <span className="spinner" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Continue</span>
                  <ArrowRightIcon size={16} />
                </>
              )}
            </button>
          </div>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: '0.8125rem', color: 'var(--color-text-3)' }}>
            Demo passcode: <strong>123456</strong>
          </p>
        </form>
      </div>
    </main>
  );
}
