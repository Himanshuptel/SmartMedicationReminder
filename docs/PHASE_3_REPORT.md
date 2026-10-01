# Phase 3 Report: Medication Logic, Concrete Dose Instances, State Transitions & Escalations

**Date**: 2026-10-01  
**Author**: Senior Full-Stack Engineer  
**Status**: COMPLETE (Phase 2 Fixes and Phase 3 Verified)  

---

## 1. Executive Summary & Deliverables

All requested Phase 2 fixes and Phase 3 amendments have been fully implemented, rigorously verified via automated test suites and direct SQLite inspections, and documented.

### Phase 2 Fixes Completed
1. **Locked Down `GET /api/users`**:
   - The user directory endpoint now strictly returns `403 Forbidden` (`FORBIDDEN`). No role (patient, caregiver, or clinician) can list all users.
   - Self-registering as a clinician or caregiver provides zero access to patient data (`/api/clinician/patients` and `/api/caregiver/patients` return empty lists `[]`).
   - Accessing any unlinked patient data returns `403 Forbidden`.

2. **Patient-Approved Caregiver & Clinician Linking**:
   - Implemented `POST /api/patient/invite`: Patients generate a secure single-use invite code (e.g., `INV-XXXXXX`) stored in `patient_invites` with a 48-hour expiration.
   - Implemented `POST /api/patient/link` & `POST /api/caregiver/link`: Caregivers and clinicians redeem the invite code to establish authorized links in `caregiver_patient`.
   - Seed data links between caregiver and patient are inserted **only** when `DEMO_MODE=true`.

3. **Restored Lost Tests**:
   - Fully restored all 17 baseline tests from Phase 1 (updated with session token authentication) alongside all 16 Phase 2 tests, plus 11 new Phase 2/3 unit tests. Total test count is now **44 tests, 100% passing**.

4. **Temporary Database Isolation for E2E Verification**:
   - `scripts/verify_db_e2e.py` creates a temporary isolated database via `tempfile.mkstemp` and cleans it up upon exit. It never modifies `backend/medremind.db`.

5. **HMAC-SHA256 OTP Hashing with Per-Code Salt**:
   - Implemented `generate_otp_record`: generates a unique 16-byte random hex salt and computes an HMAC-SHA256 digest using `SECRET_KEY`.
   - Implemented `verify_otp_hash`: verifies candidate OTPs using `hmac.compare_digest` in constant time.
   - Added `salt` column to `otp_codes` table via versioned migration.

### Phase 3 Deliverables Completed
1. **User Timezone & Concrete Daily Dose Generation**:
   - Added `timezone` column on `users` table (default `'Asia/Kolkata'`).
   - Implemented `generate_daily_doses(user_id, date_str=None, clock=None)`: reads medicine frequencies and reminder times, converts local times in user's timezone into UTC ISO timestamps, and idempotently inserts them into the `dose_instances` table.

2. **Atomic State Machine Transitions**:
   - Supported states: `pending -> taken / snoozed / missed`.
   - All state transitions use atomic conditional updates (`WHERE id = ? AND status IN ('pending', 'snoozed')`), preventing race conditions and double-firing in multi-worker environments.
   - `snooze`: Advances scheduled dose by +10 minutes; strictly enforces a maximum of 3 snoozes per dose (`snooze_count < 3`). A 4th snooze is rejected with `MAX_SNOOZE_REACHED` (HTTP 400).

3. **Auto-Missed Doses Past 30-Minute Grace Window**:
   - Doses exceeding the 30-minute grace window automatically transition to `missed`.
   - Computed lazily on read (`/api/doses/today`, `/api/reminders`, `/api/schedule/today`, `/api/history`) to accommodate free server hosts that sleep between requests.

4. **Injectable Clock for Deterministic Testing**:
   - Implemented `get_current_time(clock=None)`: respects injected `CLOCK_FN` in `app.config` or argument, allowing tests to manipulate time deterministically with **zero real sleeps**.

5. **Idempotent Intake & Stock Tracking**:
   - Taking a dose is idempotent: taking an already-taken dose returns HTTP 200 without decrementing stock again.
   - Stock decrements by 1 only on the first `taken` transition.
   - Automatically dispatches a `refill` alert notification when `stock_remaining <= low_stock_threshold`.

6. **Non-Spam Multi-Tier Escalations**:
   - Exactly **one** caregiver alert is emitted per missed dose (duplicate alerts for the same dose are suppressed).
   - If a patient accumulates 3 consecutive missed doses (`ESCALATION_CONSECUTIVE_MISSES = 3`), emergency escalation alerts are dispatched to all emergency contacts, linked caregivers, and the patient (rate-limited to once per 12 hours).

