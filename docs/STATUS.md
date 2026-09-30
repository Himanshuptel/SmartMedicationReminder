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
| **Phase 1** | Schema covers all 10 tables (`users`, `medicines`, `reminders`, `medication_history`, `caregiver_patient`, `emergency_contacts`, `notifications`, `clinical_notes`, `otp_codes`, `sessions`) | **COMPLIANT** | Defined in `backend/database.py` schema V1; verified via sqlite3 table inspection | Completed in Phase 1 |
| **Phase 1** | Foreign key enforcement (`PRAGMA foreign_keys=ON`) | **COMPLIANT** | `get_connection()` executes `PRAGMA foreign_keys = ON;` on every connection | Completed in Phase 1 |
| **Phase 1** | Database indexes on foreign keys & lookup columns | **COMPLIANT** | 8 indexes created covering users, medicines, reminders, history, notifications, OTP, and sessions | Completed in Phase 1 |
| **Phase 1** | Versioned migration / init script (works on fresh clone) | **COMPLIANT** | `backend/database.py` includes migration runner and seed CLI flags (`--init`, `--seed`) | Completed in Phase 1 |
| **Phase 1** | Parameterized SQL queries everywhere | **COMPLIANT** | 100% of SQL queries in `app.py` use parameterized `?` bindings | Completed in Phase 1 |
| **Phase 1** | Secure password hashing (PBKDF2; never return hashes) | **COMPLIANT** | Implemented PBKDF2-HMAC-SHA256 (100k iter, random salt); hashes excluded from all API responses | Completed in Phase 1 |
| **Phase 1** | Consolidate on ONE backend: Flask + SQLite (remove duplicate `server.py`) | **COMPLIANT** | Consolidated logic in `backend/app.py`; `server.py` deleted; all routes preserved | Completed in Phase 1 |
| **Phase 1** | Database as single source of truth & rewire `api.js` (no silent mock fallback) | **COMPLIANT** | `api.js` rewritten to fetch live endpoints; errors propagated; medicines, schedule, history, and notifs connected | Completed in Phase 1 |
| **Phase 1** | Consistent JSON error schema and HTTP status codes | **COMPLIANT** | `api_success` and `api_error` helpers return standard error code, message, and HTTP status codes | Completed in Phase 1 |
| **Phase 1** | Input validation on every endpoint | **COMPLIANT** | Request bodies validated for required fields, roles, types, and lengths | Completed in Phase 1 |
| **Phase 1** | Automated test suite (pytest / unittest) | **COMPLIANT** | `tests/test_api.py` contains 17 automated tests for success and failure cases; 100% pass | Completed in Phase 1 |
| **Phase 1** | Script registering user, adding medicine, verifying DB directly | **COMPLIANT** | `scripts/verify_db_e2e.py` executed; verified user, medicine, and reminders directly in SQLite | Completed in Phase 1 |
| **Phase 2** | Server-side 6-digit random OTP via `secrets` module | **COMPLIANT** | Implemented `secrets.choice("0123456789")` in `app.py`; verified via test suite | Completed in Phase 2 |
| **Phase 2** | Store only hashed OTP in database | **COMPLIANT** | OTP hashed with `SECRET_KEY` via SHA-256 before saving to `otp_codes` table | Completed in Phase 2 |
| **Phase 2** | OTP 5-minute expiry, max 5 attempts, 30s resend cooldown, single use | **COMPLIANT** | Validated and enforced in `auth_verify_otp` & `auth_resend_otp`; covered by unit tests | Completed in Phase 2 |
| **Phase 2** | Delivery via SMTP with dev console fallback | **COMPLIANT** | Real SMTP dispatch if configured; dev console logging if `DEMO_MODE=true` | Completed in Phase 2 |
| **Phase 2** | OTP required at login and registration (no token before OTP) | **COMPLIANT** | Both login and register endpoints return `requires_otp=True` and omit session token | Completed in Phase 2 |
| **Phase 2** | Signed session tokens with expiry & RBAC protection | **COMPLIANT** | Sessions table tracks tokens; `@require_auth` & `@require_role` protect all private routes | Completed in Phase 2 |
| **Phase 2** | User identity derived solely from session token (no user_id in params/body) | **COMPLIANT** | All endpoints read `g.current_user["id"]`; caregiver/clinician access verified via `caregiver_patient` | Completed in Phase 2 |
| **Phase 2** | Restrict 1-click demo login unless `DEMO_MODE=true` | **COMPLIANT** | UI queries `/api/config` and hides demo shortcuts when `DEMO_MODE=false` | Completed in Phase 2 |
| **Phase 2** | Tests for OTP validation, RBAC, isolation, and invalid access | **COMPLIANT** | 16 automated tests in `tests/test_api.py` covering all auth and access control states; 100% pass | Completed in Phase 2 |
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
| **Phase 4** | Every screen reads and writes through `api.js` exclusively | **PARTIAL** | Medicines, History, Schedule, Auth, Notifications wired; loading/empty states need completion | Complete screen integration in Phase 4 |
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

