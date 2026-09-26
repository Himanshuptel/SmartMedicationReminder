# SMART MEDICATION REMINDER SYSTEM
## Comprehensive Project Explanation & Faculty Viva Defense Manual

**Course**: BCA / Integrated Master of Computer Applications (IMCA) — Semester IV  
**Academic Year**: 2025–2026 / 2026–2027  
**Department**: Faculty of IT & Computer Science, Parul Institute of Computer Applications, Parul University  
**Internal Guide**: Prof. Sathwik Chebrolu  
**Project Team**:
- Himanshu Rajkapoor Patel `[2405101270051]`
- Divyadarshan Singh Chauhan `[2405101270037]`
- Anuj Sharma `[240510102004]`

---

## 1. Executive Summary & Problem Statement

### 1.1 Problem Statement
Medication non-adherence is a major global healthcare challenge. Studies indicate that over **50% of patients with chronic illnesses (such as diabetes, hypertension, and cardiovascular diseases) fail to take their medications as prescribed**. The root causes include:
1. **Forgotten Doses & Memory Lapses**: Patients with busy routines or age-related memory decline forget schedules.
2. **Complex Multi-Drug Regimens**: Different medications require different times (morning, bedtime), dosages, and meal relationships (before meals, with food, after food).
3. **Lack of Caregiver Visibility**: Family members and caregivers have zero real-time visibility into whether elderly or vulnerable patients have actually ingested their pills.
4. **Dangerous Drug-Drug Interactions**: Patients taking multiple prescription medications without cross-referencing potential adverse interactions (e.g., Warfarin + Aspirin causing hemorrhagic risks).
5. **Absence of Immediate Emergency Escalation**: Sudden adverse drug reactions or missed chronic doses lack immediate distress broadcasting.

### 1.2 System Objectives
The **Smart Medication Reminder** platform solves these problems through an integrated digital health ecosystem:
- **Timely, Configurable Reminders**: In-app synthesized audio alarms (Web Audio API melodic chimes) and visual alert prompts.
- **Three-Tier Action Loop**: Patients can easily mark doses as **Taken**, **Snooze (10 minutes)**, or **Skip/Missed**.
- **Automated Escalation to Caregivers**: When a dose is missed or skipped, an escalation rule automatically alerts authorized caregivers.
- **Caregiver Portal**: Real-time remote patient adherence monitoring, alert feed, and remote acknowledgement.
- **Clinician Dashboard**: Regimen review, compliance risk categorization, and doctor clinical recommendations.
- **Emergency SOS Protocol**: One-touch distress trigger activating high-decibel audio sirens, visual alarm pulses, and simulated automated SMS dispatch with GPS coordinates to hospital and family.
- **AI Clinical Safety Hub**: Instant Drug-Drug Interaction Checker matrix and interactive AI Pharmacological Chatbot for missed-dose advice and food interactions.

---

## 2. System Architecture & Technology Stack

```mermaid
graph TD
    subgraph ClientLayer ["Client Layer (React 19 + Vite)"]
        UI["Accessible Responsive UI (Light/Dark Mode)"]
        Synthesizer["Web Audio API Synthesizer (Chime & Siren)"]
        LocalStore["Resilient LocalStorage / IndexedDB Cache"]
    end

    subgraph ServiceLayer ["API Service & Gateway"]
        APIGW["Unified REST API Gateway (/api)"]
    end

    subgraph BackendLayer ["Backend Layer (Python / Flask)"]
        PyServer["Python REST API Server (Port 5050)"]
        AuthModule["Role-Based Access Controller (Patient, Caregiver, Clinician)"]
        ReminderEngine["Reminder Scheduler & Escalation Engine"]
        DrugEngine["Pharmacological Interaction Matrix"]
        AiEngine["Clinical AI Chatbot Service"]
    end

    subgraph DatabaseLayer ["Database Layer (Relational SQLite / MySQL)"]
        DB[(medremind.db)]
        T1[users]
        T2[medicines]
        T3[reminders]
        T4[medication_history]
        T5[caregiver_patient]
        T6[emergency_contacts]
        T7[notifications]
        T8[clinical_notes]
    end

    UI --> Synthesizer
    UI --> APIGW
    APIGW -.-> LocalStore
    APIGW --> PyServer
    PyServer --> AuthModule
    PyServer --> ReminderEngine
    PyServer --> DrugEngine
    PyServer --> AiEngine
    AuthModule --> DB
    ReminderEngine --> DB
```

