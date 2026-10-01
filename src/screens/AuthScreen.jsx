import React, { useState, useEffect } from 'react';
import ProgressBar from '../components/ProgressBar';
import { api } from '../services/api';
import {
  UserIcon, MailIcon, PhoneIcon, LockIcon, EyeIcon, EyeOffIcon,
  ArrowRightIcon, AlertCircleIcon, ShieldIcon, UsersIcon, StethoscopeIcon,
  PillIcon, BellIcon, BarChart2Icon
} from '../components/Icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,15}$/;

const ROLES = [
  { id: 'patient',   label: 'Patient',   Icon: ShieldIcon },
  { id: 'caregiver', label: 'Caregiver', Icon: UsersIcon },
  { id: 'clinician', label: 'Clinician', Icon: StethoscopeIcon },
];

function PasswordInput({ id, name, value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <span className="field-icon">
        <LockIcon size={18} />
      </span>
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        className={`form-input has-right-action${error ? ' input-error' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={name === 'password' ? 'current-password' : 'new-password'}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      <button
        type="button"
        className="pass-toggle"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}

function FieldError({ id, msg }) {
  if (!msg) return null;
  return (
    <p id={id} className="field-error" role="alert">
      <AlertCircleIcon size={14} />
      <span>{msg}</span>
    </p>
  );
}

/* ── Sign Up Form ─────────────────────────────────── */
function SignUpForm({ onDirectSignUp, onOtpSignUp, loading, serverError, onSwitchToLogin }) {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'patient',
  });
  const [errors, setErrors] = useState({});
  const [useOtp, setUseOtp] = useState(true);

  const change = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!EMAIL_RE.test(form.email)) e.email = 'Please enter a valid email address.';
    if (!form.phone.trim()) e.phone = 'Phone number is required.';
    else if (!PHONE_RE.test(form.phone)) e.phone = 'Please enter a valid phone number.';
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    if (!form.role) e.role = 'Please select your role.';
    return e;
  };

  const handleSubmit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (useOtp) {
      onOtpSignUp(form);
    } else {
      onDirectSignUp(form);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Sign up form">
      {serverError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircleIcon size={16} />
          <span>{serverError}</span>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="su-name" className="form-label">
          Full Name <span className="required-dot" />
        </label>
        <div className="field">
          <span className="field-icon"><UserIcon size={18} /></span>
          <input
            id="su-name"
            name="fullName"
            type="text"
            className={`form-input${errors.fullName ? ' input-error' : ''}`}
            placeholder="Jane Doe"
            value={form.fullName}
            onChange={change}
            autoComplete="name"
            aria-invalid={!!errors.fullName}
          />
        </div>
        <FieldError id="su-name-err" msg={errors.fullName} />
      </div>

      <div className="form-group">
        <label htmlFor="su-email" className="form-label">
          Email Address <span className="required-dot" />
        </label>
        <div className="field">
          <span className="field-icon"><MailIcon size={18} /></span>
          <input
            id="su-email"
            name="email"
            type="email"
            className={`form-input${errors.email ? ' input-error' : ''}`}
            placeholder="jane@example.com"
            value={form.email}
            onChange={change}
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
        </div>
        <FieldError id="su-email-err" msg={errors.email} />
      </div>

      <div className="form-group">
        <label htmlFor="su-phone" className="form-label">
          Phone Number <span className="required-dot" />
        </label>
        <div className="field">
          <span className="field-icon"><PhoneIcon size={18} /></span>
          <input
            id="su-phone"
            name="phone"
            type="tel"
            className={`form-input${errors.phone ? ' input-error' : ''}`}
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={change}
            autoComplete="tel"
            aria-invalid={!!errors.phone}
          />
        </div>
        <FieldError id="su-phone-err" msg={errors.phone} />
      </div>

      <div className="form-group">
        <label htmlFor="su-password" className="form-label">
          Password <span className="required-dot" />
        </label>
        <PasswordInput
          id="su-password"
          name="password"
          value={form.password}
          onChange={change}
          placeholder="Min. 6 characters"
          error={errors.password}
        />
        <FieldError id="su-password-err" msg={errors.password} />
      </div>

      <div className="form-group">
        <label htmlFor="su-confirm" className="form-label">
          Confirm Password <span className="required-dot" />
        </label>
        <PasswordInput
          id="su-confirm"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={change}
          placeholder="Repeat password"
          error={errors.confirmPassword}
        />
        <FieldError id="su-confirm-err" msg={errors.confirmPassword} />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Account Role <span className="required-dot" /></span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>
            Selected: {ROLES.find(r => r.id === form.role)?.label || 'Patient'}
          </span>
        </label>
        <div className="role-grid" role="radiogroup" aria-label="Select role">
          {ROLES.map(r => {
            const SelectedIcon = r.Icon;
            const isSelected = form.role === r.id;
            return (
              <button
                key={r.id}
                id={`role-select-${r.id}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`role-option role-card${isSelected ? ' selected' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setForm(f => ({ ...f, role: r.id }));
                  setErrors(er => ({ ...er, role: '' }));
                }}
                style={{
                  border: isSelected ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                  background: isSelected ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                  position: 'relative',
                  cursor: 'pointer',
                  padding: '12px 8px'
                }}
              >
                {isSelected && (
                  <span style={{
                    position: 'absolute',
                    top: 4,
                    right: 6,
                    fontSize: '0.7rem',
                    color: 'var(--color-primary)',
                    fontWeight: 700
                  }}>✓</span>
                )}
                <div className="role-option__icon role-card-icon" style={{
                  background: isSelected ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: isSelected ? '#ffffff' : 'inherit'
                }}>
                  <SelectedIcon size={20} />
                </div>
                <span className="role-card-label" style={{
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'var(--color-primary)' : 'inherit'
                }}>
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
        <FieldError id="su-role-err" msg={errors.role} />
      </div>

      <div style={{ margin: '8px 0 12px 0' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-text-2)' }}>
          <input
            type="checkbox"
            checked={useOtp}
            onChange={e => setUseOtp(e.target.checked)}
          />
          <span>Verify account with Two-Step Security OTP</span>
        </label>
      </div>

      <button id="signup-submit" type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={loading}>
        <span>{loading ? 'Creating Account...' : (useOtp ? 'Register with Two-Step OTP' : 'Create Account & Sign In')}</span>
        <ArrowRightIcon size={16} />
      </button>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <span style={{ fontSize: '0.84rem', color: 'var(--color-text-2)' }}>Already have an account? </span>
        <button
          type="button"
          onClick={onSwitchToLogin}
          style={{ fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.84rem' }}
        >
          Sign In
        </button>
      </div>
    </form>
  );
}

/* ── Login Form ───────────────────────────────────── */
function LoginForm({
  onDirectLogin,
  onOtpLogin,
  loading,
  serverError,
  onDemoLogin,
  demoMode,
  onSwitchToSignUp
}) {
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});
  const [useOtp, setUseOtp] = useState(false);

  const change = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.identifier.trim()) {
      e.identifier = useOtp ? 'Please enter your email or phone to receive an OTP code.' : 'Email or phone is required.';
    }
    if (!useOtp && !demoMode && !form.password) {
      e.password = 'Password is required.';
    }
    return e;
  };

  const handleSubmit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (useOtp) {
      onOtpLogin(form);
    } else {
      onDirectLogin(form);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Login form">
      {serverError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircleIcon size={16} />
          <span>{serverError}</span>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="li-identifier" className="form-label">
          Email or Phone <span className="required-dot" />
        </label>
        <div className="field">
          <span className="field-icon"><MailIcon size={18} /></span>
          <input
            id="li-identifier"
            name="identifier"
            type="text"
            className={`form-input${errors.identifier ? ' input-error' : ''}`}
            placeholder="himanshu@paruluniversity.ac.in"
            value={form.identifier}
            onChange={change}
            autoComplete="username"
            aria-invalid={!!errors.identifier}
          />
        </div>
        <FieldError id="li-id-err" msg={errors.identifier} />
      </div>

      {!useOtp && (
        <div className="form-group">
          <label htmlFor="li-password" className="form-label">
            Password {demoMode ? '(Optional in Demo Mode)' : <span className="required-dot" />}
          </label>
          <PasswordInput
            id="li-password"
            name="password"
            value={form.password}
            onChange={change}
            placeholder="Enter password"
            error={errors.password}
          />
          <FieldError id="li-pw-err" msg={errors.password} />
        </div>
      )}

      <div style={{ margin: '4px 0 12px 0' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-text-2)' }}>
          <input
            type="checkbox"
            checked={useOtp}
            onChange={e => { setUseOtp(e.target.checked); setErrors({}); }}
          />
          <span>Sign in with Two-Step Verification OTP (2FA)</span>
        </label>
      </div>

      {useOtp && (
        <div style={{ background: 'var(--color-primary-soft)', border: '1px solid rgba(14, 165, 233, 0.25)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--color-primary)', lineHeight: 1.4 }}>
          🛡️ <strong>Passwordless 2FA Mode:</strong> Enter your email or phone above. We will send a secure 6-digit one-time code to authenticate your session.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        <button id="login-submit" type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          <span>{loading ? 'Processing...' : (useOtp ? 'Send Verification OTP' : 'Sign In')}</span>
          <ArrowRightIcon size={16} />
        </button>

        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <span style={{ fontSize: '0.84rem', color: 'var(--color-text-2)' }}>Don't have an account? </span>
          <button
            type="button"
            onClick={onSwitchToSignUp}
            style={{ fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.84rem' }}
          >
            Create an Account
          </button>
        </div>

        {demoMode && (
          <div className="demo-login-section" style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              1-Click Demo Login (Instant Access)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <button
                id="demo-login-patient"
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onDemoLogin('patient')}
                disabled={loading}
                title="Instant Login as Patient: Himanshu Patel"
              >
                <span>👤 Patient</span>
              </button>
              <button
                id="demo-login-caregiver"
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onDemoLogin('caregiver')}
                disabled={loading}
                title="Instant Login as Caregiver: Divyadarshan Chauhan"
              >
                <span>🤝 Caregiver</span>
              </button>
              <button
                id="demo-login-clinician"
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onDemoLogin('clinician')}
                disabled={loading}
                title="Instant Login as Clinician: Prof. Sathwik Chebrolu"
              >
                <span>🩺 Clinician</span>
              </button>
            </div>
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setForm({ identifier: 'himanshu@paruluniversity.ac.in', password: 'DemoPassword123!' });
                  setErrors({});
                }}
              >
                <span>Fill Demo Credentials into Form</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

/* ── Auth Screen ──────────────────────────────────── */
export default function AuthScreen({ onComplete, onDirectLogin, sessionExpiredMessage, onClearSessionExpiredMessage }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [config, setConfig] = useState({ demo_mode: true });

  useEffect(() => {
    api.getConfig().then(cfg => {
      if (cfg) setConfig(cfg);
    });
  }, []);

  const handleDirectSignUp = async (formData) => {
    if (onClearSessionExpiredMessage) onClearSessionExpiredMessage();
    setLoading(true);
    setServerError('');
    try {
      const res = await api.directRegister(formData);
      setLoading(false);
      if (onDirectLogin) {
        onDirectLogin(res.user, res.token, true);
      }
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleOtpSignUp = async (formData) => {
    if (onClearSessionExpiredMessage) onClearSessionExpiredMessage();
    setLoading(true);
    setServerError('');
    try {
      const res = await api.register(formData);
      setLoading(false);
      onComplete({
        type: 'signup',
        email: res.email || formData.email,
        data: formData,
        demoOtp: res.demo_otp,
        totpSecret: res.totp_secret,
        totpQr: res.totp_qr
      });
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleDirectLoginSubmit = async (formData) => {
    if (onClearSessionExpiredMessage) onClearSessionExpiredMessage();
    setLoading(true);
    setServerError('');
    try {
      const res = await api.directLogin(formData);
      setLoading(false);
      if (onDirectLogin) {
        onDirectLogin(res.user, res.token, false);
      }
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleOtpLoginSubmit = async (formData) => {
    if (onClearSessionExpiredMessage) onClearSessionExpiredMessage();
    setLoading(true);
    setServerError('');
    try {
      const res = await api.login(formData);
      setLoading(false);
      onComplete({
        type: 'login',
        email: res.email || formData.identifier,
        data: formData,
        demoOtp: res.demo_otp,
        totpSecret: res.totp_secret,
        totpQr: res.totp_qr
      });
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleDemoLogin = async (role = 'patient') => {
    if (onClearSessionExpiredMessage) onClearSessionExpiredMessage();
    setLoading(true);
    setServerError('');
    try {
      const res = await api.demoLogin(role);
      setLoading(false);
      if (onDirectLogin) {
        onDirectLogin(res.user, res.token, false);
      }
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Demo login failed.');
    }
  };

  return (
    <main className="page" id="auth-screen">
      <div className="auth-split">
        <div className="auth-panel-preview" aria-hidden="true">
          <div className="preview-logo-hero">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="MedRemind" width={80} height={80} />
            <h2>Smart Medication<br />Reminder</h2>
            <p>Clinical regimen adherence with two-step secure verification.</p>
          </div>
          <div className="preview-features">
            {[
              { Icon: PillIcon, text: 'Two-factor verified medication access' },
              { Icon: BellIcon, text: 'Customizable dose alarms & sirens' },
              { Icon: BarChart2Icon, text: 'Adherence tracking and caregiver sync' },
            ].map(({ Icon, text }) => (
              <div key={text} className="preview-feature">
                <div className="preview-feature-icon"><Icon size={16} /></div>
                <span className="preview-feature-text">{text}</span>
              </div>
            ))}
          </div>

          <div className="preview-academic-tag">
            <span className="academic-badge">Academic Project</span>
            <span className="academic-text">Parul University • Guide: Prof. Sathwik Chebrolu</span>
          </div>
        </div>

        <div className="auth-panel-form">
          <div className="card">
            <ProgressBar currentStep={1} />

            {sessionExpiredMessage && (
              <div className="alert alert-warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }} role="alert">
                <AlertCircleIcon size={18} />
                <span>{sessionExpiredMessage}</span>
              </div>
            )}

            <h1 className="screen-title">{mode === 'login' ? 'Sign In' : 'Create Account'}</h1>
            <p className="screen-subtitle">
              {mode === 'login'
                ? 'Sign in to access your medication schedule and dashboard.'
                : 'Register your profile to set up your personalized medication schedule.'}
            </p>

            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                id="tab-login"
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab${mode === 'login' ? ' active' : ''}`}
                onClick={() => { setMode('login'); setServerError(''); }}
              >
                Login
              </button>
              <button
                id="tab-signup"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
                onClick={() => { setMode('signup'); setServerError(''); }}
              >
                Sign Up
              </button>
            </div>

            {mode === 'login' ? (
              <LoginForm
                onDirectLogin={handleDirectLoginSubmit}
                onOtpLogin={handleOtpLoginSubmit}
                loading={loading}
                serverError={serverError}
                onDemoLogin={handleDemoLogin}
                demoMode={config.demo_mode}
                onSwitchToSignUp={() => { setMode('signup'); setServerError(''); }}
              />
            ) : (
              <SignUpForm
                onDirectSignUp={handleDirectSignUp}
                onOtpSignUp={handleOtpSignUp}
                loading={loading}
                serverError={serverError}
                onSwitchToLogin={() => { setMode('login'); setServerError(''); }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
