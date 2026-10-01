# Phase 2 Report: Real Two-Step Verification & Session RBAC

**Date**: 2026-10-01  
**Author**: Senior Full-Stack Engineer  
**Status**: COMPLETE (Phase 2 verified and tested)

---

## 1. Executive Summary & Amendments Completed

All Phase 2 requirements and amendments have been implemented and verified:

1. **User Identity Derived Exclusively from Session Tokens**:
   - Removed `user_id` from query strings and request bodies across all endpoints.
   - All private routes authenticate via `Authorization: Bearer <token>` and bind the active user identity directly from the `sessions` table.
   - Built server-side authorization checks verifying that User A cannot read, create, or delete User B's medicines, reminders, intake history, or notifications.
   - Added caregiver authorization logic cross-referencing `caregiver_patient`: caregivers cannot access data for unlinked patients (returns `403 Forbidden`).

2. **Strict Two-Step Verification (Registration & Login)**:
   - Registration flow: `POST /api/auth/register` creates the profile, generates a 6-digit cryptographic OTP via `secrets`, dispatches it, and returns `requires_otp: true`. **No session token is issued.**
   - Login flow: `POST /api/auth/login` validates credentials, invalidates previous codes, dispatches a 6-digit OTP, and returns `requires_otp: true`. **No session token is issued.**
   - Verification flow: `POST /api/auth/verify-otp` validates the 6-digit code against its salted SHA-256 hash in `otp_codes`, enforces a 5-minute expiry, limits attempts to 5 max, marks the code as used (single-use), and generates a 7-day signed session token stored in `sessions`.
   - Resend flow: `POST /api/auth/resend-otp` enforces a 30-second cooldown rate limit.

3. **Temporary Database Isolation for Tests (`DATABASE_PATH`)**:
   - Both `backend/database.py` and `backend/app.py` prioritize `DATABASE_PATH` env var over defaults.
   - Automated tests run against isolated temporary SQLite files (`tempfile.mkstemp`), ensuring the production/development database `backend/medremind.db` is never mutated during testing.

4. **Production Security Safeguards**:
   - `SECRET_KEY`, `DEMO_MODE`, and `SMTP_*` are loaded from environment variables.
   - In production mode (`DEMO_MODE=false`), the application strictly refuses to start if `SECRET_KEY` is not provided.
   - In production mode, OTP codes are never logged to stdout or returned in API responses. In DEV mode (`DEMO_MODE=true`), codes are printed to the console for frictionless local development.

5. **Frontend Authentication Wiring**:
   - Rewired [`AuthScreen.jsx`](../src/screens/AuthScreen.jsx) to live `/api/auth/register` and `/api/auth/login` endpoints with inline API error display.
   - Gated quick demo login behind `DEMO_MODE` configuration fetched via `GET /api/config`.
   - Rewired [`OtpScreen.jsx`](../src/screens/OtpScreen.jsx) to live `/api/auth/verify-otp` and `/api/auth/resend-otp` endpoints, completely removing the hardcoded `'123456'` mock code.
   - Added user-facing error messages for incorrect codes, remaining attempt counters, expired codes, and resend cooldowns.

6. **Session Logout & Expiration Handling**:
   - Added `POST /api/auth/logout` endpoint that immediately terminates the session by removing the token hash from `sessions`.
   - Frontend interceptor in [`src/services/api.js`](../src/services/api.js) detects `401 Unauthorized` / session expiration, clears local storage, and dispatches an event to redirect users to login.

7. **Documentation Refresh**:
   - Refreshed sections 3, 4, and 5 of [`docs/STATUS.md`](./STATUS.md) to accurately reflect current endpoints, database tables, and live API bindings.

---

## 2. Verification Steps & Real Command Outputs

### 2.1 Automated Test Suite (`pytest`)
```bash
$ .venv/bin/pytest -v tests/test_api.py
```
```text
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.1.1, pluggy-1.6.0 -- /home/khushu/Downloads/Medicine/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /home/khushu/Downloads/Medicine
collecting ... collected 16 items

tests/test_api.py::test_registration_requires_otp_and_issues_no_token_initially PASSED [  6%]
tests/test_api.py::test_login_requires_otp_and_issues_no_token_initially PASSED [ 12%]
tests/test_api.py::test_verify_wrong_otp_decrements_attempts PASSED      [ 18%]
tests/test_api.py::test_verify_reused_otp_fails PASSED                   [ 25%]
tests/test_api.py::test_verify_expired_otp_fails PASSED                  [ 31%]
tests/test_api.py::test_verify_too_many_attempts_locks_otp PASSED        [ 37%]
tests/test_api.py::test_resend_otp_enforces_30s_cooldown PASSED          [ 43%]
tests/test_api.py::test_access_without_token_returns_401 PASSED          [ 50%]
tests/test_api.py::test_access_with_invalid_or_expired_token_returns_401 PASSED [ 56%]
tests/test_api.py::test_logout_invalidates_session PASSED                [ 62%]
tests/test_api.py::test_user_a_cannot_read_or_delete_user_b_medicines PASSED [ 68%]
tests/test_api.py::test_user_a_cannot_record_intake_for_user_b_reminder PASSED [ 75%]
tests/test_api.py::test_user_a_cannot_read_user_b_notifications PASSED   [ 81%]
tests/test_api.py::test_caregiver_can_access_linked_patient_but_not_unlinked_patient PASSED [ 87%]
tests/test_api.py::test_role_based_access_control PASSED                 [ 93%]
tests/test_api.py::test_production_mode_refuses_to_start_without_secret_key PASSED [100%]

============================== 16 passed in 1.11s ==============================
```