### 2.1 Technology Rationale
| Component | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | React 19 + Vite | High-performance reactive state management, instant HMR, modular component hierarchy. |
| **Styling** | Vanilla CSS Design System | Zero runtime CSS-in-JS overhead, curated teal/blue healthcare palette, 8px layout grid, accessible contrast, full dark/light theme support. |
| **Audio Alert Engine** | HTML5 Web Audio API | Synthesizes pure harmonic chords and sirens directly via browser audio oscillators. **Requires zero external audio files**—completely immune to 404s, CORS failures, or offline network drops. |
| **Backend REST API** | Python (`http.server` & Flask) | Python standard library server requires **zero third-party dependencies** (`pip`), ensuring instant execution on any evaluation machine. |
| **Database** | Relational SQLite (`medremind.db`) | ACID compliant, embedded, zero setup overhead, mirrors production MySQL schema exactly. |
| **Client-Side Resilience** | Dual-Mode Store Architecture | The frontend connects to the backend REST API; if offline or during standalone presentations, it falls back seamlessly to local persistent state without throwing errors. |

---

## 3. System Design & UML Diagrams (Matching Project Report)

### 3.1 System Flowchart (Report Page 11)
```mermaid
flowchart TD
    Start([Start]) --> Reg[1. User Registration / Login]
    Reg --> Auth[2. User Authentication: OTP / Credentials]
    Auth --> AddMed[3. Add Medicines: Name, Dosage, Frequency, Stock, Barcode]
    AddMed --> SetRem[4. Set Reminders: Scheduled Times, Meal Relation]
    SetRem --> StoreDB[(5. System Stores Schedule in Database)]
    StoreDB --> RemEngine[6. Reminder Engine Monitors Active Schedules]
    RemEngine --> Trigger[7. Scheduled Time Reached: Audio Chime & Alarm Modal]
    Trigger --> UserAction{8. User Takes Action?}

    UserAction -->|Taken| LogTaken[Update Medication History as Taken & Decrement Stock]
    UserAction -->|Snooze| Resched[Reschedule Timer +10 Minutes]
    UserAction -->|Missed / No Response| LogMissed[Update History as Missed]

    LogMissed --> NotifyCG{Caregiver Linked?}
    NotifyCG -->|Yes| CGAlert[Dispatch Missed-Dose Alert to Caregiver Portal & SMS]
    NotifyCG -->|No| CheckSOS
    CGAlert --> CheckSOS{Emergency SOS?}

    LogTaken --> CheckSOS
    Resched --> RemEngine
    CheckSOS -->|Yes| SOSAct[Activate SOS Siren & Dispatch GPS Coordinates to Emergency Contacts]
    CheckSOS -->|No| EndNode([End / Idle State])
    SOSAct --> EndNode
```

---

### 3.2 Data Flow Diagrams (Report Page 12)

#### Context Level (Level 0 DFD)
```mermaid
flowchart LR
    Patient((Patient)) <-->|Registration, Medicine Details, Intake Status, SOS Request / Alerts, Reminders, Reports| Sys[SMART MEDICATION REMINDER SYSTEM]
    Sys <-->|Alerts, Missed Dose Nudges, Reports / Acknowledgements| Caregiver((Caregiver))
    Sys <-->|Patient Reports, Adherence Timeline / Clinical Notes, Dosage Adjustments| Clinician((Clinician))
    Sys -->|Emergency Distress Signal & GPS| EmergencyContacts((Emergency Contacts / 112))
```

