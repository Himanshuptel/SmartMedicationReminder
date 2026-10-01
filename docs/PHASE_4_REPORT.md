# Phase 4 Completion Report: Connected UI, Dose Lifecycle, Invite Linking, and Operational Resilience

**Project**: Smart Medication Reminder (MedRemind)  
**Institution**: Parul University — Semester IV IMCA / BCA Project  
**Internal Academic Guide**: Prof. Sathwik Chebrolu  
**Phase Completed**: Phase 4  
**Date**: October 1, 2026  

---

## 1. Executive Summary

Phase 4 transitions the Smart Medication Reminder system from an isolated API backend and disconnected UI prototypes into a unified, deployment-ready full-stack application. All client-side mock statuses and hardcoded demo identities have been eliminated. Concrete scheduled dose instances generated on the backend are displayed on the frontend with their authoritative states (`pending`, `snoozed`, `taken`, `missed`), snooze counters (`X of 3 used`), and automated 30-minute grace window enforcement.

In addition, patient-approved linking has been fully realized in the UI: patients generate single-use 8-character invite codes with a 24-hour expiry and one-click copy button, while caregivers and clinicians can redeem these codes to unlock scoped monitoring and clinical oversight. Missed-dose detection is fully decoupled from patient app activity via lazy evaluation on caregiver/clinician reads and a guarded 60-second background evaluation worker. A persistent network offline banner and 401 session expiration interceptor guarantee frontend resilience against backend drops and stale credentials.

---

## 2. Key Amendments Implemented

### 1. Concrete Dose Schedule UI & State Machine
- **Authoritative Dose Feed**: `DashboardScreen.jsx` was rewired from static mock schedules to `/api/doses/today`.
- **Authoritative Actions**: Confirmed intake (`/api/doses/:id/take`), snooze (`/api/doses/:id/snooze`), and skip/miss (`/api/doses/:id/miss`) now hit the live API endpoints directly. Leftover client-side status manipulations have been removed.
- **Snooze Limit Counter**: The UI displays real-time snooze tracking (e.g., `"Snooze 2 of 3 used"`) and disables the snooze button when the 3-snooze ceiling is reached.
- **Timezone Awareness**: The UI displays the user's configured timezone (default `Asia/Kolkata`) on the timeline header, next dose banner, and each schedule item.

### 2. Patient-Approved Invite Linking UI
- **Patient Code Generator**: Added a "Care Team & Remote Monitoring Access" module in `DashboardScreen.jsx` (Schedule tab) allowing patients to generate single-use 8-character alphanumeric invite codes with 24-hour expiry and clipboard copy confirmation.
- **Caregiver & Clinician Redemption**: Added invite code redemption forms in the Caregiver and Clinician tabs (`/api/patient/link`).
- **Dynamic Patient Cohort**: Removed hardcoded demo patient names ("Himanshu Patel"). Caregivers and clinicians now dynamically see all patients linked via authorizations, their live adherence scores, and active regimens.
- **Empty States**: If a caregiver or clinician has zero linked patients, an informative empty state explains how patient authorization works and guides them to enter an invite code.

### 3. Decoupled Missed-Dose Detection
- **Caregiver & Clinician Read-Triggered Evaluation**: `GET /api/caregiver/patients` and `GET /api/clinician/patients` run lazy overdue evaluation on all linked patients upon request.
- **Guarded Background Daemon Thread**: An active daemon worker (`run_background_overdue_check`) runs every 60 seconds in `backend/app.py`. It is guarded by an re-entrant lock (`_bg_lock`) preventing race conditions and double-firing.
- **Automated Alerts Without Patient Request**: Verified via test `test_caregiver_alert_created_on_caregiver_read_without_patient_request` and `test_background_worker_evaluates_overdue_doses_without_double_fire`.

### 4. Future Days' Dose Generation & Reminder Dates
- **Projected Doses**: `GET /api/doses/today?date=YYYY-MM-DD` and `GET /api/doses?date=YYYY-MM-DD` project future doses.
- **Date Boundary Enforcement**: Doses are generated strictly within `[start_date, end_date]` boundaries on both the `reminders` table and `medicines` table. Verified via unit test `test_future_days_doses_and_start_end_dates_respected`.

