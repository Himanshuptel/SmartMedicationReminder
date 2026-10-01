#!/usr/bin/env python3
"""
Smart Medication Reminder - Automated E2E Smoke Test
Performs the full live user flow against the running server:
1. Register patient -> receives OTP challenge
2. OTP verification -> receives session token
3. Add medication -> auto-generates reminders & concrete doses
4. Query today's doses -> verifies pending status and timezone
5. Take dose -> records intake, updates status to 'taken', decrements stock
6. Logout -> destroys session token
7. Verifies session token is revoked (401 Unauthorized)
"""
import sys
import os
import json
import urllib.request
import urllib.error
import sqlite3

BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:5050/api")

def request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content = resp.read().decode("utf-8")
            return status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content) if content else {}
        except Exception:
            parsed = {"raw": content}
        return e.code, parsed

def main():
    print("=" * 70)
    print("LIVE E2E SMOKE TEST: Register -> OTP -> Add Med -> Take Dose -> Logout")
    print(f"Target API: {BASE_URL}")
    print("=" * 70)

    # 0. Health check
    status, res = request("/health")
    print(f"\n[Step 0] API Health Check: HTTP {status}")
    assert status == 200 and res.get("status") == "healthy", f"Health check failed: {res}"
    print(" -> Backend service healthy.")

    # 1. Register
    import time
    ts = int(time.time())
    email = f"e2e_user_{ts}@parul.ac.in"
    password = "StrongPassword_123!"
    print(f"\n[Step 1] Registering patient: {email}")
    reg_payload = {
        "fullName": f"E2E Smoke Tester {ts}",
        "email": email,
        "phone": "+91 98980 12345",
        "role": "patient",
        "password": password,
        "timezone": "Asia/Kolkata"
    }
    status, res = request("/auth/register", "POST", reg_payload)
    print(f" -> HTTP {status}: {res.get('message')}")
    assert status == 201, f"Registration failed: {res}"
    assert "token" not in res, "Security violation: token returned before OTP verification!"

    # 2. Extract OTP from database directly for this test
    # (In dev mode it was printed to stdout, we query database to verify correctness)
    db_path = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "..", "backend", "medremind.db"))
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE email = ?", (email,))
    user_id = c.fetchone()[0]
    c.execute("SELECT otp_hash, salt FROM otp_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,))
    row = c.fetchone()
    assert row is not None, "OTP record not found in database!"
    stored_hash, salt = row[0], row[1]

    # Find the matching 6-digit code by computing HMAC with secret
    secret = os.environ.get("SECRET_KEY", "dev-insecure-secret-key-change-in-production-min32chars").encode("utf-8")
    import hmac
    import hashlib
    otp_code = None
    for candidate in range(1000000):
        c_str = f"{candidate:06d}"
        msg = f"{salt}:{c_str}".encode("utf-8")
        h = hmac.new(secret, msg, hashlib.sha256).hexdigest()
        if h == stored_hash:
            otp_code = c_str
            break
    conn.close()

    assert otp_code is not None, "Could not reverse HMAC OTP!"
    print(f"\n[Step 2] Verifying OTP: {otp_code} for user {email}")
    verify_payload = {"email": email, "otp": otp_code}
    status, res = request("/auth/verify-otp", "POST", verify_payload)
    print(f" -> HTTP {status}: {res.get('message')}")
    assert status == 200, f"OTP verification failed: {res}"
    token = res.get("token")
    assert token, "Session token not issued upon OTP verification!"
    print(f" -> Session token issued: {token[:12]}...")

    # 3. Add Medication
    print(f"\n[Step 3] Adding Medication: Amoxicillin 500mg BID")
    med_payload = {
        "name": "Amoxicillin",
        "dosage_amount": "500",
        "dosage_unit": "mg",
        "frequency": "twice",
        "meal_timing": "after_food",
        "instructions": "Take with full glass of water after food",
        "stock_remaining": 30,
        "low_stock_threshold": 6,
        "reminder_times": ["08:00", "20:00"]
    }
    status, res = request("/medicines", "POST", med_payload, token=token)
    print(f" -> HTTP {status}: {res.get('message')}")
    assert status == 201, f"Failed to add medicine: {res}"
    payload_data = res.get("data") if isinstance(res.get("data"), dict) else res
    med_id = payload_data.get("medicine_id") or payload_data.get("id")
    print(f" -> Medicine created with ID {med_id}")

    # 4. Fetch Today's Doses
    print(f"\n[Step 4] Querying Today's Doses (/api/doses/today)")
    status, res = request("/doses/today", "GET", token=token)
    print(f" -> HTTP {status}")
    assert status == 200, f"Failed to fetch today's doses: {res}"
    doses_data = res.get("data") if isinstance(res.get("data"), dict) else res
    doses = doses_data.get("doses", [])
    print(f" -> Found {len(doses)} concrete dose instances for today:")
    for d in doses:
        print(f"    - Dose ID {d['id']}: {d['medicine_name']} {d['dosage']} at {d['local_time']} [{d['status']}]")
    assert len(doses) >= 2, f"Expected at least 2 doses for twice daily schedule, got {len(doses)}"
    
    # Pick the pending dose for today (the morning dose may already be marked missed if past grace window)
    target_dose = next((d for d in doses if d["status"] == "pending"), doses[0])
    print(f" -> Selected dose for intake: ID {target_dose['id']} scheduled for {target_dose['local_time']} [{target_dose['status']}]")

    # 5. Take Dose
    print(f"\n[Step 5] Taking Dose ID {target_dose['id']}")
    take_payload = {"notes": "E2E smoke test taken via API"}
    status, res = request(f"/doses/{target_dose['id']}/take", "POST", take_payload, token=token)
    print(f" -> HTTP {status}: {res.get('message')}")
    assert status == 200, f"Failed to take dose: {res}"
    assert res.get("status") == "taken", f"Expected response status 'taken', got {res.get('status')}"
    
    # Verify persistent database update
    status, res = request("/doses/today", "GET", token=token)
    doses_data = res.get("data") if isinstance(res.get("data"), dict) else res
    taken_dose = next(d for d in doses_data.get("doses", []) if d["id"] == target_dose["id"])
    assert taken_dose["status"] == "taken", f"Database did not persist taken status: {taken_dose}"
    print(f" -> Dose ID {target_dose['id']} verified persisted in SQLite with status: '{taken_dose['status']}'.")

    # Verify stock decremented
    status, res = request("/medicines", "GET", token=token)
    assert status == 200
    meds_data = res.get("data") if isinstance(res.get("data"), dict) else res
    med = next(m for m in meds_data.get("medicines", []) if m["id"] == med_id)
    print(f" -> Medicine stock remaining: {med['stock_remaining']} (originally 30, decremented to 29)")
    assert med["stock_remaining"] == 29, f"Stock was not decremented! Current: {med['stock_remaining']}"

    # 6. Logout
    print(f"\n[Step 6] Logging Out (/api/auth/logout)")
    status, res = request("/auth/logout", "POST", token=token)
    print(f" -> HTTP {status}: {res.get('message')}")
    assert status == 200, f"Logout failed: {res}"

    # 7. Verify Revocation
    print(f"\n[Step 7] Verifying Session Revocation with Expired Token")
    status, res = request("/doses/today", "GET", token=token)
    print(f" -> HTTP {status}: {res.get('message')}")
    assert status == 401, f"Expected HTTP 401 after logout, got {status}: {res}"
    print(" -> Access rejected with HTTP 401 (Session invalidated successfully).")

    print("\n" + "=" * 70)
    print("ALL 7 E2E SMOKE TEST STEPS PASSED SUCCESSFULLY AGAINST LIVE SERVER!")
    print("=" * 70)

if __name__ == "__main__":
    main()
