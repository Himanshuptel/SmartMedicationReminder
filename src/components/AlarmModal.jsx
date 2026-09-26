import React, { useEffect, useState } from 'react';
import { BellIcon, CheckIcon, RepeatIcon, XIcon, PillIcon, Volume2Icon, VolumeXIcon } from './Icons';
import { playReminderChime, playSuccessChime } from '../services/sound';

export default function AlarmModal({ alarm, onTake, onSnooze, onSkip, onClose }) {
  const [soundMuted, setSoundMuted] = useState(false);

  useEffect(() => {
    if (!soundMuted) {
      playReminderChime();
      const interval = setInterval(() => {
        playReminderChime();
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [soundMuted]);

  if (!alarm) return null;

  return (
    <div className="modal-overlay alarm-overlay" role="dialog" aria-modal="true" aria-label="Medication Reminder Alarm">
      <div className="modal alarm-modal">
        <div className="alarm-header-visual">
          <div className="alarm-pulse-ring" />
          <div className="alarm-pulse-ring ring-2" />
          <div className="alarm-bell-icon">
            <BellIcon size={44} color="#ffffff" strokeWidth={2.2} />
          </div>
        </div>

        <div className="alarm-sound-control">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSoundMuted(m => !m)}
            aria-label={soundMuted ? 'Unmute chime' : 'Mute chime'}
          >
            {soundMuted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
            <span>{soundMuted ? 'Chime Muted' : 'Chime Active'}</span>
          </button>
        </div>

        <div className="alarm-body">
          <span className="alarm-badge">SCHEDULED MEDICATION ALERT</span>
          <h2 className="alarm-title">{alarm.medicineName || alarm.name}</h2>
          <div className="alarm-dosage-tag">
            <PillIcon size={16} />
            <strong>{alarm.dosage || '500 mg'}</strong>
            <span>•</span>
            <span>{alarm.scheduledTime || 'Scheduled Now'}</span>
          </div>

          <div className="alarm-instruction-box">
            <strong>Intake Instruction:</strong>
            <p>{alarm.instructions || 'Take with a glass of water after food.'}</p>
          </div>
        </div>

        <div className="alarm-actions-grid">
          <button
            type="button"
            className="btn btn-success btn-lg alarm-take-btn"
            onClick={() => {
              playSuccessChime();
              onTake(alarm);
            }}
          >
            <CheckIcon size={20} strokeWidth={2.5} />
            <span>Mark as Taken</span>
          </button>

          <div className="alarm-secondary-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onSnooze(alarm, 10)}
            >
              <RepeatIcon size={16} />
              <span>Snooze (10m)</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => onSkip(alarm)}
            >
              <XIcon size={16} />
              <span>Skip Dose</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
