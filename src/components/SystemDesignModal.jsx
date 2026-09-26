import React, { useState } from 'react';
import { DiagramIcon, XIcon, CheckIcon, FileTextIcon, ShieldIcon, RepeatIcon } from './Icons';

const DIAGRAMS = [
  {
    id: 'flow',
    title: '4. System Flow Diagram',
    page: 'Page 11',
    description: 'High-level operational lifecycle from registration, medicine intake, reminder evaluation, to caregiver escalation and SOS activation.',
    steps: [
      'Start -> 1. User Registration / Login (Role: Patient, Caregiver, Clinician)',
      '2. User Authentication (OTP / Credentials Verification)',
      '3. Add Medicines (Details, Dosage, Frequency, Barcode/QR)',
      '4. Set Reminders (Time, Frequency, Repeat, Snooze Options)',
      '5. System Stores Schedule in Relational Database (SQLite/MySQL)',
      '6. Reminder Engine Monitors Active Schedules',
      '7. Notification Dispatched to User (Web Audio Chime / Alarm / Push / SMS)',
      '8. User Decision: Taken -> Update History; Snooze -> Reschedule (10m); Missed -> Update History & Escalate to Caregiver',
      '9. Emergency Condition? -> Activate SOS & Contact Escalation -> End'
    ]
  },
  {
    id: 'dfd',
    title: '5. Data Flow Diagrams (Context & Level 1)',
    page: 'Page 12',
    description: 'Context Level (Level 0) and Level 1 DFD tracking external entities (Patient, Caregiver, Clinician) and Data Stores (D1-D4).',
    stores: [
      { name: 'D1: User Database', desc: 'Credentials, Profile, Roles, Emergency Contacts' },
      { name: 'D2: Medicine Database', desc: 'Medication catalog, Dosage, Stock count, Barcode' },
      { name: 'D3: Schedule Database', desc: 'Scheduled reminder times, recurrence, sound triggers' },
      { name: 'D4: Medication History Database', desc: 'Adherence records: Taken, Snoozed, Missed timestamps' }
    ],
    processes: [
      '1.0 User Management (Registration, Role assignment, Authentication)',
      '2.0 Medicine Management (CRUD, Barcode scanning, Stock tracking)',
      '3.0 Reminder Engine (Schedule evaluation, Alarm generation)',
      '4.0 Notification Processing (Push, Web Audio Chime, SMS simulation)',
      '5.0 Medication History (Status recording, Adherence analytics %)',
      '6.0 Caregiver Monitoring (Remote alerts, Missed-dose acknowledgement)',
      '7.0 Emergency Support (SOS dispatch, Location broadcast, Siren)'
    ]
  },
  {
    id: 'usecase',
    title: '6.1 Use Case Diagram',
    page: 'Page 13',
    description: 'Actor capabilities across Patient, Caregiver, and Clinician.',
    actors: [
      {
        role: 'Patient',
        useCases: ['Register / Log In', 'Manage Medicines', 'Set Reminders', 'Receive Reminders', 'Record Status (Take/Snooze/Miss)', 'View History & Adherence', 'Use Emergency SOS', 'AI Chatbot & Interaction Checker']
      },
      {
        role: 'Caregiver',
        useCases: ['Monitor Authorised Patients', 'Receive Real-time Missed-Dose Alerts', 'View Adherence Reports', 'Provide Remote Acknowledgement', 'Emergency Contact Linkage']
      },
      {
        role: 'Clinician',
        useCases: ['Access Authorised Patient Monitoring', 'Review Medication Adherence Reports', 'Add Clinical Notes & Recommendations', 'Dosage Adjustments']
      }
    ]
  },
  {
    id: 'activity',
    title: '6.2 Activity Diagram - Reminder Flow',
    page: 'Page 14',
    description: 'Step-by-step workflow of the scheduled reminder lifecycle.',
    flow: [
      'User logs in -> Adds medicine -> Configures dosage & scheduled times',
      'Schedule persisted in database -> Timer reaches scheduled execution time',
      'Reminder Engine sounds Web Audio alarm chime and displays interactive modal',
      'User marks Taken -> History recorded, stock decremented, streak updated',
      'User clicks Snooze -> Rescheduled by +10 minutes; chime silenced temporarily',
      'No response / User skips -> History recorded as Missed -> Escalation rule triggers caregiver notification'
    ]
  },
  {
    id: 'class',
    title: '6.3 Class Diagram - Conceptual Entities',
    page: 'Page 15',
    description: 'Object-oriented data model showing classes, attributes, methods, and relationships.',
    classes: [
      { name: 'User', attrs: ['userId: int', 'name: string', 'email: string', 'role: enum(Patient, Caregiver, Clinician)', 'phone: string'] },
      { name: 'Medicine', attrs: ['medicineId: int', 'userId: int', 'name: string', 'dosageAmount: string', 'dosageUnit: string', 'frequency: string', 'stock: int'] },
      { name: 'Reminder', attrs: ['reminderId: int', 'medicineId: int', 'scheduledTime: time', 'status: enum(Active, Paused)', 'soundEnabled: boolean'] },
      { name: 'MedicationHistory', attrs: ['historyId: int', 'reminderId: int', 'userId: int', 'status: enum(Taken, Missed, Snoozed)', 'actionTime: datetime'] },
      { name: 'CaregiverPatient', attrs: ['relationId: int', 'caregiverId: int', 'patientId: int', 'accessLevel: string', 'status: enum'] },
      { name: 'EmergencyContact', attrs: ['contactId: int', 'userId: int', 'name: string', 'phone: string', 'relation: string', 'isPrimary: bool'] },
      { name: 'Notification', attrs: ['notificationId: int', 'userId: int', 'type: enum', 'message: string', 'channel: enum', 'status: enum'] }
    ]
  },
  {
    id: 'er',
    title: '6.4 Entity-Relationship (ER) Diagram',
    page: 'Page 16',
    description: 'Relational database schema with Primary Keys (PK) and Foreign Keys (FK).',
    entities: [
      'USER (User_ID [PK], Name, Email, Role, Phone, Password_Hash) ── 1:M ── MEDICINE',
      'MEDICINE (Medicine_ID [PK], User_ID [FK], Name, Dosage, Frequency, Stock) ── 1:M ── REMINDER',
      'REMINDER (Reminder_ID [PK], Medicine_ID [FK], Schedule_Time, Status) ── 1:M ── MEDICATION_HISTORY',
      'MEDICATION_HISTORY (History_ID [PK], Reminder_ID [FK], Status, Action_Time, Notes)',
      'USER ── 1:M ── CAREGIVER_PATIENT (Caregiver_ID [FK], Patient_ID [FK], Access_Status)',
      'USER ── 1:M ── EMERGENCY_CONTACT (Contact_ID [PK], User_ID [FK], Name, Phone, Relation)',
      'USER ── 1:M ── NOTIFICATION (Notification_ID [PK], User_ID [FK], Type, Channel, Status)'
    ]
  },
  {
    id: 'sequence',
    title: '6.5 Sequence Diagram - Reminder Interaction',
    page: 'Page 17',
    description: 'Time-ordered interaction sequence between User, System, Database, Reminder Engine, Notification Service, History, and Caregiver.',
    timeline: [
      '1. User registers / logs in -> System validates credentials',
      '2. User adds medicine & sets reminder -> System stores record in Database',
      '3. Scheduled time arrives -> Reminder Engine activates notification trigger',
      '4. Notification Service delivers audio chime & on-screen alert to User',
      '5. User selects Taken / Snooze / Missed -> System records action in History Store',
      '6. If Missed -> System triggers escalation rule to Caregiver entity with patient location and dose details'
    ]
  },
  {
    id: 'dictionary',
    title: '7. Data Dictionary',
    page: 'Pages 18-19',
    description: 'Complete data dictionary specifying entity fields, types, and constraints matching the project report.',
    fields: [
      { table: 'USER', field: 'user_id', type: 'INTEGER (PK, Auto)', notes: 'Unique user identifier' },
      { table: 'USER', field: 'role', type: 'VARCHAR(20)', notes: 'patient, caregiver, clinician' },
      { table: 'MEDICINE', field: 'name', type: 'VARCHAR(100)', notes: 'Brand or generic formulation name' },
      { table: 'MEDICINE', field: 'stock_remaining', type: 'INTEGER', notes: 'Pill count tracking low stock refills' },
      { table: 'REMINDER', field: 'scheduled_time', type: 'TIME (HH:MM)', notes: 'Target daily reminder timestamp' },
      { table: 'MED_HISTORY', field: 'status', type: 'ENUM', notes: 'taken, missed, snoozed' },
      { table: 'CAREGIVER', field: 'access_level', type: 'VARCHAR(50)', notes: 'Full, View-Only, Escalation-Only' },
      { table: 'NOTIFICATION', field: 'channel', type: 'VARCHAR(20)', notes: 'push, sms, email, in_app' }
    ]
  }
];

