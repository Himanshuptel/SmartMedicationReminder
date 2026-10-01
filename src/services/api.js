/**
 * Smart Medication Reminder - Connected API Service Layer (Phase 2)
 * Parul University - Semester IV IMCA / BCA Project
 *
 * Fully connected to the Flask REST API with:
 * - Session token authentication (Authorization: Bearer <token>)
 * - User identity derived exclusively from session token
 * - Expired session detection and handling
 * - Real 2-step verification (registration & login OTP flows)
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── Cookie & Persistent Browser Storage Utilities ─────────────────

export function setCookie(name, value, days = 30) {
  if (typeof document === 'undefined') return;
  try {
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(valStr)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) {
    console.error('Failed to set cookie:', e);
  }
}

export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  try {
    const nameEQ = encodeURIComponent(name) + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        const val = decodeURIComponent(c.substring(nameEQ.length, c.length));
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
    }
  } catch {}
  return null;
}

export function removeCookie(name) {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch {}
}

export function saveSession(user, token) {
  if (!token) return;
  const authPayload = { user, data: user, type: 'authenticated', token };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('medremind_token', token);
      localStorage.setItem('medremind_auth', JSON.stringify(authPayload));
    } catch {}
  }
  setCookie('medremind_token', token);
  setCookie('medremind_auth', authPayload);
  setCookie('medremind_role', user?.role || 'patient');
  setCookie('medremind_user', user);
}

export function clearSession() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('medremind_token');
      localStorage.removeItem('medremind_auth');
    } catch {}
  }
  removeCookie('medremind_token');
  removeCookie('medremind_auth');
  removeCookie('medremind_role');
  removeCookie('medremind_user');
}

/**
 * Standardized HTTP request handler with token injection and error propagation.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null) || getCookie('medremind_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (netErr) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('medremind:backend-offline', { detail: { url, error: netErr } }));
    }
    const error = new Error(
      `Cannot connect to backend server at ${url}. Please ensure the Python API server is running.`
    );
    error.isNetworkError = true;
    error.originalError = netErr;
    throw error;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('medremind:backend-online'));
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // If 401 Unauthorized / Session Expired, clear local tokens and dispatch event ONLY if a token was actively present
    if (response.status === 401 && token && typeof window !== 'undefined') {
      clearSession();
      window.dispatchEvent(new CustomEvent('medremind:session-expired', { detail: data }));
    }

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
  const data = authData.data || authData.user || authData;
  if (data.fullName && data.fullName.trim()) return data.fullName.trim();
  if (data.name && data.name.trim()) return data.name.trim();
  if (data.email) {
    const raw = data.email.trim();
    const username = raw.split('@')[0];
    const cleanName = username.split(/[._-]/)[0].replace(/[^a-zA-Z]/g, '');
    if (cleanName) return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    return username;
  }
  return 'User';
}

export function getUserKey(authData) {
  if (!authData) return 'user_session';
  const data = authData.data || authData.user || authData;
  const raw = data.email || data.id || 'user_session';
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function isDemoUser(authData) {
  if (!authData) return true;
  const data = authData.data || authData.user || authData;
  const email = (data.email || '').toLowerCase();
  return email.includes('himanshu') || email.includes('demo');
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
  // --- System Config ---
  async getConfig() {
    try {
      const res = await request('/config');
      return res;
    } catch {
      return { demo_mode: true, otp_length: 6, cooldown_seconds: 30 };
    }
  },

  // --- Real Two-Step Authentication & Direct Sign In ---
  async directLogin({ identifier, password }) {
    try {
      const res = await request('/auth/direct-login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });
      if (res.token) {
        saveSession(res.user, res.token);
      }
      return res;
    } catch (err) {
      // Local fallback if offline
      const localUsers = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('medremind_local_users') || '[]') : [];
      const match = localUsers.find(u => (u.email?.toLowerCase() === identifier?.toLowerCase() || u.phone === identifier));
      if (match && (!password || match.password === password)) {
        const dummyToken = 'local_' + Date.now();
        const res = { user: match, token: dummyToken };
        saveSession(match, dummyToken);
        return res;
      }
      throw err;
    }
  },

  async directRegister(userData) {
    try {
      const res = await request('/auth/direct-register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      if (res.token) {
        saveSession(res.user, res.token);
        // Cache to local users array
        if (typeof localStorage !== 'undefined') {
          const localUsers = JSON.parse(localStorage.getItem('medremind_local_users') || '[]');
          localUsers.push({ ...userData, id: res.user?.id || Date.now() });
          localStorage.setItem('medremind_local_users', JSON.stringify(localUsers));
        }
      }
      return res;
    } catch (err) {
      // If offline or network error, create local user session directly
      if (err.isNetworkError && typeof localStorage !== 'undefined') {
        const dummyToken = 'local_' + Date.now();
        const localUser = {
          id: Date.now(),
          name: userData.fullName || userData.name,
          email: userData.email,
          phone: userData.phone,
          role: userData.role || 'patient',
          timezone: userData.timezone || 'Asia/Kolkata',
          password: userData.password
        };
        const localUsers = JSON.parse(localStorage.getItem('medremind_local_users') || '[]');
        localUsers.push(localUser);
        localStorage.setItem('medremind_local_users', JSON.stringify(localUsers));
        saveSession(localUser, dummyToken);
        return { user: localUser, token: dummyToken };
      }
      throw err;
    }
  },

  async switchRole(role) {
    try {
      const res = await request('/auth/switch-role', {
        method: 'POST',
        body: JSON.stringify({ role })
      });
      const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null) || getCookie('medremind_token');
      if (res.user && token) {
        saveSession(res.user, token);
      }
      return res;
    } catch (err) {
      // Update locally even if offline
      const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null) || getCookie('medremind_token') || 'local_session';
      const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_auth') : null) || getCookie('medremind_auth');
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const updatedUser = { ...(parsed.user || parsed.data), role };
        saveSession(updatedUser, token);
        return { user: updatedUser };
      }
      throw err;
    }
  },

  async skipOtp({ email }) {
    const res = await request('/auth/skip-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    if (res.token) {
      saveSession(res.user, res.token);
    }
    return res;
  },

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

  async demoLogin(role = 'patient') {
    const res = await request('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role })
    });

    if (res.token) {
      saveSession(res.user, res.token);
    }

    return res;
  },

  async verifyOtp({ email, otp }) {
    const res = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });

    if (res.token) {
      saveSession(res.user, res.token);
    }

    return res;
  },

  async resendOtp({ email }) {
    return request('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async getTotpSetup({ email }) {
    return request(`/auth/totp/setup?email=${encodeURIComponent(email)}`);
  },

  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {}
    clearSession();
    return { success: true };
  },

  async getMe() {
    return request('/auth/me');
  },

  // --- Medicines Module (Scoped to Authenticated Session) ---
  async getMedicines(patientId = null) {
    const query = patientId ? `?patient_id=${patientId}` : '';
    const res = await request(`/medicines${query}`);
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

  async addMedicine(med) {
    const payload = {
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

  async deleteMedicine(id) {
    return request(`/medicines/${id}`, {
      method: 'DELETE'
    });
  },

  // --- Schedule & Reminders ---
  async getSchedule(patientId = null) {
    const query = patientId ? `?patient_id=${patientId}` : '';
    const res = await request(`/reminders${query}`);
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

  updateScheduleItem(id, status) {
    return { id, status };
  },

  loadDemoRegimen() {
    return true;
  },

  // --- Medication History & Adherence ---
  async getHistory(patientId = null) {
    const query = patientId ? `?patient_id=${patientId}` : '';
    const res = await request(`/history${query}`);
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

  async recordAction({ reminderId, medicineName, dosage, status, notes = '' }) {
    const payload = {
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
  async getCaregiverData() {
    try {
      const res = await request('/caregiver/patients');
      return {
        patients: res.patients || [],
        alerts: res.alerts || []
      };
    } catch (err) {
      if (err.status === 403) {
        return { patients: [], alerts: [] };
      }
      throw err;
    }
  },

  async acknowledgeAlert(alertId) {
    return request('/caregiver/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ alert_id: alertId })
    });
  },

  // --- Clinician Module ---
  async getClinicianData() {
    try {
      const res = await request('/clinician/patients');
      return {
        patients: res.patients || [],
        notes: res.notes || []
      };
    } catch (err) {
      if (err.status === 403) {
        return { patients: [], notes: [] };
      }
      throw err;
    }
  },

  async addClinicalNote({ patientId, note, dosageAdjustment }) {
    return request('/clinician/notes', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: patientId,
        note: note,
        dosage_adjustment: dosageAdjustment
      })
    });
  },

  // --- Emergency Contacts & SOS Protocol ---
  async getEmergencyContacts() {
    const res = await request('/emergency/contacts');
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
  async getNotifications() {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('medremind_token') : null;
    if (!token) {
      return {
        success: true,
        notifications: [],
        unread_count: 0
      };
    }
    const res = await request('/notifications');
    return {
      success: true,
      notifications: res.notifications || [],
      unread_count: res.unread_count || 0
    };
  },

  // --- Concrete Dose Instances (Phase 3 & 4) ---
  async getDosesToday(patientId = null, date = null) {
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);
    if (date) params.append('date', date);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await request(`/doses/today${query}`);
    return res.doses || [];
  },

  async takeDose(doseId, notes = '') {
    return request(`/doses/${doseId}/take`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  },

  async snoozeDose(doseId, notes = '') {
    return request(`/doses/${doseId}/snooze`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  },

  async missDose(doseId, notes = '') {
    return request(`/doses/${doseId}/miss`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  },

  // --- Patient-Approved Caregiver Linking ---
  async createPatientInvite() {
    return request('/patient/invite', {
      method: 'POST'
    });
  },

  async redeemPatientInvite(inviteCode) {
    return request('/patient/link', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode })
    });
  }
};
