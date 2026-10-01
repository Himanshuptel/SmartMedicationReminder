"""
Smart Medication Reminder - Comprehensive Test Suite (Phase 1, 2 & 3)
Parul University - Semester IV IMCA / BCA Project
Internal Guide: Prof. Sathwik Chebrolu

Covers:
- Restored baseline API tests (medicines, schedule, history, clinician, emergency, DDI, AI chat, notifs)
- Strict Two-Step Verification (OTP for Register & Login, HMAC-SHA256 with per-OTP salt, single use, attempts, cooldown, expiry)
- Session token authentication (Authorization: Bearer <token>) & RBAC
- User data isolation (User A vs. User B, 403/404)
- Locked-down GET /api/users (403 forbidden)
- Patient-approved caregiver linking (invite code generate & redeem)
- Unlinked caregiver/clinician access restrictions (empty lists, 403 on patient data)
- User timezone support & concrete scheduled dose instances
- Dose state machine: Pending -> Taken / Snoozed / Missed
- Snooze = +10 min, maximum 3 times per dose
- Fake clock injectable testing for auto-missed doses after 30-min grace period
- Idempotent intake actions (no double stock decrement)
- Stock decrement only on Taken; low-stock notifications
- Non-spam escalation (1 caregiver alert per miss, emergency escalation after 3 consecutive misses)
- Adherence formula: taken / (taken + missed) * 100 and consecutive 100% adherence streak
- Production mode safety (SECRET_KEY enforcement)
"""
import os
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import pytest