#### Level-1 DFD
```mermaid
flowchart TD
    P[Patient] -->|User Profile| P1[1.0 User Management]
    P1 --> D1[(D1: Users DB)]

    P -->|Medicine Info, Barcode| P2[2.0 Medicine Management]
    P2 --> D2[(D2: Medicines DB)]

    P -->|Reminder Times| P3[3.0 Reminder Engine]
    D2 --> P3
    P3 --> D3[(D3: Schedule DB)]

    D3 --> P4[4.0 Notification Processing]
    P4 -->|Audio Chime & Visual Modal| P

    P -->|Take / Snooze / Miss Action| P5[5.0 Medication History]
    P5 --> D4[(D4: History DB)]

    D4 -->|Missed Dose Escalation| P6[6.0 Caregiver Monitoring]
    P6 -->|Remote Alerts| CG[Caregiver]
    CG -->|Alert Acknowledgement| P6

    P -->|SOS Trigger| P7[7.0 Emergency Support]
    P7 -->|Siren & Automated SMS| EC[Emergency Contacts & Hospital]
```

---

### 3.3 Use Case Diagram (Report Page 13)
```mermaid
flowchart LR
    subgraph SMR ["Smart Medication Reminder System"]
        UC1([Register & Authenticate])
        UC2([Manage Medicines CRUD])
        UC3([Configure Reminders & Meal Timing])
        UC4([Receive Melodic Alarm & Ringing Modal])
        UC5([Record Dose Status: Take, Snooze, Miss])
        UC6([View Adherence Analytics & 7-Day History])
        UC7([Trigger Emergency SOS & Siren])
        UC8([Check Drug-Drug Interactions])
        UC9([Consult AI Medication Assistant])
        UC10([Monitor Authorised Patients Remotely])
        UC11([Receive Real-Time Missed-Dose Alerts])
        UC12([Acknowledge Escalation Alerts])
        UC13([Review Patient Adherence Timeline])
        UC14([Submit Clinical Notes & Dosage Adjustments])
    end

    Patient[🧑‍💼 Patient: Himanshu Patel]
    Caregiver[👨‍👩‍👦 Caregiver: Divyadarshan]
    Clinician[👨‍⚕️ Clinician: Prof. Sathwik]

    Patient --> UC1
    Patient --> UC2
    Patient --> UC3
    Patient --> UC4
    Patient --> UC5
    Patient --> UC6
    Patient --> UC7
    Patient --> UC8
    Patient --> UC9

    Caregiver --> UC1
    Caregiver --> UC10
    Caregiver --> UC11
    Caregiver --> UC12
    Caregiver --> UC6

    Clinician --> UC1
    Clinician --> UC13
    Clinician --> UC14
    Clinician --> UC8
```

---

### 3.4 Activity Diagram — Reminder Lifecycle (Report Page 14)
```mermaid
stateDiagram-v2
    [*] --> Idle: User Logged In
    Idle --> MedicineAdded: Medicine & Schedule Configured
    MedicineAdded --> TimerActive: Schedule Saved in DB
    TimerActive --> Ringing: Clock matches Reminder Time
    
    state Ringing {
        [*] --> SoundSynthesizer: Play Web Audio Melodic Chime
        SoundSynthesizer --> DisplayModal: Open Fullscreen Visual Prompt
    }

    Ringing --> Taken: User Clicks "Take Dose"
    Ringing --> Snoozed: User Clicks "Snooze"
    Ringing --> Missed: User Skips or Timer Times Out

    Taken --> UpdateDB1: Record Status = 'taken', Decrement Stock (-1)
    Snoozed --> UpdateDB2: Reschedule Timer (+10 min), Status = 'snoozed'
    Missed --> UpdateDB3: Record Status = 'missed'

    UpdateDB3 --> EscalateCaregiver: Trigger Escalation Rule
    EscalateCaregiver --> CaregiverNotified: Dispatch Alert to Caregiver Portal & SMS

    UpdateDB1 --> [*]
    UpdateDB2 --> TimerActive
    CaregiverNotified --> [*]
```

