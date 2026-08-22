import { useState, useEffect } from 'react';

const DEMO_BARCODES = [
  'MED-4821-METF-500',
  'NDC-0093-7228-98',
  'RX-LIS10MG-2024',
  'BARCODE-8847291034',
];

export default function ScannerModal({ onClose, onScanned }) {
  const [scanning, setScanning] = useState(true);
  const [scannedCode, setScannedCode] = useState(null);
  const [dots, setDots] = useState('');

  // Simulate a scan after 2.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      const randomCode = DEMO_BARCODES[Math.floor(Math.random() * DEMO_BARCODES.length)];
      setScannedCode(randomCode);
      setScanning(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Animate dots
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => {
      setDots(d => d.length < 3 ? d + '.' : '');
    }, 400);
    return () => clearInterval(t);
  }, [scanning]);

  return (
    <div
      className="modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scanner"
    >
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            📸 Barcode / QR Scanner
          </h2>
          <button
            id="scanner-close-btn"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.2rem', color: 'var(--text-muted)', lineHeight: 1,
            }}
            aria-label="Close scanner"
          >
            ✕
          </button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          Point your camera at a medicine barcode or QR code.
        </p>

        {/* Viewfinder */}
        <div className="scanner-viewfinder">
          {scanning ? (
            <>
              <div className="scanner-line" />
              <div className="scanner-corners" />
              <div className="scanner-corner-tr" />
              <div className="scanner-corner-bl" />
              <div style={{
                position: 'absolute', bottom: 12, left: 0, right: 0,
                textAlign: 'center', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)',
              }}>
                Scanning{dots}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
              <div style={{ color: 'var(--success-400)', fontWeight: 700, fontSize: '0.9rem' }}>
                Code detected!
              </div>
              <div style={{
                color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem',
                marginTop: 6, wordBreak: 'break-all', padding: '0 12px',
              }}>
                {scannedCode}
              </div>
            </div>
          )}
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 14 }}>
          {scanning
            ? '⏳ Demo: auto-scanning in progress…'
            : '🎉 Ready to use this code'}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            id="scanner-cancel-btn"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button
            id="scanner-use-btn"
            className="btn btn-primary"
            onClick={() => scannedCode && onScanned(scannedCode)}
            disabled={!scannedCode}
            style={{ flex: 2 }}
          >
            {scannedCode ? '✅ Use This Code' : '⏳ Scanning…'}
          </button>
        </div>
      </div>
    </div>
  );
}
