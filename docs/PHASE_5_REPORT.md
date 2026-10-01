# Phase 5 Verification Report: Production Hardening & Deployment Readiness

**Project**: Smart Medication Reminder (MedRemind)  
**Institution**: Parul University — Semester IV IMCA / BCA Project  
**Internal Guide**: Prof. Sathwik Chebrolu  
**Date**: 2026-10-01  
**Status**: COMPLETE (All 10 Phase 5 Objectives Fully Met & Verified)

---

## 1. Executive Summary

Phase 5 transitions the Smart Medication Reminder system from functional feature-completeness to enterprise-grade production readiness. All security, privacy, operational, and deployment requirements were systematically implemented, documented, and tested.

Crucially:
1. **CORS Restrictions**: Origin access is strictly locked to `ALLOWED_ORIGINS`. Wildcard `*` is strictly disallowed and rejected at startup when `DEMO_MODE=false`.
2. **Security Headers**: Attached to all HTTP responses: Content-Security-Policy (CSP) customized for Vite bundling, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security` (HSTS) applied exclusively when requests are behind HTTPS.
3. **Multi-Worker SQLite Rate Limiting**: Sliding-window rate limiter backed by the `request_rate_limits` table in SQLite, sharing state across all Gunicorn worker processes. Throttles `login`, `register`, `verify-otp`, and `resend-otp` per IP and per email account.
4. **Sanitized Error Output**: `@app.errorhandler(500)` returns generic JSON (`INTERNAL_SERVER_ERROR`) with zero stack traces, Python tracebacks, or raw SQL queries leaked to clients. Full tracebacks are recorded only in server logs. Structured request logging redacts all sensitive credentials (passwords, OTPs, session tokens).
5. **Production Safety Startup Checks**: In production mode (`DEMO_MODE=false`), the application refuses to start if `SECRET_KEY` is missing, default, or under 32 characters, if `ALLOWED_ORIGINS` is missing or wildcard, or if SMTP credentials are incomplete. Clean databases initialize with 0 seeded users, and OTPs are never printed to console.
6. **Multi-Worker Concurrency Safety**: The background overdue evaluation routine was validated for 2+ worker processes; atomic conditional SQL updates (`WHERE id=? AND status IN ('pending', 'snoozed')`) guarantee that exactly one worker transitions any dose, preventing duplicate medication history entries and duplicate caregiver alerts.
7. **Production Dockerfile**: Built on `python:3.12-slim`, running with Gunicorn (2 workers, 2 threads), non-root user `appuser` (UID 10001), healthcheck via `/api/health`, and persistent volume mounted at `/app/data`.
8. **Authoritative Documentation**: Complete production `README.md` replacing Vite defaults, updated `docs/STATUS.md`, and transparent `docs/KNOWN_LIMITATIONS.md`.

---

## 2. Implemented Features & Amendments

### 2.1 Documentation Consistency & Status Fixes
- Removed duplicated Phase 5 rows from `docs/STATUS.md`.
- Standardized patient invite codes to `INV-XXXXXX` across the backend and frontend (`DashboardScreen.jsx` Patient, Caregiver, and Clinician views).
- Added schema migration `version 3` (`phase_5_sqlite_rate_limiting`) and registered the 14th table `request_rate_limits`.
- Corrected test suite documentation to 57 passing tests.

### 2.2 Strict CORS Configuration & Security Headers
- `get_allowed_origins()` parses `ALLOWED_ORIGINS` from environment variables. In production mode (`DEMO_MODE=false`), any wildcard `*` or empty configuration raises a fatal `RuntimeError`.
- `@app.after_request` applies strict security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy`: Permits self assets, inline Vite scripts/styles, Google Fonts, and data/blob image URIs.
  - `Strict-Transport-Security`: Applied only when `request.is_secure` or `X-Forwarded-Proto == 'https'`. Plain HTTP requests do not receive HSTS.

### 2.3 SQLite-Backed Sliding-Window Rate Limiting
- Table `request_rate_limits(id, limiter_key, timestamp)` stores request timestamps with index `idx_rate_limits_key_time`.
- `check_rate_limit(limiter_key, max_requests, window_seconds, clock)` atomically deletes expired entries outside the sliding window and calculates exact `Retry-After` seconds.
- `enforce_rate_limits(endpoint_name, email)` evaluates:
  1. IP address limit: `ip:{endpoint}:{client_ip}` (default 5 req/min)
  2. Account email limit: `email:{endpoint}:{email}` (default 5 req/min, 3 for resend)