---

### 3.5 Class Diagram — Conceptual Entities (Report Page 15)
```mermaid
classDiagram
    class User {
        +int id
        +string name
        +string email
        +string phone
        +enum role (Patient, Caregiver, Clinician)
        +string passwordHash
        +datetime createdAt
        +login()
        +register()
    }

    class Medicine {
        +int id
        +int userId
        +string name
        +string dosageAmount
        +string dosageUnit
        +string frequency
        +string mealTiming
        +int stockRemaining
        +int lowStockThreshold
        +string barcode
        +save()
        +decrementStock()
        +delete()
    }

    class Reminder {
        +int id
        +int medicineId
        +int userId
        +time scheduledTime
        +string label
        +enum status (Active, Paused)
        +bool soundEnabled
        +triggerAlarm()
    }

    class MedicationHistory {
        +int id
        +int reminderId
        +int userId
        +string medicineName
        +string dosage
        +enum status (Taken, Missed, Snoozed)
        +datetime scheduledTime
        +datetime actionTime
        +string notes
        +logAction()
    }

    class CaregiverPatient {
        +int id
        +int caregiverId
        +int patientId
        +string accessLevel
        +enum status (Active, Inactive)
        +acknowledgeAlert()
        +sendSupportiveNudge()
    }

    class EmergencyContact {
        +int id
        +int userId
        +string name
        +string phone
        +string relation
        +bool isPrimary
        +dispatchAlert()
    }

    class Notification {
        +int id
        +int userId
        +string title
        +string message
        +enum type (Reminder, MissedDose, Emergency, Refill)
        +enum channel (Push, SMS, InApp)
        +enum status (Unread, Read, Acknowledged)
    }

    class ClinicalNote {
        +int id
        +int clinicianId
        +int patientId
        +string note
        +string dosageAdjustment
        +datetime createdAt
    }

    User "1" --> "1..*" Medicine : manages
    Medicine "1" --> "1..*" Reminder : has
    Reminder "1" --> "0..*" MedicationHistory : generates
    User "1" --> "0..*" CaregiverPatient : authorized for
    User "1" --> "0..*" EmergencyContact : has
    User "1" --> "0..*" Notification : receives
    User "1" --> "0..*" ClinicalNote : clinician adds
```

---

### 3.6 Entity-Relationship (ER) Diagram (Report Page 16)
```mermaid
erDiagram
    USERS ||--o{ MEDICINES : owns
    USERS ||--o{ REMINDERS : configures
    USERS ||--o{ MEDICATION_HISTORY : logs
    USERS ||--o{ EMERGENCY_CONTACTS : maintains
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ CAREGIVER_PATIENT : links
    USERS ||--o{ CLINICAL_NOTES : reviews
    MEDICINES ||--o{ REMINDERS : schedules
    REMINDERS ||--o{ MEDICATION_HISTORY : records

    USERS {
        int id PK
        string name
        string email UK
        string phone
        string role
        string password_hash
        timestamp created_at
    }

    MEDICINES {
        int id PK
        int user_id FK
        string name
        string dosage_amount
        string dosage_unit
        string frequency
        string meal_timing
        int stock_remaining
        int low_stock_threshold
        string barcode
    }

    REMINDERS {
        int id PK
        int medicine_id FK
        int user_id FK
        time scheduled_time
        string status
        int sound_enabled
    }

    MEDICATION_HISTORY {
        int id PK
        int reminder_id FK
        int user_id FK
        string medicine_name
        string dosage
        string status
        string scheduled_time
        string action_time
        string notes
    }

    CAREGIVER_PATIENT {
        int id PK
        int caregiver_id FK
        int patient_id FK
        string access_level
        string status
    }

    EMERGENCY_CONTACTS {
        int id PK
        int user_id FK
        string name
        string phone
        string relation
        int is_primary
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        string title
        string message
        string type
        string channel
        string status
    }

    CLINICAL_NOTES {
        int id PK
        int clinician_id FK
        int patient_id FK
        string note
        string dosage_adjustment
    }
```