7. **Adherence Formula & Daily Streak**:
   - Formula: `taken / (taken + missed) * 100.0`.
   - Daily streak: counts consecutive days with 100% adherence (all scheduled doses taken, zero missed).

8. **Automatic Drug-Drug Interaction (DDI) Check**:
   - Adding a medicine (`POST /api/medicines`) automatically cross-references the new drug against the user's active regimen using `INTERACTION_MATRIX`. Any detected interaction emits a clinical notification and returns the interaction report in the response.

9. **Emergency SOS Broadcast**:
   - `POST /api/emergency/sos` dispatches emergency notifications to all linked caregivers and emergency contacts.

---

## 2. Verification Steps & Real Command Outputs

### 2.1 Automated Test Suite (`pytest` with Temporary Database)
```bash
$ .venv/bin/pytest tests/test_api.py -v
```
```text
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.1.1, pluggy-1.6.0 -- /home/khushu/Downloads/Medicine/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /home/khushu/Downloads/Medicine
collecting ... collected 44 items

tests/test_api.py::test_health_and_config PASSED                         [  2%]
tests/test_api.py::test_medicines_crud_success PASSED                    [  4%]
tests/test_api.py::test_medicine_add_validation_failure PASSED           [  6%]
tests/test_api.py::test_automatic_ddi_warning_on_medicine_add PASSED     [  9%]
tests/test_api.py::test_schedule_and_reminders_endpoints PASSED          [ 11%]
tests/test_api.py::test_history_recording_and_adherence PASSED           [ 13%]
tests/test_api.py::test_history_validation_failure PASSED                [ 15%]
tests/test_api.py::test_caregiver_patients_and_acknowledge PASSED        [ 18%]
tests/test_api.py::test_caregiver_acknowledge_validation_failure PASSED  [ 20%]
tests/test_api.py::test_clinician_patients_and_notes PASSED              [ 22%]
tests/test_api.py::test_clinician_notes_validation_failure PASSED        [ 25%]
tests/test_api.py::test_emergency_contacts_and_sos PASSED                [ 27%]
tests/test_api.py::test_ai_interaction_checker PASSED                    [ 29%]
tests/test_api.py::test_ai_chat PASSED                                   [ 31%]
tests/test_api.py::test_ai_chat_validation_failure PASSED                [ 34%]
tests/test_api.py::test_notifications_endpoint PASSED                    [ 36%]
tests/test_api.py::test_mark_notification_read PASSED                    [ 38%]
tests/test_api.py::test_registration_requires_otp_and_issues_no_token_initially PASSED [ 40%]
tests/test_api.py::test_login_requires_otp_and_issues_no_token_initially PASSED [ 43%]
tests/test_api.py::test_verify_wrong_otp_decrements_attempts PASSED      [ 45%]
tests/test_api.py::test_verify_reused_otp_fails PASSED                   [ 47%]
tests/test_api.py::test_verify_expired_otp_fails PASSED                  [ 50%]
tests/test_api.py::test_verify_too_many_attempts_locks_otp PASSED        [ 52%]
tests/test_api.py::test_resend_otp_enforces_30s_cooldown PASSED          [ 54%]
tests/test_api.py::test_access_without_token_returns_401 PASSED          [ 56%]
tests/test_api.py::test_access_with_invalid_or_expired_token_returns_401 PASSED [ 59%]
tests/test_api.py::test_logout_invalidates_session PASSED                [ 61%]
tests/test_api.py::test_user_a_cannot_read_or_delete_user_b_medicines PASSED [ 63%]
tests/test_api.py::test_user_a_cannot_record_intake_for_user_b_reminder PASSED [ 65%]
tests/test_api.py::test_user_a_cannot_read_user_b_notifications PASSED   [ 68%]
tests/test_api.py::test_caregiver_can_access_linked_patient_but_not_unlinked_patient PASSED [ 70%]
tests/test_api.py::test_role_based_access_control PASSED                 [ 72%]
tests/test_api.py::test_production_mode_refuses_to_start_without_secret_key PASSED [ 75%]
tests/test_api.py::test_users_directory_listing_is_locked_down_403 PASSED [ 77%]
tests/test_api.py::test_unlinked_caregiver_and_clinician_get_empty_or_403 PASSED [ 79%]
tests/test_api.py::test_patient_invite_code_and_caregiver_redemption PASSED [ 81%]
tests/test_api.py::test_hmac_sha256_otp_with_salt_verification PASSED    [ 84%]
tests/test_api.py::test_user_timezone_and_dose_instance_generation PASSED [ 86%]
tests/test_api.py::test_dose_state_machine_snooze_limit PASSED           [ 88%]
tests/test_api.py::test_auto_missed_after_grace_window_with_fake_clock PASSED [ 90%]
tests/test_api.py::test_idempotent_intake_and_stock_decrement PASSED     [ 93%]
tests/test_api.py::test_stock_decrement_triggers_low_stock_notification PASSED [ 95%]
tests/test_api.py::test_non_spam_caregiver_alert_and_emergency_escalation_after_n_misses PASSED [ 97%]
tests/test_api.py::test_adherence_formula_and_streak_math PASSED         [100%]

============================== 44 passed in 2.36s ==============================
```

