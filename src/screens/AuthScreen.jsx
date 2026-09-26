import React, { useState } from 'react';
import ProgressBar from '../components/ProgressBar';
import {
  UserIcon, MailIcon, PhoneIcon, LockIcon, EyeIcon, EyeOffIcon,
  UserPlusIcon, LogInIcon, ArrowRightIcon, AlertCircleIcon,
  ShieldIcon, UsersIcon, StethoscopeIcon, PillIcon, BellIcon, BarChart2Icon
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
function SignUpForm({ onSubmit }) {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: '',
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
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    if (!form.role) e.role = 'Please select your role.';
    return e;
  };

  const submit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({ type: 'signup', data: form });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Sign up form">
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
            aria-describedby={errors.fullName ? 'su-name-err' : undefined}
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
            aria-describedby={errors.email ? 'su-email-err' : undefined}
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
            placeholder="+1 (555) 000-0000"
            value={form.phone}
            onChange={change}
            autoComplete="tel"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'su-phone-err' : undefined}
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
          placeholder="Min. 8 characters"
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
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`role-option${isSelected ? ' selected' : ''}`}
                onClick={() => {
                  setForm(f => ({ ...f, role: r.id }));
                  setErrors(er => ({ ...er, role: '' }));
                }}
              >
                <div className="role-option__icon">
                  <SelectedIcon size={18} />
                </div>
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
        <FieldError id="su-role-err" msg={errors.role} />
      </div>

      <button id="signup-submit" type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>
        <span>Continue</span>
        <ArrowRightIcon size={16} />
      </button>
    </form>
  );
}

/* ── Login Form ───────────────────────────────────── */
function LoginForm({ onSubmit }) {
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
    if (!form.password) e.password = 'Password is required.';
    return e;
  };

  const submit = e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit({ type: 'login', data: form });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Login form">
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
            placeholder="name@example.com or +1 555..."
            value={form.identifier}
            onChange={change}
            autoComplete="username"
            aria-invalid={!!errors.identifier}
            aria-describedby={errors.identifier ? 'li-id-err' : undefined}
          />
        </div>
        <FieldError id="li-id-err" msg={errors.identifier} />
      </div>

      <div className="form-group">
        <label htmlFor="li-password" className="form-label">
          Password <span className="required-dot" />
        </label>
        <PasswordInput
          id="li-password"
          name="password"
          value={form.password}
          onChange={change}
          placeholder="Your password"
          error={errors.password}
        />
        <FieldError id="li-pw-err" msg={errors.password} />
      </div>

      <div className="forgot-link">
        <a href="#forgot" onClick={e => { e.preventDefault(); alert('Password reset email sent!'); }}>
          Forgot password?
        </a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <button id="login-submit" type="submit" className="btn btn-primary" style={{ width: '100%' }}>
          <span>Log In</span>
          <ArrowRightIcon size={16} />
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ width: '100%' }}
          onClick={() => {
            onSubmit({
              type: 'login',
              data: {
                fullName: 'Himanshu Patel',
                email: 'himanshu@paruluniversity.ac.in',
                identifier: 'himanshu@paruluniversity.ac.in',
                role: 'patient'
              }
            });
          }}
        >
          <span>Use Demo Account (Himanshu Patel)</span>
        </button>
      </div>
    </form>
  );
}

/* ── Auth Screen ──────────────────────────────────── */
export default function AuthScreen({ onComplete, onSkipToDashboard }) {
  const [mode, setMode] = useState('login');

  const handleSubmit = (payload) => {
    onComplete(payload);
  };

  return (
    <main className="page" id="auth-screen">
      <div className="auth-split">
        {/* Left preview panel (desktop) */}
        <div className="auth-panel-preview" aria-hidden="true">
          <div className="preview-logo-hero">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="MedRemind"
              width={80}
              height={80}
            />
            <h2>Smart Medication<br />Reminder</h2>
            <p>Your personal assistant for timely medication management.</p>
          </div>

          <div className="preview-mockup">
            <img
              src={`${import.meta.env.BASE_URL}mockup.png`}
              alt="App screens preview"
            />
          </div>

          <div className="preview-features">
            {[
              { Icon: PillIcon, text: 'Simple 3-step setup process' },
              { Icon: BellIcon, text: 'Customizable dose reminders' },
              { Icon: BarChart2Icon, text: 'Track adherence and care records' },
            ].map(({ Icon, text }) => (
              <div key={text} className="preview-feature">
                <div className="preview-feature-icon">
                  <Icon size={16} />
                </div>
                <span className="preview-feature-text">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right form panel */}
        <div className="auth-panel-form">
          <div className="card">
            <ProgressBar currentStep={1} />

            <h1 className="screen-title">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="screen-subtitle">
              {mode === 'login'
                ? 'Sign in to access your medication reminders.'
                : 'Set up your MedRemind account to get started.'}
            </p>

            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                id="tab-login"
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab${mode === 'login' ? ' active' : ''}`}
                onClick={() => setMode('login')}
              >
                Login
              </button>
              <button
                id="tab-signup"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
                onClick={() => setMode('signup')}
              >
                Sign Up
              </button>
            </div>

            {mode === 'login' ? (
              <LoginForm onSubmit={handleSubmit} />
            ) : (
              <SignUpForm onSubmit={handleSubmit} />
            )}

            {onSkipToDashboard && (
              <div style={{ marginTop: 16, textAlign: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-primary"
                  onClick={onSkipToDashboard}
                  style={{ fontWeight: 600 }}
                >
                  <span>Skip to Full Dashboard (Demo Mode) →</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