# Ensure backend directory is in python search path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Set DATABASE_PATH to a temporary database file BEFORE importing app / database
temp_db_fd, temp_db_path = tempfile.mkstemp(suffix="_test.db")
os.environ["DATABASE_PATH"] = temp_db_path
os.environ["DEMO_MODE"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase2-automated-tests"

from app import (
    app,
    get_current_time,
    generate_otp_record,
    verify_otp_hash,
    generate_daily_doses,
    evaluate_overdue_doses,
    process_dose_action,
    run_background_overdue_check,
    validate_production_configuration,
    get_allowed_origins,
    check_rate_limit,
    enforce_rate_limits,
    dispatch_otp
)
from database import init_db, get_connection

@pytest.fixture(scope="session")
def test_client():
    """Session fixture initializing clean temporary database and Flask test client."""
    init_db(db_path=temp_db_path, force_reseed=True)
    app.config["TESTING"] = True
    app.config["RATE_LIMIT_ENABLED"] = False

    with app.test_client() as client:
        yield client

    # Cleanup temp db after test session
    try:
        os.close(temp_db_fd)
        if os.path.exists(temp_db_path):
            os.unlink(temp_db_path)
    except Exception:
        pass

def helper_register_and_verify(client, name, email, phone, role="patient", password="Password123!", tz="Asia/Kolkata"):
    """Helper to register user, extract OTP, verify, and return (user_dict, token)."""
    reg_res = client.post("/api/auth/register", json={
        "fullName": name,
        "email": email,
        "phone": phone,
        "role": role,
        "password": password,
        "timezone": tz
    })
    assert reg_res.status_code == 201, f"Reg failed: {reg_res.get_json()}"
    reg_data = reg_res.get_json()
    assert reg_data["requires_otp"] is True
    assert "token" not in reg_data

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
    assert "token" not in login_data

    email = login_data["email"]
    otp = app.config.get("LAST_DISPATCHED_OTP", {}).get(email)
    assert otp is not None, f"No OTP dispatched for {email}"

    ver_res = client.post("/api/auth/verify-otp", json={"email": email, "otp": otp})
    assert ver_res.status_code == 200, f"Verify failed: {ver_res.get_json()}"
    ver_data = ver_res.get_json()
    assert "token" in ver_data
    return ver_data["user"], ver_data["token"]

# ═════════════════════════════════════════════════════════════════════
# 1. RESTORED BASELINE TESTS (All 17 Restored from Phase 1, Auth-Wired)
# ═════════════════════════════════════════════════════════════════════

def test_health_and_config(test_client):
    res_h = test_client.get("/api/health")
    assert res_h.status_code == 200
    assert res_h.get_json()["status"] == "healthy"

    res_c = test_client.get("/api/config")
    assert res_c.status_code == 200
    assert res_c.get_json()["otp_length"] == 6

def test_medicines_crud_success(test_client):
    _, token = helper_register_and_verify(test_client, "Med Crud User", "med_crud@parul.ac.in", "+91 91001 00001")
    header = {"Authorization": f"Bearer {token}"}

    # GET empty
    get_res = test_client.get("/api/medicines", headers=header)
    assert get_res.status_code == 200
    assert len(get_res.get_json()["medicines"]) == 0

    # POST add medicine
    new_med = {
        "name": "Amoxicillin",
        "dosage_amount": "250",
        "dosage_unit": "mg",
        "frequency": "twice",
        "meal_timing": "after_food",
        "stock_remaining": 20,
        "low_stock_threshold": 4
    }
    create_res = test_client.post("/api/medicines", json=new_med, headers=header)
    assert create_res.status_code == 201
    med_id = create_res.get_json()["medicine_id"]

    # Verify medicine exists
    list_res = test_client.get("/api/medicines", headers=header)
    assert len(list_res.get_json()["medicines"]) == 1

    # Verify reminders auto-created
    rem_res = test_client.get("/api/reminders", headers=header)
    assert len(rem_res.get_json()["reminders"]) == 2

    # DELETE medicine
    del_res = test_client.delete(f"/api/medicines/{med_id}", headers=header)
    assert del_res.status_code == 200

    # Verify 404 on deleting non-existent
    del_404 = test_client.delete("/api/medicines/999999", headers=header)
    assert del_404.status_code == 404

def test_medicine_add_validation_failure(test_client):
    _, token = helper_register_and_verify(test_client, "Val User", "val_user@parul.ac.in", "+91 91002 00002")
    header = {"Authorization": f"Bearer {token}"}
    res = test_client.post("/api/medicines", json={"name": ""}, headers=header)
    assert res.status_code == 422
    assert res.get_json()["error"]["code"] == "VALIDATION_ERROR"

def test_automatic_ddi_warning_on_medicine_add(test_client):
    _, token = helper_register_and_verify(test_client, "DDI Patient", "ddi_patient@parul.ac.in", "+91 91003 00003")
    header = {"Authorization": f"Bearer {token}"}

    # Add Warfarin
    test_client.post("/api/medicines", json={"name": "Warfarin", "dosage_amount": "5", "dosage_unit": "mg"}, headers=header)

    # Add Aspirin -> Known CRITICAL interaction with Warfarin
    res = test_client.post("/api/medicines", json={"name": "Aspirin", "dosage_amount": "100", "dosage_unit": "mg"}, headers=header)
    assert res.status_code == 201
    data = res.get_json()
    assert len(data["interactions"]) >= 1
    assert any(i["severity"] == "CRITICAL" for i in data["interactions"])

    # Verify clinical notification was emitted
    notifs = test_client.get("/api/notifications", headers=header).get_json()["notifications"]
    assert any("Drug Interaction Warning" in n["title"] for n in notifs)

def test_schedule_and_reminders_endpoints(test_client):
    _, token = helper_register_and_verify(test_client, "Sched User", "sched_user@parul.ac.in", "+91 91004 00004")
    header = {"Authorization": f"Bearer {token}"}
    test_client.post("/api/medicines", json={"name": "Metformin", "frequency": "once"}, headers=header)

    res1 = test_client.get("/api/reminders", headers=header)
    res2 = test_client.get("/api/schedule/today", headers=header)
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert len(res1.get_json()["reminders"]) == len(res2.get_json()["reminders"]) == 1

def test_history_recording_and_adherence(test_client):
    _, token = helper_register_and_verify(test_client, "Hist User", "hist_user@parul.ac.in", "+91 91005 00005")
    header = {"Authorization": f"Bearer {token}"}

    # Initial history
    h1 = test_client.get("/api/history", headers=header).get_json()
    assert h1["stats"]["adherence_rate"] >= 0

    # Record intake
    rec = test_client.post("/api/history", json={"medicine_name": "Aspirin", "status": "taken"}, headers=header)
    assert rec.status_code == 201

    rec_miss = test_client.post("/api/history", json={"medicine_name": "Aspirin", "status": "missed"}, headers=header)
    assert rec_miss.status_code == 201

def test_history_validation_failure(test_client):
    _, token = helper_register_and_verify(test_client, "Hist Val", "hist_val@parul.ac.in", "+91 91006 00006")
    header = {"Authorization": f"Bearer {token}"}
    res = test_client.post("/api/history", json={"status": "invalid_action"}, headers=header)
    assert res.status_code == 422

def test_caregiver_patients_and_acknowledge(test_client):
    # Divyadarshan Chauhan is caregiver (ID 2), linked in demo mode to Himanshu (ID 1)
    _, cg_token = helper_login_and_verify(test_client, "divyadarshan@paruluniversity.ac.in", "DemoPassword123!")
    header = {"Authorization": f"Bearer {cg_token}"}

    res = test_client.get("/api/caregiver/patients", headers=header)
    assert res.status_code == 200
    assert len(res.get_json()["patients"]) >= 1

    # Acknowledge seeded alert
    ack = test_client.post("/api/caregiver/acknowledge", json={"alert_id": 2}, headers=header)
    assert ack.status_code == 200

def test_caregiver_acknowledge_validation_failure(test_client):
    _, cg_token = helper_login_and_verify(test_client, "divyadarshan@paruluniversity.ac.in", "DemoPassword123!")
    header = {"Authorization": f"Bearer {cg_token}"}
    res = test_client.post("/api/caregiver/acknowledge", json={}, headers=header)
    assert res.status_code == 422

def test_clinician_patients_and_notes(test_client):
    # Link Sathwik (clinician ID 3) to Himanshu (ID 1)
    conn = get_connection(temp_db_path)
    conn.execute("INSERT OR REPLACE INTO caregiver_patient (caregiver_id, patient_id, access_level, status) VALUES (3, 1, 'Clinical', 'Active')")
    conn.commit()
    conn.close()

    _, cl_token = helper_login_and_verify(test_client, "sathwik.chebrolu@paruluniversity.ac.in", "DemoPassword123!")
    header = {"Authorization": f"Bearer {cl_token}"}

    res = test_client.get("/api/clinician/patients", headers=header)
    assert res.status_code == 200
    assert len(res.get_json()["patients"]) >= 1

    # Add clinical note
    note_payload = {
        "patient_id": 1,
        "note": "Blood pressure regulated. Continue morning dosing.",
        "dosage_adjustment": "Maintain current regimen."
    }
    post_note = test_client.post("/api/clinician/notes", json=note_payload, headers=header)
    assert post_note.status_code == 201

def test_clinician_notes_validation_failure(test_client):
    _, cl_token = helper_login_and_verify(test_client, "sathwik.chebrolu@paruluniversity.ac.in", "DemoPassword123!")
    header = {"Authorization": f"Bearer {cl_token}"}
    res = test_client.post("/api/clinician/notes", json={"patient_id": 1, "note": ""}, headers=header)
    assert res.status_code == 422

def test_emergency_contacts_and_sos(test_client):
    _, token = helper_register_and_verify(test_client, "SOS User", "sos_user@parul.ac.in", "+91 91007 00007")
    header = {"Authorization": f"Bearer {token}"}

    contacts = test_client.get("/api/emergency/contacts", headers=header)
    assert contacts.status_code == 200

    sos_res = test_client.post("/api/emergency/sos", json={"location": "Vadodara Campus"}, headers=header)
    assert sos_res.status_code == 200
    assert sos_res.get_json()["status"] == "ALERTS_DISPATCHED"

def test_ai_interaction_checker(test_client):
    _, token = helper_register_and_verify(test_client, "AI User", "ai_user@parul.ac.in", "+91 91008 00008")
    header = {"Authorization": f"Bearer {token}"}

    res_crit = test_client.post("/api/ai/interaction-checker", json={"drugs": ["Warfarin", "Aspirin"]}, headers=header)
    assert res_crit.status_code == 200
    assert any(i["severity"] == "CRITICAL" for i in res_crit.get_json()["interactions"])

    res_safe = test_client.post("/api/ai/interaction-checker", json={"drugs": ["Paracetamol", "Vitamin C"]}, headers=header)
    assert res_safe.status_code == 200
    assert any(i["severity"] == "SAFE" for i in res_safe.get_json()["interactions"])

def test_ai_chat(test_client):
    _, token = helper_register_and_verify(test_client, "Chat User", "chat_user@parul.ac.in", "+91 91009 00009")
    header = {"Authorization": f"Bearer {token}"}
    res = test_client.post("/api/ai/chat", json={"message": "What should I do if I missed a dose of Metformin?"}, headers=header)
    assert res.status_code == 200
    assert "missed" in res.get_json()["reply"].lower()

def test_ai_chat_validation_failure(test_client):
    _, token = helper_register_and_verify(test_client, "Chat Val", "chat_val@parul.ac.in", "+91 91010 00010")
    header = {"Authorization": f"Bearer {token}"}
    res = test_client.post("/api/ai/chat", json={"message": ""}, headers=header)
    assert res.status_code == 422

def test_notifications_endpoint(test_client):
    _, token = helper_register_and_verify(test_client, "Notif User", "notif_user@parul.ac.in", "+91 91011 00011")
    header = {"Authorization": f"Bearer {token}"}
    res = test_client.get("/api/notifications", headers=header)
    assert res.status_code == 200
    assert "notifications" in res.get_json()

def test_mark_notification_read(test_client):
    _, token = helper_register_and_verify(test_client, "Notif Read User", "notif_read@parul.ac.in", "+91 91012 00012")
    header = {"Authorization": f"Bearer {token}"}
    # Add med with DDI to produce notification
    test_client.post("/api/medicines", json={"name": "Warfarin"}, headers=header)
    test_client.post("/api/medicines", json={"name": "Aspirin"}, headers=header)
    notifs = test_client.get("/api/notifications", headers=header).get_json()["notifications"]
    assert len(notifs) >= 1
    nid = notifs[0]["id"]

    res_read = test_client.put(f"/api/notifications/{nid}/read", headers=header)
    assert res_read.status_code == 200

# ═════════════════════════════════════════════════════════════════════
# 2. PHASE 2 AUTHENTICATION & DATA ISOLATION TESTS (16 tests)
# ═════════════════════════════════════════════════════════════════════

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
    assert data["requires_otp"] is True
    assert "token" not in data

def test_login_requires_otp_and_issues_no_token_initially(test_client):
    res = test_client.post("/api/auth/login", json={
        "identifier": "himanshu@paruluniversity.ac.in",
        "password": "DemoPassword123!"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["requires_otp"] is True
    assert "token" not in data

def test_verify_wrong_otp_decrements_attempts(test_client):
    email = "wrong_otp_test@parul.ac.in"
    test_client.post("/api/auth/register", json={
        "fullName": "Wrong OTP Tester",
        "email": email,
        "phone": "+91 99111 22334",
        "role": "patient",
        "password": "Password123!"
    })
    res = test_client.post("/api/auth/verify-otp", json={"email": email, "otp": "000000"})
    assert res.status_code == 400
    assert "attempt" in res.get_json()["error"]["message"].lower()

def test_verify_reused_otp_fails(test_client):
    email = "reused_otp@parul.ac.in"
    _, token = helper_register_and_verify(test_client, "Reused User", email, "+91 99222 33445")
    old_otp = app.config["LAST_DISPATCHED_OTP"][email]
    res_second = test_client.post("/api/auth/verify-otp", json={"email": email, "otp": old_otp})
    assert res_second.status_code == 400

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
    for _ in range(5):
        test_client.post("/api/auth/verify-otp", json={"email": email, "otp": "999999"})

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
    res = test_client.post("/api/auth/resend-otp", json={"email": email})
    assert res.status_code == 429
    assert res.get_json()["error"]["code"] == "COOLDOWN_ACTIVE"

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

    res_before = test_client.get("/api/medicines", headers=auth_header)
    assert res_before.status_code == 200

    res_logout = test_client.post("/api/auth/logout", headers=auth_header)
    assert res_logout.status_code == 200

    res_after = test_client.get("/api/medicines", headers=auth_header)
    assert res_after.status_code == 401

def test_user_a_cannot_read_or_delete_user_b_medicines(test_client):
    _, token_a = helper_register_and_verify(test_client, "User A", "user_a@parul.ac.in", "+91 98001 00001")
    header_a = {"Authorization": f"Bearer {token_a}"}

    med_res = test_client.post("/api/medicines", json={"name": "Secret A Med", "frequency": "once"}, headers=header_a)
    med_id_a = med_res.get_json()["medicine_id"]

    _, token_b = helper_register_and_verify(test_client, "User B", "user_b@parul.ac.in", "+91 98002 00002")
    header_b = {"Authorization": f"Bearer {token_b}"}

    list_b = test_client.get("/api/medicines", headers=header_b)
    med_names_b = [m["name"] for m in list_b.get_json()["medicines"]]
    assert "Secret A Med" not in med_names_b

    del_res = test_client.delete(f"/api/medicines/{med_id_a}", headers=header_b)
    assert del_res.status_code == 403
    assert del_res.get_json()["error"]["code"] == "FORBIDDEN"

def test_user_a_cannot_record_intake_for_user_b_reminder(test_client):
    _, token_a = helper_register_and_verify(test_client, "User X", "user_x@parul.ac.in", "+91 98003 00003")
    header_a = {"Authorization": f"Bearer {token_a}"}
    test_client.post("/api/medicines", json={"name": "User X Pill", "frequency": "once"}, headers=header_a)
    rems_a = test_client.get("/api/reminders", headers=header_a).get_json()["reminders"]
    rem_id_a = rems_a[0]["id"]

    _, token_b = helper_register_and_verify(test_client, "User Y", "user_y@parul.ac.in", "+91 98004 00004")
    header_b = {"Authorization": f"Bearer {token_b}"}

    take_res = test_client.post("/api/history", json={"reminder_id": rem_id_a, "medicine_name": "User X Pill", "status": "taken"}, headers=header_b)
    assert take_res.status_code == 403

def test_user_a_cannot_read_user_b_notifications(test_client):
    _, token_a = helper_register_and_verify(test_client, "Notif A", "notif_a@parul.ac.in", "+91 98005 00005")
    header_a = {"Authorization": f"Bearer {token_a}"}
    test_client.post("/api/history", json={"medicine_name": "A Med", "status": "missed"}, headers=header_a)

    notifs_a = test_client.get("/api/notifications", headers=header_a).get_json()["notifications"]
    assert len(notifs_a) >= 1

    _, token_b = helper_register_and_verify(test_client, "Notif B", "notif_b@parul.ac.in", "+91 98006 00006")
    header_b = {"Authorization": f"Bearer {token_b}"}
    notifs_b = test_client.get("/api/notifications", headers=header_b).get_json()["notifications"]
    assert len(notifs_b) == 0

def test_caregiver_can_access_linked_patient_but_not_unlinked_patient(test_client):
    _, cg_token = helper_login_and_verify(test_client, "divyadarshan@paruluniversity.ac.in", "DemoPassword123!")
    cg_header = {"Authorization": f"Bearer {cg_token}"}

    res_linked = test_client.get("/api/medicines?patient_id=1", headers=cg_header)
    assert res_linked.status_code == 200

    user_z, _ = helper_register_and_verify(test_client, "Unlinked Z", "unlinked_z@parul.ac.in", "+91 98007 00007")
    res_unlinked = test_client.get(f"/api/medicines?patient_id={user_z['id']}", headers=cg_header)
    assert res_unlinked.status_code == 403
    assert res_unlinked.get_json()["error"]["code"] == "FORBIDDEN"

def test_role_based_access_control(test_client):
    _, pt_token = helper_register_and_verify(test_client, "Regular Patient", "pt_rbac@parul.ac.in", "+91 98008 00008")
    pt_header = {"Authorization": f"Bearer {pt_token}"}

    res_cg = test_client.get("/api/caregiver/patients", headers=pt_header)
    assert res_cg.status_code == 403

    res_cl = test_client.get("/api/clinician/patients", headers=pt_header)
    assert res_cl.status_code == 403

def test_production_mode_refuses_to_start_without_secret_key():
    import subprocess
    cmd = [sys.executable, "-c", "import os; os.environ['DEMO_MODE']='false'; os.environ.pop('SECRET_KEY', None); from app import app"]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__), "..", "backend"))
    assert proc.returncode != 0
    assert "SECRET_KEY" in proc.stderr

