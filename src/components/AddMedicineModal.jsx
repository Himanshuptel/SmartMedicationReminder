import React, { useState } from 'react';
import { PillIcon, XIcon, CameraIcon, ScanIcon, CheckIcon, AlertCircleIcon } from './Icons';

const DOSAGE_UNITS = ['mg', 'ml', 'mcg', 'g', 'IU', 'tablets', 'capsules', 'drops'];
const FREQUENCIES = [
  { value: 'once', label: 'Once daily' },
  { value: 'twice', label: 'Twice daily' },
  { value: 'thrice', label: 'Thrice daily' },
  { value: 'custom', label: 'As needed / Custom' }
];

export default function AddMedicineModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    dosageAmount: '',
    dosageUnit: 'mg',
    frequency: 'once',
    mealTiming: 'after_food',
    stockRemaining: 30,
    lowStockThreshold: 5,
    instructions: '',
    barcode: ''
  });
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSimulateScan = () => {
    setScanning(true);
    setTimeout(() => {
      const simulatedBarcodes = ['MED-MET-500', 'MED-ATO-020', 'MED-LIS-010', 'MED-AMO-250'];
      const picked = simulatedBarcodes[Math.floor(Math.random() * simulatedBarcodes.length)];
      setFormData(prev => ({ ...prev, barcode: picked }));
      setScanning(false);
    }, 1200);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Please enter medicine name.');
      return;
    }
    if (!formData.dosageAmount) {
      setError('Please specify dosage amount.');
      return;
    }
    onSave(formData);
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add Medication">
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="icon-badge">
              <PillIcon size={20} color="var(--color-primary)" />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>Add New Medication</h2>
              <p className="modal-sub" style={{ margin: 0 }}>Configure dosage, frequency, and stock alerts</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <XIcon size={18} />
          </button>
        </div>

        {error && (
          <div className="field-error" style={{ margin: '12px 0' }} role="alert">
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="med-name">
              Medicine Name <span className="required-dot" />
            </label>
            <input
              id="med-name"
              name="name"
              type="text"
              className="form-input"
              placeholder="e.g., Metformin, Lisinopril, Atorvastatin"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="med-dosage">
                Dosage Amount <span className="required-dot" />
              </label>
              <input
                id="med-dosage"
                name="dosageAmount"
                type="number"
                min="0.1"
                step="any"
                className="form-input"
                placeholder="500"
                value={formData.dosageAmount}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="med-unit">Unit</label>
              <select
                id="med-unit"
                name="dosageUnit"
                className="form-input"
                value={formData.dosageUnit}
                onChange={handleChange}
              >
                {DOSAGE_UNITS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="med-freq">Frequency</label>
              <select
                id="med-freq"
                name="frequency"
                className="form-input"
                value={formData.frequency}
                onChange={handleChange}
              >
                {FREQUENCIES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="med-timing">Meal Timing</label>
              <select
                id="med-timing"
                name="mealTiming"
                className="form-input"
                value={formData.mealTiming}
                onChange={handleChange}
              >
                <option value="after_food">After Food / Meals</option>
                <option value="before_food">Before Food / Empty Stomach</option>
                <option value="with_food">With Meals</option>
                <option value="independent">Any Time / As Needed</option>
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label" htmlFor="med-stock">Pills in Stock</label>
              <input
                id="med-stock"
                name="stockRemaining"
                type="number"
                min="0"
                className="form-input"
                value={formData.stockRemaining}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="med-thresh">Refill Alert At</label>
              <input
                id="med-thresh"
                name="lowStockThreshold"
                type="number"
                min="1"
                className="form-input"
                value={formData.lowStockThreshold}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Barcode scanner simulator */}
          <div className="form-group">
            <label className="form-label">Barcode / QR Package Verification</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                name="barcode"
                className="form-input"
                placeholder="Barcode ID or scan"
                value={formData.barcode}
                onChange={handleChange}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSimulateScan}
                disabled={scanning}
              >
                <ScanIcon size={15} />
                <span>{scanning ? 'Scanning...' : 'Scan Barcode'}</span>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="med-instr">Special Instructions / Doctor Notes</label>
            <textarea
              id="med-instr"
              name="instructions"
              className="form-input"
              rows={2}
              placeholder="e.g., Take with a full glass of water. Avoid taking with grapefruit juice."
              value={formData.instructions}
              onChange={handleChange}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <CheckIcon size={16} />
              <span>Save Medication</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
