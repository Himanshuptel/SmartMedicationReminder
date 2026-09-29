# Smart Medication Reminder — System Status & Audit (Phase 0)

**Date**: 2026-10-01  
**Project**: Smart Medication Reminder System  
**Stack**: React 19 + Vite (Frontend), Python `http.server` & Flask (Backend), SQLite (`medremind.db`)  
**Phase**: Phase 0 — Baseline Audit (No Code Changes)

---

## 1. Executive Summary

This audit assesses the state of the Smart Medication Reminder repository against the production-readiness roadmap (Phases 1 through 5).

**Key Finding**: While the project has a polished, feature-complete UI design and comprehensive seed data in SQLite, **the frontend and backend are almost completely disconnected**.
- The frontend operates almost exclusively against browser `localStorage` and hardcoded JavaScript objects.
- 18 out of 19 REST endpoints on the backend are currently uncalled by the client application.
- Authentication and OTP verification are simulated client-side (`123456`).
- Core business logic (dose generation, auto-missed escalation, stock decrement, adherence mathematical formulas) is either mocked or incomplete.
- Two required database tables (`otp_codes` and `sessions`) are missing entirely.

---

## 2. Requirements & Audit Matrix

| Category | Requirement | Status | Evidence | Fix Planned |
|---|---|---|---|---|
| **Ground Rules** | Work in strict phases with verification, report, and git commit | **IN PROGRESS** | Phase 0 audit underway; ground rules established | Execute sequentially; wait for confirmation before each phase |
| **Ground Rules** | Do not delete working features | **COMPLIANT** | UI components, Web Audio API chime/siren, responsive views verified intact | Preserve existing UI flows while wiring actual backend APIs |
| **Ground Rules** | No paid services; env vars with safe dev fallback | **COMPLIANT** | Python standard library + SQLite used; local console OTP fallback | Maintain zero paid dependencies; use `.env.example` |
| **Ground Rules** | Never commit secrets, `.env`, or `.db` files; create `.gitignore` & `.env.example` | **COMPLIANT** | `backend/medremind.db` removed from git cache; `.gitignore` updated; `.env.example` created | Enforce git tracking rules across all phases |
| **Phase 0** | Run both frontend and backend servers | **VERIFIED** | Vite dev runs on port 5173; Python server runs on port 5050; health check returns 200 OK | Both servers confirmed operational |
| **Phase 0** | Audit frontend `localStorage` / mock usage | **AUDITED** | 16 discrete functions in `api.js` use mock data or `localStorage` | Documented in Section 3 of this status report |
| **Phase 0** | Audit uncalled backend endpoints | **AUDITED** | 18 of 19 endpoints on `server.py` never invoked by frontend | Documented in Section 4 of this status report |
| **Phase 0** | Audit database table usage | **AUDITED** | 8 tables exist; 2 missing (`otp_codes`, `sessions`); 2 tables never mutated | Documented in Section 5 of this status report |
| **Phase 1** | Schema covers all 10 tables | **UNMET** | `otp_codes` and `sessions` missing from `database.py` | Add `otp_codes` and `sessions` DDL in Phase 1 |
| **Phase 1** | Foreign key enforcement (`PRAGMA foreign_keys=ON`) | **UNMET** | Neither `database.py` nor `server.py` issues `PRAGMA foreign_keys=ON` | Add pragma execution to database connection helpers |
| **Phase 1** | Database indexes on foreign keys & lookup columns | **UNMET** | Zero indexes defined in `database.py` beyond PRIMARY KEYs | Add indexes on `user_id`, `medicine_id`, `scheduled_time`, `session_token` |
| **Phase 1** | Versioned migration / init script | **UNMET** | Only bare `init_db()` in `database.py` without schema versioning | Implement migration runner with schema version tracking |
| **Phase 1** | Parameterized SQL queries everywhere | **PARTIAL** | Most queries use `?`, but wildcard strings are concatenated | Audit and strictly parameterize 100% of queries |
| **Phase 1** | Secure password hashing (PBKDF2/bcrypt; never return hashes) | **UNMET** | Uses `"sha256_mock_hash"` and `"hashed_" + password` | Implement PBKDF2-HMAC-SHA256 with per-user salt in `hashlib` |
| **Phase 1** | Database as single source of truth (remove silent fallbacks) | **UNMET** | `api.js` catches all fetch errors and silently falls back to local mocks | Remove silent mock fallbacks; display clear API errors |
| **Phase 1** | Consistent JSON error schema and HTTP status codes | **UNMET** | Inconsistent structures (`{"error": ...}` vs `{"success": false, "error": ...}`) | Standardize response wrapper across all endpoints |
| **Phase 1** | Input validation on every endpoint | **UNMET** | Endpoints accept raw unvalidated bodies without type/length/boundary checks | Implement request validation helper for payloads and query params |
| **Phase 1** | Automated test suite (pytest / unittest) | **UNMET** | Zero test files exist in the repository | Create `tests/test_api.py` covering success and failure cases |
| **Phase 1** | Script registering user, adding medicine, verifying DB | **UNMET** | No direct verification script exists | Build `scripts/verify_db_e2e.py` |
| **Phase 2** | Server-side 6-digit random OTP via `secrets` module | **UNMET** | Frontend hardcodes `'123456'`; backend has no OTP generation | Implement `secrets.choice` generator in backend |
| **Phase 2** | Store only hashed OTP in database | **UNMET** | No OTP storage exists | Hash OTP with PBKDF2 before persisting to `otp_codes` |
| **Phase 2** | OTP 5-minute expiry, max 5 attempts, 30s resend cooldown, single use | **UNMET** | No backend OTP rate limiting or expiry tracking | Enforce constraints via `expires_at`, `attempts`, and cooldown checks |
| **Phase 2** | Delivery via SMTP with dev console fallback | **UNMET** | No email delivery module exists | Implement SMTP dispatch with console logging in DEV mode |
| **Phase 2** | OTP required at login and registration | **UNMET** | Login bypasses OTP entirely in `App.jsx`; registration is client-only | Mandate OTP verification before session token issuance |
| **Phase 2** | Signed session tokens with expiry & RBAC protection | **UNMET** | Returns dummy string `"jwt_token_demo_9921"`; routes are unprotected | Implement HMAC session tokens; check role and patient links |
| **Phase 2** | Restrict 1-click demo login unless `DEMO_MODE=true` | **UNMET** | Demo buttons are unconditionally displayed | Gate demo shortcuts behind server/client `DEMO_MODE` env check |
| **Phase 2** | Tests for OTP validation, RBAC, and invalid access | **UNMET** | No authentication tests exist | Add test suite covering OTP edge cases and 401/403 responses |
| **Phase 3** | Scheduled dose instance generation from reminders | **UNMET** | Uses static `DEMO_SCHEDULE` or single `08:00` mock item | Build dose instance generator from frequency, start/end dates |
| **Phase 3** | State transitions: Pending -> Taken / Snoozed / Missed | **PARTIAL** | Basic status strings updated in localStorage only | Implement formal state machine with validated transitions |
| **Phase 3** | Snooze = +10 min, maximum 3 times per dose | **UNMET** | Snooze simply sets status='snoozed' without timer offset or limit | Enforce 3-snooze limit and advance scheduled dose timestamp |
| **Phase 3** | Auto-missed doses after grace period (30 min) via scheduler | **UNMET** | No background scheduler or daemon exists | Implement periodic background worker to mark overdue doses |
| **Phase 3** | Idempotent dose taking (no duplicate stock decrement) | **UNMET** | Repeated calls decrement stock each time | Ensure dose state change is atomic and stock decrements once |
| **Phase 3** | Stock decrease only on Taken & low-stock alerts | **PARTIAL** | Backend decrements stock on take, but frontend never calls it | Wire API call on intake and trigger `refill` notifications |
| **Phase 3** | Multi-tier escalation (Caregiver -> Emergency Contact) | **UNMET** | Only 1 alert created on missed dose; no repeated miss escalation | Track consecutive misses; escalate to emergency contacts |
| **Phase 3** | Adherence calculation (`taken / (taken + missed)`) & streak logic | **UNMET** | Formula in UI divides by total including snoozed; streak is hardcoded | Implement standard adherence formula and real daily streak algorithm |
| **Phase 3** | Timezone handling (store UTC, format local) | **UNMET** | Local unformatted strings stored in database | Store ISO 8601 UTC timestamps; convert to client locale in UI |
| **Phase 3** | Drug-Drug Interaction check on medicine addition | **UNMET** | DDI checker is isolated on manual tab; adding medicine skips DDI check | Automatically evaluate new drug against active regimen on save |
| **Phase 3** | SOS creates notification records for emergency contacts & caregiver | **PARTIAL** | Backend has endpoint, but frontend never calls it | Connect frontend SOS modal to API; broadcast to all contacts |
| **Phase 3** | Unit tests with fake clock covering logic | **UNMET** | No unit tests exist | Create unit tests with mocked timestamps for all medication logic |
| **Phase 4** | Every screen reads and writes through `api.js` exclusively | **UNMET** | Screens mutate `localStorage` and bypass API | Refactor `api.js` and all screen handlers to use real HTTP API |
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