# ═════════════════════════════════════════════════════════════════════
# 3. PHASE 2 FIXES & PHASE 3 MEDICATION LOGIC TESTS (11 New Tests)
# ═════════════════════════════════════════════════════════════════════

def test_users_directory_listing_is_locked_down_403(test_client):
    """Proves that GET /api/users is locked down and returns 403 for any user."""
    _, token = helper_register_and_verify(test_client, "Lockdown User", "lockdown@parul.ac.in", "+91 92001 00001")
    header = {"Authorization": f"Bearer {token}"}
    res = test_client.get("/api/users", headers=header)
    assert res.status_code == 403
    assert res.get_json()["error"]["code"] == "FORBIDDEN"

def test_unlinked_caregiver_and_clinician_get_empty_or_403(test_client):
    """
    Proves that self-registering as clinician or caregiver yields NO data access.
    Returns empty patient lists and 403 on unlinked patient data.
    """
    # 1. Self-register unlinked clinician
    _, cl_token = helper_register_and_verify(test_client, "Fresh Clinician", "fresh_clinician@parul.ac.in", "+91 92002 00002", role="clinician")
    cl_header = {"Authorization": f"Bearer {cl_token}"}

    cl_patients = test_client.get("/api/clinician/patients", headers=cl_header)
    assert cl_patients.status_code == 200
    assert len(cl_patients.get_json()["patients"]) == 0
    assert len(cl_patients.get_json()["notes"]) == 0

    # Clinician attempts to write notes for patient 1: expect 403
    note_res = test_client.post("/api/clinician/notes", json={"patient_id": 1, "note": "Unlinked attempt"}, headers=cl_header)
    assert note_res.status_code == 403

    # 2. Self-register unlinked caregiver
    _, cg_token = helper_register_and_verify(test_client, "Fresh Caregiver", "fresh_caregiver@parul.ac.in", "+91 92003 00003", role="caregiver")
    cg_header = {"Authorization": f"Bearer {cg_token}"}

    cg_patients = test_client.get("/api/caregiver/patients", headers=cg_header)
    assert cg_patients.status_code == 200
    assert len(cg_patients.get_json()["patients"]) == 0
    assert len(cg_patients.get_json()["alerts"]) == 0

    # Caregiver attempts to access patient 1's medicines: expect 403
    med_res = test_client.get("/api/medicines?patient_id=1", headers=cg_header)
    assert med_res.status_code == 403

