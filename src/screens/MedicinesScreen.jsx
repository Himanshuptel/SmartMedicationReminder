import React, { useState, useRef, useCallback } from 'react';
import ProgressBar from '../components/ProgressBar';
import Toast from '../components/Toast';

const FREQUENCIES = [
  { value: 'once', label: 'Once daily' },
  { value: 'twice', label: 'Twice daily' },
  { value: 'thrice', label: 'Thrice daily' },
  { value: 'custom', label: 'Custom' },
];

const DOSAGE_UNITS = ['mg', 'ml', 'mcg', 'g', 'IU', 'tablet(s)', 'capsule(s)', 'drops'];

function createEmptyMed() {
  return {
    id: Date.now() + Math.random(),
    name: '',
    dosageAmount: '',
    dosageUnit: 'mg',
    frequency: '',
    startDate: '',
    imagePreview: null,
    imageFile: null,
    errors: {},
  };
}

function BarcodeModal({ onClose, onCapture }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Barcode Scanner">
      <div className="modal">
        <p className="modal-title">📷 Scan Barcode / QR</p>
        <p className="modal-sub">Point your camera at the medicine barcode or QR code.</p>
        <div className="camera-placeholder" aria-label="Camera viewfinder">
          <div className="camera-crosshair" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-outline btn-sm"
            style={{ flex: 1 }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={() => {
              onCapture('MED-8834-XYZ');
              onClose();
            }}
          >
            ✅ Simulate Scan
          </button>
        </div>
      </div>
    </div>
  );
}

