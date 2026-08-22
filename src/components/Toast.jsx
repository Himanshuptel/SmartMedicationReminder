import React, { useEffect, useState } from 'react';

export default function Toast({ message, type = 'success', onDismiss }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  return (
    <div className={`toast ${type} ${exiting ? 'exit' : ''}`} role="alert" aria-live="assertive">
      <span>{icon}</span>
      <span>{message}</span>
    </div>
  );
}