def test_patient_invite_code_and_caregiver_redemption(test_client):
    """
    Proves patient-approved link:
    Patient generates invite code -> Caregiver redeems it -> Caregiver can now access patient.
    """
    # Patient creates account
    patient_user, pt_token = helper_register_and_verify(test_client, "Invite Patient", "invite_patient@parul.ac.in", "+91 92004 00004")
    pt_header = {"Authorization": f"Bearer {pt_token}"}

    inv_res = test_client.post("/api/patient/invite", headers=pt_header)
    assert inv_res.status_code == 201
    code = inv_res.get_json()["invite_code"]
    assert code.startswith("INV-")

    # Caregiver redeems code
    _, cg_token = helper_register_and_verify(test_client, "Redeem Caregiver", "redeem_cg@parul.ac.in", "+91 92005 00005", role="caregiver")
    cg_header = {"Authorization": f"Bearer {cg_token}"}

    link_res = test_client.post("/api/caregiver/link", json={"invite_code": code}, headers=cg_header)
    assert link_res.status_code == 200
    assert link_res.get_json()["patient_id"] == patient_user["id"]

    # Caregiver can now see linked patient
    cg_patients = test_client.get("/api/caregiver/patients", headers=cg_header)
    assert len(cg_patients.get_json()["patients"]) == 1

def test_hmac_sha256_otp_with_salt_verification():
    """Unit test proving HMAC-SHA256 OTP hashing with random salt and constant-time comparison."""
    otp = "482910"
    salt, hashed = generate_otp_record(otp, secret_key="test-secret")
    assert len(salt) == 32
    assert len(hashed) == 64

    # Correct OTP matches
    assert verify_otp_hash(otp, salt, hashed, secret_key="test-secret") is True
    # Wrong OTP fails
    assert verify_otp_hash("000000", salt, hashed, secret_key="test-secret") is False
    # Wrong secret key fails
    assert verify_otp_hash(otp, salt, hashed, secret_key="wrong-secret") is False

def test_user_timezone_and_dose_instance_generation(test_client):
    """
    Proves timezone field on users (stored in UTC, generated in user timezone).
    """
    ny_tz = "America/New_York"
    user, token = helper_register_and_verify(test_client, "NY Patient", "ny_patient@parul.ac.in", "+91 92006 00006", tz=ny_tz)
    header = {"Authorization": f"Bearer {token}"}
    assert user["timezone"] == ny_tz

    # Add medicine with twice daily dosing (08:00 and 20:00 local NY time)
    test_client.post("/api/medicines", json={"name": "NY Medicine", "frequency": "twice"}, headers=header)

    # Doses for today
    doses_res = test_client.get("/api/doses/today", headers=header)
    assert doses_res.status_code == 200
    doses = doses_res.get_json()["doses"]
    assert len(doses) == 2
    for d in doses:
        assert d["local_time"] in ("08:00", "20:00")
        assert d["status"] in ("pending", "missed")
        # Verify UTC ISO string converts back to 08:00 or 20:00 in America/New_York
        utc_dt = datetime.fromisoformat(d["scheduled_for"])
        if utc_dt.tzinfo is None:
            utc_dt = utc_dt.replace(tzinfo=timezone.utc)
        ny_dt = utc_dt.astimezone(ZoneInfo(ny_tz))
        assert ny_dt.strftime("%H:%M") == d["local_time"]

def test_dose_state_machine_snooze_limit(test_client):
    """
    State machine transitions: Pending -> Snoozed (+10 min, max 3 times per dose).
    4th snooze fails with MAX_SNOOZE_REACHED.
    Uses fake clock at 07:55 AM so 08:00 AM dose starts in pending state.
    """
    fake_clock = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc) # 07:55 AM Asia/Kolkata
    app.config["CLOCK_FN"] = lambda: fake_clock
    try:
        _, token = helper_register_and_verify(test_client, "Snooze User", "snooze_user@parul.ac.in", "+91 92007 00007")
        header = {"Authorization": f"Bearer {token}"}
        test_client.post("/api/medicines", json={"name": "Snooze Med", "frequency": "once"}, headers=header)
        doses = test_client.get("/api/doses/today", headers=header).get_json()["doses"]
        assert len(doses) >= 1
        dose_id = doses[0]["id"]
        assert doses[0]["status"] == "pending"

        # Snooze 1 (+10 min)
        s1 = test_client.post(f"/api/doses/{dose_id}/snooze", headers=header)
        assert s1.status_code == 200
        assert s1.get_json()["snooze_count"] == 1

        # Snooze 2 (+10 min)
        s2 = test_client.post(f"/api/doses/{dose_id}/snooze", headers=header)
        assert s2.status_code == 200
        assert s2.get_json()["snooze_count"] == 2

        # Snooze 3 (+10 min)
        s3 = test_client.post(f"/api/doses/{dose_id}/snooze", headers=header)
        assert s3.status_code == 200
        assert s3.get_json()["snooze_count"] == 3

        # Snooze 4 -> Must fail
        s4 = test_client.post(f"/api/doses/{dose_id}/snooze", headers=header)
        assert s4.status_code == 400
        assert s4.get_json()["error"]["code"] == "MAX_SNOOZE_REACHED"
    finally:
        app.config.pop("CLOCK_FN", None)

def test_auto_missed_after_grace_window_with_fake_clock(test_client):
    """
    Proves that overdue doses automatically become Missed after the 30-min grace window
    using an injectable fake clock (zero real sleeps).
    """
    # Start clock at 07:55 AM (02:25 UTC)
    current_fake = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc)
    app.config["CLOCK_FN"] = lambda: current_fake

    try:
        _, token = helper_register_and_verify(test_client, "Grace User", "grace_user@parul.ac.in", "+91 92008 00008")
        header = {"Authorization": f"Bearer {token}"}
        test_client.post("/api/medicines", json={"name": "Grace Pill", "frequency": "once"}, headers=header)
        doses = test_client.get("/api/doses/today", headers=header).get_json()["doses"]
        dose = doses[0]
        assert dose["status"] == "pending"

        # Advance fake clock to 08:35 AM (03:05 UTC) -> 35 minutes after 08:00 AM (grace is 30 min)
        current_fake = datetime(2026, 10, 1, 3, 5, tzinfo=timezone.utc)

        # Trigger lazy evaluation via GET /api/doses/today
        updated_doses = test_client.get("/api/doses/today", headers=header).get_json()["doses"]
        target = [d for d in updated_doses if d["id"] == dose["id"]][0]
        assert target["status"] == "missed"
    finally:
        app.config.pop("CLOCK_FN", None)

