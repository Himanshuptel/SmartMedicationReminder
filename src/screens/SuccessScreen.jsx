import React from 'react';
import {
  CheckIcon, BellIcon, BarChart2Icon, UsersIcon, ArrowRightIcon, PillIcon
} from '../components/Icons';

function getDisplayName(authData) {
  const data = authData?.data;
  if (!data) return 'there';
  if (data.fullName && data.fullName.trim()) {
    const first = data.fullName.trim().split(' ')[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  if (data.identifier) {
    const raw = data.identifier.trim();
    if (raw.includes('@')) {
      const username = raw.split('@')[0];
      const cleanName = username.split(/[\._\-]/)[0].replace(/[^a-zA-Z]/g, '');
      if (cleanName) {
        return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      }
      return username;
    }
  }
  return 'there';
}

export default function SuccessScreen({ medicines, authData }) {
  const firstName = getDisplayName(authData);

  return (
    <main className="page" id="success-screen">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="success-wrap">
          <div className="success-icon-wrap">
            <CheckIcon size={36} strokeWidth={2.5} />
          </div>

          <p className="success-eyebrow">Setup Complete</p>
          <h1 className="success-title">You're ready, {firstName}!</h1>
          <p className="success-sub">
            Your profile and initial medication schedule have been configured.
          </p>

          {medicines && medicines.length > 0 && (
            <div className="medicine-pills" role="list" aria-label="Registered medicines">
              {medicines.map((m, i) => (
                <div key={i} className="medicine-pill" role="listitem">
                  <PillIcon size={12} />
                  <span>{m.name} ({m.dosage})</span>
                </div>
              ))}
            </div>
          )}

          <div className="next-steps-card">
            <p className="next-steps-title">What comes next</p>
            <div className="next-step-item">
              <div className="next-step-icon">
                <BellIcon size={16} />
              </div>
              <div className="next-step-text">
                <strong>Reminder Scheduling</strong>
                <span>Set specific times for your daily notifications</span>
              </div>
            </div>

            <div className="next-step-item">
              <div className="next-step-icon">
                <BarChart2Icon size={16} />
              </div>
              <div className="next-step-text">
                <strong>Adherence Tracker</strong>
                <span>Monitor intake records and consistency trends</span>
              </div>
            </div>

            <div className="next-step-item">
              <div className="next-step-icon">
                <UsersIcon size={16} />
              </div>
              <div className="next-step-text">
                <strong>Caregiver Portal</strong>
                <span>Connect your clinical or family support team</span>
              </div>
            </div>
          </div>

          <button
            id="go-to-dashboard"
            className="btn btn-primary"
            onClick={() => alert('Dashboard module — Initial setup completed.')}
          >
            <span>Go to Dashboard</span>
            <ArrowRightIcon size={16} />
          </button>

          <p style={{ marginTop: 14, fontSize: '0.75rem', color: 'var(--color-text-3)' }}>
            Collected data saved to client state.
          </p>
        </div>
      </div>
    </main>
  );
}
