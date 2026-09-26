/**
 * Smart Medication Reminder - Web Audio Synthesizer
 * Generates browser-native sound alerts without requiring external audio files.
 */

let audioCtx = null;
let activeSirenOsc = null;
let activeSirenGain = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a pleasant 3-tone melodic chime for reminder alarms
 */
export function playReminderChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [
      { freq: 523.25, time: 0.00, dur: 0.20 }, // C5
      { freq: 659.25, time: 0.18, dur: 0.22 }, // E5
      { freq: 783.99, time: 0.36, dur: 0.45 }, // G5
      { freq: 1046.50, time: 0.55, dur: 0.60 } // C6
    ];

    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.time);

      gain.gain.setValueAtTime(0, ctx.currentTime + note.time);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + note.time + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + note.time + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + note.time);
      osc.stop(ctx.currentTime + note.time + note.dur + 0.05);
    });
  } catch (err) {
    console.warn('Audio chime playback error:', err);
  }
}

/**
 * Play a short positive confirmation tone
 */
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {}
}

/**
 * Start repeating Emergency SOS siren
 */
export function startEmergencySiren() {
  try {
    stopEmergencySiren();
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    // Frequency sweep between 650Hz and 1100Hz
    const startTime = ctx.currentTime;
    for (let i = 0; i < 20; i++) {
      const t = startTime + i * 0.6;
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.linearRampToValueAtTime(1100, t + 0.3);
      osc.frequency.linearRampToValueAtTime(650, t + 0.6);
    }

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    activeSirenOsc = osc;
    activeSirenGain = gain;
  } catch (err) {
    console.warn('Siren audio error:', err);
  }
}

/**
 * Stop emergency siren
 */
export function stopEmergencySiren() {
  try {
    if (activeSirenOsc) {
      activeSirenOsc.stop();
      activeSirenOsc.disconnect();
      activeSirenOsc = null;
    }
    if (activeSirenGain) {
      activeSirenGain.disconnect();
      activeSirenGain = null;
    }
  } catch {}
}