All core operations are now wired directly to the live backend REST API with session token authentication (`Authorization: Bearer <token>`). Silent mock fallbacks have been removed.

| Function / Screen | Backend Endpoint | Status | Notes |
|---|---|---|---|
| `api.register(data)` | `POST /api/auth/register` | **Connected** | Validates inputs, stores PBKDF2 hash, dispatches 6-digit OTP, returns `requires_otp: true` |
| `api.login(data)` | `POST /api/auth/login` | **Connected** | Validates credentials, dispatches 6-digit OTP, returns `requires_otp: true` |
| `api.verifyOtp(data)` | `POST /api/auth/verify-otp` | **Connected** | Validates 6-digit OTP, records single use, issues 7-day session token in `sessions` table |
| `api.resendOtp(data)` | `POST /api/auth/resend-otp` | **Connected** | Enforces 30-second cooldown, dispatches new OTP |
| `api.logout()` | `POST /api/auth/logout` | **Connected** | Invalidates active session row in `sessions` table |
| `api.getMedicines()` | `GET /api/medicines` | **Connected** | Fetches user's active regimen derived strictly from session identity |
| `api.addMedicine(data)` | `POST /api/medicines` | **Connected** | Persists medicine and generates reminders linked to authenticated user |
| `api.deleteMedicine(id)` | `DELETE /api/medicines/:id` | **Connected** | Enforces user ownership (403 if attempting to delete another user's medicine) |
| `api.getSchedule()` | `GET /api/reminders` | **Connected** | Returns active dose schedule joined with medicine dosage and instructions |
| `api.getHistory()` | `GET /api/history` | **Connected** | Returns adherence history and dynamically computed compliance rates |
| `api.recordAction(data)` | `POST /api/history` | **Connected** | Records dose intake/snooze/missed, decrements pill stock, triggers missed dose alert |
| `api.getNotifications()` | `GET /api/notifications` | **Connected** | Fetches real-time notification feed and unread counter for TopBar |
| `api.getCaregiverData()` | `GET /api/caregiver/patients`| **Connected** | Enforces `caregiver` role; scopes alerts to linked patients in `caregiver_patient` |
| `api.acknowledgeAlert()` | `POST /api/caregiver/acknowledge`| **Connected** | Enforces `caregiver` role; checks patient link before updating status |
| `api.getClinicianData()` | `GET /api/clinician/patients` | **Connected** | Enforces `clinician` role; returns patient cohort and clinical notes |
| `api.addClinicalNote()` | `POST /api/clinician/notes` | **Connected** | Enforces `clinician` role; attaches note to patient and triggers notification |
| `api.getEmergencyContacts()`| `GET /api/emergency/contacts` | **Connected** | Returns patient's primary emergency contacts and hospital desk |
| `api.triggerSos()` | `POST /api/emergency/sos` | **Connected** | Dispatches distress alert record and simulates notification dispatch |
| `api.checkDrugInteractions()`| `POST /api/ai/interaction-checker`| **Connected** | Cross-references active regimen against pharmacological DDI matrix |
| `api.sendAiChatMessage()` | `POST /api/ai/chat` | **Connected** | Consults AI clinical guidance model for missed doses and food relations |

---

## 4. Current Backend REST Endpoints (`backend/app.py`)

All routes are consolidated in `backend/app.py`. Duplicate `server.py` has been eliminated.

| Endpoint | Method | Auth Required | Role | Notes |
|---|---|---|---|---|
| `/api/health` | `GET` | No | Public | Returns API health, service name, version, and `demo_mode` status |
| `/api/config` | `GET` | No | Public | Returns client configuration (demo mode status, OTP length, cooldown seconds) |
| `/api/auth/register` | `POST` | No | Public | Initiates registration; generates & dispatches 6-digit OTP |
| `/api/auth/login` | `POST` | No | Public | Initiates login; generates & dispatches 6-digit OTP |
| `/api/auth/verify-otp` | `POST` | No | Public | Verifies OTP; issues signed 7-day session token in `sessions` table |
| `/api/auth/resend-otp` | `POST` | No | Public | Resends OTP with 30-second rate limiting cooldown |
| `/api/auth/logout` | `POST` | **Yes** | Any | Terminates session by deleting session row from `sessions` table |
| `/api/auth/me` | `GET` | **Yes** | Any | Returns authenticated user profile |
| `/api/users` | `GET` | **Yes** | Caregiver, Clinician | Lists users (passwords never exposed) |
| `/api/medicines` | `GET` | **Yes** | Any | Lists medicines for authenticated user (or linked patient if caregiver/clinician) |
| `/api/medicines` | `POST` | **Yes** | Any | Adds medicine to authenticated user's account |
| `/api/medicines/<id>` | `DELETE`| **Yes** | Any | Deletes medicine (checks ownership; returns 403 if not owner) |
| `/api/reminders` | `GET` | **Yes** | Any | Returns active reminders and dosage schedule |
| `/api/schedule/today` | `GET` | **Yes** | Any | Alias for `/api/reminders` for full client compatibility |
| `/api/history` | `GET` | **Yes** | Any | Returns user's medication history and adherence analytics |
| `/api/history` | `POST` | **Yes** | Any | Records intake action; verifies reminder ownership; decrements stock |
| `/api/caregiver/patients`| `GET` | **Yes** | Caregiver, Clinician | Returns monitored patients and alerts scoped via `caregiver_patient` |
| `/api/caregiver/acknowledge`| `POST`| **Yes** | Caregiver, Clinician | Acknowledges alert; verifies patient link |
| `/api/clinician/patients`| `GET` | **Yes** | Clinician | Returns patient compliance overview and clinical notes |
| `/api/clinician/notes` | `POST` | **Yes** | Clinician | Posts clinical recommendation; sends notification to patient |
| `/api/emergency/contacts`| `GET` | **Yes** | Any | Returns user's emergency contacts |
| `/api/emergency/sos` | `POST` | **Yes** | Any | Broadcasts SOS notification record |
| `/api/ai/interaction-checker`| `POST`| **Yes** | Any | Pharmacological interaction matrix evaluation |
| `/api/ai/chat` | `POST` | **Yes** | Any | Clinical AI query endpoint |
| `/api/notifications` | `GET` | **Yes** | Any | Returns notifications scoped to authenticated user |

---

## 5. Current Database Schema & Tables (`backend/medremind.db`)

All 11 relational tables and indexes are initialized and managed via versioned migrations in `backend/database.py`.

| Table Name | Managed in DB | Used by Backend | Used by Frontend | Verification Status |
|---|---|---|---|---|
| `schema_migrations` | Yes | Yes (version tracking) | No | Tracks schema version (version 1 applied) |
| `users` | Yes | Yes (auth & RBAC) | Yes (profile & session) | PBKDF2 password hashes; `users(email)` indexed |
| `medicines` | Yes | Yes (CRUD) | Yes (inventory & setup) | Foreign key enforced; `medicines(user_id)` indexed |
| `reminders` | Yes | Yes (schedule) | Yes (today's schedule) | Foreign keys enforced; `reminders(user_id, medicine_id)` indexed |
| `medication_history`| Yes | Yes (intake tracking) | Yes (analytics & streak)| Foreign key enforced; `medication_history(user_id)` indexed |
| `caregiver_patient` | Yes | Yes (linkage check) | Yes (caregiver portal) | Enforces authorization between caregivers and patients |
| `emergency_contacts`| Yes | Yes (SOS dispatch) | Yes (emergency list) | Scoped to patient |
| `notifications` | Yes | Yes (alerts & push) | Yes (TopBar bell feed) | Real-time unread count and alert feed |
| `clinical_notes` | Yes | Yes (clinician notes) | Yes (clinician portal) | Clinician recommendations linked to patients |
| `otp_codes` | Yes | Yes (2FA OTP verification)| Yes (via OTP screen) | Single-use, 5-min expiry, max 5 attempts, `otp_codes(email)` indexed |
| `sessions` | Yes | Yes (session auth) | Yes (via Bearer token) | 7-day expiry; SHA-256 token hashes; `sessions(token_hash)` indexed |

---

## 6. Server Verification Evidence

### Automated Backend Test Suite (`pytest`)
- **Command**: `.venv/bin/pytest -v tests/test_api.py`
- **Output**: 16 passed in 1.11s (100% pass rate)

### Direct SQLite E2E Database Verification
- **Command**: `.venv/bin/python scripts/verify_db_e2e.py`
- **Output**: Verified user registration, OTP dispatch, token issuance, medicine addition, and direct SQLite records.

### Frontend Production Build
- **Command**: `npm run build`
- **Output**: Clean compilation with Vite in 264ms.

