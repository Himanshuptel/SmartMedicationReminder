import { useState, useEffect } from 'react';
import TopBar from './components/TopBar';
import AuthScreen from './screens/AuthScreen';
import OtpScreen from './screens/OtpScreen';
import MedicinesScreen from './screens/MedicinesScreen';
import SuccessScreen from './screens/SuccessScreen';
import './index.css';

const SCREENS = {
  AUTH: 'auth',
  OTP: 'otp',
  MEDICINES: 'medicines',
  SUCCESS: 'success',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.AUTH);
  const [authData, setAuthData] = useState(null);
  const [savedMedicines, setSavedMedicines] = useState([]);

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

  const handleAuthComplete = (payload) => {
    setAuthData(payload);
    setScreen(SCREENS.OTP);
  };

  const handleOtpVerified = () => {
    setScreen(SCREENS.MEDICINES);
  };

  const handleMedicinesSaved = (medicines) => {
    setSavedMedicines(medicines);
    setScreen(SCREENS.SUCCESS);
  };

  return (
    <div className="app-shell">
      <TopBar darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />

      {screen === SCREENS.AUTH && (
        <AuthScreen onComplete={handleAuthComplete} />
      )}

      {screen === SCREENS.OTP && (
        <OtpScreen authData={authData} onVerified={handleOtpVerified} />
      )}

      {screen === SCREENS.MEDICINES && (
        <MedicinesScreen authData={authData} onComplete={handleMedicinesSaved} />
      )}

      {screen === SCREENS.SUCCESS && (
        <SuccessScreen medicines={savedMedicines} authData={authData} />
      )}
    </div>
  );
}
