export default function ProgressIndicator({ steps, currentStep }) {
  return (
    <div className="progress-bar-container">
      <div className="progress-steps">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={index} className="step-item">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className={`step-circle ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  {isCompleted ? '✓' : stepNum}
                </div>
                <div className={`step-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  {step.label}
                </div>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={`step-connector ${isCompleted ? 'completed' : ''}`}
                  style={{ marginBottom: 16 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="progress-text">
        Step {currentStep} of {steps.length} — {steps[currentStep - 1]?.label}
      </p>
    </div>
  );
}
