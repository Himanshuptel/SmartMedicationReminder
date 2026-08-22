import React, { useEffect, useState } from 'react';
import { CheckCircleIcon, AlertCircleIcon } from './Icons';

export default function Toast({ message, type = 'success', onDismiss }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 280);
    }, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const Icon = type === 'success' ? CheckCircleIcon : AlertCircleIcon;

  return (
    <div
      className={`toast toast-${type}${exiting ? ' exit' : ''}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="toast-icon">
        <Icon size={15} strokeWidth={2} />
      </span>
      <span>{message}</span>
    </div>
  );
}
