# Smart Medication Reminder - System Architecture & Implementation Status

**Project**: Smart Medication Reminder (MedRemind)  
**Institution**: Parul University — Semester IV IMCA / BCA Project  
**Internal Guide**: Prof. Sathwik Chebrolu  
**Audit & Architecture Assessment**: Deployment-Ready Review (Phases 0, 1, 2 & 3 Complete)  
**Date**: 2026-10-01  

---

## 1. Executive Summary

This document serves as the authoritative source of truth for the **Smart Medication Reminder** application. The project has successfully completed **Phase 0 (System Audit)**, **Phase 1 (Backend & Database Consolidation)**, **Phase 2 (Strict Two-Step Verification & Session RBAC)**, and **Phase 3 (Core Medication Logic, Concrete Dose Instances, State Machine, Timezones & Escalations)**.

All private routes derive user identity strictly from verified session tokens (`Authorization: Bearer <token>`). The user directory (`GET /api/users`) is locked down (403 Forbidden), patient-caregiver relationships require patient-approved invite codes, OTPs are secured via HMAC-SHA256 with per-OTP random salts, and dose state transitions (`Pending -> Taken / Snoozed / Missed`) are atomically managed with a 30-minute grace window, idempotent stock tracking, and multi-tier non-spam escalations.

---

## 2. Requirements & Compliance Matrix

