import React from 'react';
import { SunIcon, MoonIcon } from './Icons';

export default function TopBar({ darkMode, onToggleDark }) {
  return (
    <header className="top-bar" role="banner">
      <a href="#" className="top-bar__logo" aria-label="MedRemind home">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="MedRemind"
          width={28}
          height={28}
          style={{ borderRadius: 6 }}
        />
        MedRemind
      </a>
      <div className="top-bar__actions">
        <button
          className="icon-btn"
          onClick={onToggleDark}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
      </div>
    </header>
  );
}