## 3. Audit: Frontend `localStorage` & Mock Data Usage

| File | Location / Function | Mock / LocalStorage Behavior |
|---|---|---|
| `src/services/api.js` | `getMedicines()` | Checks `localStorage.getItem('medremind_meds_' + userKey)`. If empty, returns hardcoded `DEMO_MEDICINES` or `[]`. Only attempts fetch for demo user on first load. |
| `src/services/api.js` | `addMedicine()` | **Never calls backend API.** Prepends medicine to `localStorage` key `meds_<userKey>` and fabricates a schedule item in `sched_<userKey>`. |
| `src/services/api.js` | `deleteMedicine()` | **Never calls backend API.** Filters medicine out of `localStorage` key `meds_<userKey>` and `sched_<userKey>`. |
| `src/services/api.js` | `getSchedule()` | **Synchronous.** Reads entirely from `localStorage` key `sched_<userKey>` or returns static `DEMO_SCHEDULE`. |
| `src/services/api.js` | `updateScheduleItem()` | Mutates item status only in `localStorage` key `sched_<userKey>`. |
| `src/services/api.js` | `getHistory()` | Reads only from `localStorage` key `hist_<userKey>`. Calculates adherence locally and hardcodes streak as `6` or `0`. |
| `src/services/api.js` | `recordAction()` | Writes intake records exclusively to `localStorage` key `hist_<userKey>`. |
| `src/services/api.js` | `getCaregiverData()` | Returns 100% hardcoded mock JavaScript object with dummy patients and alerts. |
| `src/services/api.js` | `acknowledgeAlert()` | Returns `true` without issuing any HTTP request. |
| `src/services/api.js` | `getClinicianData()` | Returns 100% hardcoded mock JavaScript object with dummy clinical notes and patients. |
| `src/services/api.js` | `addClinicalNote()` | Fabricates an object with `Date.now()` and returns it without saving to backend. |
| `src/services/api.js` | `getEmergencyContacts()` | Reads from `localStorage` key `emergency_contacts` or returns static `DEFAULT_EMERGENCY_CONTACTS`. |
| `src/services/api.js` | `triggerSos()` | Returns a hardcoded mock SOS confirmation object without persisting to database. |
| `src/services/api.js` | `checkDrugInteractions()` | Evaluates hardcoded if-statements client-side instead of querying the backend matrix. |
| `src/services/api.js` | `sendAiChatMessage()` | Matches substring keywords client-side instead of calling backend AI service. |
| `src/screens/AuthScreen.jsx` | `handleSubmit()` | Calls parent callback without invoking `/api/auth/register` or `/api/auth/login`. |
| `src/screens/OtpScreen.jsx` | `handleVerify()` | Validates OTP against hardcoded constant `DEMO_OTP = '123456'`. |
| `src/screens/MedicinesScreen.jsx` | `handleSave()` | Logs collected medicines to browser console and forwards to parent without saving to database. |
| `src/App.jsx` | `handleAuthComplete()` | Stores auth object in `localStorage.setItem('medremind_auth', ...)`. If login, skips OTP completely. |
| `src/App.jsx` | `notifications` state | Hardcoded initial array of 3 notifications; never queries `/api/notifications`. |