| Phase | Requirement | Status | Current Implementation Details | Next Steps / Action Items |
|---|---|---|---|---|
| **Phase 0** | Baseline system audit & documentation (`STATUS.md`) | **COMPLIANT** | Initialized system matrix, mapped mock data gaps, and documented endpoints | Completed in Phase 0 |
| **Phase 0** | Environment variable templates (`.env.example`, `.gitignore`) | **COMPLIANT** | `.env.example` created; `.gitignore` configured; `backend/medremind.db` ignored | Completed in Phase 0 |
| **Phase 1** | Fresh clone DB initialization & versioned schema migrations | **COMPLIANT** | Migrations v1 & v2 in `backend/database.py`; auto-initializes on startup | Completed in Phase 1 & 3 |
| **Phase 1** | Secure password hashing (PBKDF2; never return hashes) | **COMPLIANT** | PBKDF2-HMAC-SHA256 (100k iter, random salt); hashes excluded from all API responses | Completed in Phase 1 |
| **Phase 1** | Consolidate on ONE backend: Flask + SQLite (remove duplicate `server.py`) | **COMPLIANT** | Consolidated logic in `backend/app.py`; `server.py` deleted; all routes preserved | Completed in Phase 1 |
| **Phase 1** | Database as single source of truth & rewire `api.js` (no silent mock fallback) | **COMPLIANT** | `api.js` rewritten to fetch live endpoints; errors propagated; all private routes authenticated | Completed in Phase 1 & 2 |
| **Phase 1** | Consistent JSON error schema and HTTP status codes | **COMPLIANT** | `api_success` and `api_error` helpers return standard error code, message, and HTTP status codes | Completed in Phase 1 |
| **Phase 1** | Input validation on every endpoint | **COMPLIANT** | Request bodies validated for required fields, roles, types, and lengths | Completed in Phase 1 |
| **Phase 1** | Automated test suite (pytest / unittest) | **COMPLIANT** | `tests/test_api.py` contains 44 automated tests for success and failure cases; 100% pass | Completed in Phase 1, 2 & 3 |
| **Phase 1** | Script registering user, adding medicine, verifying DB directly | **COMPLIANT** | `scripts/verify_db_e2e.py` executed; isolated temp DB verified directly | Completed in Phase 1, 2 & 3 |
| **Phase 2** | Server-side 6-digit random OTP via `secrets` module | **COMPLIANT** | Implemented `secrets.choice("0123456789")` in `app.py`; verified via test suite | Completed in Phase 2 |
| **Phase 2** | Store hashed OTP with HMAC-SHA256 and per-OTP random salt | **COMPLIANT** | OTP hashed with `SECRET_KEY` and 16-byte random salt via HMAC-SHA256; constant-time digest compare | Completed in Phase 2 & 3 |
| **Phase 2** | OTP 5-minute expiry, max 5 attempts, 30s resend cooldown, single use | **COMPLIANT** | Validated and enforced in `auth_verify_otp` & `auth_resend_otp`; covered by unit tests | Completed in Phase 2 |
| **Phase 2** | Delivery via SMTP with dev console fallback | **COMPLIANT** | Real SMTP dispatch if configured; dev console logging if `DEMO_MODE=true` | Completed in Phase 2 |
| **Phase 2** | OTP required at login and registration (no token before OTP) | **COMPLIANT** | Both login and register endpoints return `requires_otp=True` and omit session token | Completed in Phase 2 |
| **Phase 2** | Signed session tokens with expiry & RBAC protection | **COMPLIANT** | Sessions table tracks tokens; `@require_auth` & `@require_role` protect all private routes | Completed in Phase 2 |
| **Phase 2** | User identity derived solely from session token (no user_id in params/body) | **COMPLIANT** | All endpoints read `g.current_user["id"]`; caregiver/clinician access verified via `caregiver_patient` | Completed in Phase 2 |
| **Phase 2** | Lock down `GET /api/users` & patient-approved linking | **COMPLIANT** | `GET /api/users` returns 403; patient generates invite code, caregiver/clinician redeems it | Completed in Phase 2 & 3 |
| **Phase 2** | Restrict 1-click demo login unless `DEMO_MODE=true` | **COMPLIANT** | UI queries `/api/config` and hides demo shortcuts when `DEMO_MODE=false` | Completed in Phase 2 |
| **Phase 3** | Scheduled dose instance generation from reminders | **COMPLIANT** | `generate_daily_doses` creates concrete instances in `dose_instances` for each reminder | Completed in Phase 3 |
| **Phase 3** | State transitions: Pending -> Taken / Snoozed / Missed | **COMPLIANT** | Atomic conditional transitions in `process_dose_action` and `/api/doses/<id>/action` | Completed in Phase 3 |
| **Phase 3** | Snooze = +10 min, maximum 3 times per dose | **COMPLIANT** | Enforced 3-snooze limit (`snooze_count < 3`); advances `snooze_until` timestamp by +10m | Completed in Phase 3 |
| **Phase 3** | Auto-missed doses after grace period (30 min) via scheduler & lazy eval | **COMPLIANT** | Atomic conditional updates (`WHERE status IN ('pending', 'snoozed')`); evaluated lazily on read | Completed in Phase 3 |
| **Phase 3** | Idempotent dose taking (no duplicate stock decrement) | **COMPLIANT** | Taking an already-taken dose returns success without decrementing stock again | Completed in Phase 3 |
| **Phase 3** | Stock decrease only on Taken & low-stock alerts | **COMPLIANT** | Stock decrements only on first Taken transition; triggers `refill` alert when `stock <= threshold` | Completed in Phase 3 |
| **Phase 3** | Multi-tier non-spam escalation (Caregiver -> Emergency Contact) | **COMPLIANT** | 1 alert per missed dose; emergency contact escalation triggered only after 3 consecutive misses | Completed in Phase 3 |
| **Phase 3** | Adherence calculation (`taken / (taken + missed)`) & streak logic | **COMPLIANT** | Evaluates adherence on `taken / (taken + missed) * 100`; computes consecutive 100% adherence streak | Completed in Phase 3 |
| **Phase 3** | Timezone handling (store UTC, format local) | **COMPLIANT** | User timezone stored on profile (default `Asia/Kolkata`); timestamps stored in UTC ISO 8601 | Completed in Phase 3 |
| **Phase 3** | Drug-Drug Interaction check on medicine addition | **COMPLIANT** | Automatically checks new medicine against active regimen via `INTERACTION_MATRIX`; emits clinical alert | Completed in Phase 3 |
| **Phase 3** | SOS creates notification records for emergency contacts & caregiver | **COMPLIANT** | Dispatches distress notifications to all linked caregivers and emergency contacts | Completed in Phase 3 |
| **Phase 3** | Unit tests with fake clock covering logic | **COMPLIANT** | Fake clock (`CLOCK_FN`) unit tests verify grace periods, snoozes, idempotency, and math | Completed in Phase 3 |
| **Phase 4** | Every screen reads and writes through `api.js` exclusively | **PARTIAL** | Medicines, History, Schedule, Auth, Notifications wired; loading/empty states need polish | Complete screen integration in Phase 4 |
| **Phase 4** | Loading, empty, and error states on every screen | **PARTIAL** | Skeletons, empty-state artwork, and API error banners missing | Add robust UI states to Schedule, Meds, History, and Portals |
| **Phase 4** | Clear banner when backend is unreachable | **UNMET** | App fails silently or shows stale mocks when backend is down | Add persistent connectivity alert strip when API is unreachable |
| **Phase 4** | Documented manual E2E script (`docs/E2E_CHECKLIST.md`) | **UNMET** | Checklist file does not exist | Author comprehensive step-by-step verification checklist |
| **Phase 5** | CORS restricted to configured origins | **UNMET** | Backend allows `Access-Control-Allow-Origin: *` wildcard | Bind CORS to `ALLOWED_ORIGINS` from environment config |
| **Phase 5** | Rate limiting on auth and OTP endpoints | **UNMET** | No request throttling or rate limiting in place | Implement IP and identifier rate limiters |
| **Phase 5** | Security headers (CSP, HSTS, X-Content-Type, X-Frame) | **UNMET** | No security headers attached to HTTP responses | Add security header middleware |
| **Phase 5** | Clean request logging & sanitized error outputs | **PARTIAL** | Default stdout logging; potential exception leak on failure | Wrap request dispatcher with sanitized error handlers |
| **Phase 5** | Dockerfile and documented deployment workflow | **UNMET** | No Dockerfile present | Create production Dockerfile and build instructions |
| **Phase 5** | Setup, run, and test documentation in README | **UNMET** | README contains default Vite template | Write complete production README |