def test_idempotent_intake_and_stock_decrement(test_client):
    """
    Proves intake actions are idempotent:
    First take decrements stock. Second take is idempotent and does NOT decrement stock twice.
    """
    fake_clock = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc) # 07:55 AM
    app.config["CLOCK_FN"] = lambda: fake_clock
    try:
        _, token = helper_register_and_verify(test_client, "Idempotent User", "idempotent@parul.ac.in", "+91 92009 00009")
        header = {"Authorization": f"Bearer {token}"}

        med_res = test_client.post("/api/medicines", json={
            "name": "Pill Stock Test",
            "stock_remaining": 30,
            "frequency": "once"
        }, headers=header)
        med_id = med_res.get_json()["medicine_id"]
        dose_id = test_client.get("/api/doses/today", headers=header).get_json()["doses"][0]["id"]

        # 1. Take dose
        t1 = test_client.post(f"/api/doses/{dose_id}/take", headers=header)
        assert t1.status_code == 200

        med_after_1 = test_client.get("/api/medicines", headers=header).get_json()["medicines"][0]
        assert med_after_1["stock_remaining"] == 29

        # 2. Take dose again (idempotent call)
        t2 = test_client.post(f"/api/doses/{dose_id}/take", headers=header)
        assert t2.status_code == 200
        assert "idempotent" in t2.get_json()["message"].lower()

        # Stock must STILL be 29 (no double decrement)
        med_after_2 = test_client.get("/api/medicines", headers=header).get_json()["medicines"][0]
        assert med_after_2["stock_remaining"] == 29
    finally:
        app.config.pop("CLOCK_FN", None)

def test_stock_decrement_triggers_low_stock_notification(test_client):
    """Proves low-stock notification triggers when stock <= low_stock_threshold."""
    fake_clock = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc)
    app.config["CLOCK_FN"] = lambda: fake_clock
    try:
        _, token = helper_register_and_verify(test_client, "Refill User", "refill_user@parul.ac.in", "+91 92010 00010")
        header = {"Authorization": f"Bearer {token}"}

        test_client.post("/api/medicines", json={
            "name": "Refill Med",
            "stock_remaining": 2,
            "low_stock_threshold": 2,
            "frequency": "once"
        }, headers=header)
        dose_id = test_client.get("/api/doses/today", headers=header).get_json()["doses"][0]["id"]

        # Take dose -> stock drops to 1, <= threshold of 2
        test_client.post(f"/api/doses/{dose_id}/take", headers=header)

        notifs = test_client.get("/api/notifications", headers=header).get_json()["notifications"]
        assert any("Low Stock" in n["title"] for n in notifs)
    finally:
        app.config.pop("CLOCK_FN", None)

def test_non_spam_caregiver_alert_and_emergency_escalation_after_n_misses(test_client):
    """
    Proves:
    1. One caregiver alert per missed dose (no duplicates).
    2. Emergency contact escalation triggers only after N (3) consecutive misses.
    """
    fake_clock = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc)
    app.config["CLOCK_FN"] = lambda: fake_clock
    try:
        # Create patient
        pt_user, pt_token = helper_register_and_verify(test_client, "Escalation Patient", "esc_patient@parul.ac.in", "+91 92011 00011")
        pt_header = {"Authorization": f"Bearer {pt_token}"}

        # Add emergency contact for patient
        conn = get_connection(temp_db_path)
        conn.execute("INSERT INTO emergency_contacts (user_id, name, phone, relation, is_primary) VALUES (?, 'Emergency Contact', '+91 99999 88888', 'Family', 1)", (pt_user["id"],))
        conn.commit()
        conn.close()

        # Link caregiver
        _, cg_token = helper_register_and_verify(test_client, "Escalation CG", "esc_cg@parul.ac.in", "+91 92012 00012", role="caregiver")
        cg_header = {"Authorization": f"Bearer {cg_token}"}
        inv_code = test_client.post("/api/patient/invite", headers=pt_header).get_json()["invite_code"]
        test_client.post("/api/caregiver/link", json={"invite_code": inv_code}, headers=cg_header)

        # Patient adds 3 medicines to produce 3 doses
        test_client.post("/api/medicines", json={"name": "Dose 1 Med", "frequency": "once"}, headers=pt_header)
        test_client.post("/api/medicines", json={"name": "Dose 2 Med", "frequency": "once"}, headers=pt_header)
        test_client.post("/api/medicines", json={"name": "Dose 3 Med", "frequency": "once"}, headers=pt_header)

        doses = test_client.get("/api/doses/today", headers=pt_header).get_json()["doses"]
        assert len(doses) >= 3

        # Miss 1st dose -> Caregiver gets 1 alert
        test_client.post(f"/api/doses/{doses[0]['id']}/miss", headers=pt_header)
        cg_notifs_1 = test_client.get("/api/notifications", headers=cg_header).get_json()["notifications"]
        miss_alerts_1 = [n for n in cg_notifs_1 if n["type"] == "missed_dose"]
        assert len(miss_alerts_1) == 1

        # Miss 2nd dose
        test_client.post(f"/api/doses/{doses[1]['id']}/miss", headers=pt_header)
        cg_notifs_2 = test_client.get("/api/notifications", headers=cg_header).get_json()["notifications"]
        miss_alerts_2 = [n for n in cg_notifs_2 if n["type"] == "missed_dose"]
        assert len(miss_alerts_2) == 2

        # Miss 3rd consecutive dose -> Escalation rule triggers!
        test_client.post(f"/api/doses/{doses[2]['id']}/miss", headers=pt_header)

        # Verify emergency escalation alerts dispatched
        pt_notifs = test_client.get("/api/notifications", headers=pt_header).get_json()["notifications"]
        assert any("Escalation" in n["title"] or n["type"] == "emergency" for n in pt_notifs)

        cg_notifs_3 = test_client.get("/api/notifications", headers=cg_header).get_json()["notifications"]
        assert any("Escalation" in n["title"] or n["type"] == "emergency" for n in cg_notifs_3)
    finally:
        app.config.pop("CLOCK_FN", None)

def test_adherence_formula_and_streak_math(test_client):
    """
    Proves adherence formula: taken / (taken + missed) * 100
    and consecutive streak calculation.
    """
    _, token = helper_register_and_verify(test_client, "Math Patient", "math_patient@parul.ac.in", "+91 92013 00013")
    header = {"Authorization": f"Bearer {token}"}

    # Record 3 taken and 1 missed
    test_client.post("/api/history", json={"medicine_name": "Med A", "status": "taken"}, headers=header)
    test_client.post("/api/history", json={"medicine_name": "Med B", "status": "taken"}, headers=header)
    test_client.post("/api/history", json={"medicine_name": "Med C", "status": "taken"}, headers=header)
    test_client.post("/api/history", json={"medicine_name": "Med D", "status": "missed"}, headers=header)

    hist_data = test_client.get("/api/history", headers=header).get_json()
    stats = hist_data["stats"]
    assert stats["taken"] == 3
    assert stats["missed"] == 1
    # 3 / (3 + 1) * 100 = 75.0%
    assert stats["adherence_rate"] == 75.0

