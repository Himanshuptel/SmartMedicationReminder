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
function SignUpForm({ onSubmit, loading, serverError }) {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'patient',
  });
  const [errors, setErrors] = useState({});

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

  const submit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Sign up form">
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
        <label className="form-label">
          Account Role <span className="required-dot" />
        </label>
        <div className="role-grid" role="radiogroup" aria-label="Select role">
          {ROLES.map(r => {
            const SelectedIcon = r.Icon;
            const isSelected = form.role === r.id;
            return (
              <div
                key={r.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                className={`role-card${isSelected ? ' selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, role: r.id }))}
                onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && setForm(f => ({ ...f, role: r.id }))}
              >
                <div className="role-card-icon"><SelectedIcon size={20} /></div>
                <span className="role-card-label">{r.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <button id="signup-submit" type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
        <span>{loading ? 'Sending Verification Code...' : 'Continue to Verification'}</span>
        <ArrowRightIcon size={16} />
      </button>
    </form>
  );
}

/* ── Login Form ───────────────────────────────────── */
function LoginForm({ onSubmit, loading, serverError, onDemoLogin, demoMode }) {
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});

  const change = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.identifier.trim()) e.identifier = 'Email or phone is required.';
    if (!demoMode && !form.password) e.password = 'Password is required.';
    return e;
  };

  const submit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Login form">
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <button id="login-submit" type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          <span>{loading ? 'Sending Code...' : 'Log In & Verify'}</span>
          <ArrowRightIcon size={16} />
        </button>

        {demoMode && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ width: '100%' }}
            onClick={onDemoLogin}
            disabled={loading}
          >
            <span>Quick Login: Himanshu Patel (Demo)</span>
          </button>
        )}
      </div>
    </form>
  );
}

/* ── Auth Screen ──────────────────────────────────── */
export default function AuthScreen({ onComplete }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [config, setConfig] = useState({ demo_mode: true });

  useEffect(() => {
    api.getConfig().then(cfg => {
      if (cfg) setConfig(cfg);
    });
  }, []);

  const handleSignUpSubmit = async (formData) => {
    setLoading(true);
    setServerError('');
    try {
      const res = await api.register(formData);
      setLoading(false);
      onComplete({
        type: 'signup',
        email: res.email || formData.email,
        data: formData
      });
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleLoginSubmit = async (formData) => {
    setLoading(true);
    setServerError('');
    try {
      const res = await api.login(formData);
      setLoading(false);
      onComplete({
        type: 'login',
        email: res.email || formData.identifier,
        data: formData
      });
    } catch (err) {
      setLoading(false);
      setServerError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setServerError('');
    try {
      const res = await api.login({
        identifier: 'himanshu@paruluniversity.ac.in',
        password: 'DemoPassword123!'
      });
      setLoading(false);
      onComplete({
        type: 'login',
        email: res.email || 'himanshu@paruluniversity.ac.in',
        data: {
          fullName: 'Himanshu Patel',
          email: 'himanshu@paruluniversity.ac.in',
          role: 'patient'
        }
      });
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
        </div>

        <div className="auth-panel-form">
          <div className="card">
            <ProgressBar currentStep={1} />
            <h1 className="screen-title">{mode === 'login' ? 'Sign In' : 'Create Account'}</h1>
            <p className="screen-subtitle">
              {mode === 'login'
                ? 'Enter your credentials to receive your two-factor verification code.'
                : 'Register your profile to set up your medication schedule.'}
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
                onSubmit={handleLoginSubmit}
                loading={loading}
                serverError={serverError}
                onDemoLogin={handleDemoLogin}
                demoMode={config.demo_mode}
              />
            ) : (
              <SignUpForm
                onSubmit={handleSignUpSubmit}
                loading={loading}
                serverError={serverError}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