---

## 3. Current Frontend API Integration (`src/services/api.js`)

All operations communicate directly with the backend REST API with session token authorization (`Authorization: Bearer <token>`).

| Function / Screen | Backend Endpoint | Status | Notes |
|---|---|---|---|
| `api.register(data)` | `POST /api/auth/register` | **Connected** | Validates inputs, stores PBKDF2 hash, dispatches 6-digit OTP, returns `requires_otp: true` |
| `api.login(data)` | `POST /api/auth/login` | **Connected** | Validates credentials, dispatches 6-digit OTP, returns `requires_otp: true` |
| `api.verifyOtp(data)` | `POST /api/auth/verify-otp` | **Connected** | Validates HMAC-SHA256 OTP with salt, issues 7-day session token in `sessions` table |
| `api.resendOtp(data)` | `POST /api/auth/resend-otp` | **Connected** | Enforces 30-second cooldown rate limit, dispatches new OTP |
| `api.logout()` | `POST /api/auth/logout` | **Connected** | Invalidates active session row in `sessions` table |
| `api.createPatientInvite()`| `POST /api/patient/invite` | **Connected** | Generates patient invite code (`INV-XXXXXX`) for caregiver linking |
| `api.redeemPatientInvite()`| `POST /api/patient/link` | **Connected** | Caregiver or clinician redeems code to establish authorized access |
| `api.getMedicines()` | `GET /api/medicines` | **Connected** | Fetches user's active regimen derived strictly from session identity |
| `api.addMedicine(data)` | `POST /api/medicines` | **Connected** | Persists medicine, auto-runs DDI check, and pre-generates dose instances |
| `api.deleteMedicine(id)` | `DELETE /api/medicines/:id` | **Connected** | Enforces user ownership (403 if attempting to delete another user's medicine) |
| `api.getDosesToday()` | `GET /api/doses/today` | **Connected** | Evaluates overdue doses lazily and returns today's concrete dose instances |
| `api.takeDose(id)` | `POST /api/doses/:id/take` | **Connected** | Atomically marks dose taken; idempotent; decrements stock once; checks low stock |
| `api.snoozeDose(id)` | `POST /api/doses/:id/snooze`| **Connected** | Snoozes dose +10 min (max 3 times per dose) |
| `api.missDose(id)` | `POST /api/doses/:id/miss` | **Connected** | Marks dose missed; triggers caregiver alert; escalates after 3 consecutive misses |
| `api.getSchedule()` | `GET /api/reminders` | **Connected** | Returns active reminders and today's dose instances |
| `api.getHistory()` | `GET /api/history` | **Connected** | Returns adherence history (`taken / (taken + missed) * 100`) and 100% daily streak |
| `api.recordAction(data)` | `POST /api/history` | **Connected** | Records intake action; maps to dose instance and updates stock |
| `api.getCaregiverData()` | `GET /api/caregiver/patients`| **Connected** | Enforces `caregiver` role; scopes alerts strictly to linked patients |
| `api.acknowledgeAlert()` | `POST /api/caregiver/acknowledge`| **Connected** | Verifies caregiver-patient link before updating status |
| `api.getClinicianData()` | `GET /api/clinician/patients` | **Connected** | Enforces `clinician` role; returns patient cohort and clinical notes for linked patients |
| `api.addClinicalNote()` | `POST /api/clinician/notes` | **Connected** | Enforces `clinician` role; attaches note to linked patient and triggers notification |
| `api.getEmergencyContacts()`| `GET /api/emergency/contacts` | **Connected** | Returns patient's primary emergency contacts and hospital desk |
| `api.triggerSos()` | `POST /api/emergency/sos` | **Connected** | Dispatches distress alert record to all emergency contacts and linked caregivers |
| `api.checkDrugInteractions()`| `POST /api/ai/interaction-checker`| **Connected** | Cross-references active regimen against pharmacological DDI matrix |
| `api.sendAiChatMessage()` | `POST /api/ai/chat` | **Connected** | Consults AI clinical guidance model for missed doses and food relations |
| `api.getNotifications()` | `GET /api/notifications` | **Connected** | Fetches real-time notification feed and unread counter for TopBar |

---

## 4. Current Backend REST Endpoints (`backend/app.py`)

| Endpoint | Method | Auth Required | Role | Description |
|---|---|---|---|---|
| `/api/health` | `GET` | No | Public | Returns API health, service name, version, and `demo_mode` status |
| `/api/config` | `GET` | No | Public | Returns client configuration (demo mode status, OTP length, cooldown seconds) |
| `/api/auth/register` | `POST` | No | Public | Initiates registration; generates & dispatches 6-digit OTP (HMAC-SHA256 with salt) |
| `/api/auth/login` | `POST` | No | Public | Initiates login; generates & dispatches 6-digit OTP (HMAC-SHA256 with salt) |
| `/api/auth/verify-otp` | `POST` | No | Public | Verifies OTP; issues signed 7-day session token in `sessions` table |
| `/api/auth/resend-otp` | `POST` | No | Public | Resends OTP with 30-second rate limiting cooldown |
| `/api/auth/logout` | `POST` | **Yes** | Any | Terminates session by deleting session row from `sessions` table |
| `/api/auth/me` | `GET` | **Yes** | Any | Returns authenticated user profile including `timezone` |
| `/api/users` | `GET` | **Yes** | None | **LOCKED DOWN (403 Forbidden)**; user listing disabled for privacy |
| `/api/patient/invite` | `POST` | **Yes** | Patient | Generates secure invite code (`INV-XXXXXX`) for caregiver/clinician linking |
| `/api/patient/link` | `POST` | **Yes** | Caregiver, Clinician | Redeems invite code to link patient to caregiver/clinician |
| `/api/caregiver/link` | `POST` | **Yes** | Caregiver, Clinician | Alias for `/api/patient/link` |
| `/api/medicines` | `GET` | **Yes** | Any | Lists medicines for authenticated user (or linked patient if authorized) |
| `/api/medicines` | `POST` | **Yes** | Any | Adds medicine, evaluates DDI automatically, and generates dose instances |
| `/api/medicines/<id>` | `DELETE`| **Yes** | Any | Deletes medicine (enforces user ownership; returns 403 if not owner) |
| `/api/doses/today` | `GET` | **Yes** | Any | Lazily evaluates overdue doses and returns today's concrete dose instances |
| `/api/doses/<id>/action`| `POST` | **Yes** | Any | Executes state transition: `taken`, `snoozed`, or `missed` |
| `/api/doses/<id>/take` | `POST` | **Yes** | Any | Marks dose taken; idempotent; decrements stock once; checks low stock |
| `/api/doses/<id>/snooze`| `POST`| **Yes** | Any | Snoozes dose +10 min (maximum 3 times per dose) |
| `/api/doses/<id>/miss` | `POST` | **Yes** | Any | Marks dose missed; sends caregiver alert; escalates after 3 consecutive misses |
| `/api/reminders` | `GET` | **Yes** | Any | Returns active reminders and today's dose schedule |
| `/api/schedule/today` | `GET` | **Yes** | Any | Alias for `/api/reminders` for full client compatibility |
| `/api/history` | `GET` | **Yes** | Any | Returns medication history, adherence rate (`taken / (taken + missed)`), and streak |
| `/api/history` | `POST` | **Yes** | Any | Records intake action; maps to dose instance and decrements stock |
| `/api/caregiver/patients`| `GET` | **Yes** | Caregiver, Clinician | Returns monitored patients and alerts scoped via `caregiver_patient` |
| `/api/caregiver/acknowledge`| `POST`| **Yes** | Caregiver, Clinician | Acknowledges alert; verifies patient link |
| `/api/clinician/patients`| `GET` | **Yes** | Clinician | Returns patient compliance overview and clinical notes for linked patients |
| `/api/clinician/notes` | `POST` | **Yes** | Clinician | Posts clinical recommendation to linked patient; sends notification |
| `/api/emergency/contacts`| `GET` | **Yes** | Any | Returns user's emergency contacts |
| `/api/emergency/sos` | `POST` | **Yes** | Any | Broadcasts SOS notification record to emergency contacts and linked caregivers |
| `/api/ai/interaction-checker`| `POST`| **Yes** | Any | Pharmacological interaction matrix evaluation |
| `/api/ai/chat` | `POST` | **Yes** | Any | Clinical AI query endpoint |
| `/api/notifications` | `GET` | **Yes** | Any | Returns notifications scoped to authenticated user |
| `/api/notifications/<id>/read` | `PUT` | **Yes** | Any | Marks notification as read |

---

## 5. Current Database Schema & Tables (`backend/medremind.db`)

All 13 relational tables and indexes are managed via versioned migrations in `backend/database.py`.

| Table Name | Managed in DB | Used by Backend | Used by Frontend | Verification Status |
|---|---|---|---|---|
| `schema_migrations` | Yes | Yes (version tracking) | No | Tracks schema version (version 1 & 2 applied) |
| `users` | Yes | Yes (auth & RBAC) | Yes (profile & session) | PBKDF2 password hashes; `timezone` column added; indexed on email |
| `medicines` | Yes | Yes (CRUD) | Yes (inventory & setup) | Foreign key enforced; `medicines(user_id)` indexed |
| `reminders` | Yes | Yes (schedule) | Yes (today's schedule) | Foreign keys enforced; `reminders(user_id, medicine_id)` indexed |
| `medication_history`| Yes | Yes (intake tracking) | Yes (analytics & streak)| Foreign key enforced; `medication_history(user_id)` indexed |
| `caregiver_patient` | Yes | Yes (linkage check) | Yes (caregiver portal) | Enforces authorization between caregivers and patients |
| `emergency_contacts`| Yes | Yes (SOS dispatch) | Yes (emergency list) | Scoped to patient |
| `notifications` | Yes | Yes (alerts & push) | Yes (TopBar bell feed) | Real-time unread count and alert feed |
| `clinical_notes` | Yes | Yes (clinician notes) | Yes (clinician portal) | Clinician recommendations linked to patients |
| `otp_codes` | Yes | Yes (2FA OTP verification)| Yes (via OTP screen) | HMAC-SHA256 with per-OTP `salt` column; 5-min expiry, max 5 attempts |
| `sessions` | Yes | Yes (session auth) | Yes (via Bearer token) | 7-day expiry; SHA-256 token hashes; `sessions(token_hash)` indexed |
| `patient_invites` | Yes | Yes (linking workflow) | Yes (invite generation) | Single-use invite codes (`INV-XXXXXX`) for authorized caregiver links |
| `dose_instances` | Yes | Yes (dose tracking) | Yes (today's doses) | Concrete daily dose instances with state machine, snooze counts & timestamps |

---

## 6. Server Verification Evidence

### Automated Backend Test Suite (`pytest`)
- **Command**: `.venv/bin/pytest -v tests/test_api.py`
- **Output**: 44 passed in 2.36s (100% pass rate)

### Direct SQLite E2E Database Verification
- **Command**: `.venv/bin/python scripts/verify_db_e2e.py`
- **Output**: Verified registration, OTP dispatch, token issuance, medicine addition, and direct SQLite records in isolated temp database.

### Frontend Production Build
- **Command**: `npm run build`
- **Output**: Clean compilation with Vite in 254ms.
