import { useState, useRef } from 'react';
import ScannerModal from '../components/ScannerModal';

const FREQUENCIES = [
  { value: 'once', label: 'Once daily' },
  { value: 'twice', label: 'Twice daily' },
  { value: 'thrice', label: 'Thrice daily' },
  { value: 'custom', label: 'Custom' },
];

const DOSAGE_UNITS = ['mg', 'ml', 'mcg', 'g', 'IU', 'tablet(s)', 'capsule(s)', 'drop(s)', 'puff(s)'];

function createEmptyMedicine() {
  return {
    id: Date.now() + Math.random(),
    name: '',
    dosageAmount: '',
    dosageUnit: 'mg',
    frequency: 'once',
    customFrequency: '',
    startDate: '',
    imagePreview: null,
    imageFile: null,
    barcodeData: null,
  };
}

function validateMedicine(med) {
  const errors = {};
  if (!med.name.trim()) errors.name = 'Medicine name is required';
  if (!med.dosageAmount.trim()) errors.dosageAmount = 'Dosage is required';
  if (!med.startDate) errors.startDate = 'Start date is required';
  if (med.frequency === 'custom' && !med.customFrequency.trim()) {
    errors.customFrequency = 'Please specify custom frequency';
  }
  return errors;
}

export default function AddMedicinesScreen({ userData, onSave, showToast }) {
  const [medicines, setMedicines] = useState([createEmptyMedicine()]);
  const [errors, setErrors] = useState({}); // { [medId]: { fieldName: msg } }
  const [scannerOpen, setScannerOpen] = useState(null); // medId or null
  const [loading, setLoading] = useState(false);
  const fileInputRefs = useRef({});

  const updateMed = (id, key, value) => {
    setMedicines(prev =>
      prev.map(m => (m.id === id ? { ...m, [key]: value } : m))
    );
    // Clear the error for this field
    setErrors(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: undefined },
    }));
  };

  const addMedicine = () => {
    setMedicines(prev => [...prev, createEmptyMedicine()]);
  };

  const removeMedicine = (id) => {
    if (medicines.length === 1) {
      showToast('You must have at least one medicine', 'error');
      return;
    }
    setMedicines(prev => prev.filter(m => m.id !== id));
    setErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleImageChange = (id, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      updateMed(id, 'imagePreview', ev.target.result);
      updateMed(id, 'imageFile', file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleBarcodeScanned = (medId, data) => {
    updateMed(medId, 'barcodeData', data);
    setScannerOpen(null);
    showToast(`Barcode scanned: ${data}`, 'success');
  };

  const handleSave = async () => {
    // Validate all medicines
    const allErrors = {};
    let hasErrors = false;

    medicines.forEach(med => {
      const errs = validateMedicine(med);
      if (Object.keys(errs).length > 0) {
        allErrors[med.id] = errs;
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setErrors(allErrors);
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);

    const payload = medicines.map(m => ({
      name: m.name,
      dosage: `${m.dosageAmount} ${m.dosageUnit}`,
      frequency: m.frequency === 'custom' ? m.customFrequency : FREQUENCIES.find(f => f.value === m.frequency)?.label,
      startDate: m.startDate,
      hasImage: !!m.imagePreview,
      barcodeData: m.barcodeData,
    }));

    console.log('=== MedRemind: Medicines Saved ===');
    console.log('User:', { name: userData.name, email: userData.email, role: userData.role });
    console.log('Medicines:', payload);
    console.table(payload);

    showToast(`${medicines.length} medicine${medicines.length > 1 ? 's' : ''} saved! 🎉`, 'success');

    // Pass full medicine list (with preview) up for success screen display
    onSave(medicines);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="screen-card screen-enter" style={{ maxWidth: 560 }}>
      <div className="screen-header">
        <div className="screen-eyebrow">💊 Step 3</div>
        <h1 className="screen-title">Add Your Medicines</h1>
        <p className="screen-subtitle">
          Add all medications you want reminders for. You can add more later.
        </p>
      </div>

      {/* Medicine cards */}
      {medicines.map((med, index) => (
        <MedicineCard
          key={med.id}
          med={med}
          index={index}
          errors={errors[med.id] || {}}
          onUpdate={updateMed}
          onRemove={removeMedicine}
          onImageChange={handleImageChange}
          onScanOpen={() => setScannerOpen(med.id)}
          fileInputRef={el => (fileInputRefs.current[med.id] = el)}
          today={today}
          total={medicines.length}
        />
      ))}

      {/* Add another medicine */}
      <button
        id="add-medicine-btn"
        type="button"
        className="add-medicine-btn"
        onClick={addMedicine}
      >
        ➕ Add another medicine
      </button>

      {/* Save button */}
      <button
        id="save-medicines-btn"
        type="button"
        className="btn btn-primary"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
            Saving medicines…
          </>
        ) : (
          '💾 Save & Continue'
        )}
      </button>

      {/* Scanner modal */}
      {scannerOpen !== null && (
        <ScannerModal
          onClose={() => setScannerOpen(null)}
          onScanned={(data) => handleBarcodeScanned(scannerOpen, data)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ---- Individual Medicine Card ---- */
function MedicineCard({
  med, index, errors, onUpdate, onRemove,
  onImageChange, onScanOpen, fileInputRef, today, total,
}) {
  const [showCustomFreq, setShowCustomFreq] = useState(med.frequency === 'custom');

  const handleFrequencyChange = (e) => {
    const val = e.target.value;
    onUpdate(med.id, 'frequency', val);
    setShowCustomFreq(val === 'custom');
  };

  return (
    <div className="medicine-card">
      <div className="medicine-card-header">
        <div className="medicine-card-title">
          <span className="medicine-number">{index + 1}</span>
          Medicine {index + 1}
          {med.barcodeData && (
            <span
              title={`Barcode: ${med.barcodeData}`}
              style={{ fontSize: '0.75rem', color: 'var(--primary-500)', fontWeight: 500 }}
            >
              📦 {med.barcodeData}
            </span>
          )}
        </div>
        {total > 1 && (
          <button
            type="button"
            className="remove-btn"
            onClick={() => onRemove(med.id)}
            aria-label={`Remove medicine ${index + 1}`}
            id={`remove-medicine-${index}`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Medicine Name */}
      <div className="form-group mb-0">
        <label className="form-label" htmlFor={`med-name-${med.id}`}>
          Medicine Name <span className="required">*</span>
        </label>
        <div className="input-wrapper">
          <span className="input-icon">💊</span>
          <input
            id={`med-name-${med.id}`}
            type="text"
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="e.g. Metformin, Lisinopril"
            value={med.name}
            onChange={e => onUpdate(med.id, 'name', e.target.value)}
            autoComplete="off"
          />
        </div>
        {errors.name && <p className="error-msg">⚠ {errors.name}</p>}
      </div>

      <div className="medicine-form-grid" style={{ marginTop: 14 }}>
        {/* Dosage */}
        <div className="form-group mb-0">
          <label className="form-label" htmlFor={`med-dosage-${med.id}`}>
            Dosage <span className="required">*</span>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="input-wrapper" style={{ flex: 1 }}>
              <span className="input-icon">⚖️</span>
              <input
                id={`med-dosage-${med.id}`}
                type="number"
                min="0"
                step="any"
                className={`form-input ${errors.dosageAmount ? 'error' : ''}`}
                placeholder="500"
                value={med.dosageAmount}
                onChange={e => onUpdate(med.id, 'dosageAmount', e.target.value)}
              />
            </div>
            <select
              id={`med-unit-${med.id}`}
              className="form-select"
              value={med.dosageUnit}
              onChange={e => onUpdate(med.id, 'dosageUnit', e.target.value)}
              style={{ width: 90, paddingLeft: 10, flex: 'none' }}
            >
              {DOSAGE_UNITS.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          {errors.dosageAmount && (
            <p className="error-msg">⚠ {errors.dosageAmount}</p>
          )}
        </div>

        {/* Frequency */}
        <div className="form-group mb-0">
          <label className="form-label" htmlFor={`med-freq-${med.id}`}>
            Frequency <span className="required">*</span>
          </label>
          <div className="input-wrapper">
            <span className="input-icon">🔁</span>
            <select
              id={`med-freq-${med.id}`}
              className="form-select"
              value={med.frequency}
              onChange={handleFrequencyChange}
            >
              {FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Start Date */}
        <div className="form-group mb-0">
          <label className="form-label" htmlFor={`med-date-${med.id}`}>
            Start Date <span className="required">*</span>
          </label>
          <div className="input-wrapper">
            <span className="input-icon">📅</span>
            <input
              id={`med-date-${med.id}`}
              type="date"
              className={`form-input ${errors.startDate ? 'error' : ''}`}
              value={med.startDate}
              min={today}
              onChange={e => onUpdate(med.id, 'startDate', e.target.value)}
            />
          </div>
          {errors.startDate && (
            <p className="error-msg">⚠ {errors.startDate}</p>
          )}
        </div>

        {/* Custom frequency (conditional) */}
        {showCustomFreq && (
          <div className="form-group mb-0">
            <label className="form-label" htmlFor={`med-custom-freq-${med.id}`}>
              Custom Schedule <span className="required">*</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">✏️</span>
              <input
                id={`med-custom-freq-${med.id}`}
                type="text"
                className={`form-input ${errors.customFrequency ? 'error' : ''}`}
                placeholder="e.g. Every 8 hours"
                value={med.customFrequency}
                onChange={e => onUpdate(med.id, 'customFrequency', e.target.value)}
              />
            </div>
            {errors.customFrequency && (
              <p className="error-msg">⚠ {errors.customFrequency}</p>
            )}
          </div>
        )}
      </div>

      {/* Image Upload + Scanner */}
      <div className="medicine-form-grid" style={{ marginTop: 14 }}>
        <div className="form-group mb-0">
          <label className="form-label">Medicine Image</label>
          <div
            id={`med-image-upload-${index}`}
            className={`image-upload-area ${med.imagePreview ? 'has-image' : ''}`}
            onClick={() => fileInputRefs.current?.[med.id]?.click() || fileInputRef?.()?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload medicine image"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef()?.click();
              }
            }}
          >
            {med.imagePreview ? (
              <div style={{ position: 'relative' }}>
                <img src={med.imagePreview} alt="Medicine" className="image-preview" />
                <div
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.5)', borderRadius: '50%',
                    width: 24, height: 24, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '0.7rem', color: 'white',
                  }}
                  onClick={e => { e.stopPropagation(); onUpdate(med.id, 'imagePreview', null); }}
                  role="button"
                  aria-label="Remove image"
                >
                  ✕
                </div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📷</span>
                <span className="upload-text">Tap to upload</span>
                <span className="upload-hint">PNG, JPG up to 5MB</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => onImageChange(med.id, e)}
            id={`file-input-${med.id}`}
          />
        </div>

        <div className="form-group mb-0">
          <label className="form-label">Barcode / QR</label>
          <button
            id={`scan-barcode-${index}`}
            type="button"
            className="scanner-btn"
            onClick={onScanOpen}
            style={{ height: '100%', minHeight: 120 }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>📸</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {med.barcodeData ? '✅ Scanned!' : 'Scan Barcode'}
              </div>
              {med.barcodeData && (
                <div style={{ fontSize: '0.72rem', marginTop: 2, opacity: 0.75, wordBreak: 'break-all' }}>
                  {med.barcodeData}
                </div>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
