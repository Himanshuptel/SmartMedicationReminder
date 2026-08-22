import React, { useState } from 'react';
import ProgressBar from '../components/ProgressBar';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,15}$/;

const ROLES = [
  { id: 'patient',   label: 'Patient',   emoji: '🏥' },
  { id: 'caregiver', label: 'Caregiver', emoji: '🤝' },
  { id: 'clinician', label: 'Clinician', emoji: '👨‍⚕️' },
];

function PasswordInput({ id, name, value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrapper">
      <span className="input-icon">🔒</span>
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        className={`form-input${error ? ' error' : ''}`}
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
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

function FieldError({ id, msg }) {
  if (!msg) return null;
  return <p id={id} className="field-error" role="alert">⚠ {msg}</p>;
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
    else if (!EMAIL_RE.test(form.email)) e.email = 'Please enter a valid email.';
    if (!form.phone.trim()) e.phone = 'Phone number is required.';
    else if (!PHONE_RE.test(form.phone)) e.phone = 'Please enter a valid phone number.';
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    if (!form.role) e.role = 'Please select a role.';
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
        <label htmlFor="su-name" className="form-label">Full Name <span className="required">*</span></label>
        <div className="input-wrapper">
          <span className="input-icon">👤</span>
          <input id="su-name" name="fullName" type="text" className={`form-input${errors.fullName ? ' error' : ''}`}
            placeholder="Jane Doe" value={form.fullName} onChange={change}
            autoComplete="name" aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'su-name-err' : undefined} />
        </div>
        <FieldError id="su-name-err" msg={errors.fullName} />
      </div>

      <div className="form-group">
        <label htmlFor="su-email" className="form-label">Email Address <span className="required">*</span></label>
        <div className="input-wrapper">
          <span className="input-icon">📧</span>
          <input id="su-email" name="email" type="email" className={`form-input${errors.email ? ' error' : ''}`}
            placeholder="jane@example.com" value={form.email} onChange={change}
            autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'su-email-err' : undefined} />
        </div>
        <FieldError id="su-email-err" msg={errors.email} />
      </div>

      <div className="form-group">
        <label htmlFor="su-phone" className="form-label">Phone Number <span className="required">*</span></label>
        <div className="input-wrapper">
          <span className="input-icon">📱</span>
          <input id="su-phone" name="phone" type="tel" className={`form-input${errors.phone ? ' error' : ''}`}
            placeholder="+1 234 567 8900" value={form.phone} onChange={change}
            autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'su-phone-err' : undefined} />
        </div>
        <FieldError id="su-phone-err" msg={errors.phone} />
      </div>

      <div className="form-group">
        <label htmlFor="su-password" className="form-label">Password <span className="required">*</span></label>
        <PasswordInput id="su-password" name="password" value={form.password} onChange={change}
          placeholder="Min. 8 characters" error={errors.password} />
        <FieldError id="su-password-err" msg={errors.password} />
      </div>

      <div className="form-group">
        <label htmlFor="su-confirm" className="form-label">Confirm Password <span className="required">*</span></label>
        <PasswordInput id="su-confirm" name="confirmPassword" value={form.confirmPassword} onChange={change}
          placeholder="Repeat your password" error={errors.confirmPassword} />
        <FieldError id="su-confirm-err" msg={errors.confirmPassword} />
      </div>

      <div className="form-group">
        <label className="form-label">I am a… <span className="required">*</span></label>
        <div className="role-selector" role="radiogroup" aria-label="Select role">
          {ROLES.map(r => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={form.role === r.id}
              className={`role-card${form.role === r.id ? ' selected' : ''}`}
              onClick={() => { setForm(f => ({ ...f, role: r.id })); setErrors(er => ({ ...er, role: '' })); }}
            >
              <span className="role-emoji">{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>
        <FieldError id="su-role-err" msg={errors.role} />
      </div>

      <button id="signup-submit" type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>
        Continue →
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
        <label htmlFor="li-identifier" className="form-label">Email or Phone <span className="required">*</span></label>
        <div className="input-wrapper">
          <span className="input-icon">📧</span>
          <input id="li-identifier" name="identifier" type="text" className={`form-input${errors.identifier ? ' error' : ''}`}
            placeholder="jane@example.com or +1 234..." value={form.identifier} onChange={change}
            autoComplete="username" aria-invalid={!!errors.identifier} aria-describedby={errors.identifier ? 'li-id-err' : undefined} />
        </div>
        <FieldError id="li-id-err" msg={errors.identifier} />
      </div>

      <div className="form-group">
        <label htmlFor="li-password" className="form-label">Password <span className="required">*</span></label>
        <PasswordInput id="li-password" name="password" value={form.password} onChange={change}
          placeholder="Your password" error={errors.password} />
        <FieldError id="li-pw-err" msg={errors.password} />
      </div>

      <div className="forgot-link">
        <a href="#forgot" onClick={e => { e.preventDefault(); alert('Password reset link sent to your email!'); }}>
          Forgot password?
        </a>
      </div>

      <button id="login-submit" type="submit" className="btn btn-primary">
        Continue →
      </button>
    </form>
  );
}

/* ── Auth Screen ──────────────────────────────────── */
export default function AuthScreen({ onComplete }) {
  const [mode, setMode] = useState('login');

  const handleSubmit = (payload) => {
    onComplete(payload);
  };

  return (
    <main className="page" id="auth-screen" style={{ padding: '40px 16px 60px' }}>
      <div className="auth-split">

        {/* ── Left: Preview panel ── */}
        <div className="auth-split__preview" aria-hidden="true">
          <div className="auth-split__logo-hero">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="MedRemind" width={88} height={88} />
            <h2>Smart Medication<br />Reminder</h2>
            <p>Never miss a dose. Stay healthy, stay on track.</p>
          </div>

          <div className="auth-split__mockup">
            <img src={`${import.meta.env.BASE_URL}mockup.png`} alt="App screens preview" />
          </div>

          <div className="auth-split__features">
            {[
              ['💊', '3-screen onboarding — quick &amp; simple'],
              ['🔔', 'Smart reminders that fit your schedule'],
              ['📊', 'Track adherence and share with caregivers'],
            ].map(([icon, text]) => (
              <div key={text} className="auth-split__feat">
                <span className="auth-split__feat-icon">{icon}</span>
                <span className="auth-split__feat-text" dangerouslySetInnerHTML={{ __html: text }} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Form panel ── */}
        <div className="auth-split__panel">
          <div className="card">
            <ProgressBar currentStep={1} />

            {/* Logo hero (visible on mobile only — hidden on desktop since left panel shows it) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              marginBottom: 24,
            }} className="auth-mobile-hero">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="MedRemind logo"
                width={64}
                height={64}
                style={{ borderRadius: 16, boxShadow: '0 4px 16px rgba(20,184,166,.25)' }}
              />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-.01em' }}>
                  Smart Medication Reminder
                </p>
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Never miss a dose again
                </p>
              </div>
            </div>

            <h1 className="card-title">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="card-subtitle">
              {mode === 'login'
                ? 'Sign in to manage your medications and reminders.'
                : 'Set up your MedRemind profile to get started.'}
            </p>

            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button
                id="tab-login"
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-toggle__btn${mode === 'login' ? ' active' : ''}`}
                onClick={() => setMode('login')}
              >
                Login
              </button>
              <button
                id="tab-signup"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`auth-toggle__btn${mode === 'signup' ? ' active' : ''}`}
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
          </div>
        </div>
      </div>

      {/* Hide mobile hero on desktop (left panel already shows branding) */}
      <style>{`
        @media (min-width: 701px) { .auth-mobile-hero { display: none !important; } }
      `}</style>
    </main>
  );
}