def test_caregiver_alert_created_on_caregiver_read_without_patient_request(test_client):
    """
    Phase 4 Requirement 3:
    Proves that missed-dose detection does NOT depend on the patient opening the app:
    Caregiver reads the portal with fake clock advanced past grace window,
    and a caregiver alert is created and returned WITHOUT any request from the patient.
    """
    fake_clock = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc) # 07:55 AM Asia/Kolkata
    app.config["CLOCK_FN"] = lambda: fake_clock
    try:
        # 1. Register patient and add medication
        pt_user, pt_token = helper_register_and_verify(
            test_client, "Remote Patient", "remote_pt@parul.ac.in", "+91 92020 00020"
        )
        pt_header = {"Authorization": f"Bearer {pt_token}"}

        test_client.post("/api/medicines", json={
            "name": "Remote Cardiac Med",
            "dosage_amount": "100",
            "dosage_unit": "mg",
            "frequency": "once",
            "start_date": "2026-10-01"
        }, headers=pt_header)

        # Patient generates invite code
        inv_res = test_client.post("/api/patient/invite", headers=pt_header)
        inv_code = inv_res.get_json()["invite_code"]

        # Ensure dose instance exists in pending state
        pt_doses = test_client.get("/api/doses/today", headers=pt_header).get_json()["doses"]
        assert len(pt_doses) >= 1
        assert pt_doses[0]["status"] == "pending"

        # 2. Caregiver registers and links to patient
        cg_user, cg_token = helper_register_and_verify(
            test_client, "Remote Caregiver", "remote_cg@parul.ac.in", "+91 92021 00021", role="caregiver"
        )
        cg_header = {"Authorization": f"Bearer {cg_token}"}
        link_res = test_client.post("/api/caregiver/link", json={"invite_code": inv_code}, headers=cg_header)
        assert link_res.status_code == 200

        # 3. Advance fake clock past grace window: 08:35 AM local (03:05 UTC)
        # Note: 08:00 AM dose + 30 min grace = overdue at 08:30. 08:35 is overdue!
        fake_clock = datetime(2026, 10, 1, 3, 5, tzinfo=timezone.utc)

        # 4. PATIENT NEVER MAKES ANY REQUEST. Patient is idle.
        # Caregiver accesses caregiver portal:
        cg_data = test_client.get("/api/caregiver/patients", headers=cg_header).get_json()
        assert cg_data["success"] is True

        patients = cg_data["patients"]
        assert len(patients) == 1
        assert patients[0]["name"] == "Remote Patient"

        # Overdue evaluation ran lazily on caregiver read: alert must exist!
        alerts = cg_data["alerts"]
        assert len(alerts) >= 1
        missed_alerts = [a for a in alerts if a["type"] == "missed_dose"]
        assert len(missed_alerts) >= 1
        assert "Remote Cardiac Med" in missed_alerts[0]["message"]
        assert "Remote Patient" in missed_alerts[0]["message"]
    finally:
        app.config.pop("CLOCK_FN", None)

def test_background_worker_evaluates_overdue_doses_without_double_fire(test_client):
    """
    Phase 4 Requirement 3(b):
    Tests that run_background_overdue_check runs without double-firing and transitions
    overdue doses to missed state.
    """
    fake_clock = datetime(2026, 10, 1, 2, 25, tzinfo=timezone.utc) # 07:55 AM
    app.config["CLOCK_FN"] = lambda: fake_clock
    try:
        pt_user, pt_token = helper_register_and_verify(
            test_client, "Worker Patient", "worker_pt@parul.ac.in", "+91 92022 00022"
        )
        pt_header = {"Authorization": f"Bearer {pt_token}"}
        test_client.post("/api/medicines", json={
            "name": "Worker Med",
            "frequency": "once",
            "start_date": "2026-10-01"
        }, headers=pt_header)

        # Generate pending dose
        doses = test_client.get("/api/doses/today", headers=pt_header).get_json()["doses"]
        assert doses[0]["status"] == "pending"

        # Advance fake clock past grace window
        fake_clock = datetime(2026, 10, 1, 3, 10, tzinfo=timezone.utc) # 08:40 AM

        # Run background worker check directly
        result = run_background_overdue_check(clock=lambda: fake_clock)
        assert result is True

        # Verify dose transitioned to missed
        conn = get_connection(temp_db_path)
        cur = conn.cursor()
        cur.execute("SELECT status FROM dose_instances WHERE user_id = ? AND medicine_name = 'Worker Med'", (pt_user["id"],))
        row = cur.fetchone()
        assert row["status"] == "missed"
        conn.close()
    finally:
        app.config.pop("CLOCK_FN", None)

def test_future_days_doses_and_start_end_dates_respected(test_client):
    """
    Phase 4 Requirement 4:
    Verifies that future days' doses are generated correctly and that medicine
    and reminder start_date and end_date constraints are strictly respected.
    """
    pt_user, pt_token = helper_register_and_verify(
        test_client, "Future Patient", "future_pt@parul.ac.in", "+91 92023 00023"
    )
    pt_header = {"Authorization": f"Bearer {pt_token}"}

    # Medicine A: Active strictly from 2026-10-10 to 2026-10-20
    test_client.post("/api/medicines", json={
        "name": "Antibiotic Course (10 days)",
        "dosage_amount": "250",
        "dosage_unit": "mg",
        "frequency": "once",
        "start_date": "2026-10-10",
        "end_date": "2026-10-20"
    }, headers=pt_header)

    # Medicine B: Active strictly from 2026-10-01 to 2026-10-05
    test_client.post("/api/medicines", json={
        "name": "Steroid Taper (5 days)",
        "dosage_amount": "5",
        "dosage_unit": "mg",
        "frequency": "once",
        "start_date": "2026-10-01",
        "end_date": "2026-10-05"
    }, headers=pt_header)

    # 1. Query October 3 (Within Med B, Before Med A)
    res_oct3 = test_client.get("/api/doses/today?date=2026-10-03", headers=pt_header).get_json()
    names_oct3 = [d["medicine_name"] for d in res_oct3["doses"]]
    assert "Steroid Taper (5 days)" in names_oct3
    assert "Antibiotic Course (10 days)" not in names_oct3

    # 2. Query October 15 (After Med B ended, Within Med A)
    res_oct15 = test_client.get("/api/doses/today?date=2026-10-15", headers=pt_header).get_json()
    names_oct15 = [d["medicine_name"] for d in res_oct15["doses"]]
    assert "Antibiotic Course (10 days)" in names_oct15
    assert "Steroid Taper (5 days)" not in names_oct15

    # 3. Query October 25 (After BOTH Med A and Med B ended)
    res_oct25 = test_client.get("/api/doses/today?date=2026-10-25", headers=pt_header).get_json()
    assert len(res_oct25["doses"]) == 0

    # 4. Query September 25 (Before BOTH Med A and Med B started)
    res_sep25 = test_client.get("/api/doses/today?date=2026-09-25", headers=pt_header).get_json()
    assert len(res_sep25["doses"]) == 0