---

### 3.7 Sequence Diagram — Reminder & Escalation (Report Page 17)
```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient (Himanshu)
    participant UI as Frontend Interface
    participant Audio as Web Audio Synthesizer
    participant Engine as Reminder Engine
    participant DB as SQLite Database
    actor Caregiver as Caregiver (Divyadarshan)

    Patient->>UI: Configure Medicine (Lisinopril 10mg at 07:30 AM)
    UI->>DB: INSERT into medicines & reminders
    DB-->>UI: Stored & Confirmation
    Note over Engine: Clock reaches 07:30 AM
    Engine->>UI: Trigger Scheduled Alert Event
    UI->>Audio: playReminderChime() (Harmonic C-E-G Chord)
    Audio-->>Patient: Chime Sounds in Browser
    UI->>Patient: Display Alarm Modal (Take / Snooze / Skip)

    alt Patient Marks Dose as Taken
        Patient->>UI: Click "Mark as Taken"
        UI->>Audio: playSuccessChime()
        UI->>DB: INSERT status='taken' & Stock = Stock - 1
        DB-->>UI: History updated (Adherence = 100%)
    else Patient Clicks Snooze (10m)
        Patient->>UI: Click "Snooze 10m"
        UI->>DB: INSERT status='snoozed'
        UI->>Engine: Schedule re-alarm in +10 minutes
    else Patient Skips or No Response (Escalation)
        Patient->>UI: Click "Skip" / Timeout
        UI->>DB: INSERT status='missed'
        DB->>UI: Trigger Escalation Rule
        UI->>Caregiver: Dispatch Instant Missed-Dose Notification
        Caregiver->>UI: Open Caregiver Portal
        Caregiver->>UI: Click "Acknowledge Alert" & Send Supportive Nudge
        UI->>DB: UPDATE notifications SET status='acknowledged'
    end
```

---

## 4. Complete Data Dictionary (Report Pages 18–19)

