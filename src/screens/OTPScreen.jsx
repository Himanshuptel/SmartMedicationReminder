import { useState, useRef, useEffect, useCallback } from 'react';

const OTP_LENGTH = 6;
const RESEND_DELAY = 30;
// Demo: the "correct" OTP is 123456 — any other triggers error state
const DEMO_OTP = '123456';

function maskContact(contact) {
  if (!contact) return '***@***.com';
  if (contact.includes('@')) {
    const [user, domain] = contact.split('@');
    const masked = user.slice(0, 2) + '***' + (user.length > 4 ? user.slice(-1) : '');
    return `${masked}@${domain}`;
  }
  // Phone: show last 4 digits
  return contact.replace(/\d(?=\d{4})/g, '*');
}

export default function OTPScreen({ userData, onVerified, onBack, showToast }) {
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [errorState, setErrorState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_DELAY);
  const [canResend, setCanResend] = useState(false);
  const [resendKey, setResendKey] = useState(0); // bump to restart countdown animation
  const inputRefs = useRef([]);

  // Focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (canResend) return;
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, canResend, resendKey]);

  const handleChange = (index, value) => {
    // Accept only single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    setErrorState(false);

    const next = [...otp];
    next[index] = digit;
    setOtp(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      setErrorState(false);
      if (otp[index]) {
        const next = [...otp];
        next[index] = '';
        setOtp(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...otp];
        next[index - 1] = '';
        setOtp(next);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((char, i) => { next[i] = char; });
    setOtp(next);
    // Focus the next empty or last box
    const nextIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[nextIdx]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      showToast('Please enter the full 6-digit OTP', 'error');
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);

    if (code === DEMO_OTP) {
      showToast('OTP verified successfully! 🎉', 'success');
      onVerified();
    } else {
      setErrorState(true);
      showToast('Invalid OTP. Try 123456 for demo.', 'error');
    }
  };

  const handleResend = useCallback(() => {
    if (!canResend) return;
    setOtp(Array(OTP_LENGTH).fill(''));
    setErrorState(false);
    setCountdown(RESEND_DELAY);
    setCanResend(false);
    setResendKey(k => k + 1);
    inputRefs.current[0]?.focus();
    showToast('OTP resent! Check your messages.', 'info');
  }, [canResend, showToast]);

  const contact = userData.email || userData.phone || '';
  const contactType = userData.email ? 'email' : 'phone';
  const otpFilled = otp.join('').length === OTP_LENGTH;

  return (
    <div className="screen-card screen-enter">
      <div className="screen-header">
        <div className="screen-eyebrow">🔐 Verification</div>
        <h1 className="screen-title">Enter OTP</h1>
        <p className="screen-subtitle" style={{ marginBottom: 4 }}>
          We sent a 6-digit code to your {contactType}.
        </p>
        <div className="masked-contact">
          <span>{contactType === 'email' ? '📧' : '📱'}</span>
          <span>{maskContact(contact)}</span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
          💡 <strong>Demo:</strong> Enter <strong>123456</strong> to proceed.
        </p>
      </div>

      {/* OTP Inputs */}
      <div
        className="otp-group"
        role="group"
        aria-label="6-digit verification code"
        onPaste={handlePaste}
      >
        {otp.map((digit, i) => (
          <input
            key={i}
            id={`otp-input-${i}`}
            ref={el => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            className={`otp-input ${digit ? 'filled' : ''} ${errorState ? 'error-state' : ''}`}
            value={digit}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            aria-label={`Digit ${i + 1}`}
            autoComplete="one-time-code"
          />
        ))}
      </div>

      {/* Error message */}
      {errorState && (
        <p
          className="error-msg"
          style={{ justifyContent: 'center', marginBottom: 12 }}
          role="alert"
        >
          ⚠ Invalid or expired OTP. Please try again.
        </p>
      )}

      {/* Verify button */}
      <button
        id="otp-verify-btn"
        className="btn btn-primary"
        onClick={handleVerify}
        disabled={loading || !otpFilled}
        style={{ marginBottom: 16 }}
      >
        {loading ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
            Verifying…
          </>
        ) : (
          '✅ Verify OTP'
        )}
      </button>

      {/* Resend OTP */}
      <div className="resend-area">
        {canResend ? (
          <button
            id="resend-otp-btn"
            type="button"
            className="btn btn-ghost"
            onClick={handleResend}
            style={{ width: '100%' }}
          >
            🔄 Resend OTP
          </button>
        ) : (
          <p className="countdown-text">
            Resend OTP in{' '}
            <span className="countdown-number">
              {String(Math.floor(countdown / 60)).padStart(2, '0')}:
              {String(countdown % 60).padStart(2, '0')}
            </span>
          </p>
        )}
      </div>

      {/* Back link */}
      <div className="text-center" style={{ marginTop: 20 }}>
        <button
          id="otp-back-btn"
          type="button"
          className="link"
          onClick={onBack}
        >
          ← Back to {userData.isLogin ? 'Login' : 'Sign Up'}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
