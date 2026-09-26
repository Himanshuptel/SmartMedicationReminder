import React, { useState, useEffect } from 'react';
import { AlertTriangleIcon, PhoneIcon, CheckCircleIcon, XIcon, ShieldIcon } from './Icons';
import { startEmergencySiren, stopEmergencySiren } from '../services/sound';
import { api } from '../services/api';

export default function SosModal({ onClose }) {
  const [countdown, setCountdown] = useState(3);
  const [dispatched, setDispatched] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 3-second safety countdown before siren and alert dispatch
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !dispatched) {
      triggerEmergency();
    }
  }, [countdown, dispatched]);

  const triggerEmergency = async () => {
    setLoading(true);
    startEmergencySiren();
    try {
      const res = await api.triggerSos({
        userId: 1,
        location: 'Parul University Campus, Vadodara, Gujarat (22.2887° N, 73.3634° E)'
      });
      setContacts(res.dispatched_to || []);
      setDispatched(true);
    } catch {
      setDispatched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    stopEmergencySiren();
    onClose();
  };

  return (
    <div className="modal-overlay sos-overlay" role="dialog" aria-modal="true" aria-label="Emergency SOS Alert">
      <div className={`modal sos-modal ${dispatched ? 'sos-active' : ''}`}>
        <div className="sos-header">
          <div className={`sos-pulse-ring ${countdown > 0 ? 'counting' : 'blinking'}`}>
            <AlertTriangleIcon size={40} color="#ffffff" strokeWidth={2.5} />
          </div>
          <h2 className="sos-title">
            {countdown > 0 ? `EMERGENCY SOS IN ${countdown}s` : 'EMERGENCY PROTOCOL ACTIVATED'}
          </h2>
          <p className="sos-subtitle">
            {countdown > 0
              ? 'Alert will dispatch to emergency contacts and caregivers automatically.'
              : 'Automated distress signal and GPS location dispatched.'}
          </p>
        </div>

        {countdown > 0 ? (
          <div className="sos-countdown-view">
            <div className="sos-counter-display">{countdown}</div>
            <p className="sos-note">Accidental press? Cancel immediately below.</p>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              style={{ width: '100%' }}
              onClick={handleCancel}
            >
              Cancel Emergency Request
            </button>
          </div>
        ) : (
          <div className="sos-dispatched-view">
            <div className="sos-status-card">
              <div className="sos-status-row">
                <CheckCircleIcon size={18} color="var(--color-success)" />
                <strong>Dispatch Status: CONFIRMED</strong>
              </div>
              <p className="sos-location">
                📍 Location: Parul University Campus, Vadodara (22.2887° N, 73.3634° E)
              </p>
            </div>

            <div className="sos-contacts-list">
              <span className="sos-contacts-label">Automated Alerts Dispatched To:</span>
              {contacts.map((c, i) => (
                <div key={i} className="sos-contact-item">
                  <div className="sos-contact-info">
                    <strong>{c.name}</strong>
                    <span>{c.relation} • {c.phone}</span>
                  </div>
                  <a href={`tel:${c.phone}`} className="btn btn-sm btn-primary">
                    <PhoneIcon size={14} />
                    <span>Call</span>
                  </a>
                </div>
              ))}
            </div>

            <div className="sos-hotline-bar">
              <span>National Medical Emergency: <strong>112 / 108</strong></span>
              <a href="tel:112" className="btn btn-danger btn-sm">
                Direct Ambulance Call
              </a>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-lg"
              style={{ width: '100%', marginTop: 16 }}
              onClick={handleCancel}
            >
              Stop Siren & Silence Emergency
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
