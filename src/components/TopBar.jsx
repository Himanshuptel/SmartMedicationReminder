import React, { useState } from 'react';
import {
  SunIcon, MoonIcon, ShieldIcon, UsersIcon, StethoscopeIcon,
  BellIcon, AlertTriangleIcon, DiagramIcon, CheckIcon, PillIcon
} from './Icons';

export default function TopBar({
  darkMode,
  onToggleDark,
  currentRole,
  onRoleChange,
  onTriggerTestAlarm,
  onOpenSos,
  onOpenSystemDesign,
  notifications = [],
  userName = 'Himanshu Patel'
}) {
  const [showNotifs, setShowNotifs] = useState(false);

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar__left">
        <a href="#" className="top-bar__logo" aria-label="MedRemind home">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="MedRemind"
            width={28}
            height={28}
            style={{ borderRadius: 6 }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <span className="logo-text">MedRemind</span>
        </a>

        {/* Role Switcher Pill Bar for Faculty / Demonstration */}
        <div className="role-switcher" role="group" aria-label="User role selection">
          <button
            type="button"
            className={`role-btn ${currentRole === 'patient' ? 'active' : ''}`}
            onClick={() => onRoleChange('patient')}
            title="Switch to Patient View"
          >
            <ShieldIcon size={14} />
            <span>Patient</span>
          </button>
          <button
            type="button"
            className={`role-btn ${currentRole === 'caregiver' ? 'active' : ''}`}
            onClick={() => onRoleChange('caregiver')}
            title="Switch to Caregiver Portal"
          >
            <UsersIcon size={14} />
            <span>Caregiver</span>
          </button>
          <button
            type="button"
            className={`role-btn ${currentRole === 'clinician' ? 'active' : ''}`}
            onClick={() => onRoleChange('clinician')}
            title="Switch to Clinician Portal"
          >
            <StethoscopeIcon size={14} />
            <span>Clinician</span>
          </button>
        </div>
      </div>

      <div className="top-bar__actions">
        {/* Test Alarm Simulator Button */}
        <button
          type="button"
          className="btn btn-outline-primary btn-sm test-alarm-btn"
          onClick={onTriggerTestAlarm}
          title="Simulate live reminder chime and ringing alarm"
        >
          <BellIcon size={14} />
          <span>Test Alarm</span>
        </button>

        {/* System Design Architecture Button */}
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={onOpenSystemDesign}
          title="View UML diagrams & system architecture"
        >
          <DiagramIcon size={14} />
          <span>System Design</span>
        </button>

        {/* Emergency SOS Button */}
        <button
          type="button"
          className="btn btn-danger btn-sm sos-topbar-btn"
          onClick={onOpenSos}
          title="Trigger Emergency SOS Protocol"
        >
          <AlertTriangleIcon size={14} />
          <span>SOS</span>
        </button>

        {/* Notifications Dropdown */}
        <div className="notif-wrapper" style={{ position: 'relative' }}>
          <button
            type="button"
            className="icon-btn notif-btn"
            onClick={() => setShowNotifs(s => !s)}
            aria-label="View notifications"
          >
            <BellIcon size={18} />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>

          {showNotifs && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <strong>Notifications & Alerts</strong>
                <span className="notif-count-pill">{notifications.length} alerts</span>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">No new alerts</div>
                ) : (
                  notifications.map((n, i) => (
                    <div key={i} className={`notif-item ${n.status === 'unread' ? 'unread' : ''}`}>
                      <div className="notif-title-row">
                        <strong>{n.title}</strong>
                        <span className="notif-time">{n.time || 'Recent'}</span>
                      </div>
                      <p className="notif-msg">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dark Mode Toggle */}
        <button
          className="icon-btn"
          onClick={onToggleDark}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>

        {/* Active User Pill */}
        <div className="user-profile-badge">
          <div className="user-avatar">{userName.charAt(0)}</div>
          <span className="user-name">{userName}</span>
        </div>
      </div>
    </header>
  );
}
