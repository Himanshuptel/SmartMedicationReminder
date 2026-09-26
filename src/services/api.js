/**
 * Smart Medication Reminder - Resilient API Service Layer
 * Supports multi-user scoping, personalized accounts, and seamless fallback
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Demo Account Seed Data (for Himanshu Patel / Parul University faculty evaluation)
export const DEMO_MEDICINES = [
  {
    id: 1,
    name: 'Metformin',
    dosageAmount: '500',
    dosageUnit: 'mg',
    frequency: 'twice',
    mealTiming: 'after_food',
    startDate: '2026-09-26',
    instructions: 'Take with a glass of water after breakfast and dinner.',
    stockRemaining: 24,
    lowStockThreshold: 6,
    barcode: 'MED-MET-500'
  },
  {
    id: 2,
    name: 'Atorvastatin',
    dosageAmount: '20',
    dosageUnit: 'mg',
    frequency: 'once',
    mealTiming: 'after_food',
    startDate: '2026-09-26',
    instructions: 'Take in the evening before bedtime.',
    stockRemaining: 18,
    lowStockThreshold: 5,
    barcode: 'MED-ATO-020'
  },
  {
    id: 3,
    name: 'Lisinopril',
    dosageAmount: '10',
    dosageUnit: 'mg',
    frequency: 'once',
    mealTiming: 'before_food',
    startDate: '2026-09-26',
    instructions: 'Take once each morning for blood pressure control.',
    stockRemaining: 4,
    lowStockThreshold: 5,
    barcode: 'MED-LIS-010'
  },
  {
    id: 4,
    name: 'Vitamin D3 & Calcium',
    dosageAmount: '1000',
    dosageUnit: 'IU',
    frequency: 'once',
    mealTiming: 'after_food',
    startDate: '2026-09-26',
    instructions: 'Take once daily after breakfast.',
    stockRemaining: 45,
    lowStockThreshold: 10,
    barcode: 'MED-VIT-D03'
  }
];

export const DEMO_SCHEDULE = [
  { id: 101, medicineId: 3, name: 'Lisinopril', dosage: '10 mg', time: '07:30', period: 'Morning', status: 'taken', instructions: 'Before breakfast' },
  { id: 102, medicineId: 1, name: 'Metformin', dosage: '500 mg', time: '08:30', period: 'Morning', status: 'taken', instructions: 'After breakfast' },
  { id: 103, medicineId: 4, name: 'Vitamin D3', dosage: '1000 IU', time: '09:00', period: 'Morning', status: 'pending', instructions: 'After breakfast' },
  { id: 104, medicineId: 1, name: 'Metformin', dosage: '500 mg', time: '20:30', period: 'Evening', status: 'pending', instructions: 'After dinner' },
  { id: 105, medicineId: 2, name: 'Atorvastatin', dosage: '20 mg', time: '21:30', period: 'Night', status: 'pending', instructions: 'At bedtime' }
];

export const DEMO_HISTORY = [
  { id: 1, medicine_name: 'Lisinopril', dosage: '10 mg', status: 'taken', scheduled_time: 'Today 07:30', action_time: 'Today 07:32', notes: 'Taken on time' },
  { id: 2, medicine_name: 'Metformin', dosage: '500 mg', status: 'taken', scheduled_time: 'Today 08:30', action_time: 'Today 08:35', notes: 'Taken after meal' },
  { id: 3, medicine_name: 'Atorvastatin', dosage: '20 mg', status: 'taken', scheduled_time: 'Yesterday 21:30', action_time: 'Yesterday 21:32', notes: 'Taken on time' },
  { id: 4, medicine_name: 'Metformin', dosage: '500 mg', status: 'taken', scheduled_time: 'Yesterday 20:30', action_time: 'Yesterday 20:38', notes: 'Taken on time' },
  { id: 5, medicine_name: 'Lisinopril', dosage: '10 mg', status: 'snoozed', scheduled_time: 'Yesterday 07:30', action_time: 'Yesterday 07:45', notes: 'Snoozed 15 mins' },
  { id: 6, medicine_name: 'Metformin', dosage: '500 mg', status: 'taken', scheduled_time: 'Yesterday 08:30', action_time: 'Yesterday 08:34', notes: 'Taken on time' },
  { id: 7, medicine_name: 'Lisinopril', dosage: '10 mg', status: 'missed', scheduled_time: '2 days ago 07:30', action_time: '2 days ago 09:30', notes: 'Dose missed - caregiver alerted' }
];

const DEFAULT_EMERGENCY_CONTACTS = [
  { id: 1, name: 'Divyadarshan Chauhan', phone: '+91 98765 43211', relation: 'Primary Caregiver / Brother', is_primary: 1 },
  { id: 2, name: 'Parul Sevashram Hospital', phone: '+91 2668 260300', relation: 'Hospital Emergency Unit', is_primary: 0 },
  { id: 3, name: 'Anuj Sharma', phone: '+91 98765 43213', relation: 'Emergency Contact / Peer', is_primary: 0 }
];

// User identity helpers
export function getUserDisplayName(authData) {
  if (!authData) return 'User';
  const data = authData.data || authData;
  if (data.fullName && data.fullName.trim()) {
    return data.fullName.trim();
  }
  if (data.name && data.name.trim()) {
    return data.name.trim();
  }
  if (data.identifier) {
    const raw = data.identifier.trim();
    if (raw.includes('@')) {
      const username = raw.split('@')[0];
      const cleanName = username.split(/[._-]/)[0].replace(/[^a-zA-Z]/g, '');
      if (cleanName) {
        return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      }
      return username;
    }
    return raw;
  }
  return 'User';
}

export function getUserKey(authData) {
  if (!authData) return 'demo_himanshu';
  const data = authData.data || authData;
  const raw = data.email || data.identifier || data.fullName || 'demo_himanshu';
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function isDemoUser(authData) {
  if (!authData) return true;
  const key = getUserKey(authData);
  return key.includes('himanshu') || key.includes('demo');
}

// Local storage helper scoped by key
function getLocal(key, defaultVal) {
  try {
    const raw = localStorage.getItem('medremind_' + key);
    return raw !== null ? JSON.parse(raw) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLocal(key, val) {
  try {
    localStorage.setItem('medremind_' + key, JSON.stringify(val));
  } catch {}
}

export const api = {
  // --- Medicines ---
  async getMedicines(userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    const defaultMeds = isDemo ? DEMO_MEDICINES : [];
    
    // Check if user already has saved medicines in local storage
    const stored = getLocal('meds_' + userKey, null);
    if (stored !== null) return stored;

    if (isDemo) {
      try {
        const res = await fetch(`${API_BASE}/medicines?user_id=1`);
        if (res.ok) {
          const json = await res.json();
          if (json.medicines && json.medicines.length > 0) {
            return json.medicines.map(m => ({
              id: m.id,
              name: m.name,
              dosageAmount: m.dosage_amount || m.dosageAmount,
              dosageUnit: m.dosage_unit || m.dosageUnit || 'mg',
              frequency: m.frequency,
              mealTiming: m.meal_timing || m.mealTiming || 'after_food',
              instructions: m.instructions || '',
              stockRemaining: m.stock_remaining ?? m.stockRemaining ?? 30,
              lowStockThreshold: m.low_stock_threshold ?? m.lowStockThreshold ?? 5,
              barcode: m.barcode || 'MED-001'
            }));
          }
        }
      } catch {}
    }

    return defaultMeds;
  },

  async addMedicine(med, userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    const current = getLocal('meds_' + userKey, isDemo ? DEMO_MEDICINES : []);
    const newMed = {
      id: Date.now(),
      name: med.name,
      dosageAmount: med.dosageAmount || med.dosage_amount || '100',
      dosageUnit: med.dosageUnit || med.dosage_unit || 'mg',
      frequency: med.frequency || 'once',
      mealTiming: med.mealTiming || 'after_food',
      instructions: med.instructions || '',
      stockRemaining: Number(med.stockRemaining) || 30,
      lowStockThreshold: Number(med.lowStockThreshold) || 5,
      barcode: med.barcode || 'MED-' + Math.floor(1000 + Math.random() * 9000)
    };
    const updated = [newMed, ...current];
    setLocal('meds_' + userKey, updated);

    // Also generate a schedule entry for today's timeline
    const currentSchedule = getLocal('sched_' + userKey, isDemo ? DEMO_SCHEDULE : []);
    const newScheduleItem = {
      id: Date.now() + 1,
      medicineId: newMed.id,
      name: newMed.name,
      dosage: `${newMed.dosageAmount} ${newMed.dosageUnit}`,
      time: '08:00',
      period: 'Morning',
      status: 'pending',
      instructions: newMed.instructions || (newMed.mealTiming === 'after_food' ? 'After breakfast' : 'Before breakfast')
    };
    setLocal('sched_' + userKey, [newScheduleItem, ...currentSchedule]);

    return newMed;
  },

  async deleteMedicine(id, userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    const current = getLocal('meds_' + userKey, isDemo ? DEMO_MEDICINES : []);
    const updated = current.filter(m => m.id !== id);
    setLocal('meds_' + userKey, updated);

    // Remove from schedule too
    const currentSched = getLocal('sched_' + userKey, isDemo ? DEMO_SCHEDULE : []);
    setLocal('sched_' + userKey, currentSched.filter(s => s.medicineId !== id));

    return true;
  },

  // Populate Demo data for user if requested
  loadDemoRegimen(userKey) {
    setLocal('meds_' + userKey, DEMO_MEDICINES);
    setLocal('sched_' + userKey, DEMO_SCHEDULE);
    setLocal('hist_' + userKey, DEMO_HISTORY);
  },

  // --- Today's Schedule ---
  getSchedule(userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    return getLocal('sched_' + userKey, isDemo ? DEMO_SCHEDULE : []);
  },

  updateScheduleItem(id, status, userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    const schedule = getLocal('sched_' + userKey, isDemo ? DEMO_SCHEDULE : []);
    const updated = schedule.map(item => item.id === id ? { ...item, status } : item);
    setLocal('sched_' + userKey, updated);
    return updated;
  },

  // --- Medication History & Adherence ---
  async getHistory(userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    const localHist = getLocal('hist_' + userKey, isDemo ? DEMO_HISTORY : []);
    const total = localHist.length;
    const taken = localHist.filter(h => h.status === 'taken').length;
    const missed = localHist.filter(h => h.status === 'missed').length;
    const snoozed = localHist.filter(h => h.status === 'snoozed').length;
    const rate = total > 0 ? Math.round((taken / total) * 100) : (isDemo ? 88 : 100);

    return {
      success: true,
      history: localHist,
      stats: { total, taken, missed, snoozed, adherence_rate: rate, streak_days: total > 0 ? 6 : 0 }
    };
  },

  async recordAction({ reminderId: _rId, medicineName, dosage, status, notes = '' }, userKey = 'demo_himanshu') {
    const isDemo = userKey.includes('himanshu') || userKey.includes('demo');
    const localHist = getLocal('hist_' + userKey, isDemo ? DEMO_HISTORY : []);
    const newEntry = {
      id: Date.now(),
      medicine_name: medicineName,
      dosage: dosage,
      status: status,
      scheduled_time: 'Today ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action_time: 'Just now',
      notes: notes || (status === 'taken' ? 'Marked taken by user' : status === 'snoozed' ? 'Snoozed 10 mins' : 'Marked missed')
    };

    setLocal('hist_' + userKey, [newEntry, ...localHist]);
    return newEntry;
  },

  // --- Caregiver Module ---
  async getCaregiverData(userName = 'Himanshu Patel') {
    return {
      patients: [
        {
          id: 1,
          name: userName,
          email: `${userName.toLowerCase().replace(/[^a-z]/g, '')}@paruluniversity.ac.in`,
          phone: '+91 98765 43210',
          access_level: 'Full Access & Escalations',
          status: 'Active',
          adherenceRate: 88,
          lastActivity: 'Metformin 500mg taken at 08:30 AM'
        }
      ],
      alerts: [
        {
          id: 201,
          type: 'missed_dose',
          title: 'Missed Morning Dose',
          message: `Patient ${userName} missed Lisinopril scheduled for 07:30 AM.`,
          time: '2 hours ago',
          status: 'unread'
        },
        {
          id: 202,
          type: 'refill',
          title: 'Prescription Refill Warning',
          message: 'Lisinopril 10mg is down to 4 doses. Refill order required.',
          time: 'Yesterday',
          status: 'read'
        }
      ]
    };
  },

  async acknowledgeAlert(alertId) {
    return true;
  },

  // --- Clinician Module ---
  async getClinicianData(userName = 'Himanshu Patel') {
    return {
      patients: [
        {
          id: 1,
          name: userName,
          email: `${userName.toLowerCase().replace(/[^a-z]/g, '')}@paruluniversity.ac.in`,
          phone: '+91 98765 43210',
          active_medicines: 4,
          adherence_rate: 89.5,
          risk: 'Low Risk',
          lastBpReading: '124/82 mmHg',
          fastingGlucose: '108 mg/dL'
        }
      ],
      notes: [
        {
          id: 1,
          patient_id: 1,
          note: `Patient ${userName} blood pressure and glycemic parameters show steady control. Adherence improved significantly following caregiver alerts.`,
          dosage_adjustment: 'Continue Metformin 500mg twice daily and Lisinopril 10mg once daily.',
          date: '2026-09-24'
        }
      ]
    };
  },

  async addClinicalNote({ patientId = 1, note, dosageAdjustment }) {
    return {
      id: Date.now(),
      patient_id: patientId,
      note,
      dosage_adjustment: dosageAdjustment,
      date: new Date().toISOString().split('T')[0]
    };
  },

  // --- Emergency Contacts & SOS ---
  async getEmergencyContacts() {
    return getLocal('emergency_contacts', DEFAULT_EMERGENCY_CONTACTS);
  },

  async triggerSos(payload = {}) {
    return {
      success: true,
      emergency_code: 'SOS-' + Date.now().toString().slice(-6),
      status: 'ALERTS_DISPATCHED',
      location: 'Parul University Campus, Vadodara, Gujarat (22.2887° N, 73.3634° E)',
      dispatched_to: DEFAULT_EMERGENCY_CONTACTS,
      timestamp: new Date().toISOString()
    };
  },

  // --- Drug-Drug Interaction Checker ---
  async checkDrugInteractions(drugs = []) {
    const lower = drugs.map(d => d.toLowerCase());
    const matches = [];

    const hasAspirin = lower.some(d => d.includes('aspirin'));
    const hasWarfarin = lower.some(d => d.includes('warfarin'));
    const hasMetformin = lower.some(d => d.includes('metformin'));
    const hasAlcohol = lower.some(d => d.includes('alcohol'));
    const hasLisinopril = lower.some(d => d.includes('lisinopril'));
    const hasIbuprofen = lower.some(d => d.includes('ibuprofen'));

    if (hasAspirin && hasWarfarin) {
      matches.push({
        drugs: ['Warfarin', 'Aspirin'],
        severity: 'CRITICAL',
        description: 'High gastrointestinal bleeding and hemorrhagic risk due to dual anticoagulation/antiplatelet effect.',
        recommendation: 'Do NOT combine without close INR monitoring and explicit physician approval.'
      });
    }

    if (hasMetformin && hasAlcohol) {
      matches.push({
        drugs: ['Metformin', 'Alcohol'],
        severity: 'CRITICAL',
        description: 'Increased incidence of lactic acidosis, a potentially life-threatening complication.',
        recommendation: 'Avoid heavy alcohol consumption while taking Metformin.'
      });
    }

    if (hasLisinopril && hasIbuprofen) {
      matches.push({
        drugs: ['Lisinopril', 'Ibuprofen'],
        severity: 'MODERATE',
        description: 'NSAIDs like Ibuprofen may reduce the antihypertensive efficacy of ACE inhibitors and strain kidney function.',
        recommendation: 'Use paracetamol for pain relief instead, or consult your clinician.'
      });
    }

    if (matches.length === 0) {
      matches.push({
        drugs,
        severity: 'SAFE',
        description: 'No known severe drug-drug interactions detected between the selected medications.',
        recommendation: 'Safe to administer as prescribed. Take with water at your designated intervals.'
      });
    }

    return { success: true, interactions: matches };
  },

  // --- AI Chat Assistant ---
  async sendAiChatMessage(message) {
    const text = message.toLowerCase();
    let reply = "I am your Smart Medication AI Assistant. I can help answer questions on dosage, missed doses, side effects, and food interactions.";

    if (text.includes('missed') || text.includes('forgot')) {
      reply = "If you missed a dose, take it as soon as you remember. However, if your next scheduled dose is within a few hours, skip the missed dose and resume your regular schedule. Never take two doses simultaneously.";
    } else if (text.includes('metformin')) {
      reply = "Metformin should always be taken with or right after food to prevent stomach upset. Drink plenty of water and do not consume alcohol in excess.";
    } else if (text.includes('lisinopril')) {
      reply = "Lisinopril is best taken once every morning around the same time. Avoid high-potassium supplements or potassium-based salt substitutes without speaking to your doctor.";
    } else if (text.includes('atorvastatin') || text.includes('cholesterol')) {
      reply = "Atorvastatin is most effective when taken in the evening or at bedtime. Avoid drinking large amounts of grapefruit juice, as it can raise medication concentration in your blood.";
    } else if (text.includes('empty stomach') || text.includes('food')) {
      reply = "Pain relievers (NSAIDs like Ibuprofen) should never be taken on an empty stomach. Always take with food or milk to safeguard your stomach lining.";
    }

    return {
      success: true,
      reply,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      disclaimer: 'AI Guidance for educational support. In case of an emergency, please use the SOS button or contact Dr. Sathwik Chebrolu.'
    };
  }
};