### 5. Loading, Empty, Error States & Offline Resilience
- **Persistent Backend Unreachable Banner**: A sticky red banner (`.backend-offline-banner`) with a retry button automatically slides down when `/api` fails or network offline events fire.
- **Session Expiration Handling (401)**: The API interceptor catches HTTP 401, invalidates local credentials, and redirects to the sign-in screen with a clear alert notice.
- **Screen States**: Clean loading spinners, empty-state notices (cabinet, schedule, history filter, caregiver, clinician), and inline dismissible error banners implemented across all views.

### 6. End-to-End Checklist & Live Smoke Test
- Authored `docs/E2E_CHECKLIST.md` with full manual instructions and automated verification logs.
- Executed automated smoke test script `scripts/e2e_smoke_test.py` covering register -> OTP -> add medicine -> take dose -> logout against live running Flask API and Vite servers.

---

## 3. Real Verification Command Outputs

### A. Python Backend Pytest Suite (47/47 Passed)
```text
$ .venv/bin/pytest tests/test_api.py -v
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.1.1, pluggy-1.6.0 -- /home/khushu/Downloads/Medicine/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /home/khushu/Downloads/Medicine
collecting ... collected 47 items

tests/test_api.py::test_health_and_config PASSED                         [  2%]
tests/test_api.py::test_medicines_crud_success PASSED                    [  4%]
tests/test_api.py::test_medicine_add_validation_failure PASSED           [  6%]
tests/test_api.py::test_automatic_ddi_warning_on_medicine_add PASSED     [  8%]
tests/test_api.py::test_schedule_and_reminders_endpoints PASSED          [ 10%]
tests/test_api.py::test_history_recording_and_adherence PASSED           [ 12%]
tests/test_api.py::test_history_validation_failure PASSED                [ 14%]
tests/test_api.py::test_caregiver_patients_and_acknowledge PASSED        [ 17%]
tests/test_api.py::test_caregiver_acknowledge_validation_failure PASSED  [ 19%]
tests/test_api.py::test_clinician_patients_and_notes PASSED              [ 21%]
tests/test_api.py::test_clinician_notes_validation_failure PASSED        [ 23%]
tests/test_api.py::test_emergency_contacts_and_sos PASSED                [ 25%]
tests/test_api.py::test_ai_interaction_checker PASSED                    [ 27%]
tests/test_api.py::test_ai_chat PASSED                                   [ 29%]
tests/test_api.py::test_ai_chat_validation_failure PASSED                [ 31%]
tests/test_api.py::test_notifications_endpoint PASSED                    [ 34%]
tests/test_api.py::test_mark_notification_read PASSED                    [ 36%]
tests/test_api.py::test_registration_requires_otp_and_issues_no_token_initially PASSED [ 38%]
tests/test_api.py::test_login_requires_otp_and_issues_no_token_initially PASSED [ 40%]
tests/test_api.py::test_verify_wrong_otp_decrements_attempts PASSED      [ 42%]
tests/test_api.py::test_verify_reused_otp_fails PASSED                   [ 44%]
tests/test_api.py::test_verify_expired_otp_fails PASSED                  [ 46%]
tests/test_api.py::test_verify_too_many_attempts_locks_otp PASSED        [ 48%]
tests/test_api.py::test_resend_otp_enforces_30s_cooldown PASSED          [ 51%]
tests/test_api.py::test_access_without_token_returns_401 PASSED          [ 53%]
tests/test_api.py::test_access_with_invalid_or_expired_token_returns_401 PASSED [ 55%]
tests/test_api.py::test_logout_invalidates_session PASSED                [ 57%]
tests/test_api.py::test_user_a_cannot_read_or_delete_user_b_medicines PASSED [ 59%]
tests/test_api.py::test_user_a_cannot_record_intake_for_user_b_reminder PASSED [ 61%]
tests/test_api.py::test_user_a_cannot_read_user_b_notifications PASSED   [ 63%]
tests/test_api.py::test_caregiver_can_access_linked_patient_but_not_unlinked_patient PASSED [ 65%]
tests/test_api.py::test_role_based_access_control PASSED                 [ 68%]
tests/test_api.py::test_production_mode_refuses_to_start_without_secret_key PASSED [ 70%]
tests/test_api.py::test_users_directory_listing_is_locked_down_403 PASSED [ 72%]
tests/test_api.py::test_unlinked_caregiver_and_clinician_get_empty_or_403 PASSED [ 74%]
tests/test_api.py::test_patient_invite_code_and_caregiver_redemption PASSED [ 76%]
tests/test_api.py::test_hmac_sha256_otp_with_salt_verification PASSED    [ 78%]
tests/test_api.py::test_user_timezone_and_dose_instance_generation PASSED [ 80%]
tests/test_api.py::test_dose_state_machine_snooze_limit PASSED           [ 82%]
tests/test_api.py::test_auto_missed_after_grace_window_with_fake_clock PASSED [ 85%]
tests/test_api.py::test_idempotent_intake_and_stock_decrement PASSED     [ 87%]
tests/test_api.py::test_stock_decrement_triggers_low_stock_notification PASSED [ 89%]
tests/test_api.py::test_non_spam_caregiver_alert_and_emergency_escalation_after_n_misses PASSED [ 91%]
tests/test_api.py::test_adherence_formula_and_streak_math PASSED         [ 93%]
tests/test_api.py::test_caregiver_alert_created_on_caregiver_read_without_patient_request PASSED [ 95%]
tests/test_api.py::test_background_worker_evaluates_overdue_doses_without_double_fire PASSED [ 97%]
tests/test_api.py::test_future_days_doses_and_start_end_dates_respected PASSED [100%]

============================== 47 passed in 2.38s ==============================
```

