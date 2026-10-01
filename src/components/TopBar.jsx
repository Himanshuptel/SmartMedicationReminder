import React, { useState, useRef, useEffect } from 'react';
import {
  SunIcon, MoonIcon, ShieldIcon, UsersIcon, StethoscopeIcon,
  BellIcon, AlertTriangleIcon, DiagramIcon, CheckIcon, PillIcon, LogOutIcon
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
  userName = 'Himanshu Patel',
  currentScreen,
  onOpenAuth,
  onSwitchToDemo,
  onLogout,
  isDemo,
  isAuthenticated
}) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifs(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    if (showNotifs || showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifs, showProfileMenu]);

  const isAuthScreen = currentScreen === 'auth' || currentScreen === 'otp' || !isAuthenticated;

  if (isAuthScreen) {
    return (
      <header className="top-bar auth-top-bar" role="banner">
        <div className="top-bar__left">
          <div className="top-bar__logo" aria-label="MedRemind home">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="MedRemind"
              width={30}
              height={30}
              style={{ borderRadius: 8 }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <span className="logo-text">MedRemind</span>
          </div>
          <span className="auth-brand-tag">Clinical Portal</span>
        </div>

        <div className="top-bar__right">
          <button
            type="button"
            className="btn btn-ghost btn-sm system-design-btn"
            onClick={onOpenSystemDesign}
            title="View system design & architecture specifications"
          >
            <DiagramIcon size={14} />
            <span>Architecture & Specs</span>
          </button>

          <button
            className="icon-btn"
            onClick={onToggleDark}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
        </div>
      </header>
    );
  }

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

        {/* If Faculty Demo Mode: show role switcher with label. Otherwise, show strictly locked role badge! */}
        {isDemo ? (
          <div className="role-switcher" role="group" aria-label="Faculty demo role switcher">
            <span className="demo-label">
              Demo:
            </span>
            <button
              type="button"
              className={`role-btn ${currentRole === 'patient' ? 'active' : ''}`}
              onClick={() => onRoleChange('patient')}
              title="Switch to Patient View"
            >
              <ShieldIcon size={14} />
              <span className="role-btn-text">Patient</span>
            </button>
            <button
              type="button"
              className={`role-btn ${currentRole === 'caregiver' ? 'active' : ''}`}
              onClick={() => onRoleChange('caregiver')}
              title="Switch to Caregiver Portal"
            >
              <UsersIcon size={14} />
              <span className="role-btn-text">Caregiver</span>
            </button>
            <button
              type="button"
              className={`role-btn ${currentRole === 'clinician' ? 'active' : ''}`}
              onClick={() => onRoleChange('clinician')}
              title="Switch to Clinician Portal"
            >
              <StethoscopeIcon size={14} />
              <span className="role-btn-text">Clinician</span>
            </button>
          </div>
        ) : (
          <div className="role-locked-badge">
            {currentRole === 'clinician' && <><StethoscopeIcon size={14} color="var(--color-primary)" /><span className="role-badge-text">Clinician Workstation</span></>}
            {currentRole === 'caregiver' && <><UsersIcon size={14} color="var(--color-accent)" /><span className="role-badge-text">Caregiver Station</span></>}
            {currentRole === 'patient' && <><ShieldIcon size={14} color="var(--color-primary)" /><span className="role-badge-text">Patient Portal</span></>}
          </div>
        )}
      </div>

      <div className="top-bar__actions">
        {/* Test Alarm Simulator Button (Patient Only) */}
        {currentRole === 'patient' && (
          <button
            type="button"
            className="btn btn-outline-primary btn-sm test-alarm-btn"
            onClick={onTriggerTestAlarm}
            title="Simulate live reminder chime and ringing alarm"
          >
            <BellIcon size={14} />
            <span>Test Alarm</span>
          </button>
        )}

        {/* System Design Architecture Button */}
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm system-design-btn"
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

        {/* Notifications Dropdown with Outside-Click Handler */}
        <div className="notif-wrapper" ref={notifRef}>
          <button
            type="button"
            className={`icon-btn notif-btn ${showNotifs ? 'active' : ''}`}
            onClick={() => setShowNotifs(s => !s)}
            aria-label="View notifications"
            aria-expanded={showNotifs}
            title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'View notifications'}
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

        {/* Demo Account Switcher Button */}
        {!isDemo ? (
          <button
            type="button"
            className="btn btn-outline-primary btn-xs demo-switch-topbar-btn"
            onClick={onSwitchToDemo}
            title="Switch to Demo Account with full pre-loaded medications"
          >
            <span>Switch to Demo (Himanshu)</span>
          </button>
        ) : (
          <span className="badge demo-badge" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontSize: '0.7rem', padding: '3px 8px' }}>
            Demo Account
          </span>
        )}

        {/* Active User Pill with Interactive Profile & Logout Dropdown */}
        <div className="profile-menu-wrapper" ref={profileRef}>
          <button
            type="button"
            className="user-profile-badge"
            onClick={() => setShowProfileMenu(s => !s)}
            aria-expanded={showProfileMenu}
            aria-label="User account and profile menu"
            title={`${userName} (${currentRole}) — Tap for account options & logout`}
          >
            <div className="user-avatar">{userName.charAt(0).toUpperCase()}</div>
            <span className="user-name">{userName}</span>
          </button>

          {showProfileMenu && (
            <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-user">
                <div className="user-avatar profile-avatar-lg">{userName.charAt(0).toUpperCase()}</div>
                <div className="profile-user-info">
                  <strong className="profile-user-name">{userName}</strong>
                  <span className="profile-user-role">{currentRole.toUpperCase()}</span>
                </div>
              </div>

              <div className="profile-dropdown-divider" />

              {!isDemo ? (
                <button
                  type="button"
                  className="profile-menu-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onSwitchToDemo();
                  }}
                >
                  <UsersIcon size={16} />
                  <span>Switch to Demo Account</span>
                </button>
              ) : null}

              <button
                type="button"
                className="profile-menu-item"
                onClick={() => {
                  setShowProfileMenu(false);
                  onOpenSystemDesign();
                }}
              >
                <DiagramIcon size={16} />
                <span>Architecture Specs</span>
              </button>

              <div className="profile-dropdown-divider" />

              <button
                type="button"
                className="profile-menu-item profile-logout-item text-danger"
                onClick={() => {
                  setShowProfileMenu(false);
                  onLogout();
                }}
              >
                <LogOutIcon size={16} color="var(--color-error)" />
                <strong>Log Out</strong>
              </button>
            </div>
          )}
        </div>

        {/* Explicit Logout Button for Desktop */}
        <button
          type="button"
          className="btn btn-ghost btn-xs text-danger logout-topbar-btn"
          onClick={onLogout}
          title="Log out and return to Login screen"
          style={{ fontWeight: 600 }}
        >
          <LogOutIcon size={13} color="currentColor" />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
}