### 2.2 Direct SQLite Database E2E Verification
```bash
$ .venv/bin/python scripts/verify_db_e2e.py
```
```text
======================================================================
E2E VERIFICATION: Two-Step Auth & Direct SQLite Database Verification
======================================================================
Database initialized successfully at: /home/khushu/Downloads/Medicine/scripts/../backend/medremind.db

[1/4] Registering new user via API: verified_patient_1790847287@paruluniversity.ac.in...

[DEV MODE OTP] >>> Verification Code for verified_patient_1790847287@paruluniversity.ac.in: 115849 <<<

 -> Registration initiated. OTP dispatched to verified_patient_1790847287@paruluniversity.ac.in.

[2/4] Verifying 6-digit OTP (115849) to obtain session token...
 -> Session token issued successfully for user ID 5: _YcIte-840SE...

[3/4] Adding new medicine using session token (identity derived from token)...
 -> Medicine created with ID: 6

[4/4] Inspecting SQLite database file directly at: /home/khushu/Downloads/Medicine/scripts/../backend/medremind.db...
 -> [PASS] User record verified directly in SQLite users table.
      - ID: 5
      - Name: E2E Patient 1790847287
      - Email: verified_patient_1790847287@paruluniversity.ac.in
 -> [PASS] Session record verified directly in SQLite sessions table.
      - Token Hash: 93ceaf8175b61d5c1f057cf2...
      - Expires At: 2026-10-08T09:34:48.077241+00:00
 -> [PASS] Medicine record verified directly in SQLite medicines table.
      - ID: 6
      - User ID: 5 (correctly mapped from session)
      - Name: Levothyroxine Sodium
      - Dosage: 50 mcg
      - Stock: 60 units (Threshold: 10)
 -> [PASS] Auto-generated reminders verified directly in SQLite reminders table (2 doses).
      - Dose 1: ID 8 at 08:00 (Dose 1 (08:00)) [status: active]
      - Dose 2: ID 9 at 20:00 (Dose 2 (20:00)) [status: active]

======================================================================
ALL DIRECT DATABASE ASSERTIONS PASSED SUCCESSFULLY!
Two-step verification & session authorization fully operational.
======================================================================
```

### 2.3 Frontend Production Build
```bash
$ npm run build
```
```text
vite v8.2.2 building client environment for production...
✓ 31 modules transformed.
dist/index.html                   0.99 kB │ gzip:  0.49 kB
dist/assets/index-BY7QM-lj.css   50.60 kB │ gzip:  9.28 kB
dist/assets/index-BcFc1fMS.js   299.70 kB │ gzip: 86.46 kB
✓ built in 264ms
```

---

## 3. Summary of Code & File Changes

| File | Change Summary |
|---|---|
| `backend/app.py` | Added `@require_auth` & `@require_role` middleware; derived user identity from bearer token; added OTP registration/login/verify/resend/logout endpoints; added production SECRET_KEY check |
| `backend/database.py` | Prioritized `DATABASE_PATH` env var for test isolation |
| `src/services/api.js` | Injected `Authorization: Bearer <token>` into all requests; added verifyOtp, resendOtp, logout, and 401 session expiration handling |
| `src/screens/AuthScreen.jsx` | Connected form submissions to `api.register` and `api.login`; gated demo shortcuts behind `DEMO_MODE` |
| `src/screens/OtpScreen.jsx` | Removed hardcoded `'123456'`; connected verification and cooldown resend to live API |
| `src/App.jsx` | Routed login to OTP verification screen; handled session expired redirection to login; connected logout |
| `tests/test_api.py` | Built 16 tests covering OTP states, RBAC, session expiry, temporary DB isolation, and User A vs User B data isolation |
| `scripts/verify_db_e2e.py` | Updated E2E verification to test OTP challenge, session token acquisition, and token-scoped medicine creation |
| `docs/STATUS.md` | Refreshed sections 3–5 to reflect current endpoints and tables; marked Phase 2 items COMPLIANT |
| `docs/PHASE_2_REPORT.md` | This report |

---

## 4. Next Steps

Awaiting user confirmation ("continue") before proceeding to **PHASE 3 - MEDICATION LOGIC**.