function MedicineEntry({ med, idx, onChange, onRemove, canRemove, onScanOpen }) {
  const fileInputRef = useRef();

  const update = (field, value) => {
    onChange(med.id, { ...med, [field]: value, errors: { ...med.errors, [field]: '' } });
  };

  const handleImage = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      onChange(med.id, { ...med, imageFile: file, imagePreview: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="med-entry" role="group" aria-label={`Medicine ${idx + 1}`}>
      <div className="med-entry-header">
        <span className="med-entry-title">
          💊 Medicine <span className="badge">#{idx + 1}</span>
        </span>
        {canRemove && (
          <button
            type="button"
            className="remove-btn"
            onClick={() => onRemove(med.id)}
            aria-label={`Remove medicine ${idx + 1}`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Medicine Name */}
      <div className="form-group">
        <label htmlFor={`med-name-${med.id}`} className="form-label">
          Medicine Name <span className="required">*</span>
        </label>
        <div className="input-wrapper">
          <span className="input-icon">💊</span>
          <input
            id={`med-name-${med.id}`}
            type="text"
            className={`form-input${med.errors.name ? ' error' : ''}`}
            placeholder="e.g. Metformin, Aspirin…"
            value={med.name}
            onChange={e => update('name', e.target.value)}
            aria-invalid={!!med.errors.name}
          />
        </div>
        {med.errors.name && <p className="field-error">⚠ {med.errors.name}</p>}
      </div>

      {/* Dosage + Frequency row */}
      <div className="med-row">
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor={`med-dose-${med.id}`} className="form-label">
            Dosage <span className="required">*</span>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="input-wrapper" style={{ flex: 1 }}>
              <span className="input-icon">⚖️</span>
              <input
                id={`med-dose-${med.id}`}
                type="number"
                min="0"
                step="any"
                className={`form-input${med.errors.dosageAmount ? ' error' : ''}`}
                placeholder="500"
                value={med.dosageAmount}
                onChange={e => update('dosageAmount', e.target.value)}
                aria-invalid={!!med.errors.dosageAmount}
              />
            </div>
            <select
              className="form-input no-icon"
              style={{ width: 90, flexShrink: 0, paddingLeft: 12 }}
              value={med.dosageUnit}
              onChange={e => update('dosageUnit', e.target.value)}
              aria-label="Dosage unit"
            >
              {DOSAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {med.errors.dosageAmount && <p className="field-error">⚠ {med.errors.dosageAmount}</p>}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor={`med-freq-${med.id}`} className="form-label">
            Frequency <span className="required">*</span>
          </label>
          <div className="input-wrapper">
            <span className="input-icon">🔁</span>
            <select
              id={`med-freq-${med.id}`}
              className={`form-input${med.errors.frequency ? ' error' : ''}`}
              value={med.frequency}
              onChange={e => update('frequency', e.target.value)}
              aria-invalid={!!med.errors.frequency}
            >
              <option value="">Select…</option>
              {FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {med.errors.frequency && <p className="field-error">⚠ {med.errors.frequency}</p>}
        </div>
      </div>

      {/* Start Date */}
      <div className="form-group" style={{ marginTop: 12 }}>
        <label htmlFor={`med-date-${med.id}`} className="form-label">
          Start Date <span className="required">*</span>
        </label>
        <div className="input-wrapper">
          <span className="input-icon">📅</span>
          <input
            id={`med-date-${med.id}`}
            type="date"
            className={`form-input${med.errors.startDate ? ' error' : ''}`}
            value={med.startDate}
            min={today}
            onChange={e => update('startDate', e.target.value)}
            aria-invalid={!!med.errors.startDate}
          />
        </div>
        {med.errors.startDate && <p className="field-error">⚠ {med.errors.startDate}</p>}
      </div>

      {/* Image + Scan row */}
      <div className="med-row" style={{ marginTop: 4 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Medicine Image</label>
          <div className="image-upload-box" onClick={() => fileInputRef.current?.click()} aria-label="Upload medicine image">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImage}
              aria-hidden="true"
            />
            {med.imagePreview ? (
              <img src={med.imagePreview} alt="Medicine preview" className="image-preview" />
            ) : (
              <div className="image-upload-placeholder">
                <span className="up-icon">📷</span>
                <span>Upload photo</span>
              </div>
            )}
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Scan Barcode</label>
          <button
            type="button"
            className="scan-btn"
            onClick={() => onScanOpen(med.id)}
            aria-label="Open barcode scanner"
            style={{ height: '90px' }}
          >
            <span style={{ fontSize: '1.6rem' }}>🔍</span>
            <span>Scan Barcode<br />or QR Code</span>
          </button>
          {med.scannedCode && (
            <p style={{ fontSize: '.75rem', color: 'var(--primary)', marginTop: 4, textAlign: 'center' }}>
              ✅ {med.scannedCode}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MedicinesScreen({ authData, onComplete }) {
  const [medicines, setMedicines] = useState([createEmptyMed()]);
  const [scanTarget, setScanTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  };

  const handleChange = useCallback((id, updated) => {
    setMedicines(ms => ms.map(m => m.id === id ? updated : m));
  }, []);

  const handleRemove = id => {
    setMedicines(ms => ms.filter(m => m.id !== id));
  };

  const handleAddMore = () => {
    setMedicines(ms => [...ms, createEmptyMed()]);
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const validateAll = () => {
    let valid = true;
    const updated = medicines.map(med => {
      const errors = {};
      if (!med.name.trim()) { errors.name = 'Medicine name is required.'; valid = false; }
      if (!med.dosageAmount) { errors.dosageAmount = 'Dosage is required.'; valid = false; }
      if (!med.frequency) { errors.frequency = 'Please select a frequency.'; valid = false; }
      if (!med.startDate) { errors.startDate = 'Start date is required.'; valid = false; }
      return { ...med, errors };
    });
    setMedicines(updated);
    return valid;
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!validateAll()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1000));
    setSubmitting(false);

    const payload = medicines.map(m => ({
      name: m.name,
      dosage: `${m.dosageAmount} ${m.dosageUnit}`,
      frequency: FREQUENCIES.find(f => f.value === m.frequency)?.label,
      startDate: m.startDate,
      hasImage: !!m.imagePreview,
      scannedCode: m.scannedCode || null,
    }));

    console.log('💊 Medicines saved:', JSON.stringify(payload, null, 2));
    console.log('👤 User data:', authData?.data);

    showToast(`✅ ${payload.length} medicine${payload.length > 1 ? 's' : ''} saved successfully!`, 'success');
    setTimeout(() => onComplete(payload), 1200);
  };

  const handleScanCapture = (code) => {
    if (!scanTarget) return;
    setMedicines(ms => ms.map(m =>
      m.id === scanTarget ? { ...m, scannedCode: code } : m
    ));
    showToast('Barcode scanned: ' + code, 'success');
  };

  return (
    <main className="page" id="medicines-screen">
      <div className="card card-wide">
        <ProgressBar currentStep={3} />

        {/* ── Logo strip ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: 'center', marginBottom: 24,
        }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={40} height={40}
            style={{ borderRadius: 10, boxShadow: '0 2px 10px rgba(20,184,166,.2)' }} />
          <span style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text-primary)' }}>
            Smart Medication Reminder
          </span>
        </div>

        <h1 className="card-title">Add your medicines</h1>
        <p className="card-subtitle">
          Enter details for each medication you take. You can add multiple medicines below.
        </p>

        <form onSubmit={handleSave} noValidate aria-label="Add medicines form">
          <div className="med-list">
            {medicines.map((med, idx) => (
              <MedicineEntry
                key={med.id}
                med={med}
                idx={idx}
                onChange={handleChange}
                onRemove={handleRemove}
                canRemove={medicines.length > 1}
                onScanOpen={(id) => setScanTarget(id)}
              />
            ))}
          </div>

          <button
            type="button"
            className="add-more-btn"
            onClick={handleAddMore}
            id="add-more-medicine"
          >
            ＋ Add another medicine
          </button>

          <button
            id="save-medicines"
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Saving…
              </>
            ) : (
              '💾 Save & Continue →'
            )}
          </button>
        </form>
      </div>

      {scanTarget && (
        <BarcodeModal
          onClose={() => setScanTarget(null)}
          onCapture={handleScanCapture}
        />
      )}

      {toast && (
        <div className="toast-container">
          <Toast
            key={toast.key}
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
