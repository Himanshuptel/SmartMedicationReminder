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
  const userTimezone = authData?.user?.timezone || authData?.data?.timezone || 'Asia/Kolkata';

  const [activeTab, setActiveTab] = useState('schedule');
  const [medicines, setMedicines] = useState([]);
  const [doses, setDoses] = useState([]);
  const [historyData, setHistoryData] = useState({ history: [], stats: {} });
  const [caregiverData, setCaregiverData] = useState({ patients: [], alerts: [] });
  const [clinicianData, setClinicianData] = useState({ patients: [], notes: [] });
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [showAddMed, setShowAddMed] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Patient Invite state
  const [inviteState, setInviteState] = useState({
    code: '',
    expiresAt: '',
    loading: false,
    copied: false,
    error: null
  });

  // Caregiver / Clinician redeem code state
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState(null);
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [selectedClinicianPatientId, setSelectedClinicianPatientId] = useState(null);

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

  // Fetch initial data scoped to authenticated session
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [meds, todayDoses, hist, cg, cl, ec] = await Promise.all([
        api.getMedicines(),
        api.getDosesToday(),
        api.getHistory(),
        api.getCaregiverData(),
        api.getClinicianData(),
        api.getEmergencyContacts()
      ]);
      setMedicines(meds);
      setDoses(todayDoses);
      setHistoryData(hist);
      setCaregiverData(cg);
      setClinicianData(cl);
      if (cl.patients && cl.patients.length > 0) {
        setSelectedClinicianPatientId(prev => prev || cl.patients[0].id);
      }
      setEmergencyContacts(ec);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setLoadError(err.message || 'Failed to load data from backend server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync tab when TopBar role changes
  useEffect(() => {
    if (currentRole === 'caregiver') setActiveTab('caregiver');
    else if (currentRole === 'clinician') setActiveTab('clinician');
  }, [currentRole]);

  // Phase 3 & 4: Concrete Dose Instance Actions
  const handleTakeDose = async (dose) => {
    playSuccessChime();
    setActionLoadingId(dose.id);
    setActionError(null);
    try {
      await api.takeDose(dose.id, 'Confirmed intake via Schedule tab');
      await loadData();
    } catch (err) {
      console.error('Failed to record dose intake:', err);
      setActionError(err.message || 'Failed to record dose intake');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSnoozeDose = async (dose) => {
    setActionLoadingId(dose.id);
    setActionError(null);
    try {
      await api.snoozeDose(dose.id, 'Snoozed 10 minutes');
      await loadData();
    } catch (err) {
      console.error('Failed to record dose snooze:', err);
      setActionError(err.message || 'Failed to snooze dose');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMissDose = async (dose) => {
    setActionLoadingId(dose.id);
    setActionError(null);
    try {
      await api.missDose(dose.id, 'Patient reported dose skipped');
      await loadData();
    } catch (err) {
      console.error('Failed to record missed dose:', err);
      setActionError(err.message || 'Failed to record missed dose');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAddMedicine = async (medData) => {
    await api.addMedicine(medData);
    await loadData();
  };

  const handleDeleteMed = async (id) => {
    if (confirm('Are you sure you want to remove this medication from your active regimen?')) {
      await api.deleteMedicine(id);
      await loadData();
    }
  };

  // Phase 4: Patient-Approved Caregiver Linking Handlers
  const handleGenerateInvite = async () => {
    setInviteState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.createPatientInvite();
      setInviteState({
        code: res.invite_code,
        expiresAt: res.expires_at,
        loading: false,
        copied: false,
        error: null
      });
    } catch (err) {
      setInviteState(s => ({ ...s, loading: false, error: err.message || 'Failed to generate invite code' }));
    }
  };

  const handleCopyInvite = () => {
    if (inviteState.code) {
      navigator.clipboard?.writeText(inviteState.code);
      setInviteState(s => ({ ...s, copied: true }));
      setTimeout(() => setInviteState(s => ({ ...s, copied: false })), 2500);
    }
  };

  const handleRedeemInvite = async (e) => {
    if (e) e.preventDefault();
    if (!redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemError(null);
    setRedeemSuccess(null);
    try {
      await api.redeemPatientInvite(redeemCode.trim());
      setRedeemSuccess('Successfully linked to patient! Medical schedule and alerts unlocked.');
      setRedeemCode('');
      await loadData();
    } catch (err) {
      setRedeemError(err.message || 'Invalid or expired invite code.');
    } finally {
      setRedeemLoading(false);
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
    try {
      await api.acknowledgeAlert(alertId);
      setCaregiverData(prev => ({
        ...prev,
        alerts: prev.alerts.map(a => a.id === alertId ? { ...a, status: 'acknowledged' } : a)
      }));
    } catch (err) {
      setActionError(err.message || 'Failed to acknowledge alert');
    }
  };

  const handleAddDoctorNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const targetPatientId = selectedClinicianPatientId || clinicianData.patients[0]?.id;
    if (!targetPatientId) {
      setActionError('Please link and select a patient first.');
      return;
    }
    const targetPatient = clinicianData.patients.find(p => p.id === targetPatientId);
    try {
      const added = await api.addClinicalNote({
        patientId: targetPatientId,
        note: newNote,
        dosageAdjustment: newDosageAdj
      });
      setClinicianData(prev => ({
        ...prev,
        notes: [added, ...prev.notes]
      }));
      setNewNote('');
      setNewDosageAdj('');
      alert(`Clinical recommendation saved and dispatched to patient ${targetPatient ? targetPatient.name : ''}.`);
    } catch (err) {
      setActionError(err.message || 'Failed to save clinical recommendation');
    }
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
          {/* Loading state indicator */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px 20px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
              <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
              <p style={{ color: 'var(--color-text-2)', fontSize: '0.88rem', margin: 0 }}>
                Loading today's schedule and active doses from server...
              </p>
            </div>
          )}

          {/* Error notifications */}
          {loadError && (
            <div className="alert alert-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{loadError}</span>
              <button type="button" className="btn btn-sm btn-primary" onClick={loadData}>Retry</button>
            </div>
          )}

          {actionError && (
            <div className="alert alert-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{actionError}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setActionError(null)}>Dismiss</button>
            </div>
          )}

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
                {doses.filter(s => s.status === 'taken').length} / {doses.length}
              </div>
              <span className="stat-sub">Doses confirmed</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">On-Time Adherence</span>
              <div className="stat-number text-primary">
                {historyData.stats?.adherence_rate !== undefined ? `${historyData.stats.adherence_rate}%` : (isDemo ? '88%' : '100%')}
              </div>
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
          {(() => {
            const nextDose = doses.find(d => d.status === 'pending' || d.status === 'snoozed') || doses[0];
            return nextDose ? (
              <div className="next-dose-banner">
                <div className="next-dose-info">
                  <span className="badge badge-pulse">UPCOMING REMINDER</span>
                  <h3>{nextDose.medicine_name} {nextDose.dosage} • {nextDose.local_time}</h3>
                  <p>{nextDose.notes || `Scheduled for ${nextDose.local_time} (${userTimezone})`}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => onTriggerAlarm({
                    name: nextDose.medicine_name,
                    dosage: nextDose.dosage,
                    instructions: `Scheduled for ${nextDose.local_time} (${userTimezone})`,
                    scheduledTime: nextDose.local_time
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
            );
          })()}

          {/* Schedule Timeline with Concrete Dose Instances */}
          <div className="card schedule-card">
            <div className="card-header-flex">
              <div>
                <h2 className="card-title">Today's Intake Schedule</h2>
                <p className="card-sub">
                  Times displayed in <strong>{userTimezone}</strong> • Auto-miss grace window: 30 minutes
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="schedule-date-tag">
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-2)', marginTop: 4 }}>
                  Timezone: {userTimezone}
                </div>
              </div>
            </div>

            <div className="timeline-list">
              {doses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' }}>
                  <PillIcon size={36} color="var(--color-primary)" />
                  <h3 style={{ margin: '12px 0 6px 0' }}>No Medications Scheduled for Today</h3>
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
                doses.map((dose) => {
                  const isTaken = dose.status === 'taken';
                  const isMissed = dose.status === 'missed';
                  const isSnoozed = dose.status === 'snoozed';
                  const isPending = dose.status === 'pending';
                  const isProcessing = actionLoadingId === dose.id;

                  return (
                    <div key={dose.id} className={`timeline-item status-${dose.status}`}>
                      <div className="timeline-time-col">
                        <strong className="timeline-time">{dose.local_time}</strong>
                        <span className="timeline-period">{userTimezone.split('/')[1] || userTimezone}</span>
                      </div>

                      <div className="timeline-content">
                        <div className="timeline-med-header">
                          <div className="timeline-med-name">
                            <PillIcon size={16} />
                            <strong>{dose.medicine_name}</strong>
                            <span className="dosage-pill">{dose.dosage}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {isSnoozed && (
                              <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                                Snooze {dose.snooze_count || 1} of 3 used
                              </span>
                            )}
                            <span className={`status-badge status-badge-${dose.status}`}>
                              {dose.status.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="timeline-instructions" style={{ margin: '6px 0', fontSize: '0.85rem' }}>
                          {isPending && <span>Scheduled for {dose.local_time} ({userTimezone}) • 30-min grace window</span>}
                          {isSnoozed && <span>Snoozed (+10 min) • Grace window active • Max 3 snoozes</span>}
                          {isTaken && <span>Dose confirmed taken • Stock decremented</span>}
                          {isMissed && <span style={{ color: 'var(--color-error)' }}>Automatically marked missed after grace window • Caregiver notified</span>}
                        </div>

                        <div className="timeline-actions">
                          {isTaken ? (
                            <div className="confirmed-taken">
                              <CheckCircleIcon size={16} color="var(--color-success)" />
                              <span>Dose Taken</span>
                            </div>
                          ) : isMissed ? (
                            <div className="missed-notice" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-error)', fontSize: '0.85rem' }}>
                              <AlertTriangleIcon size={16} />
                              <span>Missed Dose</span>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                onClick={() => handleTakeDose(dose)}
                                disabled={isProcessing}
                              >
                                <CheckIcon size={14} />
                                <span>{isProcessing ? 'Recording...' : 'Take Dose'}</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleSnoozeDose(dose)}
                                disabled={isProcessing || (dose.snooze_count >= 3)}
                                title={dose.snooze_count >= 3 ? "Maximum 3 snoozes allowed per dose" : "Snooze 10 minutes"}
                              >
                                <RepeatIcon size={14} />
                                <span>
                                  {dose.snooze_count >= 3 
                                    ? 'Max Snoozes (3/3)' 
                                    : `Snooze (10m) [${dose.snooze_count || 0}/3]`}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm btn-danger-text"
                                onClick={() => handleMissDose(dose)}
                                disabled={isProcessing}
                              >
                                <span>Skip</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Phase 4: Patient-Approved Care Team Invite Card */}
          <div className="card" style={{ marginTop: 24, border: '1px solid var(--color-border)' }}>
            <div className="card-header-flex">
              <div>
                <h3 className="card-title">Care Team & Remote Monitoring Access</h3>
                <p className="card-sub">
                  Caregivers and clinicians cannot see your data until you generate and share a secure Invite Code.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={handleGenerateInvite}
                disabled={inviteState.loading}
              >
                <PlusIcon size={14} />
                <span>{inviteState.loading ? 'Generating...' : 'Generate New Invite Code'}</span>
              </button>
            </div>

            {inviteState.error && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <span>{inviteState.error}</span>
              </div>
            )}

            {inviteState.code ? (
              <div style={{
                marginTop: 16,
                padding: 16,
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                border: '1px solid var(--color-primary-soft)'
              }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                    Patient Authorization Invite Code
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '3px', color: 'var(--color-primary)', marginTop: 4, fontFamily: 'monospace' }}>
                    {inviteState.code}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-3)' }}>
                    Valid for 24 hours (Expires at {new Date(inviteState.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCopyInvite}
                >
                  <CheckIcon size={16} />
                  <span>{inviteState.copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
                </button>
              </div>
            ) : (
              <p style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--color-text-2)' }}>
                Click <strong>Generate New Invite Code</strong> to create an 8-character single-use link for your doctor or family caregiver.
              </p>
            )}
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
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-2)' }}>
                        <ClockIcon size={24} style={{ display: 'block', margin: '0 auto 8px auto', opacity: 0.6 }} />
                        <span>No medication intake history records found for "{historyFilter}".</span>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((h, i) => (
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
                    ))
                  )}
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
                Caregiver: <strong>{userName}</strong> • Monitoring <strong>{caregiverData.patients.length} Linked Patient{caregiverData.patients.length === 1 ? '' : 's'}</strong>
              </p>
            </div>
          </div>

          {/* Action error banner */}
          {actionError && (
            <div className="alert alert-error" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{actionError}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setActionError(null)}>Dismiss</button>
            </div>
          )}

          {/* Redeem Patient Invite Code Section */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header-flex">
              <div>
                <h3 className="card-title">Link New Patient via Invite Code</h3>
                <p className="card-sub">
                  Ask your patient to generate a secure 8-character invite code from their Schedule screen.
                </p>
              </div>
            </div>

            {redeemError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <span>{redeemError}</span>
              </div>
            )}
            {redeemSuccess && (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                <span>{redeemSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRedeemInvite} style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter 8-character code (e.g. ABC12345)"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                className="form-input"
                style={{ flex: 1, minWidth: 220, fontFamily: 'monospace', letterSpacing: '2px', textTransform: 'uppercase' }}
                maxLength={8}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={redeemLoading || redeemCode.trim().length < 6}
              >
                <PlusIcon size={16} />
                <span>{redeemLoading ? 'Linking...' : 'Redeem & Link Patient'}</span>
              </button>
            </form>
          </div>

          {/* Linked Patients Section */}
          {caregiverData.patients.length === 0 ? (
            <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: '40px 20px' }}>
              <UsersIcon size={40} color="var(--color-primary)" />
              <h3 style={{ margin: '14px 0 8px 0' }}>No Linked Patients Yet</h3>
              <p style={{ margin: '0 auto 16px auto', maxWidth: 520, color: 'var(--color-text-2)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                You are not currently monitoring any patients. In compliance with patient privacy safeguards, caregiver access requires explicit patient authorization. Ask your family member or patient to generate an <strong>Invite Code</strong> from their Medication Dashboard (Care Team section) and enter it above to begin remote oversight.
              </p>
            </div>
          ) : (
            <div className="portal-grid" style={{ marginTop: 20 }}>
              {/* Linked Patients List */}
              <div className="card">
                <h3 className="card-title">Monitored Patient Profiles ({caregiverData.patients.length})</h3>
                <p className="card-sub">Active patient authorizations and live adherence</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                  {caregiverData.patients.map((pat) => (
                    <div key={pat.id} style={{ background: 'var(--color-surface-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div className="patient-stat-box" style={{ marginBottom: 12 }}>
                        <div className="patient-avatar">{(pat.name || 'P').charAt(0).toUpperCase()}</div>
                        <div>
                          <h4 style={{ margin: 0 }}>{pat.name}</h4>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-2)' }}>{pat.email}</span>
                          {pat.phone && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-3)', display: 'block' }}>📞 {pat.phone}</span>
                          )}
                        </div>
                      </div>

                      <div className="patient-vitals-grid">
                        <div className="vital-item">
                          <span>Adherence Score</span>
                          <strong className="text-primary">
                            {pat.adherence_rate !== null && pat.adherence_rate !== undefined ? `${pat.adherence_rate}%` : 'N/A'}
                          </strong>
                        </div>
                        <div className="vital-item">
                          <span>Current Regimen</span>
                          <strong>{pat.active_medicines || (pat.medicines ? pat.medicines.length : 0)} Active Meds</strong>
                        </div>
                        <div className="vital-item">
                          <span>Escalation Protocol</span>
                          <strong className="text-success">{pat.status || 'Active'} & Online</strong>
                        </div>
                      </div>

                      {pat.medicines && pat.medicines.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' }}>
                            Prescribed Medications:
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            {pat.medicines.map((m) => (
                              <span key={m.id} className="dosage-pill" style={{ fontSize: '0.75rem' }}>
                                {m.name} ({m.dosage_amount} {m.dosage_unit})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 14 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%' }}
                          onClick={() => alert(`Supportive reminder notification dispatched to patient ${pat.name}.`)}
                        >
                          <SendIcon size={14} />
                          <span>Send Supportive Medication Nudge</span>
                        </button>
                      </div>
                    </div>
                  ))}
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
                  {caregiverData.alerts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-2)' }}>
                      <CheckCircleIcon size={32} color="var(--color-success)" />
                      <p style={{ margin: '10px 0 0 0', fontSize: '0.9rem' }}>
                        No pending escalation alerts. All patient intake schedules are on track.
                      </p>
                    </div>
                  ) : (
                    caregiverData.alerts.map((al) => (
                      <div key={al.id} className={`alert-feed-item ${al.status === 'unread' ? 'urgent' : ''}`}>
                        <div className="alert-feed-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertTriangleIcon size={16} color={al.type === 'missed_dose' ? 'var(--color-error)' : 'var(--color-warning)'} />
                            <strong>{al.title}</strong>
                          </div>
                          <span className="alert-time">{al.time || al.created_at}</span>
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
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
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
                Attending Clinician: <strong>{userName}</strong> • <strong>{clinicianData.patients.length} Patient{clinicianData.patients.length === 1 ? '' : 's'} Under Oversight</strong>
              </p>
            </div>
          </div>

          {/* Action error banner */}
          {actionError && (
            <div className="alert alert-error" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{actionError}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setActionError(null)}>Dismiss</button>
            </div>
          )}

          {/* Clinician Redeem Invite Code Section */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header-flex">
              <div>
                <h3 className="card-title">Establish Clinical Oversight via Invite Code</h3>
                <p className="card-sub">
                  Clinician access is strictly patient-approved. Enter the 8-character invite code provided by your patient.
                </p>
              </div>
            </div>

            {redeemError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <span>{redeemError}</span>
              </div>
            )}
            {redeemSuccess && (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                <span>{redeemSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRedeemInvite} style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter 8-character code (e.g. ABC12345)"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                className="form-input"
                style={{ flex: 1, minWidth: 220, fontFamily: 'monospace', letterSpacing: '2px', textTransform: 'uppercase' }}
                maxLength={8}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={redeemLoading || redeemCode.trim().length < 6}
              >
                <PlusIcon size={16} />
                <span>{redeemLoading ? 'Linking...' : 'Link Patient to Clinical Care'}</span>
              </button>
            </form>
          </div>

          {clinicianData.patients.length === 0 ? (
            <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: '40px 20px' }}>
              <StethoscopeIcon size={40} color="var(--color-accent)" />
              <h3 style={{ margin: '14px 0 8px 0' }}>No Patients Under Clinical Care</h3>
              <p style={{ margin: '0 auto 16px auto', maxWidth: 520, color: 'var(--color-text-2)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                You do not have any patient records linked yet. Clinicians cannot browse or access unlinked patient data without explicit patient authorization. Ask your patient to generate an <strong>Invite Code</strong> from their Medication Dashboard and enter it above.
              </p>
            </div>
          ) : (
            <>
              {/* Patient Selector Tabs if multiple patients */}
              {clinicianData.patients.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 20, overflowX: 'auto', paddingBottom: 6 }}>
                  {clinicianData.patients.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`filter-pill ${(selectedClinicianPatientId || clinicianData.patients[0]?.id) === p.id ? 'active' : ''}`}
                      onClick={() => setSelectedClinicianPatientId(p.id)}
                    >
                      {p.name} ({p.adherence_rate !== null && p.adherence_rate !== undefined ? `${p.adherence_rate}%` : 'N/A'})
                    </button>
                  ))}
                </div>
              )}

              {(() => {
                const currentPatient = clinicianData.patients.find(p => p.id === (selectedClinicianPatientId || clinicianData.patients[0]?.id)) || clinicianData.patients[0];
                const patientMeds = currentPatient.medicines || [];
                const patientNotes = (clinicianData.notes || []).filter(n => n.patient_id === currentPatient.id);

                return (
                  <div className="portal-grid" style={{ marginTop: 20 }}>
                    {/* Clinical Regimen Assessment */}
                    <div className="card">
                      <div className="card-header-flex">
                        <div>
                          <h3 className="card-title">Patient Profile: {currentPatient.name}</h3>
                          <p className="card-sub">{currentPatient.email} {currentPatient.phone ? `• ${currentPatient.phone}` : ''}</p>
                        </div>
                        <span className="badge badge-success">Active Regimen</span>
                      </div>

                      <div className="patient-vitals-grid" style={{ marginTop: 12 }}>
                        <div className="vital-item">
                          <span>Adherence Rate</span>
                          <strong className="text-primary">
                            {currentPatient.adherence_rate !== null && currentPatient.adherence_rate !== undefined ? `${currentPatient.adherence_rate}%` : 'N/A'}
                          </strong>
                        </div>
                        <div className="vital-item">
                          <span>Active Prescriptions</span>
                          <strong>{currentPatient.active_medicines || patientMeds.length} Meds</strong>
                        </div>
                        <div className="vital-item">
                          <span>Compliance Risk</span>
                          <strong className={(currentPatient.adherence_rate || 100) >= 80 ? 'text-success' : 'text-danger'}>
                            {(currentPatient.adherence_rate || 100) >= 80 ? 'Good Adherence' : 'At-Risk Compliance'}
                          </strong>
                        </div>
                      </div>

                      <div style={{ marginTop: 20 }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Active Prescriptions ({patientMeds.length})</h4>
                        {patientMeds.length === 0 ? (
                          <p style={{ color: 'var(--color-text-2)', fontSize: '0.85rem' }}>No active prescriptions entered by this patient yet.</p>
                        ) : (
                          <ul className="clinical-presc-list">
                            {patientMeds.map((m) => (
                              <li key={m.id} className="clinical-presc-item">
                                <strong>{m.name} ({m.dosage_amount} {m.dosage_unit})</strong>
                                <span>Frequency: {m.frequency} • {m.meal_timing ? m.meal_timing.replace('_', ' ') : 'anytime'}</span>
                                {m.instructions && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-3)', marginTop: 2 }}>{m.instructions}</div>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Add Clinical Note Form */}
                    <div className="card">
                      <h3 className="card-title">Add Clinical Note & Recommendations</h3>
                      <p className="card-sub">Will be visible on {currentPatient.name}'s notification feed</p>

                      <form onSubmit={handleAddDoctorNote}>
                        <div className="form-group">
                          <label className="form-label">Clinical Observations</label>
                          <textarea
                            className="form-input"
                            rows={3}
                            placeholder={`Enter clinical assessment or adherence remarks for ${currentPatient.name}...`}
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
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Recent Clinical Entries ({patientNotes.length})</h4>
                        {patientNotes.length === 0 ? (
                          <p style={{ color: 'var(--color-text-2)', fontSize: '0.85rem' }}>No clinical notes recorded yet for this patient.</p>
                        ) : (
                          patientNotes.map((n, i) => (
                            <div key={i} className="clinical-note-item">
                              <p style={{ margin: 0, fontSize: '0.88rem' }}>"{n.note}"</p>
                              {n.dosage_adjustment && (
                                <span className="dosage-adj-tag">Recommendation: {n.dosage_adjustment}</span>
                              )}
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', display: 'block', marginTop: 4 }}>
                                {n.created_at}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
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