---

## 4. Audit: Uncalled Backend Endpoints (`backend/server.py`)

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/health` | `GET` | Available | Tested via curl; not called by client UI |
| `/api/users` | `GET` | **Uncalled** | Never queried by frontend |
| `/api/medicines` | `GET` | **Partially Called** | Only fetched once on initial demo user load if `localStorage` is empty |
| `/api/reminders` | `GET` | **Uncalled** | Frontend relies solely on `sched_<userKey>` in `localStorage` |
| `/api/history` | `GET` | **Uncalled** | Frontend reads from `hist_<userKey>` in `localStorage` |
| `/api/caregiver/patients` | `GET` | **Uncalled** | Frontend uses hardcoded mock caregiver object |
| `/api/clinician/patients` | `GET` | **Uncalled** | Frontend uses hardcoded mock clinician object |
| `/api/emergency/contacts` | `GET` | **Uncalled** | Frontend uses hardcoded emergency contacts |
| `/api/notifications` | `GET` | **Uncalled** | Frontend uses hardcoded state array in `App.jsx` |
| `/api/auth/register` | `POST` | **Uncalled** | Frontend bypasses backend registration |
| `/api/auth/login` | `POST` | **Uncalled** | Frontend bypasses backend login |
| `/api/medicines` | `POST` | **Uncalled** | New medicines saved only to `localStorage` |
| `/api/history` | `POST` | **Uncalled** | Dose actions saved only to `localStorage` |
| `/api/caregiver/acknowledge`| `POST` | **Uncalled** | Acknowledgement is client-only |
| `/api/clinician/notes` | `POST` | **Uncalled** | Notes are appended to client state only |
| `/api/emergency/sos` | `POST` | **Uncalled** | SOS modal calls mock in `api.js` |
| `/api/ai/interaction-checker`| `POST` | **Uncalled** | Interaction check runs in browser JavaScript |
| `/api/ai/chat` | `POST` | **Uncalled** | AI chatbot replies generated in browser JavaScript |
| `/api/medicines/<id>` | `DELETE`| **Uncalled** | Medicine deleted only from `localStorage` |

---

## 5. Audit: Database Tables (`backend/medremind.db`)

| Table Name | Defined in DB? | Used by Backend? | Used by Frontend? | Status / Gap |
|---|---|---|---|---|
| `users` | Yes | Yes (auth & patient queries) | Indirectly (mock data mirrors schema) | Password hashes are not secure (`hashed_` / `mock_hash`) |
| `medicines` | Yes | Yes (CRUD endpoints) | Read once on demo load; writes never reach DB | Needs full connection to frontend add/delete flows |
| `reminders` | Yes | Yes (generated on med creation) | Never queried or updated by frontend | Needs dose instance scheduler integration |
| `medication_history` | Yes | Yes (read/write in `server.py`) | Never read or written by frontend | Needs single source of truth connection |
| `caregiver_patient` | Yes | Read only in `caregiver/patients` | Never queried by frontend | Needs dynamic patient linking capability |
| `emergency_contacts` | Yes | Read in contacts & SOS | Never queried by frontend | Needs CRUD & sync with SOS dispatch |
| `notifications` | Yes | Written on alerts; read on alerts | Never queried by frontend | TopBar notification bell needs to fetch this table |
| `clinical_notes` | Yes | Written on notes; read on patient overview | Never queried or written by frontend | Clinician dashboard needs live read/write |
| `otp_codes` | **NO** | **Missing** | **Missing** | **Must be created in Phase 1 for secure 2FA** |
| `sessions` | **NO** | **Missing** | **Missing** | **Must be created in Phase 1 for session auth** |

---

## 6. Server Verification Evidence

### Backend Server (`backend/server.py`)
- **Command**: `python3 backend/server.py`
- **Output**:
  ```
  SmartMedicationReminder REST API listening on http://localhost:5050
  127.0.0.1 - - [01/Oct/2026 14:49:23] "GET /api/health HTTP/1.1" 200 -
  {"status": "healthy", "service": "Smart Medication Reminder API", "version": "1.0.0", "institution": "Parul University", "guide": "Prof. Sathwik Chebrolu", "timestamp": "2026-10-01T14:49:23.715739"}
  ```
- **Exit Code**: 0 (Normal startup, clean health response)

### Frontend Production Build (`npm run build`)
- **Command**: `npm run build`
- **Output**:
  ```
  > med-reminder@0.0.0 build
  > vite build

  vite v8.2.2 building client environment for production...
  transforming (31) src/index.css✓ 31 modules transformed.
  rendering chunks (1)...computing gzip size...
  dist/index.html                   0.99 kB │ gzip:  0.50 kB
  dist/assets/index-BY7QM-lj.css   50.60 kB │ gzip:  9.28 kB
  dist/assets/index-CwBBQ5kz.js   304.45 kB │ gzip: 87.90 kB
  ✓ built in 288ms
  ```
- **Exit Code**: 0 (Clean build without errors)

### Frontend Dev Server (`npx vite --port 5173`)
- **Command**: `npx vite --port 5173`
- **Output**:
  ```
  VITE v8.2.2  ready in 249 ms
  ➜  Local:   http://localhost:5173/SmartMedicationReminder/
  ➜  Network: use --host to expose
  ```
- **Exit Code**: 0 (Dev server initialized and proxy configured to `http://localhost:5050`)