- Returns HTTP 429 `TOO_MANY_REQUESTS` with standard `Retry-After` header when throttled.
- Fully verified deterministically using fake clocks in automated tests.

### 2.4 Sanitized Error Handling & Structured Logging
- `@app.errorhandler(500)` and `@app.errorhandler(Exception)` catch all unhandled exceptions (including database operational errors, query syntax failures, and internal bugs).
- Returns sanitized JSON:
  ```json
  {
    "success": false,
    "error": {
      "code": "INTERNAL_SERVER_ERROR",
      "message": "An internal server error occurred. Please try again later.",
      "details": null
    }
  }
  ```
- Detailed stack trace is emitted only to server logger (`logger.exception`).
- Structured request logging records:
  `REQ: method={method} path={path} status={status} duration_ms={ms} ip={ip} user={user_id}`
  Request bodies, authorization headers, passwords, tokens, and OTPs are strictly excluded.

### 2.5 Production Safety Startup Validation (`DEMO_MODE=false`)
- `validate_production_configuration()` verifies on application boot:
  - `SECRET_KEY` is set, is not the dev default, and is at least 32 characters long.
  - `ALLOWED_ORIGINS` is configured and is not `*`.
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` are all non-empty.
- `init_db()` never seeds demo users or known passwords (`DemoPassword123!`) when `DEMO_MODE=false`.
- `dispatch_otp()` never prints OTPs to stdout/stderr and does not store `app.config["LAST_DISPATCHED_OTP"]` in production.

### 2.6 Multi-Worker Overdue Thread Concurrency Safety
- In a multi-worker WSGI deployment (Gunicorn with 2+ workers), each worker process may run background overdue evaluations.
- Atomic conditional SQL statement:
  ```sql
  UPDATE dose_instances
  SET status = 'missed', action_time = ?, notes = ?
  WHERE id = ? AND status IN ('pending', 'snoozed');
  ```
  Only the worker whose update changes the row (`cursor.rowcount == 1`) proceeds to insert into `medication_history`, send caregiver notifications, and trigger escalation.
- Notification deduplication queries ensure at most one caregiver alert per missed dose.
- Verified with multithreaded concurrent test `test_phase5_multi_worker_concurrency_safety_for_overdue_evaluator`.

### 2.7 Production Dockerfile
- Located at `/Dockerfile`.
- Uses `python:3.12-slim` base image.
- Installs `curl` for container healthcheck.
- Creates unprivileged non-root system user `appuser` (UID 10001).
- Declares persistent volume mount point `VOLUME ["/app/data"]`.
- Configures healthcheck querying `/api/health` every 30 seconds.
- Runs `gunicorn --bind 0.0.0.0:5050 --workers 2 --threads 2 app:app`.

---

## 3. Real Verification Evidence & Command Outputs

### 3.1 Full Automated Backend Pytest Suite
```
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.1.1, pluggy-1.6.0 -- /home/khushu/Downloads/Medicine/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /home/khushu/Downloads/Medicine
collecting ... collected 57 items

