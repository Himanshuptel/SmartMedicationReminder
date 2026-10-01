import { useState, useEffect } from 'react';
import TopBar from './components/TopBar';
import AuthScreen from './screens/AuthScreen';
import OtpScreen from './screens/OtpScreen';
import MedicinesScreen from './screens/MedicinesScreen';
import SuccessScreen from './screens/SuccessScreen';
import DashboardScreen from './screens/DashboardScreen';
import AlarmModal from './components/AlarmModal';
import SosModal from './components/SosModal';
import SystemDesignModal from './components/SystemDesignModal';
import { api, getUserDisplayName, isDemoUser } from './services/api';
import './index.css';

const SCREENS = {
  AUTH: 'auth',
  OTP: 'otp',
  MEDICINES: 'medicines',
  SUCCESS: 'success',
  DASHBOARD: 'dashboard'
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.AUTH);
  const [authData, setAuthData] = useState(() => {
    try {
      const stored = localStorage.getItem('medremind_auth');
      return stored ? JSON.parse(stored) : { data: { fullName: 'Himanshu Patel', email: 'himanshu@paruluniversity.ac.in', role: 'patient' } };
    } catch {
      return { data: { fullName: 'Himanshu Patel', email: 'himanshu@paruluniversity.ac.in', role: 'patient' } };
    }
  });
  const [savedMedicines, setSavedMedicines] = useState([]);
  const [currentRole, setCurrentRole] = useState('patient');

  // Modals
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [systemDesignOpen, setSystemDesignOpen] = useState(false);

  // Notification Feed
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    const fetchNotifs = async () => {
      try {
        const res = await api.getNotifications(authData);
        if (mounted && res?.notifications) {
          setNotifications(res.notifications);
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, [authData]);

  // Dark mode — persisted in localStorage
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem('medremind-dark');
      if (stored !== null) return stored === 'true';
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    try { localStorage.setItem('medremind-dark', String(darkMode)); } catch {}
  }, [darkMode]);

  // Scroll to top on screen change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen]);

  // Backend Unreachable & Session Expiration State
  const [isBackendUnreachable, setIsBackendUnreachable] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  // Handle network reachability events
  useEffect(() => {
    const handleOffline = () => setIsBackendUnreachable(true);
    const handleOnline = () => setIsBackendUnreachable(false);

    window.addEventListener('medremind:backend-offline', handleOffline);
    window.addEventListener('medremind:backend-online', handleOnline);

    // Initial ping to verify backend status
    api.getConfig().then(() => setIsBackendUnreachable(false)).catch(() => setIsBackendUnreachable(true));

    return () => {
      window.removeEventListener('medremind:backend-offline', handleOffline);
      window.removeEventListener('medremind:backend-online', handleOnline);
    };
  }, []);

  const handleRetryBackend = async () => {
    try {
      await api.getConfig();
      setIsBackendUnreachable(false);
    } catch {
      setIsBackendUnreachable(true);
    }
  };

  // Handle session expiration redirect
  useEffect(() => {
    const handleExpired = (e) => {
      setAuthData(null);
      setSessionExpiredMessage('Your session has expired or is invalid. Please sign in again.');
      setScreen(SCREENS.AUTH);
    };
    window.addEventListener('medremind:session-expired', handleExpired);
    return () => window.removeEventListener('medremind:session-expired', handleExpired);
  }, []);

  const handleAuthComplete = (payload) => {
    setSessionExpiredMessage('');
    setAuthData(payload);
    setScreen(SCREENS.OTP);
  };

  const handleOtpVerified = (verifiedUser, token) => {
    const payload = {
      type: 'authenticated',
      data: verifiedUser,
      token: token
    };
    setAuthData(payload);
    try {
      localStorage.setItem('medremind_auth', JSON.stringify(payload));
      localStorage.setItem('medremind_token', token);
    } catch {}

    if (authData?.type === 'signup') {
      setScreen(SCREENS.MEDICINES);
    } else {
      setScreen(SCREENS.DASHBOARD);
    }
  };

  const handleMedicinesSaved = (medicines) => {
    setSavedMedicines(medicines);
    setScreen(SCREENS.SUCCESS);
  };

  const handleGoToDashboard = () => {
    setScreen(SCREENS.DASHBOARD);
  };

  // Alarm simulation trigger
  const handleTriggerTestAlarm = (customPayload) => {
    setActiveAlarm(customPayload || {
      name: 'Metformin',
      dosage: '500 mg',
      instructions: 'Take with a glass of water after dinner.',
      scheduledTime: 'Now'
    });
  };

  const handleAlarmTake = async (alarm) => {
    await api.recordAction({
      medicineName: alarm.name || alarm.medicineName,
      dosage: alarm.dosage,
      status: 'taken',
      notes: 'Confirmed via Alarm Alert'
    });
    setActiveAlarm(null);
  };

  const handleAlarmSnooze = async (alarm, minutes = 10) => {
    await api.recordAction({
      medicineName: alarm.name || alarm.medicineName,
      dosage: alarm.dosage,
      status: 'snoozed',
      notes: `Snoozed for ${minutes} minutes`
    });
    setActiveAlarm(null);
  };

  const handleAlarmSkip = async (alarm) => {
    await api.recordAction({
      medicineName: alarm.name || alarm.medicineName,
      dosage: alarm.dosage,
      status: 'missed',
      notes: 'Patient skipped dose during alarm'
    });
    setActiveAlarm(null);
  };

  const userName = getUserDisplayName(authData);
  const isDemo = isDemoUser(authData);

  const handleSwitchToDemo = () => {
    setScreen(SCREENS.AUTH);
  };

  const handleLogout = async () => {
    await api.logout();
    setAuthData(null);
    setScreen(SCREENS.AUTH);
  };

  return (
    <div className="app-shell">
      {/* Persistent Backend Unreachable Alert Banner */}
      {isBackendUnreachable && (
        <aside className="backend-offline-banner" role="alert" aria-live="assertive">
          <div className="offline-banner-content">
            <span className="offline-icon" aria-hidden="true">⚠️</span>
            <div>
              <strong>Backend Server Unreachable</strong>
              <p>Unable to connect to Flask API server at <code>/api</code>. Please ensure the Python backend is running.</p>
            </div>
            <button
              type="button"
              className="btn-offline-retry"
              onClick={handleRetryBackend}
            >
              Retry Connection
            </button>
          </div>
        </aside>
      )}

      <TopBar
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        onTriggerTestAlarm={() => handleTriggerTestAlarm()}
        onOpenSos={() => setSosOpen(true)}
        onOpenSystemDesign={() => setSystemDesignOpen(true)}
        notifications={notifications}
        userName={userName}
        isDemo={isDemo}
        currentScreen={screen}
        onOpenAuth={() => setScreen(s => s === SCREENS.AUTH ? SCREENS.DASHBOARD : SCREENS.AUTH)}
        onSwitchToDemo={handleSwitchToDemo}
        onLogout={handleLogout}
      />

      {/* Mode navigation bar if user wants to switch between Onboarding Flow and Dashboard */}
      <div className="system-banner-strip">
        <span className="banner-tag">PROJECT SYSTEM</span>
        <span>Smart Medication Reminder • Parul University (Guide: Prof. Sathwik Chebrolu)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {screen === SCREENS.DASHBOARD ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-primary"
              onClick={() => setScreen(SCREENS.AUTH)}
            >
              Restart Onboarding Flow
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-primary"
              onClick={() => setScreen(SCREENS.DASHBOARD)}
            >
              Back to Main Dashboard
            </button>
          )}
        </div>
      </div>

      {screen === SCREENS.AUTH && (
        <AuthScreen
          onComplete={handleAuthComplete}
          onSkipToDashboard={() => setScreen(SCREENS.DASHBOARD)}
          sessionExpiredMessage={sessionExpiredMessage}
          onClearSessionExpiredMessage={() => setSessionExpiredMessage('')}
        />
      )}

      {screen === SCREENS.OTP && (
        <OtpScreen authData={authData} onVerified={handleOtpVerified} />
      )}

      {screen === SCREENS.MEDICINES && (
        <MedicinesScreen authData={authData} onComplete={handleMedicinesSaved} />
      )}

      {screen === SCREENS.SUCCESS && (
        <SuccessScreen
          medicines={savedMedicines}
          authData={authData}
          onGoToDashboard={handleGoToDashboard}
        />
      )}

      {screen === SCREENS.DASHBOARD && (
        <DashboardScreen
          authData={authData}
          currentRole={currentRole}
          onOpenSos={() => setSosOpen(true)}
          onTriggerAlarm={handleTriggerTestAlarm}
        />
      )}

      {/* Global Live Alarm Modal */}
      {activeAlarm && (
        <AlarmModal
          alarm={activeAlarm}
          onTake={handleAlarmTake}
          onSnooze={handleAlarmSnooze}
          onSkip={handleAlarmSkip}
          onClose={() => setActiveAlarm(null)}
        />
      )}

      {/* Global SOS Emergency Modal */}
      {sosOpen && (
        <SosModal onClose={() => setSosOpen(false)} />
      )}

      {/* Global System Design Architecture Viewer Modal */}
      {systemDesignOpen && (
        <SystemDesignModal onClose={() => setSystemDesignOpen(false)} />
      )}
    </div>
  );
}
