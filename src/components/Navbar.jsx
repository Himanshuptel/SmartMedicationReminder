export default function Navbar({ darkMode, onToggleDark }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="brand-icon">💊</div>
        <span>MedRemind</span>
      </div>
      <button
        className="dark-toggle"
        onClick={onToggleDark}
        aria-label="Toggle dark mode"
        id="dark-mode-toggle"
      >
        <span>{darkMode ? '☀️' : '🌙'}</span>
        <span>{darkMode ? 'Light' : 'Dark'}</span>
      </button>
    </nav>
  );
}