### B. Frontend Production Build (`npm run build`)
```text
$ npm run build

> med-reminder@0.0.0 build
> vite build

vite v8.2.2 building client environment for production...
transforming (31) src/index.css✓ 31 modules transformed.
rendering chunks (1)...computing gzip size...
dist/index.html                   0.99 kB │ gzip:  0.50 kB
dist/assets/index-JsjMfZcc.css   51.78 kB │ gzip:  9.51 kB
dist/assets/index-i1qDC_7S.js   315.99 kB │ gzip: 89.97 kB

✓ built in 258ms
```

### C. Direct SQLite Database E2E Verification (`scripts/verify_db_e2e.py`)
```text
$ .venv/bin/python3 scripts/verify_db_e2e.py
======================================================================
E2E VERIFICATION: Two-Step Auth & Direct SQLite Database Verification
Isolated Temp DB: /tmp/tmp0gb0ndt1_e2e_verify.db
======================================================================
Database seeded successfully with default datasets.
Database initialized successfully at: /tmp/tmp0gb0ndt1_e2e_verify.db

[1/4] Registering new user via API: verified_patient_1790849828@paruluniversity.ac.in...
 -> Registration initiated. OTP dispatched to verified_patient_1790849828@paruluniversity.ac.in.

[2/4] Verifying 6-digit OTP (542433) to obtain session token...
 -> Session token issued successfully for user ID 4: Ks8ZDoatV4zT...

[3/4] Adding new medicine using session token (identity derived from token)...
 -> Medicine created with ID: 5

[4/4] Inspecting SQLite database file directly at: /tmp/tmp0gb0ndt1_e2e_verify.db...
 -> [PASS] User record verified directly in SQLite users table.
      - ID: 4
      - Name: E2E Patient 1790849828
      - Email: verified_patient_1790849828@paruluniversity.ac.in
      - Timezone: Asia/Kolkata
 -> [PASS] Session record verified directly in SQLite sessions table.
      - Token Hash: 880a20d1c54e98239c4a3bef...
      - Expires At: 2026-10-08T10:17:08.310011+00:00
 -> [PASS] Medicine record verified directly in SQLite medicines table.
      - ID: 5
      - User ID: 4 (correctly mapped from session)
      - Name: Levothyroxine Sodium
      - Dosage: 50 mcg
      - Stock: 60 units (Threshold: 10)
 -> [PASS] Auto-generated reminders verified directly in SQLite reminders table (2 doses).
      - Dose 1: ID 6 at 08:00 (Dose 1 (08:00)) [status: active]
      - Dose 2: ID 7 at 20:00 (Dose 2 (20:00)) [status: active]
 -> [PASS] Concrete scheduled dose instances verified directly in SQLite dose_instances table (2 instances).

======================================================================
ALL DIRECT DATABASE ASSERTIONS PASSED SUCCESSFULLY!
======================================================================
```

