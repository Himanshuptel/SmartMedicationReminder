import React from 'react';

const STEPS = [
  { label: 'Account' },
  { label: 'Verify OTP' },
  { label: 'Add Medicines' },
];

export default function ProgressBar({ currentStep }) {
  return (
    <div className="progress-wrap" role="navigation" aria-label="Setup progress">
      <div className="progress-steps">
        {STEPS.map((step, idx) => {
          const stepNum = idx + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <React.Fragment key={stepNum}>
              <div className="progress-step">
                <div
                  className={`step-dot ${isDone ? 'done' : isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                  title={step.label}
                >
                  {isDone ? '✓' : stepNum}
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`step-connector ${isDone ? 'done' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="progress-label">
        Step <strong>{currentStep}</strong> of {STEPS.length} — {STEPS[currentStep - 1]?.label}
      </p>
    </div>
  );
}
