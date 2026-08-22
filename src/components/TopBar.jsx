import React from 'react';

export default function TopBar({ darkMode, onToggleDark }) {
  return (
    <header className="top-bar" role="banner">
      <a href="#" className="top-bar__logo" aria-label="MedRemind Home">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="MedRemind logo"
          width="36"
          height="36"
          style={{ borderRadius: 8, flexShrink: 0 }}
        />
        MedRemind
      </a>
      <button
        className="dark-toggle"
        onClick={onToggleDark}
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        title={darkMode ? 'Light mode' : 'Dark mode'}
      >
        {darkMode ? '☀️' : '🌙'}
      </button>
    </header>
  );
}