export default function SystemDesignModal({ onClose }) {
  const [activeTab, setActiveTab] = useState(DIAGRAMS[0].id);

  const current = DIAGRAMS.find(d => d.id === activeTab) || DIAGRAMS[0];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="System Design Architecture">
      <div className="modal" style={{ maxWidth: 840, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="icon-badge">
              <DiagramIcon size={22} color="var(--color-primary)" />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>System Design & Architecture</h2>
              <p className="modal-sub" style={{ margin: 0 }}>
                Parul University BCA / IMCA Project Report Reference (Pages 11–19)
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <XIcon size={18} />
          </button>
        </div>

        {/* Tab selector */}
        <div className="system-design-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 20px 0' }}>
          {DIAGRAMS.map(d => (
            <button
              key={d.id}
              type="button"
              className={`btn btn-sm ${activeTab === d.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(d.id)}
            >
              {d.title.split(' ')[1] || d.title}
            </button>
          ))}
        </div>

        {/* Content viewer */}
        <div className="system-design-card" style={{ background: 'var(--color-surface-2)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-text-1)' }}>
              {current.title}
            </h3>
            <span className="badge" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 600, padding: '4px 10px', borderRadius: 12, fontSize: '0.8rem' }}>
              Report {current.page}
            </span>
          </div>

          <p style={{ color: 'var(--color-text-2)', fontSize: '0.9rem', marginBottom: 16 }}>
            {current.description}
          </p>

          {/* Flow Steps */}
          {current.steps && (
            <div className="flow-steps-list">
              {current.steps.map((st, i) => (
                <div key={i} className="flow-step-item" style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 8, marginBottom: 8, border: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', minWidth: 24 }}>#{i + 1}</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-text-1)' }}>{st}</span>
                </div>
              ))}
            </div>
          )}

          {/* DFD Stores & Processes */}
          {current.stores && (
            <div>
              <h4 style={{ margin: '12px 0 8px 0', fontSize: '0.95rem' }}>Data Stores (D1–D4):</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 }}>
                {current.stores.map((s, i) => (
                  <div key={i} style={{ padding: 12, background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <strong style={{ color: 'var(--color-primary)', display: 'block', fontSize: '0.88rem' }}>{s.name}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-2)' }}>{s.desc}</span>
                  </div>
                ))}
              </div>
              <h4 style={{ margin: '12px 0 8px 0', fontSize: '0.95rem' }}>Core Level-1 Processes:</h4>
              <ul style={{ paddingLeft: 20, fontSize: '0.88rem', color: 'var(--color-text-2)' }}>
                {current.processes.map((p, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Use Case Actors */}
          {current.actors && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {current.actors.map((a, i) => (
                <div key={i} style={{ padding: 14, background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <strong style={{ color: 'var(--color-primary)', fontSize: '0.95rem', display: 'block', marginBottom: 10 }}>
                    Actor: {a.role}
                  </strong>
                  <ul style={{ paddingLeft: 18, margin: 0, fontSize: '0.82rem', color: 'var(--color-text-2)' }}>
                    {a.useCases.map((u, j) => (
                      <li key={j} style={{ marginBottom: 5 }}>{u}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Activity Diagram */}
          {current.flow && (
            <ol style={{ paddingLeft: 20, fontSize: '0.88rem', color: 'var(--color-text-2)', lineHeight: 1.7 }}>
              {current.flow.map((f, i) => (
                <li key={i} style={{ marginBottom: 8 }}>{f}</li>
              ))}
            </ol>
          )}

          {/* Class Diagram */}
          {current.classes && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {current.classes.map((c, i) => (
                <div key={i} style={{ padding: 12, background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: 6, marginBottom: 8, color: 'var(--color-primary)' }}>
                    class {c.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--color-text-2)' }}>
                    {c.attrs.map((at, j) => (
                      <div key={j}>• {at}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ER Entities */}
          {current.entities && (
            <div style={{ background: 'var(--color-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--color-border)', fontSize: '0.85rem', fontFamily: 'monospace', lineHeight: 1.8, color: 'var(--color-text-1)' }}>
              {current.entities.map((en, i) => (
                <div key={i} style={{ marginBottom: 6 }}>{en}</div>
              ))}
            </div>
          )}

          {/* Sequence Diagram */}
          {current.timeline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {current.timeline.map((tm, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Step {i + 1}</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-text-1)' }}>{tm}</span>
                </div>
              ))}
            </div>
          )}

          {/* Data Dictionary */}
          {current.fields && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    <th style={{ padding: 8 }}>Table</th>
                    <th style={{ padding: 8 }}>Field</th>
                    <th style={{ padding: 8 }}>Data Type</th>
                    <th style={{ padding: 8 }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {current.fields.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: 8, fontWeight: 600 }}>{f.table}</td>
                      <td style={{ padding: 8, color: 'var(--color-primary)', fontFamily: 'monospace' }}>{f.field}</td>
                      <td style={{ padding: 8, color: 'var(--color-text-2)' }}>{f.type}</td>
                      <td style={{ padding: 8, color: 'var(--color-text-2)' }}>{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close Diagram Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