### D. Live Server Automated Smoke Test (`scripts/e2e_smoke_test.py`)
```text
$ .venv/bin/python3 scripts/e2e_smoke_test.py
======================================================================
LIVE E2E SMOKE TEST: Register -> OTP -> Add Med -> Take Dose -> Logout
Target API: http://127.0.0.1:5050/api
======================================================================

[Step 0] API Health Check: HTTP 200
 -> Backend service healthy.

[Step 1] Registering patient: e2e_user_1790850271@parul.ac.in
 -> HTTP 201: Registration initiated. A 6-digit verification code has been dispatched.

[Step 2] Verifying OTP: 722251 for user e2e_user_1790850271@parul.ac.in
 -> HTTP 200: Verification successful. Session issued.
 -> Session token issued: f33Rul0nDGFO...

[Step 3] Adding Medication: Amoxicillin 500mg BID
 -> HTTP 201: Medicine and schedule reminders saved successfully
 -> Medicine created with ID 7

[Step 4] Querying Today's Doses (/api/doses/today)
 -> HTTP 200
 -> Found 2 concrete dose instances for today:
    - Dose ID 14: Amoxicillin 500 mg at 08:00 [missed]
    - Dose ID 15: Amoxicillin 500 mg at 20:00 [pending]
 -> Selected dose for intake: ID 15 scheduled for 20:00 [pending]

[Step 5] Taking Dose ID 15
 -> HTTP 200: Dose successfully recorded as taken
 -> Dose ID 15 verified persisted in SQLite with status: 'taken'.
 -> Medicine stock remaining: 29 (originally 30, decremented to 29)

[Step 6] Logging Out (/api/auth/logout)
 -> HTTP 200: Successfully logged out and session terminated.

[Step 7] Verifying Session Revocation with Expired Token
 -> HTTP 401: None
 -> Access rejected with HTTP 401 (Session invalidated successfully).

======================================================================
ALL 7 E2E SMOKE TEST STEPS PASSED SUCCESSFULLY AGAINST LIVE SERVER!
======================================================================
```

---

## 4. Summary of Changes by File

1. `backend/database.py`:
   - Added `start_date` and `end_date` columns to `reminders` table and migration v3.
   - Preserved all existing schema constraints and seed datasets.
2. `backend/app.py`:
   - Added guarded background overdue evaluation worker (`run_background_overdue_check`, `start_background_scheduler`) running every 60s with re-entrant lock `_bg_lock`.
   - Updated caregiver and clinician patient reads to run lazy evaluation for linked patients.
   - Updated `caregiver_patients` and `clinician_patients` to include active prescribed medicines for linked patients.
   - Extended `/api/doses/today` and `/api/doses` to support future date projections and enforce `start_date` / `end_date` bounds.
3. `tests/test_api.py`:
   - Added `test_caregiver_alert_created_on_caregiver_read_without_patient_request`.
   - Added `test_background_worker_evaluates_overdue_doses_without_double_fire`.
   - Added `test_future_days_doses_and_start_end_dates_respected`.
4. `src/services/api.js`:
   - Added network failure event dispatchers (`medremind:backend-offline` and `medremind:backend-online`).
   - Extended `getDosesToday(patientId, date)` to support target date parameter.
5. `src/App.jsx`:
   - Added persistent `.backend-offline-banner` with retry connection handler.
   - Added session expiration event listener (`medremind:session-expired`) redirecting to AuthScreen.
6. `src/screens/AuthScreen.jsx`:
   - Added session expiration warning alert banner display.
7. `src/screens/DashboardScreen.jsx`:
   - Schedule tab displays concrete doses from `/api/doses/today` with real states, snooze counter (`X of 3 used`), 30-min auto-miss notice, and timezone display (`Asia/Kolkata`).
   - Patient Care Team module provides single-use invite code generation with 24h expiry and copy-to-clipboard functionality.
   - Caregiver and Clinician tabs feature invite redemption forms, dynamic linked patient cards with prescription details, and helpful empty states when no patients are linked.
8. `src/index.css`:
   - Added CSS rules for `.backend-offline-banner`, `.offline-banner-content`, `.btn-offline-retry`, and `.missed-notice`.
9. `scripts/e2e_smoke_test.py`:
   - Complete automated smoke test script exercising the full 7-step user lifecycle against live running servers.
10. `docs/E2E_CHECKLIST.md`:
    - Full manual and automated testing checklist and execution documentation.
11. `docs/STATUS.md`:
    - Updated compliance matrix and implementation details for Phase 4.

---

## 5. Next Steps

Phase 4 is complete. Ready for final review before Phase 5 (Production Hardening & Deployment).