| Entity / Table | Attribute Name | Data Type & Constraint | Key | Description / Purpose |
|---|---|---|---|---|
| **USERS** | `id` | INTEGER AUTOINCREMENT | **PK** | Unique primary key for each system user |
| | `name` | VARCHAR(100) NOT NULL | | Full legal or preferred name |
| | `email` | VARCHAR(150) UNIQUE | | Login email address |
| | `phone` | VARCHAR(20) NOT NULL | | Contact phone number for SMS alerts |
| | `role` | ENUM('patient','caregiver','clinician') | | Role-based authorization domain |
| | `password_hash` | VARCHAR(255) NOT NULL | | Salted hash of user password |
| **MEDICINES** | `id` | INTEGER AUTOINCREMENT | **PK** | Unique identifier for medication |
| | `user_id` | INTEGER NOT NULL | **FK** | Foreign key referencing `users(id)` |
| | `name` | VARCHAR(100) NOT NULL | | Brand or generic name (e.g. Metformin) |
| | `dosage_amount`| VARCHAR(20) NOT NULL | | Numeric amount (e.g. 500, 20) |
| | `dosage_unit` | VARCHAR(10) DEFAULT 'mg' | | Unit: mg, ml, mcg, IU, tablets |
| | `frequency` | ENUM('once','twice','thrice','custom') | | Prescribed dosing frequency |
| | `meal_timing` | ENUM('before_food','with_food','after_food')| | Intake instruction in relation to food |
| | `stock_remaining`| INTEGER DEFAULT 30 | | Pill counter for inventory tracking |
| | `low_stock_threshold`| INTEGER DEFAULT 5 | | Threshold triggering refill warnings |
| | `barcode` | VARCHAR(50) | | Verified barcode / QR package string |
| **REMINDERS** | `id` | INTEGER AUTOINCREMENT | **PK** | Unique identifier for reminder schedule |
| | `medicine_id` | INTEGER NOT NULL | **FK** | Foreign key referencing `medicines(id)` |
| | `user_id` | INTEGER NOT NULL | **FK** | Foreign key referencing `users(id)` |
| | `scheduled_time`| TIME (HH:MM) NOT NULL | | Scheduled daily intake time |
| | `status` | ENUM('active','paused','completed') | | Operating state of the reminder |
| | `sound_enabled` | BOOLEAN DEFAULT 1 | | Audio chime enablement flag |
| **MEDICATION_HISTORY**| `id` | INTEGER AUTOINCREMENT | **PK** | Audit log record ID |
| | `reminder_id` | INTEGER | **FK** | Referenced reminder ID |
| | `user_id` | INTEGER NOT NULL | **FK** | Patient user ID |
| | `medicine_name`| VARCHAR(100) NOT NULL | | Snapshot of medicine name at time of event |
| | `dosage` | VARCHAR(30) NOT NULL | | Snapshot of dosage at time of event |
| | `status` | ENUM('taken','missed','snoozed') | | Recorded outcome of reminder prompt |
| | `scheduled_time`| VARCHAR(50) NOT NULL | | Expected schedule timestamp |
| | `action_time` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | | Exact timestamp when patient acted |
| | `notes` | TEXT | | Patient notes or caregiver remarks |
| **CAREGIVER_PATIENT** | `id` | INTEGER AUTOINCREMENT | **PK** | Relationship link ID |
| | `caregiver_id` | INTEGER NOT NULL | **FK** | References `users(id)` with caregiver role |
| | `patient_id` | INTEGER NOT NULL | **FK** | References `users(id)` with patient role |
| | `access_level` | VARCHAR(50) DEFAULT 'Full' | | 'Full', 'View-Only', 'Escalations' |
| | `status` | VARCHAR(20) DEFAULT 'Active' | | Active or revoked monitoring status |
| **EMERGENCY_CONTACTS**| `id` | INTEGER AUTOINCREMENT | **PK** | Emergency contact ID |
| | `user_id` | INTEGER NOT NULL | **FK** | Patient user ID |
| | `name` | VARCHAR(100) NOT NULL | | Contact person or hospital desk name |
| | `phone` | VARCHAR(20) NOT NULL | | Direct dial telephone number |
| | `relation` | VARCHAR(50) NOT NULL | | e.g. 'Primary Caregiver', 'Ambulance' |
| | `is_primary` | BOOLEAN DEFAULT 0 | | 1 if first priority for SOS dispatch |
| **NOTIFICATIONS**| `id` | INTEGER AUTOINCREMENT | **PK** | In-app notification ID |
| | `user_id` | INTEGER NOT NULL | **FK** | Recipient user ID |
| | `title` | VARCHAR(100) NOT NULL | | Header of alert message |
| | `message` | TEXT NOT NULL | | Body content of the alert |
| | `type` | ENUM('reminder','missed_dose','emergency','refill') | | Categorical notification taxonomy |
| | `channel` | ENUM('push','sms','email','in_app') | | Delivery mechanism |
| | `status` | ENUM('unread','read','acknowledged')| | Lifecycle state |
| **CLINICAL_NOTES**| `id` | INTEGER AUTOINCREMENT | **PK** | Medical record ID |
| | `clinician_id`| INTEGER NOT NULL | **FK** | Doctor's user ID |
| | `patient_id` | INTEGER NOT NULL | **FK** | Patient user ID |
| | `note` | TEXT NOT NULL | | Clinical diagnosis remarks & observations |
| | `dosage_adjustment`| VARCHAR(255) | | Regimen changes recommended by doctor |

---

## 5. Core Algorithmic Implementations

### 5.1 Adherence Rate Calculation
Adherence is computed dynamically over total scheduled doses:
$$\text{Adherence Rate (\%)} = \left( \frac{\text{Total Doses Taken}}{\text{Total Scheduled Doses}} \right) \times 100$$
- If a patient takes 8 doses out of 9, Adherence is $\frac{8}{9} \times 100 = 88.9\%$.
- Doses marked as **Snoozed** grant a 10-minute grace window before re-evaluation.
- Persistent missed doses trigger compliance risk escalation in the Clinician View (Low Risk > 85%, Moderate Risk 70–85%, High Risk < 70%).

