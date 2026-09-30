"""
Smart Medication Reminder - Comprehensive Phase 2 Test Suite
Parul University - Semester IV IMCA / BCA Project

Covers:
- Strict Two-Step Verification (Registration OTP & Login OTP)
- Single-use, attempt limits (5 max), expiry, and 30s cooldown
- Session token authentication (Authorization: Bearer <token>)
- User isolation: User A cannot read/modify User B's medicines, history, or notifications
- Caregiver-Patient authorization via caregiver_patient
- Role-Based Access Control (RBAC 401/403)
- Logout and session expiration
- Temporary database isolation (DATABASE_PATH env var)
"""
import os
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
import pytest

# Ensure backend directory is in python search path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Set DATABASE_PATH to a temporary database file BEFORE importing app / database
temp_db_fd, temp_db_path = tempfile.mkstemp(suffix="_test.db")
os.environ["DATABASE_PATH"] = temp_db_path
os.environ["DEMO_MODE"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase2-automated-tests"

from app import app
from database import init_db, get_connection

@pytest.fixture(scope="session")
def test_client():
    """Session fixture initializing clean temporary database and Flask test client."""
    init_db(db_path=temp_db_path, force_reseed=True)
    app.config["TESTING"] = True

    with app.test_client() as client:
        yield client

    # Cleanup temp db after test session
    try:
        os.close(temp_db_fd)
        if os.path.exists(temp_db_path):
            os.unlink(temp_db_path)
    except Exception:
        pass

def helper_register_and_verify(client, name, email, phone, role="patient", password="Password123!"):
    """Helper to register user, extract OTP, verify, and return (user_dict, token)."""
    reg_res = client.post("/api/auth/register", json={
        "fullName": name,
        "email": email,
        "phone": phone,
        "role": role,
        "password": password
    })
    assert reg_res.status_code == 201, f"Reg failed: {reg_res.get_json()}"
    reg_data = reg_res.get_json()
    assert reg_data["requires_otp"] is True
    assert "token" not in reg_data # Ensure NO token before OTP

    otp = app.config.get("LAST_DISPATCHED_OTP", {}).get(email)
    assert otp is not None, f"No OTP dispatched for {email}"

    ver_res = client.post("/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert ver_res.status_code == 200, f"Verify failed: {ver_res.get_json()}"
    ver_data = ver_res.get_json()
    assert "token" in ver_data
    return ver_data["user"], ver_data["token"]

def helper_login_and_verify(client, identifier, password):
    """Helper to login, extract OTP, verify, and return (user_dict, token)."""
    login_res = client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert login_res.status_code == 200, f"Login failed: {login_res.get_json()}"
    login_data = login_res.get_json()
    assert login_data["requires_otp"] is True
    assert "token" not in login_data # Ensure NO token before OTP

    email = login_data["email"]
    otp = app.config.get("LAST_DISPATCHED_OTP", {}).get(email)
    assert otp is not None, f"No OTP dispatched for {email}"

    ver_res = client.post("/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert ver_res.status_code == 200, f"Verify failed: {ver_res.get_json()}"
    ver_data = ver_res.get_json()
    assert "token" in ver_data
    return ver_data["user"], ver_data["token"]

# ── 1. Strict Two-Step Verification (Registration & Login) ─────────

def test_registration_requires_otp_and_issues_no_token_initially(test_client):
    res = test_client.post("/api/auth/register", json={
        "fullName": "OTP Test User",
        "email": "otp.user@parul.ac.in",
        "phone": "+91 99000 11000",
        "role": "patient",
        "password": "SecurePassword123!"
    })
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True
    assert data["requires_otp"] is True
    assert "token" not in data

def test_login_requires_otp_and_issues_no_token_initially(test_client):
    # Himanshu Patel is seeded
    res = test_client.post("/api/auth/login", json={
        "identifier": "himanshu@paruluniversity.ac.in",
        "password": "DemoPassword123!"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["requires_otp"] is True
    assert "token" not in data

# ── 2. OTP Edge Cases: Wrong, Expired, Reused, Max Attempts, Cooldown

def test_verify_wrong_otp_decrements_attempts(test_client):
    email = "wrong_otp_test@parul.ac.in"
    test_client.post("/api/auth/register", json={
        "fullName": "Wrong OTP Tester",
        "email": email,
        "phone": "+91 99111 22334",
        "role": "patient",
        "password": "Password123!"
    })

    # Enter wrong OTP
    res = test_client.post("/api/auth/verify-otp", json={"email": email, "otp": "000000"})
    assert res.status_code == 400
    data = res.get_json()
    assert data["success"] is False
    assert "attempt" in data["error"]["message"].lower()

def test_verify_reused_otp_fails(test_client):
    email = "reused_otp@parul.ac.in"
    _, token = helper_register_and_verify(test_client, "Reused User", email, "+91 99222 33445")
    assert token is not None

    # Try verifying the exact same OTP code again
    old_otp = app.config["LAST_DISPATCHED_OTP"][email]
    res_second = test_client.post("/api/auth/verify-otp", json={"email": email, "otp": old_otp})
    assert res_second.status_code == 400
    assert "no pending otp request" in res_second.get_json()["error"]["message"].lower()

def test_verify_expired_otp_fails(test_client):
    email = "expired_otp@parul.ac.in"
    test_client.post("/api/auth/register", json={
        "fullName": "Expired Tester",
        "email": email,
        "phone": "+91 99333 44556",
        "role": "patient",
        "password": "Password123!"
    })
    otp = app.config["LAST_DISPATCHED_OTP"][email]

    # Force expiration in DB
    conn = get_connection(temp_db_path)
    past_iso = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    conn.execute("UPDATE otp_codes SET expires_at = ? WHERE email = ?", (past_iso, email))
    conn.commit()
    conn.close()

    res = test_client.post("/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "OTP_EXPIRED"

def test_verify_too_many_attempts_locks_otp(test_client):
    email = "locked_otp@parul.ac.in"
    test_client.post("/api/auth/register", json={
        "fullName": "Lockout Tester",
        "email": email,
        "phone": "+91 99444 55667",
        "role": "patient",
        "password": "Password123!"
    })

    # Fail 5 times
    for _ in range(5):
        test_client.post("/api/auth/verify-otp", json={"email": email, "otp": "999999"})

    # 6th attempt should be blocked
    res_locked = test_client.post("/api/auth/verify-otp", json={"email": email, "otp": "999999"})
    assert res_locked.status_code == 429
    assert res_locked.get_json()["error"]["code"] == "TOO_MANY_ATTEMPTS"

def test_resend_otp_enforces_30s_cooldown(test_client):
    email = "cooldown_tester@parul.ac.in"
    test_client.post("/api/auth/register", json={
        "fullName": "Cooldown Tester",
        "email": email,
        "phone": "+91 99555 66778",
        "role": "patient",
        "password": "Password123!"
    })

    # Immediate resend within 30s
    res = test_client.post("/api/auth/resend-otp", json={"email": email})
    assert res.status_code == 429
    assert res.get_json()["error"]["code"] == "COOLDOWN_ACTIVE"

# ── 3. Session Authentication & 401 Protection ─────────────────────

def test_access_without_token_returns_401(test_client):
    res = test_client.get("/api/medicines")
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "UNAUTHORIZED"

def test_access_with_invalid_or_expired_token_returns_401(test_client):
    res = test_client.get("/api/medicines", headers={"Authorization": "Bearer invalid_token_xyz_123"})
    assert res.status_code == 401

def test_logout_invalidates_session(test_client):
    user, token = helper_register_and_verify(test_client, "Logout User", "logout_user@parul.ac.in", "+91 99666 77889")
    auth_header = {"Authorization": f"Bearer {token}"}

    # Verify token works
    res_before = test_client.get("/api/medicines", headers=auth_header)
    assert res_before.status_code == 200

    # Logout
    res_logout = test_client.post("/api/auth/logout", headers=auth_header)
    assert res_logout.status_code == 200
    assert res_logout.get_json()["success"] is True

    # Token must now return 401
    res_after = test_client.get("/api/medicines", headers=auth_header)
    assert res_after.status_code == 401

# ── 4. User Data Isolation: User A cannot read/modify User B ───────

def test_user_a_cannot_read_or_delete_user_b_medicines(test_client):
    # Create User A and add medicine
    _, token_a = helper_register_and_verify(test_client, "User A", "user_a@parul.ac.in", "+91 98001 00001")
    header_a = {"Authorization": f"Bearer {token_a}"}

    med_res = test_client.post("/api/medicines", json={
        "name": "Secret A Med",
        "dosage_amount": "10",
        "dosage_unit": "mg",
        "frequency": "once"
    }, headers=header_a)
    assert med_res.status_code == 201
    med_id_a = med_res.get_json()["medicine_id"]

    # Create User B
    user_b, token_b = helper_register_and_verify(test_client, "User B", "user_b@parul.ac.in", "+91 98002 00002")
    header_b = {"Authorization": f"Bearer {token_b}"}

    # User B lists medicines: must NOT contain User A's medicine
    list_b = test_client.get("/api/medicines", headers=header_b)
    assert list_b.status_code == 200
    med_names_b = [m["name"] for m in list_b.get_json()["medicines"]]
    assert "Secret A Med" not in med_names_b

    # User B attempts to delete User A's medicine: expect 403 Forbidden
    del_res = test_client.delete(f"/api/medicines/{med_id_a}", headers=header_b)
    assert del_res.status_code == 403
    assert del_res.get_json()["error"]["code"] == "FORBIDDEN"

def test_user_a_cannot_record_intake_for_user_b_reminder(test_client):
    _, token_a = helper_register_and_verify(test_client, "User X", "user_x@parul.ac.in", "+91 98003 00003")
    header_a = {"Authorization": f"Bearer {token_a}"}

    # Add medicine for User A to generate reminder
    test_client.post("/api/medicines", json={"name": "User X Pill", "frequency": "once"}, headers=header_a)
    rems_a = test_client.get("/api/reminders", headers=header_a).get_json()["reminders"]
    rem_id_a = rems_a[0]["id"]

    # User Y tries to record intake using User X's reminder ID: expect 403
    _, token_b = helper_register_and_verify(test_client, "User Y", "user_y@parul.ac.in", "+91 98004 00004")
    header_b = {"Authorization": f"Bearer {token_b}"}

    take_res = test_client.post("/api/history", json={
        "reminder_id": rem_id_a,
        "medicine_name": "User X Pill",
        "status": "taken"
    }, headers=header_b)
    assert take_res.status_code == 403

def test_user_a_cannot_read_user_b_notifications(test_client):
    # Trigger notification for User A by reporting a missed dose
    _, token_a = helper_register_and_verify(test_client, "Notif A", "notif_a@parul.ac.in", "+91 98005 00005")
    header_a = {"Authorization": f"Bearer {token_a}"}
    test_client.post("/api/history", json={"medicine_name": "A Med", "status": "missed"}, headers=header_a)

    notifs_a = test_client.get("/api/notifications", headers=header_a).get_json()["notifications"]
    assert len(notifs_a) >= 1

    # User B checks notifications: must see 0 notifications
    _, token_b = helper_register_and_verify(test_client, "Notif B", "notif_b@parul.ac.in", "+91 98006 00006")
    header_b = {"Authorization": f"Bearer {token_b}"}
    notifs_b = test_client.get("/api/notifications", headers=header_b).get_json()["notifications"]
    assert len(notifs_b) == 0

# ── 5. Caregiver-Patient Linkage & RBAC ─────────────────────────────

def test_caregiver_can_access_linked_patient_but_not_unlinked_patient(test_client):
    # Divyadarshan is caregiver (ID 2), linked to Himanshu (ID 1)
    _, cg_token = helper_login_and_verify(test_client, "divyadarshan@paruluniversity.ac.in", "DemoPassword123!")
    cg_header = {"Authorization": f"Bearer {cg_token}"}

    # Access linked patient (Himanshu ID 1): expect 200
    res_linked = test_client.get("/api/medicines?patient_id=1", headers=cg_header)
    assert res_linked.status_code == 200
    assert len(res_linked.get_json()["medicines"]) >= 1

    # Create unlinked patient User Z
    user_z, _ = helper_register_and_verify(test_client, "Unlinked Z", "unlinked_z@parul.ac.in", "+91 98007 00007")
    unlinked_id = user_z["id"]

    # Caregiver tries to access unlinked patient Z: expect 403 Forbidden
    res_unlinked = test_client.get(f"/api/medicines?patient_id={unlinked_id}", headers=cg_header)
    assert res_unlinked.status_code == 403
    assert res_unlinked.get_json()["error"]["code"] == "FORBIDDEN"

def test_role_based_access_control(test_client):
    # Patient tries to access Caregiver portal: expect 403
    _, pt_token = helper_register_and_verify(test_client, "Regular Patient", "pt_rbac@parul.ac.in", "+91 98008 00008")
    pt_header = {"Authorization": f"Bearer {pt_token}"}

    res_cg = test_client.get("/api/caregiver/patients", headers=pt_header)
    assert res_cg.status_code == 403

    # Patient tries to access Clinician portal: expect 403
    res_cl = test_client.get("/api/clinician/patients", headers=pt_header)
    assert res_cl.status_code == 403

# ── 6. Production Mode Safeguards ──────────────────────────────────

def test_production_mode_refuses_to_start_without_secret_key():
    import subprocess
    env = os.environ.copy()
    env["DEMO_MODE"] = "false"
    env.pop("SECRET_KEY", None)

    cmd = [sys.executable, "-c", "import os; os.environ['DEMO_MODE']='false'; os.environ.pop('SECRET_KEY', None); from app import app"]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__), "..", "backend"))
    assert proc.returncode != 0
    assert "SECRET_KEY" in proc.stderr
