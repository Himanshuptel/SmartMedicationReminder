"""
Smart Medication Reminder - Comprehensive Backend Test Suite
Parul University - Semester IV IMCA / BCA Project
"""
import os
import sys
import tempfile
import pytest

# Ensure backend directory is in python search path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import app
from database import init_db, get_connection, verify_password

@pytest.fixture(scope="session")
def test_client():
    """
    Create a clean test database and Flask test client.
    """
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.environ["DB_PATH"] = db_path

    # Initialize schema and seed data into test db
    init_db(db_path=db_path, force_reseed=True)

    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

    # Cleanup temp db after test session
    os.close(db_fd)
    if os.path.exists(db_path):
        os.unlink(db_path)

# ── Health & System ────────────────────────────────────────────────

def test_health_endpoint(test_client):
    res = test_client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["status"] == "healthy"
    assert "Parul University" in data["institution"]

# ── Users & Authentication ─────────────────────────────────────────

def test_get_users(test_client):
    res = test_client.get("/api/users")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert len(data["users"]) >= 3
    # Ensure password hashes are NEVER exposed
    for u in data["users"]:
        assert "password_hash" not in u
        assert "password" not in u

def test_register_success(test_client):
    payload = {
        "fullName": "Test Patient",
        "email": "test.patient@example.com",
        "phone": "+91 99999 88888",
        "role": "patient",
        "password": "SecurePassword123!"
    }
    res = test_client.post("/api/auth/register", json=payload)
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True
    assert data["user"]["email"] == "test.patient@example.com"
    assert "password_hash" not in data["user"]

def test_register_duplicate_email_fails(test_client):
    payload = {
        "fullName": "Duplicate User",
        "email": "test.patient@example.com",
        "phone": "+91 11111 22222",
        "role": "patient",
        "password": "Password123!"
    }
    res = test_client.post("/api/auth/register", json=payload)
    assert res.status_code == 409
    data = res.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "CONFLICT"

def test_register_validation_failures(test_client):
    # Missing name
    res = test_client.post("/api/auth/register", json={"email": "bad@example.com", "phone": "123", "password": "pass"})
    assert res.status_code == 422
    assert res.get_json()["error"]["code"] == "VALIDATION_ERROR"

    # Invalid role
    res = test_client.post("/api/auth/register", json={
        "fullName": "Invalid Role",
        "email": "badrole@example.com",
        "phone": "123",
        "role": "admin",
        "password": "password123"
    })
    assert res.status_code == 422

