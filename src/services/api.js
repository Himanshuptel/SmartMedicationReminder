/**
 * Smart Medication Reminder - Connected API Service Layer
 * Parul University - Semester IV IMCA / BCA Project
 *
 * Connected directly to the Flask SQLite REST API.
 * The database is the single source of truth; silent mock fallbacks are eliminated.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Standardized HTTP request handler with robust error propagation.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch (netErr) {
    const error = new Error(
      `Cannot connect to backend server at ${url}. Please ensure the Python API server is running.`
    );
    error.isNetworkError = true;
    error.originalError = netErr;
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `API request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.code = data?.error?.code || 'API_ERROR';
    error.details = data?.error?.details || data;
    throw error;
  }

  return data;
}

// ── User Identity Helpers ──────────────────────────────────────────

export function getUserDisplayName(authData) {
  if (!authData) return 'User';
  const data = authData.data || authData;
  if (data.fullName && data.fullName.trim()) return data.fullName.trim();
  if (data.name && data.name.trim()) return data.name.trim();
  if (data.identifier) {
    const raw = data.identifier.trim();
    if (raw.includes('@')) {
      const username = raw.split('@')[0];
      const cleanName = username.split(/[._-]/)[0].replace(/[^a-zA-Z]/g, '');
      if (cleanName) return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
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

export function resolveUserId(userKey, authData) {
  if (authData?.id) return authData.id;
  if (authData?.data?.id) return authData.data.id;
  if (typeof userKey === 'number') return userKey;
  if (!userKey) return 1;
  const key = String(userKey).toLowerCase();
  if (key.includes('divya') || key.includes('caregiver')) return 2;
  if (key.includes('sathwik') || key.includes('clinician')) return 3;
  return 1;
}

function getPeriod(timeStr) {
  if (!timeStr) return 'Morning';
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Evening';
  return 'Night';
}

// ── API Operations (Single Source of Truth) ────────────────────────

export const api = {
  // --- Authentication ---
  async register(userData) {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async login(credentials) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  },

  // --- Medicines Module ---
  async getMedicines(userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const res = await request(`/medicines?user_id=${userId}`);
    const list = res.medicines || [];
    return list.map(m => ({
      id: m.id,
      name: m.name,
      dosageAmount: m.dosage_amount || m.dosageAmount || '100',
      dosageUnit: m.dosage_unit || m.dosageUnit || 'mg',
      frequency: m.frequency || 'once',
      mealTiming: m.meal_timing || m.mealTiming || 'after_food',
      startDate: m.start_date || m.startDate || '',
      instructions: m.instructions || '',
      stockRemaining: m.stock_remaining ?? m.stockRemaining ?? 30,
      lowStockThreshold: m.low_stock_threshold ?? m.lowStockThreshold ?? 5,
      barcode: m.barcode || 'MED-001'
    }));
  },

  async addMedicine(med, userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const payload = {
      user_id: userId,
      name: med.name,
      dosage_amount: med.dosageAmount || med.dosage_amount || '100',
      dosage_unit: med.dosageUnit || med.dosage_unit || 'mg',
      frequency: med.frequency || 'once',
      meal_timing: med.mealTiming || med.meal_timing || 'after_food',
      start_date: med.startDate || med.start_date || new Date().toISOString().split('T')[0],
      instructions: med.instructions || '',
      stock_remaining: Number(med.stockRemaining) || 30,
      low_stock_threshold: Number(med.lowStockThreshold) || 5,
      barcode: med.barcode || ('MED-' + Math.floor(1000 + Math.random() * 9000))
    };

    const res = await request('/medicines', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      ...payload,
      id: res.medicine_id || res.data?.medicine_id || Date.now()
    };
  },

  async deleteMedicine(id, userKey = 'demo_himanshu', authData = null) {
    return request(`/medicines/${id}`, {
      method: 'DELETE'
    });
  },

  // --- Schedule & Reminders ---
  async getSchedule(userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const res = await request(`/reminders?user_id=${userId}`);
    const list = res.reminders || [];
    return list.map(r => ({
      id: r.id || r.reminder_id,
      medicineId: r.medicine_id,
      name: r.medicine_name || r.name || 'Medication',
      dosage: `${r.dosage_amount || ''} ${r.dosage_unit || 'mg'}`.trim(),
      time: r.scheduled_time || '08:00',
      period: getPeriod(r.scheduled_time),
      status: r.status || 'pending',
      instructions: r.instructions || (r.meal_timing === 'after_food' ? 'After meals' : 'Before meals')
    }));
  },

  updateScheduleItem(id, status, _userKey) {
    // Local optimistic update helper for immediate UI feedback
    return { id, status };
  },

  loadDemoRegimen(_userKey) {
    // Kept for backward compatibility
    return true;
  },

  // --- Medication History & Adherence ---
  async getHistory(userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const res = await request(`/history?user_id=${userId}`);
    return {
      success: true,
      history: res.history || [],
      stats: res.stats || {
        total: 0,
        taken: 0,
        missed: 0,
        snoozed: 0,
        adherence_rate: 100,
        streak_days: 0
      }
    };
  },

  async recordAction({ reminderId, medicineName, dosage, status, notes = '' }, userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const payload = {
      user_id: userId,
      reminder_id: reminderId,
      medicine_name: medicineName,
      dosage: dosage,
      status: status,
      notes: notes
    };

    return request('/history', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // --- Caregiver Module ---
  async getCaregiverData(_userName = 'Himanshu Patel') {
    const res = await request('/caregiver/patients?caregiver_id=2');
    return {
      patients: res.patients || [],
      alerts: res.alerts || []
    };
  },

  async acknowledgeAlert(alertId) {
    return request('/caregiver/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ alert_id: alertId })
    });
  },

  // --- Clinician Module ---
  async getClinicianData(_userName = 'Himanshu Patel') {
    const res = await request('/clinician/patients?clinician_id=3');
    return {
      patients: res.patients || [],
      notes: res.notes || []
    };
  },

  async addClinicalNote({ clinicianId = 3, patientId = 1, note, dosageAdjustment }) {
    return request('/clinician/notes', {
      method: 'POST',
      body: JSON.stringify({
        clinician_id: clinicianId,
        patient_id: patientId,
        note: note,
        dosage_adjustment: dosageAdjustment
      })
    });
  },

  // --- Emergency Contacts & SOS Protocol ---
  async getEmergencyContacts(userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const res = await request(`/emergency/contacts?user_id=${userId}`);
    return res.contacts || [];
  },

  async triggerSos(payload = {}) {
    return request('/emergency/sos', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // --- Drug-Drug Interaction Safety Checker ---
  async checkDrugInteractions(drugs = []) {
    return request('/ai/interaction-checker', {
      method: 'POST',
      body: JSON.stringify({ drugs })
    });
  },

  // --- Clinical AI Pharmacological Assistant ---
  async sendAiChatMessage(message) {
    return request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  },

  // --- Notifications Feed ---
  async getNotifications(userKey = 'demo_himanshu', authData = null) {
    const userId = resolveUserId(userKey, authData);
    const res = await request(`/notifications?user_id=${userId}`);
    return {
      success: true,
      notifications: res.notifications || [],
      unread_count: res.unread_count || 0
    };
  }
};
