import React from 'react';

export default function SuccessScreen({ medicines, authData }) {
  const name = authData?.data?.fullName || authData?.data?.identifier || 'there';
  const firstName = name.split(' ')[0];

  return (
    <main className="page" id="success-screen">
      <div className="card" style={{ textAlign: 'center', maxWidth: 520 }}>
        <div className="success-screen">

          {/* Logo + brand */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="MedRemind logo"
              width={80}
              height={80}
              style={{
                borderRadius: 20,
                boxShadow: '0 8px 32px rgba(20,184,166,.35)',
                animation: 'popIn .5s cubic-bezier(.175,.885,.32,1.275) both',
              }}
            />
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Setup Complete ✓
            </span>
          </div>

          <h1 className="success-title">You're all set, {firstName}! 🎉</h1>
          <p className="success-sub">
            Your medications are registered. MedRemind will keep you on track —
            every dose, every day.
          </p>

          {/* Saved medicine pills */}
          {medicines && medicines.length > 0 && (
            <div className="success-pills" role="list" aria-label="Registered medicines">
              {medicines.map((m, i) => (
                <div key={i} className="success-pill" role="listitem">
                  💊 {m.name} — {m.dosage}
                </div>
              ))}
            </div>
          )}

          {/* Mockup preview */}
          <div style={{
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 28,
            border: '1px solid var(--border)',
            boxShadow: '0 8px 28px rgba(0,0,0,.1)',
          }}>
            <img
              src={`${import.meta.env.BASE_URL}mockup.png`}
              alt="Smart Medication Reminder app screens preview"
              style={{ width: '100%', display: 'block' }}
            />
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 100%)',
              padding: '20px 16px 14px',
              textAlign: 'left',
            }}>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: '.85rem', marginBottom: 2 }}>
                Coming up in MedRemind
              </p>
              <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '.75rem' }}>
                Reminders · Adherence dashboard · Caregiver portal
              </p>
            </div>
          </div>

          {/* What's next */}
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '18px 20px',
            marginBottom: 24,
            textAlign: 'left',
          }}>
            <p style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚡ What comes next
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['🔔', 'Reminder scheduling', 'Set daily notification times'],
                ['📊', 'Adherence dashboard', 'Track your medication streaks'],
                ['👥', 'Caregiver portal', 'Share updates with your care team'],
              ].map(([icon, label, desc]) => (
                <li key={label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 32, height: 32, flexShrink: 0,
                    background: 'var(--primary-light)',
                    borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.95rem',
                  }}>{icon}</span>
                  <div>
                    <p style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{label}</p>
                    <p style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <button
            id="go-to-dashboard"
            className="btn btn-primary"
            onClick={() => alert('🚀 Dashboard coming soon — only 3 screens were built in this session!')}
          >
            Go to Dashboard →
          </button>

          <p style={{ marginTop: 14, fontSize: '.78rem', color: 'var(--text-muted)' }}>
            Data logged to console. No backend connected yet.
          </p>
        </div>
      </div>
    </main>
  );
}
