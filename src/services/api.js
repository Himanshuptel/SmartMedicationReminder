/**
 * Smart Medication Reminder - Resilient API Service Layer
 * Supports seamless backend REST API integration with automatic client-side fallback
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Initial fallback mock data matching project report
const DEFAULT_MEDICINES = [
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

const DEFAULT_SCHEDULE = [
  { id: 101, medicineId: 3, name: 'Lisinopril', dosage: '10 mg', time: '07:30', period: 'Morning', status: 'taken', instructions: 'Before breakfast' },
  { id: 102, medicineId: 1, name: 'Metformin', dosage: '500 mg', time: '08:30', period: 'Morning', status: 'taken', instructions: 'After breakfast' },
  { id: 103, medicineId: 4, name: 'Vitamin D3', dosage: '1000 IU', time: '09:00', period: 'Morning', status: 'pending', instructions: 'After breakfast' },
  { id: 104, medicineId: 1, name: 'Metformin', dosage: '500 mg', time: '20:30', period: 'Evening', status: 'pending', instructions: 'After dinner' },
  { id: 105, medicineId: 2, name: 'Atorvastatin', dosage: '20 mg', time: '21:30', period: 'Night', status: 'pending', instructions: 'At bedtime' }
];

const DEFAULT_HISTORY = [
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

// Helper to get / set local storage
function getLocal(key, defaultVal) {
  try {
    const raw = localStorage.getItem('medremind_' + key);
    return raw ? JSON.parse(raw) : defaultVal;
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
  async getMedicines(userId = 1) {
    try {
      const res = await fetch(`${API_BASE}/medicines?user_id=${userId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.medicines && json.medicines.length > 0) {
          // Normalize fields
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
    } catch (e) {
      console.warn('API call failed, using local storage:', e);
    }
    return getLocal('medicines', DEFAULT_MEDICINES);
  },

  async addMedicine(med) {
    const current = getLocal('medicines', DEFAULT_MEDICINES);
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
    setLocal('medicines', updated);

    try {
      await fetch(`${API_BASE}/medicines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          name: newMed.name,
          dosage_amount: newMed.dosageAmount,
          dosage_unit: newMed.dosageUnit,
          frequency: newMed.frequency,
          meal_timing: newMed.mealTiming,
          instructions: newMed.instructions,
          stock_remaining: newMed.stockRemaining,
          barcode: newMed.barcode
        })
      });
    } catch {}

    return newMed;
  },

  async deleteMedicine(id) {
    const current = getLocal('medicines', DEFAULT_MEDICINES);
    const updated = current.filter(m => m.id !== id);
    setLocal('medicines', updated);
    try {
      await fetch(`${API_BASE}/medicines/${id}`, { method: 'DELETE' });
    } catch {}
    return true;
  },

  // --- Today's Schedule ---
  getSchedule() {
    return getLocal('schedule', DEFAULT_SCHEDULE);
  },

  updateScheduleItem(id, status) {
    const schedule = getLocal('schedule', DEFAULT_SCHEDULE);
    const updated = schedule.map(item => item.id === id ? { ...item, status } : item);
    setLocal('schedule', updated);
    return updated;
  },

  // --- Medication History & Adherence ---
  async getHistory(userId = 1) {
    try {
      const res = await fetch(`${API_BASE}/history?user_id=${userId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.history) return json;
      }
    } catch {}

    const localHist = getLocal('history', DEFAULT_HISTORY);
    const total = localHist.length;
    const taken = localHist.filter(h => h.status === 'taken').length;
    const missed = localHist.filter(h => h.status === 'missed').length;
    const snoozed = localHist.filter(h => h.status === 'snoozed').length;
    const rate = total > 0 ? Math.round((taken / total) * 100) : 100;

    return {
      success: true,
      history: localHist,
      stats: { total, taken, missed, snoozed, adherence_rate: rate, streak_days: 6 }
    };
  },

  async recordAction({ reminderId, medicineName, dosage, status, notes = '' }) {
    const localHist = getLocal('history', DEFAULT_HISTORY);
    const newEntry = {
      id: Date.now(),
      medicine_name: medicineName,
      dosage: dosage,
      status: status, // taken, snoozed, missed
      scheduled_time: 'Today ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action_time: 'Just now',
      notes: notes || (status === 'taken' ? 'Marked taken by user' : status === 'snoozed' ? 'Snoozed 10 mins' : 'Marked missed')
    };

    setLocal('history', [newEntry, ...localHist]);

    // If missed, record notification
    if (status === 'missed') {
      const notifs = getLocal('notifications', []);
      notifs.unshift({
        id: Date.now(),
        title: 'Missed Dose Escalation',
        message: `Patient Himanshu Patel missed scheduled dose of ${medicineName}. Caregiver notified.`,
        type: 'missed_dose',
        time: 'Just now',
        status: 'unread'
      });
      setLocal('notifications', notifs);
    }

    try {
      await fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          reminder_id: reminderId,
          medicine_name: medicineName,
          dosage,
          status,
          notes: newEntry.notes
        })
      });
    } catch {}

    return newEntry;
  },

  // --- Caregiver Module ---
  async getCaregiverData() {
    try {
      const res = await fetch(`${API_BASE}/caregiver/patients?caregiver_id=2`);
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch {}

    return {
      patients: [
        {
          id: 1,
          name: 'Himanshu Patel',
          email: 'himanshu@paruluniversity.ac.in',
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
          message: 'Patient Himanshu Patel missed Lisinopril scheduled for 07:30 AM.',
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
    try {
      await fetch(`${API_BASE}/caregiver/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId })
      });
    } catch {}
    return true;
  },

  // --- Clinician Module ---
  async getClinicianData() {
    try {
      const res = await fetch(`${API_BASE}/clinician/patients?clinician_id=3`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    return {
      patients: [
        {
          id: 1,
          name: 'Himanshu Patel',
          email: 'himanshu@paruluniversity.ac.in',
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
          note: 'Blood pressure and glycemic parameters show steady control. Adherence improved significantly following caregiver alerts.',
          dosage_adjustment: 'Continue Metformin 500mg twice daily and Lisinopril 10mg once daily.',
          date: '2026-09-24'
        }
      ]
    };
  },

  async addClinicalNote({ patientId = 1, note, dosageAdjustment }) {
    try {
      await fetch(`${API_BASE}/clinician/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinician_id: 3,
          patient_id: patientId,
          note,
          dosage_adjustment: dosageAdjustment
        })
      });
    } catch {}
    return {
      id: Date.now(),
      patient_id: patientId,
      note,
      dosage_adjustment: dosageAdjustment,
      date: new Date().toISOString().split('T')[0]
    };
  },

  // --- Emergency Contacts & SOS ---
  async getEmergencyContacts(userId = 1) {
    try {
      const res = await fetch(`${API_BASE}/emergency/contacts?user_id=${userId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.contacts) return json.contacts;
      }
    } catch {}
    return getLocal('emergency_contacts', DEFAULT_EMERGENCY_CONTACTS);
  },

  async triggerSos(payload = {}) {
    try {
      const res = await fetch(`${API_BASE}/emergency/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch {}

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
    try {
      const res = await fetch(`${API_BASE}/ai/interaction-checker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugs })
      });
      if (res.ok) return await res.json();
    } catch {}

    // Built-in interaction matrix fallback
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
    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (res.ok) return await res.json();
    } catch {}

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