tests/test_api.py::test_health_and_config PASSED                         [  1%]
tests/test_api.py::test_medicines_crud_success PASSED                    [  3%]
tests/test_api.py::test_medicine_add_validation_failure PASSED           [  5%]
tests/test_api.py::test_automatic_ddi_warning_on_medicine_add PASSED     [  7%]
tests/test_api.py::test_schedule_and_reminders_endpoints PASSED          [  8%]
tests/test_api.py::test_history_recording_and_adherence PASSED           [ 10%]
tests/test_api.py::test_history_validation_failure PASSED                [ 12%]
tests/test_api.py::test_caregiver_patients_and_acknowledge PASSED        [ 14%]
tests/test_api.py::test_caregiver_acknowledge_validation_failure PASSED  [ 15%]
tests/test_api.py::test_clinician_patients_and_notes PASSED              [ 17%]
tests/test_api.py::test_clinician_notes_validation_failure PASSED        [ 19%]
tests/test_api.py::test_emergency_contacts_and_sos PASSED                [ 21%]
tests/test_api.py::test_ai_interaction_checker PASSED                    [ 22%]
tests/test_api.py::test_ai_chat PASSED                                   [ 24%]
tests/test_api.py::test_ai_chat_validation_failure PASSED                [ 26%]
tests/test_api.py::test_notifications_endpoint PASSED                    [ 28%]
tests/test_api.py::test_mark_notification_read PASSED                    [ 29%]
tests/test_api.py::test_registration_requires_otp_and_issues_no_token_initially PASSED [ 31%]
tests/test_api.py::test_login_requires_otp_and_issues_no_token_initially PASSED [ 33%]
tests/test_api.py::test_verify_wrong_otp_decrements_attempts PASSED      [ 35%]
tests/test_api.py::test_verify_reused_otp_fails PASSED                   [ 36%]
tests/test_api.py::test_verify_expired_otp_fails PASSED                  [ 38%]
tests/test_api.py::test_verify_too_many_attempts_locks_otp PASSED        [ 40%]
tests/test_api.py::test_resend_otp_enforces_30s_cooldown PASSED          [ 42%]
tests/test_api.py::test_access_without_token_returns_401 PASSED          [ 43%]
tests/test_api.py::test_access_with_invalid_or_expired_token_returns_401 PASSED [ 45%]
tests/test_api.py::test_logout_invalidates_session PASSED                [ 47%]
tests/test_api.py::test_user_a_cannot_read_or_delete_user_b_medicines PASSED [ 49%]
tests/test_api.py::test_user_a_cannot_record_intake_for_user_b_reminder PASSED [ 50%]
tests/test_api.py::test_user_a_cannot_read_user_b_notifications PASSED   [ 52%]
tests/test_api.py::test_caregiver_can_access_linked_patient_but_not_unlinked_patient PASSED [ 54%]
tests/test_api.py::test_role_based_access_control PASSED                 [ 56%]
tests/test_api.py::test_production_mode_refuses_to_start_without_secret_key PASSED [ 57%]
tests/test_api.py::test_users_directory_listing_is_locked_down_403 PASSED [ 59%]
tests/test_api.py::test_unlinked_caregiver_and_clinician_get_empty_or_403 PASSED [ 61%]
tests/test_api.py::test_patient_invite_code_and_caregiver_redemption PASSED [ 63%]
tests/test_api.py::test_hmac_sha256_otp_with_salt_verification PASSED    [ 64%]
tests/test_api.py::test_user_timezone_and_dose_instance_generation PASSED [ 66%]
tests/test_api.py::test_dose_state_machine_snooze_limit PASSED           [ 68%]
tests/test_api.py::test_auto_missed_after_grace_window_with_fake_clock PASSED [ 70%]
tests/test_api.py::test_idempotent_intake_and_stock_decrement PASSED     [ 71%]
tests/test_api.py::test_stock_decrement_triggers_low_stock_notification PASSED [ 73%]
tests/test_api.py::test_non_spam_caregiver_alert_and_emergency_escalation_after_n_misses PASSED [ 75%]
tests/test_api.py::test_adherence_formula_and_streak_math PASSED         [ 77%]
tests/test_api.py::test_caregiver_alert_created_on_caregiver_read_without_patient_request PASSED [ 78%]
tests/test_api.py::test_background_worker_evaluates_overdue_doses_without_double_fire PASSED [ 80%]
tests/test_api.py::test_future_days_doses_and_start_end_dates_respected PASSED [ 82%]
tests/test_api.py::test_phase5_security_headers_present PASSED           [ 84%]
tests/test_api.py::test_phase5_hsts_only_when_https PASSED               [ 85%]
tests/test_api.py::test_phase5_cors_restricted_in_production PASSED      [ 87%]
tests/test_api.py::test_phase5_sqlite_rate_limiting_ip_with_fake_clock PASSED [ 89%]
tests/test_api.py::test_phase5_sqlite_rate_limiting_email_with_fake_clock PASSED [ 91%]
tests/test_api.py::test_phase5_sanitized_500_error_response PASSED       [ 92%]
tests/test_api.py::test_phase5_production_safety_checks_at_startup PASSED [ 94%]
tests/test_api.py::test_phase5_production_mode_does_not_seed_demo_users PASSED [ 96%]
tests/test_api.py::test_phase5_production_mode_does_not_print_or_store_otp PASSED [ 98%]
tests/test_api.py::test_phase5_multi_worker_concurrency_safety_for_overdue_evaluator PASSED [100%]

