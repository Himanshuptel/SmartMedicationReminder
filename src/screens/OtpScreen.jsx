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

export default function OtpScreen({ authData, onVerified }) {
  const [digits, setDigits] = useState(Array(OTP_LEN).fill(''));
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
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

  const contactEmail = authData?.email || authData?.data?.email || authData?.data?.identifier || '';
  const maskedContact = maskContact(contactEmail);

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
      await api.resendOtp({ email: contactEmail });
      setDigits(Array(OTP_LEN).fill(''));
      setCountdown(COUNTDOWN_SECS);
      setCanResend(false);
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
          <div className="otp-group" role="group" aria-label="Enter 6-digit verification code">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={el => { inputRefs.current[idx] = el; }}
                id={`otp-${idx}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                className={`otp-digit${hasError ? ' input-error' : ''}${digit ? ' filled' : ''}`}
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
      </div>
    </main>
  );
}