### 2.2 Direct SQLite Database E2E Verification (Isolated Temp Database)
```bash
$ .venv/bin/python scripts/verify_db_e2e.py
```
```text
======================================================================
E2E VERIFICATION: Two-Step Auth & Direct SQLite Database Verification
Isolated Temp DB: /tmp/tmp0wlxj_6d_e2e_verify.db
======================================================================
Database seeded successfully with default datasets.
Database initialized successfully at: /tmp/tmp0wlxj_6d_e2e_verify.db

[1/4] Registering new user via API: verified_patient_1790848133@paruluniversity.ac.in...

[DEV MODE OTP] >>> Verification Code for verified_patient_1790848133@paruluniversity.ac.in: 948915 <<<

 -> Registration initiated. OTP dispatched to verified_patient_1790848133@paruluniversity.ac.in.

[2/4] Verifying 6-digit OTP (948915) to obtain session token...
 -> Session token issued successfully for user ID 4: 9ijlXRHHeIb4...

[3/4] Adding new medicine using session token (identity derived from token)...
 -> Medicine created with ID: 5

[4/4] Inspecting SQLite database file directly at: /tmp/tmp0wlxj_6d_e2e_verify.db...
 -> [PASS] User record verified directly in SQLite users table.
      - ID: 4
      - Name: E2E Patient 1790848133
      - Email: verified_patient_1790848133@paruluniversity.ac.in
      - Timezone: Asia/Kolkata
 -> [PASS] Session record verified directly in SQLite sessions table.
      - Token Hash: 6fd2511dd1f791e59fc71563...
      - Expires At: 2026-10-08T09:48:54.043694+00:00
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
Two-step verification, concrete doses & session authorization operational.
======================================================================
```

### 2.3 Frontend Production Build
```bash
$ npm run build
```
```text
vite v8.2.2 building client environment for production...
✓ 31 modules transformed.
dist/index.html                   0.99 kB │ gzip:  0.50 kB
dist/assets/index-BY7QM-lj.css   50.60 kB │ gzip:  9.28 kB
dist/assets/index-DbmMUjUC.js   300.28 kB │ gzip: 86.58 kB
✓ built in 254ms
```

---

## 3. Summary of Code & File Changes

| File | Change Summary |
|---|---|
| `backend/database.py` | Added migration v2 with `timezone` column on `users`, `salt` column on `otp_codes`, `patient_invites` table, `dose_instances` table, and 3 indexes. Seed links inserted only when `DEMO_MODE=true`. |
| `backend/app.py` | Implemented injectable clock (`get_current_time`); HMAC-SHA256 OTP hashing with per-code salt; locked down `/api/users` (403); added `/api/patient/invite` and `/api/patient/link`; restricted clinician/caregiver views to linked patients; built dose instance generator, state transitions (take, snooze, miss), auto-missed logic, idempotent stock decrement, non-spam escalations, DDI check on add, and adherence math. |
| `scripts/verify_db_e2e.py` | Strictly uses a temporary database file created via `tempfile.mkstemp` and removes it upon exit, ensuring `backend/medremind.db` is never modified. |
| `src/services/api.js` | Added `getDosesToday`, `takeDose`, `snoozeDose`, `missDose`, `createPatientInvite`, and `redeemPatientInvite` methods. |
| `tests/test_api.py` | Expanded to 44 comprehensive tests covering all auth, RBAC, data isolation, timezone generation, snooze limit, fake clock grace period auto-missed, idempotency, low-stock alerts, and non-spam escalations. |
| `docs/STATUS.md` | Updated system matrix, endpoints, tables, and verification records to reflect complete Phase 3 compliance. |

---

## 4. Verification Conclusion

Phase 3 is 100% verified. The application is completely ready for **Phase 4: Frontend UI Refinement, Loading States, and Error Banners**.
