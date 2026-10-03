import React, { useState, useRef, useCallback } from 'react';
import ProgressBar from '../components/ProgressBar';
import Toast from '../components/Toast';
import { api, getUserKey } from '../services/api';
import {
  PillIcon, ScaleIcon, RepeatIcon, CalendarIcon, UploadIcon,
  ScanIcon, PlusIcon, XIcon, CheckCircleIcon, ArrowRightIcon,
  AlertCircleIcon, CameraIcon
} from '../components/Icons';

const FREQUENCIES = [
  { value: 'once', label: 'Once daily' },
  { value: 'twice', label: 'Twice daily' },
  { value: 'thrice', label: 'Thrice daily' },
  { value: 'custom', label: 'Custom schedule' },
];

const DOSAGE_UNITS = ['mg', 'ml', 'mcg', 'g', 'IU', 'tablets', 'capsules', 'drops'];

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
    scannedCode: null,
    errors: {},
  };
}

function BarcodeModal({ onClose, onCapture }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Barcode Scanner">
      <div className="modal">
        <h3 className="modal-title">Scan Barcode / QR</h3>
        <p className="modal-sub">Position the medication barcode within the frame to scan.</p>
        <div className="camera-view" aria-label="Camera viewfinder">
          <div className="camera-frame">
            <div className="camera-corners" />
            <div className="scan-line" />
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ flex: 1 }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={() => {
              onCapture('MED-8834-XYZ');
              onClose();
            }}
          >
            <CameraIcon size={14} />
            <span>Simulate Scan</span>
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
    <div className="med-card" role="group" aria-label={`Medicine ${idx + 1}`}>
      <div className="med-card-header">
        <div className="med-card-label">
          <PillIcon size={16} color="var(--color-primary)" />
          <span>Medicine Entry</span>
          <span className="med-badge">#{idx + 1}</span>
        </div>
        {canRemove && (
          <button
            type="button"
            className="remove-btn"
            onClick={() => onRemove(med.id)}
            aria-label={`Remove medicine ${idx + 1}`}
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* Medicine Name */}
      <div className="form-group">
        <label htmlFor={`med-name-${med.id}`} className="form-label">
          Medicine Name <span className="required-dot" />
        </label>
        <div className="field">
          <span className="field-icon"><PillIcon size={18} /></span>
          <input
            id={`med-name-${med.id}`}
            type="text"
            className={`form-input${med.errors.name ? ' input-error' : ''}`}
            placeholder="e.g. Metformin, Amoxicillin..."
            value={med.name}
            onChange={e => update('name', e.target.value)}
            aria-invalid={!!med.errors.name}
          />
        </div>
        {med.errors.name && (
          <p className="field-error"><AlertCircleIcon size={14} /><span>{med.errors.name}</span></p>
        )}
      </div>

      {/* Dosage + Frequency row */}
      <div className="med-row">
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor={`med-dose-${med.id}`} className="form-label">
            Dosage <span className="required-dot" />
          </label>
          <div className="dosage-row">
            <div className="field">
              <span className="field-icon"><ScaleIcon size={18} /></span>
              <input
                id={`med-dose-${med.id}`}
                type="number"
                min="0"
                step="any"
                className={`form-input${med.errors.dosageAmount ? ' input-error' : ''}`}
                placeholder="500"
                value={med.dosageAmount}
                onChange={e => update('dosageAmount', e.target.value)}
                aria-invalid={!!med.errors.dosageAmount}
              />
            </div>
            <select
              className="dosage-unit-select"
              value={med.dosageUnit}
              onChange={e => update('dosageUnit', e.target.value)}
              aria-label="Dosage unit"
            >
              {DOSAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {med.errors.dosageAmount && (
            <p className="field-error"><AlertCircleIcon size={14} /><span>{med.errors.dosageAmount}</span></p>
          )}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor={`med-freq-${med.id}`} className="form-label">
            Frequency <span className="required-dot" />
          </label>
          <div className="field">
            <span className="field-icon"><RepeatIcon size={18} /></span>
            <select
              id={`med-freq-${med.id}`}
              className={`form-input${med.errors.frequency ? ' input-error' : ''}`}
              value={med.frequency}
              onChange={e => update('frequency', e.target.value)}
              aria-invalid={!!med.errors.frequency}
            >
              <option value="">Select frequency...</option>
              {FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {med.errors.frequency && (
            <p className="field-error"><AlertCircleIcon size={14} /><span>{med.errors.frequency}</span></p>
          )}
        </div>
      </div>

      {/* Start Date */}
      <div className="form-group" style={{ marginTop: 16 }}>
        <label htmlFor={`med-date-${med.id}`} className="form-label">
          Start Date <span className="required-dot" />
        </label>
        <div className="field">
          <span className="field-icon"><CalendarIcon size={18} /></span>
          <input
            id={`med-date-${med.id}`}
            type="date"
            className={`form-input${med.errors.startDate ? ' input-error' : ''}`}
            value={med.startDate}
            min={today}
            onChange={e => update('startDate', e.target.value)}
            aria-invalid={!!med.errors.startDate}
          />
        </div>
        {med.errors.startDate && (
          <p className="field-error"><AlertCircleIcon size={14} /><span>{med.errors.startDate}</span></p>
        )}
      </div>

      {/* Upload & Scan row */}
      <div className="med-row" style={{ marginTop: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Medicine Photo</label>
          <div
            className="upload-box"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload medicine image"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImage}
              aria-hidden="true"
            />
            {med.imagePreview ? (
              <img src={med.imagePreview} alt="Medicine preview" className="upload-preview" />
            ) : (
              <div className="upload-placeholder">
                <UploadIcon size={20} />
                <span>Upload image</span>
              </div>
            )}
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Barcode Scanner</label>
          <button
            type="button"
            className="scan-btn"
            onClick={() => onScanOpen(med.id)}
            aria-label="Open barcode scanner"
          >
            <ScanIcon size={20} />
            <span>Scan Barcode / QR</span>
          </button>
          {med.scannedCode && (
            <p className="scan-code-result">
              <CheckCircleIcon size={12} />
              <span>{med.scannedCode}</span>
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
      showToast('Please complete all required fields.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = [];
      for (const m of medicines) {
        await api.addMedicine({
          name: m.name,
          dosageAmount: m.dosageAmount,
          dosageUnit: m.dosageUnit,
          frequency: m.frequency,
          mealTiming: 'after_food',
          startDate: m.startDate,
          instructions: '',
          barcode: m.scannedCode || undefined
        }, getUserKey(authData), authData);

        payload.push({
          name: m.name,
          dosage: `${m.dosageAmount} ${m.dosageUnit}`,
          frequency: FREQUENCIES.find(f => f.value === m.frequency)?.label,
          startDate: m.startDate,
          hasImage: !!m.imagePreview,
          scannedCode: m.scannedCode || null,
        });
      }

      setSubmitting(false);
      showToast(`${payload.length} medicine${payload.length > 1 ? 's' : ''} saved successfully to database.`, 'success');
      setTimeout(() => onComplete(payload), 800);
    } catch (err) {
      setSubmitting(false);
      showToast(err.message || 'Failed to save medicines to backend database.', 'error');
    }
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

        <div className="logo-strip">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width={32}
            height={32}
          />
          <span className="logo-strip__name">Smart Medication Reminder</span>
        </div>

        <h1 className="screen-title">Add your medicines</h1>
        <p className="screen-subtitle">
          Enter your current medications to configure reminders and scheduling.
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

          <div className="med-form-actions">
            <button
              type="button"
              className="add-more-btn"
              onClick={handleAddMore}
              id="add-more-medicine"
            >
              <PlusIcon size={16} />
              <span>Add another medicine</span>
            </button>

            <button
              id="save-medicines"
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" />
                  <span>Saving entries...</span>
                </>
              ) : (
                <>
                  <span>Save &amp; Continue</span>
                  <ArrowRightIcon size={16} />
                </>
              )}
            </button>
          </div>
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
    </main>
  );
}
