import React from 'react';
import { CheckIcon } from './Icons';

const STEPS = ['Account', 'Verify', 'Medicines'];

export default function ProgressBar({ currentStep }) {
  return (
    <div className="progress-wrap" role="navigation" aria-label="Setup progress">
      <div className="progress-steps">
        {STEPS.map((label, idx) => {
          const n = idx + 1;
          const done   = n < currentStep;
          const active = n === currentStep;
          return (
            <React.Fragment key={n}>
              <div className="progress-step-item">
                <div
                  className={`step-node${done ? ' done' : active ? ' active' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  title={label}
                >
                  {done
                    ? <CheckIcon size={12} strokeWidth={2.5} />
                    : <span>{n}</span>
                  }
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`step-line${done ? ' done' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="progress-label">
        Step <strong>{currentStep}</strong> of {STEPS.length} — {STEPS[currentStep - 1]}
      </p>
    </div>
  );
}
