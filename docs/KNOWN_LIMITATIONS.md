# Smart Medication Reminder - Known Limitations & Architectural Scope

**Project**: Smart Medication Reminder (MedRemind)  
**Institution**: Parul University — Semester IV IMCA / BCA Project  
**Internal Guide**: Prof. Sathwik Chebrolu  
**Date**: 2026-10-01  

---

## Executive Summary

The Smart Medication Reminder application has been engineered from a client-side prototype into an enterprise-grade full-stack web application with strict session token RBAC, two-step HMAC-SHA256 OTP verification, patient-approved caregiver linking, atomic dose state machine transitions, SQLite-backed rate limiting, multi-worker concurrency protection, security headers, and automated test coverage.

In adherence to production transparency and academic integrity, this document details the architectural boundaries, intentional trade-offs, and simulated external services in the current release.

---

## 1. Simulated External Telephony & Push Services

### Implementation
- **Current State**: System alerts (reminders, missed-dose warnings, low-stock notifications, clinical notes, and emergency escalations) are persisted atomically to the relational `notifications` table and delivered in real-time through the top navigation notification center and unread badge.
- **Email Delivery**: Live email delivery is implemented using standard RFC 5321/5322 SMTP (`smtplib`) with STARTTLS encryption. When SMTP credentials are provided, OTPs are dispatched to real mailboxes. In development mode (`DEMO_MODE=true`), console fallback is available.
- **Simulation**: Direct carrier SMS dispatch (e.g., Twilio, Plivo) and mobile native APNs/FCM push notifications are simulated via database event records marked with channel types `sms` and `push`. Live cellular SMS requires an active third-party telecommunications gateway subscription.

---

## 2. Emergency SOS Dispatch

### Implementation
- **Current State**: When a patient triggers the SOS button (`POST /api/emergency/sos`), the backend immediately queries all linked emergency contacts and active linked caregivers from `emergency_contacts` and `caregiver_patient`.
- **Alert Dispatch**: Individual high-priority emergency alert records are generated and saved with `type = 'emergency'`.
- **Simulation**: Outbound automated voice calls, carrier 112/911 emergency services dispatch, and cellular GPS telemetry transmission are simulated as database notifications and structured server logs. In an enterprise clinical rollout, this would interface with a dedicated telecare emergency response center.

---

## 3. Clinical AI Assistant & Query Engine

### Implementation
- **Current State**: The `/api/ai/chat` endpoint provides interactive clinical guidance, missed-dose recommendations, and meal-timing safety instructions.
- **Architecture**: Employs an internal clinical knowledge engine with keyword normalization, intent classification, and pharmacological safety rules tailored for common chronic care regimens.
- **Simulation**: Generative large language model API calls (e.g., Google Gemini or OpenAI GPT-4) are simulated using the internal clinical rules engine to eliminate external API costs, latency fluctuations, and unpredictable hallucinations in medical guidance. Every response includes clinical disclaimers advising consultation with Dr. Sathwik Chebrolu or a certified physician.

---

## 4. Drug-Drug Interaction (DDI) Knowledge Matrix

### Implementation
- **Current State**: Whenever a patient or clinician registers a new medication, the backend executes an automatic cross-check against the patient's existing active regimen (`INTERACTION_MATRIX`).
- **Clinical Coverage**: Covers critical pharmacological interaction pairs commonly encountered in geriatric and chronic care:
  - *Metformin + Contrast Agents / Cimetidine* (Lactic acidosis risk)
  - *Lisinopril + Potassium Supplements / Spironolactone* (Hyperkalemia risk)
  - *Warfarin + Aspirin / NSAIDs* (Major hemorrhage risk)
  - *Atorvastatin + Clarithromycin / Gemfibrozil* (Rhabdomyolysis risk)
  - *Omeprazole + Clopidogrel* (Reduced antiplatelet efficacy)
  - *Ciprofloxacin + Antacids / Calcium* (Chelation and reduced absorption)
- **Simulation**: While mathematically and pharmacologically accurate for the curated pairs, the matrix is not an exhaustive 50,000+ chemical compound database like the FDA National Drug Code (NDC) or Lexicomp. For a national hospital deployment, an external clinical pharmacology API would replace the local matrix.

---

## 5. Storage Engine & Ephemeral Disks

### Implementation
- **Current State**: The database utilizes SQLite 3 with Write-Ahead Logging (WAL) mode, foreign key enforcement, multi-version concurrency, and versioned schema migrations (`version 1`, `version 2`, `version 3`).
- **Trade-off**: On free or serverless container platforms (e.g., Render, Railway, Heroku free tiers), the container filesystem is ephemeral and resets to base image state when the container sleeps or redeploys.
- **Resolution**:
  1. **Persistent Volume**: Attach a persistent disk mount to `/app/data` (as defined in the Dockerfile `VOLUME ["/app/data"]`).
  2. **Automated Demo Seeding**: In development/demo deployments (`DEMO_MODE=true`), the backend auto-seeds baseline demonstration records on startup whenever the database file is fresh.

---

## 6. Summary of Architectural Status

| Capability | Current State | Production Path |
|---|---|---|
| **Two-Step Verification (OTP)** | Production-Ready (HMAC-SHA256, salted, 5-min expiry, max 5 attempts) | Ready for deployment |
| **Session RBAC & Privacy** | Production-Ready (Tokens in DB, zero user_id leaks, locked user list) | Ready for deployment |
| **Dose State Machine** | Production-Ready (Concrete instances, +10m snooze, 30m grace period) | Ready for deployment |
| **Patient-Caregiver Linking** | Production-Ready (Patient-generated `INV-XXXXXX` invite codes) | Ready for deployment |
| **Rate Limiting** | Production-Ready (SQLite-backed sliding window shared across workers) | Ready for deployment |
| **Security Headers & CORS** | Production-Ready (CSP, HSTS on HTTPS, X-Frame, strict origins) | Ready for deployment |
| **Sanitized Error Output** | Production-Ready (Generic 500 JSON, tracebacks only in server logs) | Ready for deployment |
| **Multi-Worker Concurrency** | Production-Ready (Atomic SQL updates, deduplicated alerts) | Ready for deployment |
| **Carrier SMS / APNs Push** | Simulated (Database notification log + real SMTP email) | Plug in Twilio / FCM API keys |
| **Cellular SOS Dispatch** | Simulated (Database notification records + caregiver alerts) | Integrate telecare API |
| **DDI Pharmacological Scale**| Curated 12-rule Matrix (Covers chronic care baseline) | Connect FDA NDC / Lexicomp API |
| **Clinical AI Assistant** | Local Rule Engine (Deterministic, instant, cost-free) | Connect Google Gemini API |