### 5.2 Pharmacological Drug-Drug Interaction Matrix
When a patient or doctor checks medication combinations, the system queries a cross-indexed clinical severity matrix:
- **Warfarin + Aspirin**: Severity = **CRITICAL**. Clinical mechanism: Dual inhibition of primary platelet aggregation and coagulation cascade causes severe gastrointestinal hemorrhage risk.
- **Metformin + Alcohol**: Severity = **CRITICAL**. Alcohol interferes with hepatic gluconeogenesis and potentiates metformin effect on lactate clearance, elevating fatal lactic acidosis risk.
- **Lisinopril + Ibuprofen**: Severity = **MODERATE**. NSAID-induced prostaglandin inhibition decreases ACE inhibitor hypotensive efficacy and increases renal vascular resistance.
- **Metformin + Lisinopril**: Severity = **SAFE / BENEFICIAL**. Standard dual therapy providing cardioprotective and glycemic control in hypertensive type-2 diabetics.

### 5.3 Web Audio Oscillator Sound Synthesis
Rather than relying on audio media elements (`<audio src="...">`) which routinely fail during offline presentations or trigger browser autoplay policy rejections, MedRemind utilizes browser-native `AudioContext`:
```javascript
// Melodic 3-tone reminder chime
const notes = [
  { freq: 523.25, time: 0.00, dur: 0.20 }, // C5
  { freq: 659.25, time: 0.18, dur: 0.22 }, // E5
  { freq: 783.99, time: 0.36, dur: 0.45 }, // G5
  { freq: 1046.50, time: 0.55, dur: 0.60 } // C6
];
// Dual-tone frequency sweep siren for SOS
osc.frequency.linearRampToValueAtTime(1100, t + 0.3);
osc.frequency.linearRampToValueAtTime(650, t + 0.6);
```

---

## 6. Faculty Viva Defense & Presentation Cheat Sheet

Below are the 10 most common questions examiners and faculty guides ask during MCA / BCA project viva examinations, along with exact, technically rigorous answers:

### Q1: "Why did you implement role-based views for Patient, Caregiver, and Clinician in one system?"
> **Answer**: In healthcare adherence, the patient alone cannot always ensure compliance—especially elderly patients or those with chronic conditions. A closed-loop system requires the **Patient** to execute intake, the **Caregiver** to monitor adherence and intervene upon missed doses, and the **Clinician** to review real-world compliance data to adjust prescriptions without guesswork.

### Q2: "How does your system handle notifications if the user is offline or closes the browser tab?"
> **Answer**: The application is built with a dual-mode persistence architecture. For active sessions, in-app Web Audio synthesis and modal notifications prompt the user. For offline or background states, the backend schedule engine tracks overdue doses and dispatches asynchronous SMS and Email notifications (via Twilio/SMTP architecture outlined in SRS Section 3.3). When the user returns online, the client state synchronizes with the database audit log.

### Q3: "What prevents multiple contradictory records if a user clicks 'Take' repeatedly?"
> **Answer**: State transitions are idempotent. When a reminder transition occurs (`taken`, `snoozed`, `missed`), the action dispatches a timestamped log to `medication_history`, updates the schedule item's state to prevent concurrent clicks, and atomically decrements inventory stock in `medicines` using a SQL statement: `UPDATE medicines SET stock_remaining = MAX(0, stock_remaining - 1) WHERE id = ?`.

### Q4: "Explain the emergency SOS protocol and why there is a 3-second countdown."
> **Answer**: The 3-second cancellation countdown serves as an accidental-press safeguard (false alarm mitigation). If not cancelled, the system activates the emergency synthesizer siren, broadcasts an emergency distress notification with precise GPS coordinates (e.g., Parul University campus: $22.2887^\circ \text{ N}, 73.3634^\circ \text{ E}$), and dispatches automated SMS escalation to primary caregivers and hospital hotlines (112/108).