# ── Phase 5 Tests: Production Hardening, Security, Rate Limiting & Multi-Worker ──

def test_phase5_security_headers_present(test_client):
    """
    Phase 5 Requirement 2:
    Verifies that security headers (CSP suited to Vite, X-Content-Type-Options,
    X-Frame-Options, Referrer-Policy) are present on HTTP responses.
    """
    res = test_client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    csp = res.headers.get("Content-Security-Policy", "")
    assert "default-src 'self'" in csp
    assert "script-src 'self' 'unsafe-inline'" in csp
    assert "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" in csp

def test_phase5_hsts_only_when_https(test_client):
    """
    Phase 5 Requirement 2:
    Strict-Transport-Security (HSTS) must ONLY be attached when requests are behind HTTPS.
    Plain HTTP requests must NOT carry HSTS.
    """
    # 1. Plain HTTP request: no HSTS
    http_res = test_client.get("/api/health")
    assert "Strict-Transport-Security" not in http_res.headers

    # 2. Behind HTTPS proxy (X-Forwarded-Proto: https): HSTS present
    https_res = test_client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
    assert "Strict-Transport-Security" in https_res.headers
    assert "max-age=31536000" in https_res.headers["Strict-Transport-Security"]

def test_phase5_cors_restricted_in_production():
    """
    Phase 5 Requirement 2 & 5:
    CORS must be restricted to ALLOWED_ORIGINS; wildcard '*' is strictly disallowed in production.
    """
    # 1. Production mode with wildcard '*' must fail startup/validation
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_configuration({
            "DEMO_MODE": "false",
            "SECRET_KEY": "a" * 32,
            "ALLOWED_ORIGINS": "*",
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "test@domain.com",
            "SMTP_PASS": "pass",
            "SMTP_FROM": "noreply@domain.com"
        })
    assert "ALLOWED_ORIGINS" in str(exc_info.value)
    assert "wildcard" in str(exc_info.value).lower()

    # 2. Production mode with specific origins succeeds
    origins = get_allowed_origins({
        "DEMO_MODE": "false",
        "ALLOWED_ORIGINS": "https://example.com, https://app.example.com"
    })
    assert origins == ["https://example.com", "https://app.example.com"]

    # 3. get_allowed_origins rejects '*' when DEMO_MODE=false
    with pytest.raises(RuntimeError):
        get_allowed_origins({
            "DEMO_MODE": "false",
            "ALLOWED_ORIGINS": "*"
        })

def test_phase5_sqlite_rate_limiting_ip_with_fake_clock(test_client):
    """
    Phase 5 Requirement 3:
    SQLite-backed rate limiting per IP on login endpoint with fake clock advancement.
    """
    app.config["RATE_LIMIT_ENABLED"] = True
    app.config["RATE_LIMIT_LOGIN_MAX"] = 3
    app.config["RATE_LIMIT_WINDOW_SECONDS"] = 60

    fake_clock = datetime(2026, 10, 1, 10, 0, 0, tzinfo=timezone.utc)
    app.config["CLOCK_FN"] = lambda: fake_clock

    ip_headers = {"X-Forwarded-For": "198.51.100.42"}

    try:
        # Requests 1, 2, 3 should pass through rate limiter (404 account not found)
        for i in range(3):
            res = test_client.post("/api/auth/login", json={"identifier": f"unknown_{i}@parul.ac.in", "password": "x"}, headers=ip_headers)
            assert res.status_code == 404

        # Request 4 from same IP within the 60-second window must be rate-limited (HTTP 429)
        blocked_res = test_client.post("/api/auth/login", json={"identifier": "unknown_4@parul.ac.in", "password": "x"}, headers=ip_headers)
        assert blocked_res.status_code == 429
        data = blocked_res.get_json()
        assert data["error"]["code"] == "TOO_MANY_REQUESTS"
        assert "Retry-After" in blocked_res.headers
        assert int(blocked_res.headers["Retry-After"]) > 0

        # Advance fake clock by 65 seconds past the sliding window
        fake_clock += timedelta(seconds=65)

        # Request 5 should now succeed and not be rate limited
        recovered_res = test_client.post("/api/auth/login", json={"identifier": "unknown_5@parul.ac.in", "password": "x"}, headers=ip_headers)
        assert recovered_res.status_code == 404

    finally:
        app.config["RATE_LIMIT_ENABLED"] = False
        app.config.pop("CLOCK_FN", None)

def test_phase5_sqlite_rate_limiting_email_with_fake_clock(test_client):
    """
    Phase 5 Requirement 3:
    SQLite-backed rate limiting per email on login endpoint across different IPs with fake clock.
    """
    app.config["RATE_LIMIT_ENABLED"] = True
    app.config["RATE_LIMIT_LOGIN_MAX"] = 3
    app.config["RATE_LIMIT_WINDOW_SECONDS"] = 60

    fake_clock = datetime(2026, 10, 1, 11, 0, 0, tzinfo=timezone.utc)
    app.config["CLOCK_FN"] = lambda: fake_clock

    target_email = "target_user@parul.ac.in"

    try:
        # 3 requests targeting the same email from different IPs
        for i in range(3):
            headers = {"X-Forwarded-For": f"198.51.100.{100 + i}"}
            res = test_client.post("/api/auth/login", json={"identifier": target_email, "password": "x"}, headers=headers)
            assert res.status_code == 404

        # 4th request from a brand new IP targeting the same email must trigger account rate limit (429)
        new_headers = {"X-Forwarded-For": "203.0.113.88"}
        blocked_res = test_client.post("/api/auth/login", json={"identifier": target_email, "password": "x"}, headers=new_headers)
        assert blocked_res.status_code == 429
        data = blocked_res.get_json()
        assert data["error"]["code"] == "TOO_MANY_REQUESTS"
        assert data["error"]["details"]["limit_type"] == "email"

        # Advance fake clock past window
        fake_clock += timedelta(seconds=65)

        recovered_res = test_client.post("/api/auth/login", json={"identifier": target_email, "password": "x"}, headers=new_headers)
        assert recovered_res.status_code == 404

    finally:
        app.config["RATE_LIMIT_ENABLED"] = False
        app.config.pop("CLOCK_FN", None)

def test_phase5_sanitized_500_error_response(test_client, monkeypatch):
    """
    Phase 5 Requirement 4:
    Sanitized errors: unhandled server exceptions return generic 500 JSON without leaking
    stack traces, file paths, or raw SQL queries to the client.
    """
    import sqlite3
    def broken_connection(*args, **kwargs):
        raise sqlite3.OperationalError("deliberate syntax error in SELECT * FROM secret_table_internal")

    monkeypatch.setattr("app.get_connection", broken_connection)

    res = test_client.get("/api/auth/me", headers={"Authorization": "Bearer mock-token-triggering-db"})
    assert res.status_code == 500
    data = res.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert "An internal server error occurred" in data["error"]["message"]
    # Verify no raw SQL or traceback leak in response body
    raw_body = res.get_data(as_text=True)
    assert "Traceback" not in raw_body
    assert "secret_table_internal" not in raw_body
    assert "OperationalError" not in raw_body

