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
import { api, getUserDisplayName, isDemoUser, saveSession, clearSession, getCookie } from './services/api';
import './index.css';

const SCREENS = {
  AUTH: 'auth',
  OTP: 'otp',
  MEDICINES: 'medicines',
  SUCCESS: 'success',
  DASHBOARD: 'dashboard'
};

export default function App() {
  const [authData, setAuthData] = useState(() => {
    try {
      const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null) || getCookie('medremind_token');
      const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_auth') : null) || getCookie('medremind_auth');
      if (token && stored) {
        return typeof stored === 'string' ? JSON.parse(stored) : stored;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [screen, setScreen] = useState(() => {
    try {
      const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null) || getCookie('medremind_token');
      const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_auth') : null) || getCookie('medremind_auth');
      return (token && stored) ? SCREENS.DASHBOARD : SCREENS.AUTH;
    } catch {
      return SCREENS.AUTH;
    }
  });

  const [savedMedicines, setSavedMedicines] = useState([]);
  const [currentRole, setCurrentRole] = useState(() => {
    try {
      const cookieRole = getCookie('medremind_role');
      if (cookieRole) return cookieRole;
      const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_auth') : null) || getCookie('medremind_auth');
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        return parsed?.data?.role || parsed?.user?.role || 'patient';
      }
    } catch {}
    return 'patient';
  });

  // Modals
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [systemDesignOpen, setSystemDesignOpen] = useState(false);

  // Notification Feed
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    const fetchNotifs = async () => {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null;
      if (!token) return;
      try {
        const res = await api.getNotifications();
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

  const handleDirectLogin = (verifiedUser, token, isNewRegistration = false) => {
    setSessionExpiredMessage('');
    const payload = {
      type: 'authenticated',
      data: verifiedUser,
      user: verifiedUser,
      token: token
    };
    setAuthData(payload);
    setCurrentRole(verifiedUser.role || 'patient');
    saveSession(verifiedUser, token);
    if (isNewRegistration) {
      setScreen(SCREENS.MEDICINES);
    } else {
      setScreen(SCREENS.DASHBOARD);
    }
  };

  const handleOtpVerified = (verifiedUser, token) => {
    handleDirectLogin(verifiedUser, token, authData?.type === 'signup');
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

  const handleSwitchToDemo = async () => {
    try {
      const res = await api.demoLogin('patient');
      handleDirectLogin(res.user, res.token, false);
    } catch {
      setScreen(SCREENS.AUTH);
    }
  };

  const handleRoleChange = async (newRole) => {
    setCurrentRole(newRole);
    try {
      if (isDemo || isDemoUser(authData)) {
        const res = await api.demoLogin(newRole);
        const payload = {
          type: 'authenticated',
          data: res.user,
          user: res.user,
          token: res.token
        };
        setAuthData(payload);
        saveSession(res.user, res.token);
      } else {
        const res = await api.switchRole(newRole);
        const updated = res.user || { ...(authData?.user || authData?.data), role: newRole };
        const token = authData?.token || (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null) || getCookie('medremind_token');
        const payload = {
          type: 'authenticated',
          data: updated,
          user: updated,
          token
        };
        setAuthData(payload);
        saveSession(updated, token);
      }
    } catch (err) {
      console.error('Error switching role:', err);
      setAuthData(prev => {
        if (!prev) return prev;
        const u = { ...(prev.user || prev.data), role: newRole };
        const updated = { ...prev, user: u, data: u };
        saveSession(u, prev.token || 'local_token');
        return updated;
      });
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    clearSession();
    setAuthData(null);
    setSessionExpiredMessage('');
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
        onRoleChange={handleRoleChange}
        onTriggerTestAlarm={() => handleTriggerTestAlarm()}
        onOpenSos={() => setSosOpen(true)}
        onOpenSystemDesign={() => setSystemDesignOpen(true)}
        notifications={notifications}
        userName={userName}
        isDemo={isDemo}
        isAuthenticated={!!(authData && (authData.token || authData.user) && screen === SCREENS.DASHBOARD)}
        currentScreen={screen}
        onOpenAuth={() => setScreen(s => s === SCREENS.AUTH ? SCREENS.DASHBOARD : SCREENS.AUTH)}
        onSwitchToDemo={handleSwitchToDemo}
        onLogout={handleLogout}
      />

      {screen === SCREENS.AUTH && (
        <AuthScreen
          onComplete={handleAuthComplete}
          onDirectLogin={handleDirectLogin}
          onSkipToDashboard={() => setScreen(SCREENS.DASHBOARD)}
          sessionExpiredMessage={sessionExpiredMessage}
          onClearSessionExpiredMessage={() => setSessionExpiredMessage('')}
        />
      )}

      {screen === SCREENS.OTP && (
        <OtpScreen
          authData={authData}
          onVerified={handleOtpVerified}
          onBack={() => setScreen(SCREENS.AUTH)}
        />
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
