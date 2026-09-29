import React, { useState, useEffect, useCallback } from 'react';
import {
  PillIcon, ClockIcon, CheckCircleIcon, AlertTriangleIcon,
  RepeatIcon, PlusIcon, SearchIcon, Trash2Icon, FileTextIcon,
  BotIcon, SparklesIcon, SendIcon, UsersIcon,
  StethoscopeIcon, BarChart2Icon, CheckIcon
} from '../components/Icons';
import AddMedicineModal from '../components/AddMedicineModal';
import { api, getUserDisplayName, getUserKey, isDemoUser } from '../services/api';
import { playSuccessChime } from '../services/sound';

export default function DashboardScreen({
  authData,
  currentRole,
  onOpenSos,
  onTriggerAlarm
}) {
  const userName = getUserDisplayName(authData);
  const userKey = getUserKey(authData);
  const isDemo = isDemoUser(authData);

  const [activeTab, setActiveTab] = useState('schedule');
  const [medicines, setMedicines] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [historyData, setHistoryData] = useState({ history: [], stats: {} });
  const [caregiverData, setCaregiverData] = useState({ patients: [], alerts: [] });
  const [clinicianData, setClinicianData] = useState({ patients: [], notes: [] });
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [showAddMed, setShowAddMed] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');

  // Drug interaction checker state
  const [selectedDrugs, setSelectedDrugs] = useState(['Metformin', 'Lisinopril']);
  const [interactionResults, setInteractionResults] = useState(null);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'bot',
      text: `Hello ${userName}! I am your AI Medication Clinical Assistant. Ask me anything about dosage schedules, what to do if you miss a dose, food interactions, or medication storage.`,
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  // New Clinical Note form
  const [newNote, setNewNote] = useState('');
  const [newDosageAdj, setNewDosageAdj] = useState('');

  // Clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial data scoped to this specific user account
  const loadData = useCallback(async () => {
    try {
      const [meds, sched, hist, cg, cl, ec] = await Promise.all([
        api.getMedicines(userKey),
        api.getSchedule(userKey),
        api.getHistory(userKey),
        api.getCaregiverData(userName),
        api.getClinicianData(userName),
        api.getEmergencyContacts(userKey)
      ]);
      setMedicines(meds);
      setSchedule(sched);
      setHistoryData(hist);
      setCaregiverData(cg);
      setClinicianData(cl);
      setEmergencyContacts(ec);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }, [userKey, userName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync tab when TopBar role changes
  useEffect(() => {
    if (currentRole === 'caregiver') setActiveTab('caregiver');
    else if (currentRole === 'clinician') setActiveTab('clinician');
  }, [currentRole]);

  // Actions scoped to user
  const handleTakeDose = async (item) => {
    playSuccessChime();
    setSchedule(prev => prev.map(s => s.id === item.id ? { ...s, status: 'taken' } : s));
    try {
      await api.recordAction({
        reminderId: item.medicineId || item.id,
        medicineName: item.name,
        dosage: item.dosage,
        status: 'taken',
        notes: 'Confirmed intake via Schedule tab'
      }, userKey);
      await loadData();
    } catch (err) {
      console.error('Failed to record dose intake:', err);
    }
  };

  const handleSnoozeDose = async (item) => {
    setSchedule(prev => prev.map(s => s.id === item.id ? { ...s, status: 'snoozed' } : s));
    try {
      await api.recordAction({
        reminderId: item.medicineId || item.id,
        medicineName: item.name,
        dosage: item.dosage,
        status: 'snoozed',
        notes: 'Snoozed 10 minutes'
      }, userKey);
      await loadData();
    } catch (err) {
      console.error('Failed to record dose snooze:', err);
    }
  };

  const handleMissDose = async (item) => {
    setSchedule(prev => prev.map(s => s.id === item.id ? { ...s, status: 'missed' } : s));
    try {
      await api.recordAction({
        reminderId: item.medicineId || item.id,
        medicineName: item.name,
        dosage: item.dosage,
        status: 'missed',
        notes: 'Patient reported dose skipped'
      }, userKey);
      await loadData();
    } catch (err) {
      console.error('Failed to record missed dose:', err);
    }
  };

  const handleAddMedicine = async (medData) => {
    await api.addMedicine(medData, userKey);
    await loadData();
  };

  const handleDeleteMed = async (id) => {
    if (confirm('Are you sure you want to remove this medication from your active regimen?')) {
      await api.deleteMedicine(id, userKey);
      await loadData();
    }
  };

  const handleLoadSampleRegimen = () => {
    api.loadDemoRegimen(userKey);
    loadData();
  };

  const handleCheckInteractions = async () => {
    setCheckingInteractions(true);
    const res = await api.checkDrugInteractions(selectedDrugs);
    setInteractionResults(res.interactions);
    setCheckingInteractions(false);
  };

  const toggleDrugSelection = (drugName) => {
    if (selectedDrugs.includes(drugName)) {
      setSelectedDrugs(selectedDrugs.filter(d => d !== drugName));
    } else {
      setSelectedDrugs([...selectedDrugs, drugName]);
    }
  };

  const handleSendChat = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || sendingChat) return;

    const userMsg = { sender: 'user', text: chatInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setChatMessages(prev => [...prev, userMsg]);
    const query = chatInput;
    setChatInput('');
    setSendingChat(true);

    try {
      const res = await api.sendAiChatMessage(query);
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: res.reply, time: res.timestamp }
      ]);
    } catch {
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: 'I am currently operating in offline mode. For emergency queries, please use the SOS button.', time: 'Now' }
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    await api.acknowledgeAlert(alertId);
    setCaregiverData(prev => ({
      ...prev,
      alerts: prev.alerts.map(a => a.id === alertId ? { ...a, status: 'acknowledged' } : a)
    }));
  };

  const handleAddDoctorNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const added = await api.addClinicalNote({
      patientId: 1,
      note: newNote,
      dosageAdjustment: newDosageAdj
    });
    setClinicianData(prev => ({
      ...prev,
      notes: [added, ...prev.notes]
    }));
    setNewNote('');
    setNewDosageAdj('');
    alert('Clinical recommendation saved and dispatched to patient Himanshu Patel.');
  };

  // Export CSV
  const handleExportCsv = () => {
    const rows = [
      ['ID', 'Medicine', 'Dosage', 'Status', 'Scheduled Time', 'Action Time', 'Notes'],
      ...(historyData.history || []).map(h => [
        h.id, h.medicine_name, h.dosage, h.status, h.scheduled_time, h.action_time, `"${h.notes || ''}"`
      ])
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medication_adherence_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered meds
  const filteredMeds = medicines.filter(m =>
    m.name.toLowerCase().includes(medSearch.toLowerCase()) ||
    m.instructions.toLowerCase().includes(medSearch.toLowerCase())
  );

  // Filtered history
  const filteredHistory = (historyData.history || []).filter(h => {
    if (historyFilter === 'all') return true;
    return h.status === historyFilter;
  });

  return (
    <div className="dashboard-container">
      {/* Header Banner */}
      <div className="dashboard-header">
        <div className="dashboard-header-text">
          <div className="dashboard-eyebrow">
            <span>Parul University Healthcare Portal</span>
            <span className="dot-divider">•</span>
            <span className="time-badge">{currentTime.toLocaleTimeString()}</span>
          </div>
          <h1 className="dashboard-title">
            Welcome back, {userName}
          </h1>
          <p className="dashboard-sub">
            Your daily adherence score is <strong>{historyData.stats?.adherence_rate || (isDemo ? 88 : 100)}%</strong> with an active <strong>{historyData.stats?.streak_days || (isDemo ? 6 : 0)}-day streak</strong>.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddMed(true)}
          >
            <PlusIcon size={16} />
            <span>Add Medicine</span>
          </button>
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={onOpenSos}
          >
            <AlertTriangleIcon size={16} />
            <span>Emergency SOS</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="dashboard-nav-tabs" role="tablist" aria-label="Portal Navigation">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'schedule'}
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <ClockIcon size={16} />
          <span>Today's Schedule</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'medicines'}
          className={`tab-btn ${activeTab === 'medicines' ? 'active' : ''}`}
          onClick={() => setActiveTab('medicines')}
        >
          <PillIcon size={16} />
          <span>Medicine Catalog</span>
          <span className="tab-counter">{medicines.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <BarChart2Icon size={16} />
          <span>Adherence & History</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'caregiver'}
          className={`tab-btn ${activeTab === 'caregiver' ? 'active' : ''}`}
          onClick={() => setActiveTab('caregiver')}
        >
          <UsersIcon size={16} />
          <span>Caregiver Portal</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'clinician'}
          className={`tab-btn ${activeTab === 'clinician' ? 'active' : ''}`}
          onClick={() => setActiveTab('clinician')}
        >
          <StethoscopeIcon size={16} />
          <span>Clinician View</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ai-emergency'}
          className={`tab-btn ${activeTab === 'ai-emergency' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai-emergency')}
        >
          <BotIcon size={16} />
          <span>AI & Safety Hub</span>
        </button>
      </nav>

      {/* TAB 1: TODAY'S SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="tab-pane">
          {/* Quick Metrics Bar */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Prescribed Medications</span>
              <div className="stat-number">{medicines.length}</div>
              <span className="stat-sub">Active in regimen</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Taken Today</span>
              <div className="stat-number text-success">
                {schedule.filter(s => s.status === 'taken').length} / {schedule.length}
              </div>
              <span className="stat-sub">Doses confirmed</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">On-Time Adherence</span>
              <div className="stat-number text-primary">{historyData.stats?.adherence_rate || (isDemo ? 88 : 100)}%</div>
              <span className="stat-sub">Compliance score</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Low Stock Alerts</span>
              <div className="stat-number text-warning">
                {medicines.filter(m => m.stockRemaining <= m.lowStockThreshold).length}
              </div>
              <span className="stat-sub">Refill recommended</span>
            </div>
          </div>

          {/* Next Dose Banner */}
          {schedule.length > 0 ? (
            <div className="next-dose-banner">
              <div className="next-dose-info">
                <span className="badge badge-pulse">UPCOMING REMINDER</span>
                <h3>{schedule[0].name} {schedule[0].dosage} • {schedule[0].time}</h3>
                <p>{schedule[0].instructions || 'Take as prescribed.'}</p>
              </div>
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => onTriggerAlarm({
                  name: schedule[0].name,
                  dosage: schedule[0].dosage,
                  instructions: schedule[0].instructions,
                  scheduledTime: schedule[0].time
                })}
              >
                <ClockIcon size={16} />
                <span>Simulate Alarm Now</span>
              </button>
            </div>
          ) : (
            <div className="next-dose-banner" style={{ background: 'var(--color-surface-2)', border: '1px dashed var(--color-border)' }}>
              <div className="next-dose-info">
                <span className="badge" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>NEW ACCOUNT SETUP</span>
                <h3>Welcome, {userName}!</h3>
                <p>Add your first medication to activate your automated reminder schedule.</p>
              </div>
              <div className="next-dose-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowAddMed(true)}
                >
                  <PlusIcon size={16} />
                  <span>Add First Medicine</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLoadSampleRegimen}
                >
                  <span>Populate Sample Regimen</span>
                </button>
              </div>
            </div>
          )}

          {/* Schedule Timeline */}
          <div className="card schedule-card">
            <div className="card-header-flex">
              <div>
                <h2 className="card-title">Today's Intake Schedule</h2>
                <p className="card-sub">Record dose actions or snooze if needed</p>
              </div>
              <span className="schedule-date-tag">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div className="timeline-list">
              {schedule.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' }}>
                  <PillIcon size={36} color="var(--color-primary)" />
                  <h3 style={{ margin: '12px 0 6px 0' }}>No Medications Scheduled Yet</h3>
                  <p style={{ margin: '0 0 16px 0', color: 'var(--color-text-2)', fontSize: '0.9rem' }}>
                    Welcome to your personalized account! Start by adding your prescribed medicines.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddMed(true)}>
                      <PlusIcon size={14} />
                      <span>Add Medicine</span>
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleLoadSampleRegimen}>
                      <span>Load Sample Regimen</span>
                    </button>
                  </div>
                </div>
              ) : (
                schedule.map((item) => (
                <div key={item.id} className={`timeline-item status-${item.status}`}>
                  <div className="timeline-time-col">
                    <strong className="timeline-time">{item.time}</strong>
                    <span className="timeline-period">{item.period}</span>
                  </div>

                  <div className="timeline-content">
                    <div className="timeline-med-header">
                      <div className="timeline-med-name">
                        <PillIcon size={16} />
                        <strong>{item.name}</strong>
                        <span className="dosage-pill">{item.dosage}</span>
                      </div>
                      <span className={`status-badge status-badge-${item.status}`}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>

                    <p className="timeline-instructions">{item.instructions}</p>

                    <div className="timeline-actions">
                      {item.status === 'taken' ? (
                        <div className="confirmed-taken">
                          <CheckCircleIcon size={16} color="var(--color-success)" />
                          <span>Dose Taken</span>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => handleTakeDose(item)}
                          >
                            <CheckIcon size={14} />
                            <span>Take Dose</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSnoozeDose(item)}
                          >
                            <RepeatIcon size={14} />
                            <span>Snooze (10m)</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-danger-text"
                            onClick={() => handleMissDose(item)}
                          >
                            <span>Skip</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MEDICINE MANAGEMENT */}
      {activeTab === 'medicines' && (
        <div className="tab-pane">
          <div className="catalog-toolbar">
            <div className="search-box">
              <SearchIcon size={18} />
              <input
                type="text"
                placeholder="Search medications by name or instructions..."
                value={medSearch}
                onChange={e => setMedSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddMed(true)}
            >
              <PlusIcon size={16} />
              <span>Add Medication</span>
            </button>
          </div>

          <div className="meds-grid">
            {filteredMeds.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '36px 20px', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
                <PillIcon size={36} color="var(--color-primary)" />
                <h3 style={{ margin: '12px 0 6px 0' }}>Your Medicine Cabinet is Empty</h3>
                <p style={{ margin: '0 0 16px 0', color: 'var(--color-text-2)', fontSize: '0.9rem' }}>
                  Add your prescription details to start receiving reminders and tracking adherence.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button type="button" className="btn btn-primary" onClick={() => setShowAddMed(true)}>
                    <PlusIcon size={16} />
                    <span>Add New Medicine</span>
                  </button>
                  <button type="button" className="btn btn-outline-primary" onClick={handleLoadSampleRegimen}>
                    <span>Populate Sample Medicines</span>
                  </button>
                </div>
              </div>
            ) : (
              filteredMeds.map((med) => {
              const isLowStock = med.stockRemaining <= med.lowStockThreshold;
              return (
                <div key={med.id} className="med-catalog-card">
                  <div className="med-catalog-header">
                    <div className="med-icon-wrap">
                      <PillIcon size={24} color="var(--color-primary)" />
                    </div>
                    <div className="med-title-group">
                      <h3 className="med-name">{med.name}</h3>
                      <span className="med-strength">{med.dosageAmount} {med.dosageUnit}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-btn-danger"
                      onClick={() => handleDeleteMed(med.id)}
                      title="Remove medication"
                    >
                      <Trash2Icon size={16} />
                    </button>
                  </div>

                  <div className="med-details-list">
                    <div className="med-detail-row">
                      <span className="detail-key">Frequency:</span>
                      <strong className="detail-val">{med.frequency}</strong>
                    </div>
                    <div className="med-detail-row">
                      <span className="detail-key">Intake Timing:</span>
                      <strong className="detail-val">{med.mealTiming.replace('_', ' ')}</strong>
                    </div>
                    <div className="med-detail-row">
                      <span className="detail-key">Barcode / QR:</span>
                      <span className="barcode-badge">{med.barcode}</span>
                    </div>
                  </div>

                  {med.instructions && (
                    <div className="med-instruction-box">
                      <span>{med.instructions}</span>
                    </div>
                  )}

                  {/* Stock Tracker */}
                  <div className="stock-tracker">
                    <div className="stock-header">
                      <span>Inventory Stock</span>
                      <strong className={isLowStock ? 'text-danger' : ''}>
                        {med.stockRemaining} pills remaining
                      </strong>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className={`progress-bar-fill ${isLowStock ? 'low-stock-fill' : ''}`}
                        style={{ width: `${Math.min(100, (med.stockRemaining / 30) * 100)}%` }}
                      />
                    </div>
                    {isLowStock && (
                      <span className="refill-warning">
                        ⚠️ Low stock threshold reached. Refill advised.
                      </span>
                    )}
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* TAB 3: ADHERENCE & HISTORY */}
      {activeTab === 'history' && (
        <div className="tab-pane">
          <div className="analytics-overview-row">
            {/* Adherence Score Card */}
            <div className="card adherence-score-card">
              <h3>Adherence Overview</h3>
              <div className="adherence-circle-wrap">
                <div className="adherence-circle">
                  <span className="adherence-pct">{historyData.stats?.adherence_rate || 88}%</span>
                  <span className="adherence-sublabel">Compliant</span>
                </div>
              </div>
              <p className="adherence-summary-text">
                You have logged <strong>{historyData.stats?.taken || 8}</strong> taken doses out of <strong>{historyData.stats?.total || 9}</strong> scheduled doses.
              </p>
            </div>

            {/* 7-Day Adherence Calendar */}
            <div className="card weekly-calendar-card">
              <h3>7-Day Intake Compliance</h3>
              <p className="card-sub">Daily adherence history for this week</p>

              <div className="week-grid">
                {[
                  { day: 'Mon', status: 'taken', rate: '100%' },
                  { day: 'Tue', status: 'taken', rate: '100%' },
                  { day: 'Wed', status: 'missed', rate: '50%' },
                  { day: 'Thu', status: 'taken', rate: '100%' },
                  { day: 'Fri', status: 'taken', rate: '100%' },
                  { day: 'Sat', status: 'snoozed', rate: '75%' },
                  { day: 'Sun (Today)', status: 'taken', rate: '100%' }
                ].map((d, i) => (
                  <div key={i} className={`week-day-cell cell-${d.status}`}>
                    <span className="cell-day">{d.day}</span>
                    <div className="cell-indicator">
                      {d.status === 'taken' && <CheckCircleIcon size={18} color="var(--color-success)" />}
                      {d.status === 'snoozed' && <RepeatIcon size={18} color="var(--color-warning)" />}
                      {d.status === 'missed' && <AlertTriangleIcon size={18} color="var(--color-error)" />}
                    </div>
                    <span className="cell-rate">{d.rate}</span>
                  </div>
                ))}
              </div>

              <div className="export-row" style={{ marginTop: 24 }}>
                <button type="button" className="btn btn-outline-primary" onClick={handleExportCsv}>
                  <FileTextIcon size={16} />
                  <span>Export Adherence Log (CSV)</span>
                </button>
              </div>
            </div>
          </div>

          {/* History Log Table */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header-flex">
              <div>
                <h3 className="card-title">Medication Intake History</h3>
                <p className="card-sub">Complete chronological audit trail</p>
              </div>
              <div className="filter-pill-group">
                {['all', 'taken', 'snoozed', 'missed'].map(f => (
                  <button
                    key={f}
                    type="button"
                    className={`filter-pill ${historyFilter === f ? 'active' : ''}`}
                    onClick={() => setHistoryFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dosage</th>
                    <th>Status</th>
                    <th>Scheduled For</th>
                    <th>Logged At</th>
                    <th>Clinical Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((h, i) => (
                    <tr key={i}>
                      <td><strong>{h.medicine_name}</strong></td>
                      <td>{h.dosage}</td>
                      <td>
                        <span className={`status-badge status-badge-${h.status}`}>
                          {h.status.toUpperCase()}
                        </span>
                      </td>
                      <td>{h.scheduled_time}</td>
                      <td>{h.action_time}</td>
                      <td style={{ color: 'var(--color-text-2)', fontSize: '0.85rem' }}>{h.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CAREGIVER PORTAL */}
      {activeTab === 'caregiver' && (
        <div className="tab-pane">
          <div className="caregiver-banner">
            <div className="caregiver-banner-icon">
              <UsersIcon size={32} color="var(--color-primary)" />
            </div>
            <div>
              <h2 style={{ margin: 0 }}>Caregiver Remote Monitoring Station</h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-2)' }}>
                Caregiver: <strong>Divyadarshan Chauhan</strong> • Linked to Patient: <strong>Himanshu Patel</strong>
              </p>
            </div>
          </div>

          <div className="portal-grid">
            {/* Monitored Patient Card */}
            <div className="card">
              <h3 className="card-title">Monitored Patient Profile</h3>
              <div className="patient-stat-box">
                <div className="patient-avatar">H</div>
                <div>
                  <h4 style={{ margin: 0 }}>Himanshu Patel</h4>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-2)' }}>himanshu@paruluniversity.ac.in</span>
                </div>
              </div>

              <div className="patient-vitals-grid">
                <div className="vital-item">
                  <span>Adherence Score</span>
                  <strong className="text-primary">89.5%</strong>
                </div>
                <div className="vital-item">
                  <span>Current Regimen</span>
                  <strong>4 Active Meds</strong>
                </div>
                <div className="vital-item">
                  <span>Escalation Protocol</span>
                  <strong className="text-success">Active & Online</strong>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => alert('Supportive reminder notification dispatched to patient Himanshu Patel.')}
                >
                  <SendIcon size={14} />
                  <span>Send Supportive Medication Nudge</span>
                </button>
              </div>

              {emergencyContacts.length > 0 && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>
                    Linked Emergency Escalation Contacts
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {emergencyContacts.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', background: 'var(--color-surface-2)', padding: '6px 10px', borderRadius: 6 }}>
                        <span>{c.name} ({c.relation})</span>
                        <strong style={{ color: 'var(--color-primary)' }}>{c.phone}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Missed-Dose Alerts & Escalations Feed */}
            <div className="card">
              <h3 className="card-title">Live Escalation & Missed-Dose Alerts</h3>
              <p className="card-sub">Requires caregiver remote acknowledgement</p>

              <div className="alerts-feed">
                {caregiverData.alerts.map((al) => (
                  <div key={al.id} className={`alert-feed-item ${al.status === 'unread' ? 'urgent' : ''}`}>
                    <div className="alert-feed-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangleIcon size={16} color={al.type === 'missed_dose' ? 'var(--color-error)' : 'var(--color-warning)'} />
                        <strong>{al.title}</strong>
                      </div>
                      <span className="alert-time">{al.time}</span>
                    </div>
                    <p className="alert-message">{al.message}</p>

                    <div className="alert-action-row">
                      {al.status === 'acknowledged' ? (
                        <span className="ack-tag">
                          <CheckCircleIcon size={14} color="var(--color-success)" />
                          <span>Acknowledged</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => handleAcknowledgeAlert(al.id)}
                        >
                          <CheckIcon size={14} />
                          <span>Acknowledge Alert</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CLINICIAN VIEW */}
      {activeTab === 'clinician' && (
        <div className="tab-pane">
          <div className="caregiver-banner" style={{ background: 'rgba(59, 130, 246, 0.08)', borderColor: 'var(--color-accent)' }}>
            <div className="caregiver-banner-icon" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
              <StethoscopeIcon size={32} color="var(--color-accent)" />
            </div>
            <div>
              <h2 style={{ margin: 0 }}>Clinician Medical Regimen Review</h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-2)' }}>
                Attending Clinician: <strong>Prof. Sathwik Chebrolu</strong> • Patient ID: <strong>#PU-PAT-2405</strong>
              </p>
            </div>
          </div>

          <div className="portal-grid">
            {/* Clinical Regimen Assessment */}
            <div className="card">
              <h3 className="card-title">Patient Clinical Assessment</h3>
              <div className="patient-vitals-grid" style={{ marginTop: 12 }}>
                <div className="vital-item">
                  <span>Recent Blood Pressure</span>
                  <strong>124 / 82 mmHg</strong>
                </div>
                <div className="vital-item">
                  <span>Fasting Glucose</span>
                  <strong>108 mg/dL</strong>
                </div>
                <div className="vital-item">
                  <span>Non-Compliance Risk</span>
                  <strong className="text-success">Low Risk</strong>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Active Prescriptions</h4>
                <ul className="clinical-presc-list">
                  {medicines.map((m, i) => (
                    <li key={i} className="clinical-presc-item">
                      <strong>{m.name} ({m.dosageAmount} {m.dosageUnit})</strong>
                      <span>Frequency: {m.frequency} • {m.mealTiming.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Add Clinical Note Form */}
            <div className="card">
              <h3 className="card-title">Add Clinical Note & Recommendations</h3>
              <p className="card-sub">Will be visible on patient's notification feed</p>

              <form onSubmit={handleAddDoctorNote}>
                <div className="form-group">
                  <label className="form-label">Clinical Observations</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Enter clinical assessment or adherence remarks..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Dosage Adjustment / Guidance</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Maintain Metformin 500mg BID. Review in 3 weeks."
                    value={newDosageAdj}
                    onChange={e => setNewDosageAdj(e.target.value)}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <CheckIcon size={16} />
                  <span>Publish Clinical Recommendation</span>
                </button>
              </form>

              {/* Past Doctor Notes */}
              <div style={{ marginTop: 24 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Recent Clinical Entries</h4>
                {clinicianData.notes.map((n, i) => (
                  <div key={i} className="clinical-note-item">
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>"{n.note}"</p>
                    {n.dosage_adjustment && (
                      <span className="dosage-adj-tag">Recommendation: {n.dosage_adjustment}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: EMERGENCY & AI SAFETY HUB */}
      {activeTab === 'ai-emergency' && (
        <div className="tab-pane">
          {/* Emergency SOS Banner */}
          <div className="emergency-hero-banner">
            <div className="emergency-hero-content">
              <div className="sos-badge">EMERGENCY PROTOCOL MODULE</div>
              <h2>Instant SOS Distress Broadcast</h2>
              <p>
                Triggers visual alert, high-decibel synthesizer siren, and automated dispatch to your family and emergency hospital units with GPS coordinates.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-lg emergency-sos-cta"
              onClick={onOpenSos}
            >
              <AlertTriangleIcon size={24} strokeWidth={2.5} />
              <span>TRIGGER SOS EMERGENCY</span>
            </button>
          </div>

          <div className="portal-grid" style={{ marginTop: 24 }}>
            {/* Drug-Drug Interaction Checker */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SparklesIcon size={20} color="var(--color-primary)" />
                <h3 className="card-title" style={{ margin: 0 }}>Drug-Drug Interaction Checker</h3>
              </div>
              <p className="card-sub">
                Select combinations from your active medications or additives to verify clinical safety
              </p>

              <div className="drug-pill-selector">
                {['Metformin', 'Lisinopril', 'Atorvastatin', 'Aspirin', 'Warfarin', 'Ibuprofen', 'Alcohol'].map(d => {
                  const isSelected = selectedDrugs.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`drug-select-pill ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleDrugSelection(d)}
                    >
                      <span>{d}</span>
                      {isSelected ? <CheckIcon size={12} /> : <PlusIcon size={12} />}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCheckInteractions}
                  disabled={checkingInteractions || selectedDrugs.length < 2}
                  style={{ width: '100%' }}
                >
                  <SparklesIcon size={16} />
                  <span>
                    {checkingInteractions
                      ? 'Analyzing Pharmacological Safety...'
                      : `Analyze Selected (${selectedDrugs.length} Drugs)`}
                  </span>
                </button>
              </div>

              {/* Interaction Results */}
              {interactionResults && (
                <div className="interaction-results-box">
                  {interactionResults.map((item, idx) => (
                    <div key={idx} className={`interaction-item severity-${item.severity.toLowerCase().replace(/[^a-z]/g, '')}`}>
                      <div className="interaction-header">
                        <span className={`severity-tag severity-${item.severity.toLowerCase().replace(/[^a-z]/g, '')}`}>
                          {item.severity}
                        </span>
                        <strong>{item.drugs.join(' + ')}</strong>
                      </div>
                      <p className="interaction-desc">{item.description}</p>
                      <div className="interaction-recom">
                        <strong>Clinical Guidance:</strong> {item.recommendation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Clinical Medication Assistant Chatbot */}
            <div className="card chatbot-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <BotIcon size={20} color="var(--color-primary)" />
                <h3 className="card-title" style={{ margin: 0 }}>AI Medication Assistant</h3>
              </div>
              <p className="card-sub">Instant answers on missed doses, storage, and food guidance</p>

              {/* Suggested Questions */}
              <div className="suggestion-chips">
                {[
                  'What if I missed a dose of Metformin?',
                  'Can I take pain relievers on an empty stomach?',
                  'Are there food interactions with Lisinopril?'
                ].map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => {
                      setChatInput(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Chat Messages */}
              <div className="chat-window">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`chat-bubble-row ${m.sender === 'user' ? 'user-row' : 'bot-row'}`}>
                    {m.sender === 'bot' && (
                      <div className="bot-chat-avatar">
                        <BotIcon size={14} color="#ffffff" />
                      </div>
                    )}
                    <div className={`chat-bubble ${m.sender === 'user' ? 'bubble-user' : 'bubble-bot'}`}>
                      <p>{m.text}</p>
                      <span className="chat-timestamp">{m.time}</span>
                    </div>
                  </div>
                ))}
                {sendingChat && (
                  <div className="chat-bubble-row bot-row">
                    <div className="bot-chat-avatar">
                      <BotIcon size={14} color="#ffffff" />
                    </div>
                    <div className="chat-bubble bubble-bot typing-bubble">
                      <span>Clinical AI is formulating response...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="chat-input-bar">
                <input
                  type="text"
                  placeholder="Ask a medical or schedule question..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  className="chat-input"
                />
                <button
                  type="submit"
                  className="btn btn-primary chat-send-btn"
                  disabled={!chatInput.trim() || sendingChat}
                >
                  <SendIcon size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Medicine Modal */}
      {showAddMed && (
        <AddMedicineModal
          onClose={() => setShowAddMed(false)}
          onSave={handleAddMedicine}
        />
      )}
    </div>
  );
}