============================== 57 passed in 2.61s ==============================
```

### 3.2 Live Production-Mode Smoke Test (`scripts/smoke_test_production.py`)
```
===========================================================================
PRODUCTION-MODE SMOKE TEST (DEMO_MODE=false + Live SMTP Stub)
===========================================================================

[Step 1] Starting documented local SMTP server stub on port 8587...
 -> SMTP stub server listening and ready.

[Step 2] Launching backend on port 5055 with DEMO_MODE=false...
 -> Backend initialized successfully. DEMO_MODE=False

[Step 3] Verifying Security Headers on HTTP Response...
 -> CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy verified.

[Step 4] Verifying clean production database (zero demo users seeded)...
 -> Current user count in database: 0

[Step 5] Registering production patient (prod_patient_1790851566@parul.ac.in)...
 -> HTTP 201: Registration initiated. A 6-digit verification code has been dispatched.

[Step 6] Inspecting SMTP stub server for dispatched email...
 -> SMTP stub received verification email for prod_patient_1790851566@parul.ac.in.
 -> Extracted verification code from live SMTP message: 071646

[Step 7] Verifying OTP 071646 via /api/auth/verify-otp...
 -> HTTP 200: Verification successful. Session issued.
 -> Signed 7-day session token issued: d3MP-U5Qm23r...

[Step 8] Creating medication regimen in production mode...
 -> HTTP 201: Medicine saved and daily doses projected.
 -> Selected pending dose instance ID 2 scheduled for 20:00 [pending]
 -> Dose ID 2 marked as 'taken' successfully.
 -> Session successfully revoked (HTTP 401 on subsequent authenticated access).

===========================================================================
ALL PRODUCTION-MODE SMOKE TEST CHECKS PASSED WITH 100% SUCCESS!
===========================================================================
```

### 3.3 Frontend Production Build (`npm run build`)
```
> med-reminder@0.0.0 build
> vite build

vite v8.2.2 building client environment for production...
transforming (31) src/index.css✓ 31 modules transformed.
rendering chunks (1)...computing gzip size...
dist/index.html                   0.99 kB │ gzip:  0.50 kB
dist/assets/index-JsjMfZcc.css   51.78 kB │ gzip:  9.51 kB
dist/assets/index-CCYS5gXK.js   316.12 kB │ gzip: 89.98 kB

✓ built in 292ms
```

---

## 4. Phase 5 Completion Checklist

- [x] Removed duplicated Phase 5 rows in `docs/STATUS.md`.
- [x] Corrected test count to 57 and migration versions to v1, v2, v3 in `docs/STATUS.md`.
- [x] Standardized invite-code format (`INV-XXXXXX`) across all UI screens.
- [x] Restricted CORS to `ALLOWED_ORIGINS` from env (no wildcard `*` allowed in production).
- [x] Applied security headers: CSP suited to Vite, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS only when behind HTTPS.
- [x] Implemented SQLite-backed rate limiting per IP and per email on login, register, verify-otp, resend-otp.
- [x] Added fake clock tests proving rate limiter throttling and recovery.
- [x] Sanitized 500 error responses: generic JSON without stack traces or SQL errors leaked to client.
- [x] Structured request logging that redacts passwords, tokens, and OTPs.
- [x] Implemented startup production safety checks (`DEMO_MODE=false` requires `SECRET_KEY`, `ALLOWED_ORIGINS`, SMTP settings; never seeds demo users; never prints OTPs).
- [x] Authored backend Dockerfile on Python 3.12, Gunicorn, non-root user `appuser`, healthcheck, and persistent volume.
- [x] Verified and documented multi-worker concurrency safety for background overdue evaluation.
- [x] Replaced default Vite README with complete production `README.md`.
- [x] Created `docs/KNOWN_LIMITATIONS.md` documenting simulated services honestly.
- [x] Executed full pytest suite, production smoke test, and npm run build.
- [x] Zero git commands executed, zero git history touched.