def test_login_success(test_client):
    res = test_client.post("/api/auth/login", json={
        "identifier": "himanshu@paruluniversity.ac.in",
        "password": "DemoPassword123!"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["user"]["email"] == "himanshu@paruluniversity.ac.in"
    assert "password_hash" not in data["user"]

def test_login_wrong_password_fails(test_client):
    res = test_client.post("/api/auth/login", json={
        "identifier": "himanshu@paruluniversity.ac.in",
        "password": "IncorrectPassword"
    })
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "UNAUTHORIZED"

# ── Medicines Module ───────────────────────────────────────────────

def test_medicines_crud(test_client):
    # GET list for patient (user 1)
    res = test_client.get("/api/medicines?user_id=1")
    assert res.status_code == 200
    meds = res.get_json()["medicines"]
    initial_count = len(meds)
    assert initial_count >= 1

    # POST add medicine
    new_med = {
        "user_id": 1,
        "name": "Amoxicillin",
        "dosage_amount": "250",
        "dosage_unit": "mg",
        "frequency": "twice",
        "meal_timing": "after_food",
        "stock_remaining": 20,
        "low_stock_threshold": 4
    }
    create_res = test_client.post("/api/medicines", json=new_med)
    assert create_res.status_code == 201
    create_data = create_res.get_json()
    assert create_data["success"] is True
    med_id = create_data["medicine_id"]
    assert med_id is not None

    # Verify medicine appears in GET
    res_after = test_client.get("/api/medicines?user_id=1")
    assert len(res_after.get_json()["medicines"]) == initial_count + 1

    # Verify reminders were auto-created
    rems_res = test_client.get("/api/reminders?user_id=1")
    rems = rems_res.get_json()["reminders"]
    amox_rems = [r for r in rems if r["medicine_id"] == med_id]
    assert len(amox_rems) == 2 # "twice" generates 2 doses

    # DELETE medicine
    del_res = test_client.delete(f"/api/medicines/{med_id}")
    assert del_res.status_code == 200
    assert del_res.get_json()["success"] is True

    # Verify 404 on deleting non-existent medicine
    del_404 = test_client.delete("/api/medicines/999999")
    assert del_404.status_code == 404

def test_medicine_add_validation_failure(test_client):
    res = test_client.post("/api/medicines", json={"user_id": 1, "name": ""})
    assert res.status_code == 422
    assert res.get_json()["error"]["code"] == "VALIDATION_ERROR"

# ── Reminders & Schedule ───────────────────────────────────────────

def test_schedule_and_reminders_endpoints(test_client):
    res1 = test_client.get("/api/reminders?user_id=1")
    res2 = test_client.get("/api/schedule/today?user_id=1")
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert len(res1.get_json()["reminders"]) == len(res2.get_json()["reminders"])

# ── History & Intake Actions ───────────────────────────────────────

def test_history_recording_and_adherence(test_client):
    # GET history
    hist_res = test_client.get("/api/history?user_id=1")
    assert hist_res.status_code == 200
    data = hist_res.get_json()
    assert data["success"] is True
    assert "stats" in data
    assert data["stats"]["adherence_rate"] >= 0

    # POST record dose action: taken
    take_payload = {
        "user_id": 1,
        "reminder_id": 1,
        "medicine_name": "Metformin",
        "dosage": "500 mg",
        "status": "taken",
        "notes": "Verified via test intake"
    }
    rec_res = test_client.post("/api/history", json=take_payload)
    assert rec_res.status_code == 201
    assert rec_res.get_json()["success"] is True

    # POST record dose action: missed (triggers caregiver notification)
    miss_payload = {
        "user_id": 1,
        "reminder_id": 1,
        "medicine_name": "Metformin",
        "dosage": "500 mg",
        "status": "missed",
        "notes": "Patient forgot dose"
    }
    rec_miss = test_client.post("/api/history", json=miss_payload)
    assert rec_miss.status_code == 201

    # POST invalid status
    bad_res = test_client.post("/api/history", json={"user_id": 1, "status": "unknown_status"})
    assert bad_res.status_code == 422

# ── Caregiver Portal ───────────────────────────────────────────────

def test_caregiver_patients_and_acknowledge(test_client):
    cg_res = test_client.get("/api/caregiver/patients?caregiver_id=2")
    assert cg_res.status_code == 200
    data = cg_res.get_json()
    assert data["success"] is True
    assert len(data["patients"]) >= 1

    # Acknowledge alert
    ack_res = test_client.post("/api/caregiver/acknowledge", json={"alert_id": 1})
    assert ack_res.status_code == 200
    assert ack_res.get_json()["success"] is True

    # Missing alert_id validation
    ack_fail = test_client.post("/api/caregiver/acknowledge", json={})
    assert ack_fail.status_code == 422

# ── Clinician Portal ───────────────────────────────────────────────

def test_clinician_patients_and_notes(test_client):
    res = test_client.get("/api/clinician/patients?clinician_id=3")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert len(data["patients"]) >= 1

    # Add clinical note
    note_payload = {
        "clinician_id": 3,
        "patient_id": 1,
        "note": "Blood pressure stabilized. Regimen effective.",
        "dosage_adjustment": "Continue Metformin 500mg BID."
    }
    note_res = test_client.post("/api/clinician/notes", json=note_payload)
    assert note_res.status_code == 201
    assert note_res.get_json()["success"] is True

    # Missing note validation
    bad_note = test_client.post("/api/clinician/notes", json={"patient_id": 1, "note": ""})
    assert bad_note.status_code == 422

# ── Emergency SOS & Contacts ───────────────────────────────────────

def test_emergency_contacts_and_sos(test_client):
    contacts_res = test_client.get("/api/emergency/contacts?user_id=1")
    assert contacts_res.status_code == 200
    contacts = contacts_res.get_json()["contacts"]
    assert len(contacts) >= 1

    sos_res = test_client.post("/api/emergency/sos", json={
        "user_id": 1,
        "location": "Vadodara Campus"
    })
    assert sos_res.status_code == 200
    data = sos_res.get_json()
    assert data["success"] is True
    assert data["status"] == "ALERTS_DISPATCHED"

# ── Drug Interactions & AI Assistant ───────────────────────────────

def test_ai_interaction_checker(test_client):
    # Known critical interaction
    res = test_client.post("/api/ai/interaction-checker", json={
        "drugs": ["Warfarin", "Aspirin"]
    })
    assert res.status_code == 200
    interactions = res.get_json()["interactions"]
    assert any(i["severity"] == "CRITICAL" for i in interactions)

    # Safe drugs
    res_safe = test_client.post("/api/ai/interaction-checker", json={
        "drugs": ["Paracetamol", "Vitamin C"]
    })
    assert res_safe.status_code == 200
    assert any(i["severity"] == "SAFE" for i in res_safe.get_json()["interactions"])

def test_ai_chat(test_client):
    res = test_client.post("/api/ai/chat", json={"message": "What if I missed a dose of Metformin?"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "missed" in data["reply"].lower()

    # Empty message validation
    res_empty = test_client.post("/api/ai/chat", json={"message": ""})
    assert res_empty.status_code == 422

# ── Notifications Feed ─────────────────────────────────────────────

def test_notifications_endpoint(test_client):
    res = test_client.get("/api/notifications?user_id=1")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "notifications" in data
    assert "unread_count" in data