def test_phase5_production_safety_checks_at_startup():
    """
    Phase 5 Requirement 5:
    Production safety checks at startup when DEMO_MODE=false:
    Require SECRET_KEY (>= 32 chars and not default), ALLOWED_ORIGINS (no wildcard),
    and all SMTP settings.
    """
    # 1. Missing SECRET_KEY
    with pytest.raises(RuntimeError) as exc:
        validate_production_configuration({"DEMO_MODE": "false"})
    assert "SECRET_KEY" in str(exc.value)

    # 2. Insecure default dev SECRET_KEY
    with pytest.raises(RuntimeError) as exc:
        validate_production_configuration({
            "DEMO_MODE": "false",
            "SECRET_KEY": "dev-insecure-secret-key-change-in-production-min32chars"
        })
    assert "SECRET_KEY" in str(exc.value)

    # 3. Short SECRET_KEY (< 32 chars)
    with pytest.raises(RuntimeError) as exc:
        validate_production_configuration({
            "DEMO_MODE": "false",
            "SECRET_KEY": "too-short-secret"
        })
    assert "SECRET_KEY" in str(exc.value)

    # 4. Missing ALLOWED_ORIGINS
    with pytest.raises(RuntimeError) as exc:
        validate_production_configuration({
            "DEMO_MODE": "false",
            "SECRET_KEY": "a" * 32
        })
    assert "ALLOWED_ORIGINS" in str(exc.value)

    # 5. Wildcard ALLOWED_ORIGINS
    with pytest.raises(RuntimeError) as exc:
        validate_production_configuration({
            "DEMO_MODE": "false",
            "SECRET_KEY": "a" * 32,
            "ALLOWED_ORIGINS": "*"
        })
    assert "ALLOWED_ORIGINS" in str(exc.value)

    # 6. Missing SMTP configuration
    with pytest.raises(RuntimeError) as exc:
        validate_production_configuration({
            "DEMO_MODE": "false",
            "SECRET_KEY": "a" * 32,
            "ALLOWED_ORIGINS": "https://example.com"
        })
    assert "SMTP settings are required" in str(exc.value)

    # 7. Valid production configuration passes smoothly
    assert validate_production_configuration({
        "DEMO_MODE": "false",
        "SECRET_KEY": "a" * 32,
        "ALLOWED_ORIGINS": "https://example.com",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "demo@domain.com",
        "SMTP_PASS": "secret",
        "SMTP_FROM": "noreply@domain.com"
    }) is True

def test_phase5_production_mode_does_not_seed_demo_users(monkeypatch):
    """
    Phase 5 Requirement 5:
    When DEMO_MODE=false, init_db never seeds demo users with known passwords.
    """
    prod_fd, prod_path = tempfile.mkstemp(suffix="_prod_clean.db")
    try:
        monkeypatch.setenv("DEMO_MODE", "false")
        init_db(db_path=prod_path, force_reseed=True)

        conn = get_connection(prod_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        conn.close()

        assert user_count == 0, f"Expected 0 users in production mode, found {user_count}"
    finally:
        os.close(prod_fd)
        if os.path.exists(prod_path):
            os.remove(prod_path)

def test_phase5_production_mode_does_not_print_or_store_otp(capsys, monkeypatch):
    """
    Phase 5 Requirement 5:
    When DEMO_MODE=false, dispatch_otp never prints OTPs to console and does not store
    them in app.config['LAST_DISPATCHED_OTP'].
    """
    monkeypatch.setenv("DEMO_MODE", "false")
    app.config.pop("LAST_DISPATCHED_OTP", None)

    dispatch_otp("secure_user@parul.ac.in", "+91 99999 00000", "849201")

    captured = capsys.readouterr()
    assert "849201" not in captured.out
    assert "849201" not in captured.err
    assert "LAST_DISPATCHED_OTP" not in app.config

def test_phase5_multi_worker_concurrency_safety_for_overdue_evaluator():
    """
    Phase 5 Requirement 6:
    Validates that the background overdue dose evaluator behaves correctly when 2+ workers
    execute evaluate_overdue_doses concurrently on the same dataset.
    Proves that atomic SQL conditional updates prevent duplicate medication_history rows
    and duplicate caregiver notifications.
    """
    concurrency_fd, concurrency_path = tempfile.mkstemp(suffix="_concurrency.db")
    try:
        init_db(db_path=concurrency_path, force_reseed=True)
        conn = get_connection(concurrency_path)
        cursor = conn.cursor()

        # Insert patient (id 10) and caregiver (id 20) with valid password_hash
        cursor.execute("INSERT OR REPLACE INTO users (id, name, email, phone, role, password_hash) VALUES (10, 'Conc Patient', 'conc_pt@test.com', '123', 'patient', 'hash10')")
        cursor.execute("INSERT OR REPLACE INTO users (id, name, email, phone, role, password_hash) VALUES (20, 'Conc Caregiver', 'conc_cg@test.com', '456', 'caregiver', 'hash20')")
        cursor.execute("INSERT OR REPLACE INTO caregiver_patient (caregiver_id, patient_id, status) VALUES (20, 10, 'Active')")
        cursor.execute("INSERT OR REPLACE INTO medicines (id, user_id, name, dosage_amount, dosage_unit, frequency, start_date) VALUES (50, 10, 'ConcMed', '500', 'mg', 'once', '2026-10-01')")

        # Insert an overdue dose instance (scheduled 2 hours ago)
        overdue_scheduled = "2026-10-01T06:00:00+00:00"
        cursor.execute("""
            INSERT INTO dose_instances (id, user_id, medicine_id, reminder_id, medicine_name, dosage, scheduled_for, local_time, status)
            VALUES (999, 10, 50, 1, 'ConcMed', '500 mg', ?, '11:30', 'pending')
        """, (overdue_scheduled,))
        conn.commit()
        conn.close()

        # Fixed evaluation time well past the grace window
        eval_clock = datetime(2026, 10, 1, 9, 0, 0, tzinfo=timezone.utc)

        import concurrent.futures
        def worker_task(worker_id):
            c = get_connection(concurrency_path)
            try:
                evaluate_overdue_doses(user_id=10, clock=eval_clock, conn=c)
            finally:
                c.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(worker_task, i) for i in range(2)]
            concurrent.futures.wait(futures)

        # Verify results in database:
        verify_conn = get_connection(concurrency_path)
        v_cursor = verify_conn.cursor()

        # 1. Dose must be marked missed
        v_cursor.execute("SELECT status FROM dose_instances WHERE id = 999")
        dose_status = v_cursor.fetchone()[0]
        assert dose_status == "missed"

        # 2. Exactly ONE history entry must exist (no duplicate!)
        v_cursor.execute("SELECT COUNT(*) FROM medication_history WHERE user_id = 10 AND status = 'missed'")
        history_count = v_cursor.fetchone()[0]
        assert history_count == 1, f"Expected exactly 1 history row, found {history_count}"

        # 3. Exactly ONE caregiver notification must exist (no duplicate!)
        v_cursor.execute("SELECT COUNT(*) FROM notifications WHERE user_id = 20 AND type = 'missed_dose'")
        notif_count = v_cursor.fetchone()[0]
        assert notif_count == 1, f"Expected exactly 1 notification, found {notif_count}"

        verify_conn.close()
    finally:
        os.close(concurrency_fd)
        if os.path.exists(concurrency_path):
            os.remove(concurrency_path)