### Q5: "How are drug interactions evaluated?"
> **Answer**: The system contains a clinical interaction matrix that cross-indexes active medication molecules. When multiple drugs are selected or prescribed together, the algorithm parses their active pharmacological classes and checks for known contraindicated interactions, returning an immediate clinical risk tier (Critical, Severe, Moderate, Safe), description of biochemical risk, and doctor recommendations.

### Q6: "Why use SQLite instead of a heavy database server for this phase?"
> **Answer**: SQLite is fully relational, ACID compliant, supports full SQL syntax, foreign keys, and indexes. Because it runs embedded without external socket daemon dependencies, it ensures portability and zero-downtime execution during viva evaluation while maintaining 100% schema parity with MySQL for production migration.

### Q7: "How is data normalized in your database design?"
> **Answer**: The schema is normalized to **Third Normal Form (3NF)**:
> - **1NF**: All attributes are atomic (no repeating groups or comma-separated lists of doses in medicines).
> - **2NF**: All non-key attributes are fully functionally dependent on the entire primary key.
> - **3NF**: There are no transitive dependencies; user profile data belongs in `users`, medication attributes belong in `medicines`, and relations are linked purely via foreign keys (`user_id`, `medicine_id`, `reminder_id`).

### Q8: "How does the system ensure accessibility for elderly users?"
> **Answer**: Adhering to WCAG guidelines, the UI features high-contrast typography, large touch-friendly buttons (minimum 44x44px touch targets), distinctive color coding with dual iconography (green check, yellow repeat, red alert) so color-blind users can distinguish statuses, and a high-contrast Dark Mode toggle.

### Q9: "What is the role of the AI Assistant in this system?"
> **Answer**: The AI Medication Assistant operates as an immediate educational guide for patients who are uncertain about meal timing (e.g., whether to take Ibuprofen with food), what to do when they forget a dose, or how to store medicines. It is programmed with clinical disclaimers urging consultation with Dr. Sathwik Chebrolu for critical diagnoses.

### Q10: "What are the future development phases (Phase II & III)?"
> **Answer**: As outlined in our SRS (Section 3.7):
> 1. Integration with physical IoT smart pillboxes with weight sensors.
> 2. Wearable smartwatch vibration alerts via WearOS / WatchOS.
> 3. Direct synchronization with hospital Electronic Health Record (EHR) systems via FHIR / HL7 standards.

---

## 7. How to Run the Demonstration

### 1. Launch the Backend API Server
```bash
python3 backend/server.py
# Server listening on http://localhost:5050
# Initialized medremind.db with all 8 tables and realistic seed data
```

### 2. Launch the Frontend Application
```bash
npm run dev
# Vite dev server running on http://127.0.0.1:5173/SmartMedicationReminder/
```

### 3. Faculty Walkthrough Checklist
1. Open the website: notice the **TopBar** with role switcher (`Patient`, `Caregiver`, `Clinician`), Dark/Light mode toggle, and notification bell.
2. View **Today's Schedule**: test clicking **Take Dose** (notice the pleasant confirmation chime and streak update).
3. Click **Test Alarm** in the top bar: observe the live ringing alarm modal, melodic Web Audio chime, and snooze option.
4. Open **Medicine Catalog**: test the real-time search, inventory stock levels, and low stock refill alerts.
5. Switch to **Caregiver Portal**: observe the live feed of missed doses and click **Acknowledge Alert**.
6. Switch to **Clinician View**: review the patient compliance score and publish a new doctor recommendation.
7. Open **AI & Safety Hub**: test the **Drug-Drug Interaction Checker** (try selecting `Warfarin + Aspirin`) and chat with the **AI Clinical Assistant**.
8. Click **System Design** in the top bar: show the faculty all 8 diagrams matching your project report directly inside the live application!
9. Click **SOS**: demonstrate the safety countdown and emergency siren audio.
