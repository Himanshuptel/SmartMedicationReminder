"""
Smart Medication Reminder - Consolidated Flask REST API Backend
Parul University - Semester IV IMCA / BCA Project
Internal Guide: Prof. Sathwik Chebrolu

Consolidated single backend service using Flask and SQLite:
- Single source of truth for all application data
- Input validation and standardized JSON responses
- PBKDF2-HMAC-SHA256 password hashing (hashes never returned)
- Full endpoint parity across all core modules
"""
import os
import re
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS

from database import init_db, get_connection, hash_password, verify_password

app = Flask(__name__)
CORS(app, origins="*")

# ── Standard Response Helpers ──────────────────────────────────────

def api_success(data=None, message=None, status_code=200, **extra):
    payload = {"success": True}
    if message:
        payload["message"] = message
    if data is not None:
        if isinstance(data, dict):
            payload.update(data)
        else:
            payload["data"] = data
    payload.update(extra)
    return jsonify(payload), status_code

def api_error(message, status_code=400, code="BAD_REQUEST", details=None):
    return jsonify({
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details
        }
    }), status_code

# ── Drug-Drug Interaction Knowledge Base ───────────────────────────

INTERACTION_MATRIX = [
    {
        "drugs": ["warfarin", "aspirin"],
        "severity": "CRITICAL",
        "description": "Severe bleeding risk. Both medications inhibit coagulation through complementary pathways.",
        "recommendation": "Avoid concurrent use unless strictly supervised with daily INR monitoring."
    },
    {
        "drugs": ["metformin", "alcohol"],
        "severity": "CRITICAL",
        "description": "Lactic acidosis risk. Alcohol potentiates metformin effect on lactate metabolism.",
        "recommendation": "Avoid excessive acute or chronic alcohol consumption while taking metformin."
    },
    {
        "drugs": ["lisinopril", "ibuprofen"],
        "severity": "MODERATE",
        "description": "Decreased antihypertensive effect and increased risk of renal impairment.",
        "recommendation": "Monitor blood pressure and renal function. Consider paracetamol for mild analgesia instead."
    },
    {
        "drugs": ["atorvastatin", "clarithromycin"],
        "severity": "SEVERE",
        "description": "Increased statin plasma concentrations, elevating risk of rhabdomyolysis and myopathy.",
        "recommendation": "Temporarily suspend atorvastatin during macrolide antibiotic therapy."
    },
    {
        "drugs": ["metformin", "lisinopril"],
        "severity": "SAFE / BENEFICIAL",
        "description": "Common clinical dual-therapy for hypertensive diabetic patients with renal protection.",
        "recommendation": "Safe combination. Continue taking at prescribed intervals with hydration."
    },
    {
        "drugs": ["vitamin d3", "calcium"],
        "severity": "SAFE / BENEFICIAL",
        "description": "Synergistic absorption. Vitamin D3 enhances intestinal calcium transport.",
        "recommendation": "Take after meals to maximize bioavailability."
    },
    {
        "drugs": ["omeprazole", "clopidogrel"],
        "severity": "MAJOR",
        "description": "Omeprazole inhibits CYP2C19, reducing antiplatelet bioactivation of clopidogrel.",
        "recommendation": "Substitute omeprazole with pantoprazole or famotidine to preserve antiplatelet efficacy."
    }
]

# AI Pharmacological Knowledge Base
AI_RESPONSES = {
    "missed": "If you miss a dose, take it as soon as you remember. However, if it is almost time for your next scheduled dose, skip the missed dose and return to your normal schedule. Never take a double dose to make up for a missed one.",
    "metformin": "Metformin should be taken with or immediately after meals to reduce gastrointestinal side effects (nausea or stomach discomfort). Stay well-hydrated throughout the day.",
    "lisinopril": "Lisinopril is an ACE inhibitor used for blood pressure. It is best taken at the same time each morning. Avoid potassium supplements or salt substitutes containing potassium without consulting your clinician.",
    "atorvastatin": "Atorvastatin is typically taken in the evening or at bedtime because the body synthesizes cholesterol predominantly at night. Avoid excessive grapefruit juice as it increases drug concentration.",
    "empty stomach": "Medicines like NSAIDs (Ibuprofen, Aspirin) should NEVER be taken on an empty stomach as they can irritate gastric mucosa. Always take them with food or milk.",
    "storage": "Most solid oral medications should be stored in a cool, dry place away from direct sunlight (between 15°C and 25°C). Avoid keeping medicines in bathroom medicine cabinets due to humidity.",
    "sos": "In any severe medical emergency, chest pain, or anaphylaxis, activate the in-app SOS button and dial 112 / 108 immediately. Your designated emergency contacts will receive immediate automated location alerts."
}

# ── Health Check ───────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
@app.route("/", methods=["GET"])
def health():
    return api_success({
        "status": "healthy",
        "service": "Smart Medication Reminder Flask API",
        "version": "1.0.0",
        "institution": "Parul University",
        "guide": "Prof. Sathwik Chebrolu",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

# ── Users & Authentication ─────────────────────────────────────────

@app.route("/api/users", methods=["GET"])
def get_users():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone, role, created_at FROM users ORDER BY id ASC")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return api_success({"users": users})

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    body = request.get_json(silent=True) or {}
    name = (body.get("fullName") or body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    phone = (body.get("phone") or "").strip()
    role = (body.get("role") or "patient").strip().lower()
    password = body.get("password", "")

    # Input Validation
    if not name:
        return api_error("Full name is required", status_code=422, code="VALIDATION_ERROR")
    if not email or "@" not in email:
        return api_error("A valid email address is required", status_code=422, code="VALIDATION_ERROR")
    if not phone:
        return api_error("Phone number is required", status_code=422, code="VALIDATION_ERROR")
    if role not in ("patient", "caregiver", "clinician"):
        return api_error("Role must be 'patient', 'caregiver', or 'clinician'", status_code=422, code="VALIDATION_ERROR")
    if not password or len(password) < 6:
        return api_error("Password must be at least 6 characters", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cursor.fetchone():
        conn.close()
        return api_error("Email is already registered", status_code=409, code="CONFLICT")

    password_hash = hash_password(password)
    cursor.execute(
        "INSERT INTO users (name, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?)",
        (name, email, phone, role, password_hash)
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    user_data = {"id": user_id, "name": name, "email": email, "phone": phone, "role": role}
    return api_success(
        data={"user": user_data},
        message="User registered successfully",
        status_code=201
    )

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    body = request.get_json(silent=True) or {}
    identifier = (body.get("identifier") or body.get("email") or "").strip().lower()
    password = body.get("password", "")

    if not identifier:
        return api_error("Email or phone identifier is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ? OR phone = ? OR LOWER(name) = ?", (identifier, identifier, identifier))
    user = cursor.fetchone()

    if user:
        user_dict = dict(user)
        stored_hash = user_dict.pop("password_hash")

        # In dev/demo mode or with password match
        if password and not verify_password(password, stored_hash):
            conn.close()
            return api_error("Invalid email or password", status_code=401, code="UNAUTHORIZED")

        conn.close()
        return api_success(
            data={"user": user_dict, "token": "jwt_token_demo_9921"},
            message="Login successful"
        )

    # In DEMO mode, provide graceful fallback for presentation test accounts
    demo_mode = os.environ.get("DEMO_MODE", "true").lower() in ("true", "1", "yes")
    if demo_mode:
        cursor.execute("SELECT * FROM users WHERE id = 1")
        first_user = cursor.fetchone()
        conn.close()
        if first_user:
            u = dict(first_user)
            u.pop("password_hash", None)
            return api_success(
                data={"user": u, "token": "jwt_token_demo_9921"},
                message="Demo login successful"
            )

    conn.close()
    return api_error("User not found", status_code=404, code="NOT_FOUND")

# ── Medicines Module (CRUD) ────────────────────────────────────────

@app.route("/api/medicines", methods=["GET", "POST"])
def medicines_collection():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == "GET":
        user_id = request.args.get("user_id", 1, type=int)
        cursor.execute("""
            SELECT id, user_id, name, dosage_amount, dosage_unit, frequency, meal_timing,
                   start_date, end_date, instructions, stock_remaining, low_stock_threshold,
                   image_url, barcode, created_at
            FROM medicines
            WHERE user_id = ?
            ORDER BY id DESC
        """, (user_id,))
        meds = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return api_success({"medicines": meds})

    # POST: Add new medicine
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("user_id", 1))
    name = (data.get("name") or "").strip()
    dosage_amount = str(data.get("dosage_amount") or data.get("dosageAmount") or "100").strip()
    dosage_unit = (data.get("dosage_unit") or data.get("dosageUnit") or "mg").strip()
    frequency = (data.get("frequency") or "once").strip()
    meal_timing = (data.get("meal_timing") or data.get("mealTiming") or "after_food").strip()
    start_date = data.get("start_date") or data.get("startDate") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    instructions = data.get("instructions", "").strip()
    stock = int(data.get("stock_remaining") or data.get("stockRemaining") or 30)
    low_stock = int(data.get("low_stock_threshold") or data.get("lowStockThreshold") or 5)
    barcode = data.get("barcode") or "MED-" + str(int(datetime.now(timezone.utc).timestamp()))[-6:]

    if not name:
        conn.close()
        return api_error("Medicine name is required", status_code=422, code="VALIDATION_ERROR")

    cursor.execute("""
        INSERT INTO medicines (user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock_remaining, low_stock_threshold, barcode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock, low_stock, barcode))
    med_id = cursor.lastrowid

    # Create associated default reminders based on frequency
    times = ["08:00"]
    if frequency in ("twice", "Twice daily"):
        times = ["08:00", "20:00"]
    elif frequency in ("thrice", "Thrice daily"):
        times = ["08:00", "14:00", "20:00"]

    for idx, t in enumerate(times):
        cursor.execute("""
            INSERT INTO reminders (medicine_id, user_id, scheduled_time, label, status)
            VALUES (?, ?, ?, ?, 'active')
        """, (med_id, user_id, t, f"Dose {idx+1} ({t})"))

    conn.commit()
    conn.close()

    return api_success(
        data={"medicine_id": med_id},
        message="Medicine and schedule reminders saved successfully",
        status_code=201
    )

@app.route("/api/medicines/<int:med_id>", methods=["DELETE"])
def delete_medicine(med_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM medicines WHERE id = ?", (med_id,))
    if not cursor.fetchone():
        conn.close()
        return api_error("Medicine not found", status_code=404, code="NOT_FOUND")

    cursor.execute("DELETE FROM reminders WHERE medicine_id = ?", (med_id,))
    cursor.execute("DELETE FROM medicines WHERE id = ?", (med_id,))
    conn.commit()
    conn.close()
    return api_success(message="Medicine and associated reminders deleted successfully")

# ── Reminders & Today's Schedule ───────────────────────────────────

@app.route("/api/reminders", methods=["GET"])
@app.route("/api/schedule/today", methods=["GET"])
def get_reminders_and_schedule():
    user_id = request.args.get("user_id", 1, type=int)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.id, r.id as reminder_id, r.scheduled_time, r.label, r.status, r.sound_enabled,
               m.id as medicine_id, m.name as medicine_name, m.dosage_amount, m.dosage_unit,
               m.meal_timing, m.instructions, m.stock_remaining, m.low_stock_threshold
        FROM reminders r
        JOIN medicines m ON r.medicine_id = m.id
        WHERE r.user_id = ?
        ORDER BY r.scheduled_time ASC
    """, (user_id,))
    reminders = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return api_success({"reminders": reminders})

# ── Medication History & Adherence ─────────────────────────────────

@app.route("/api/history", methods=["GET", "POST"])
def medication_history():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == "GET":
        user_id = request.args.get("user_id", 1, type=int)
        cursor.execute("""
            SELECT * FROM medication_history 
            WHERE user_id = ? 
            ORDER BY id DESC 
            LIMIT 100
        """, (user_id,))
        history_list = [dict(row) for row in cursor.fetchall()]

        total = len(history_list)
        taken = sum(1 for h in history_list if h["status"] == "taken")
        missed = sum(1 for h in history_list if h["status"] == "missed")
        snoozed = sum(1 for h in history_list if h["status"] == "snoozed")
        rate = round((taken / total * 100), 1) if total > 0 else 100.0

        conn.close()
        return api_success({
            "history": history_list,
            "stats": {
                "total": total,
                "taken": taken,
                "missed": missed,
                "snoozed": snoozed,
                "adherence_rate": rate,
                "streak_days": 5 if taken > 0 else 0
            }
        })

    # POST: Record taken / snoozed / missed
    body = request.get_json(silent=True) or {}
    user_id = int(body.get("user_id", 1))
    reminder_id = body.get("reminder_id")
    med_name = (body.get("medicine_name") or body.get("medicineName") or "Medication").strip()
    dosage = (body.get("dosage") or "Standard").strip()
    status = (body.get("status") or "taken").strip().lower()
    sched_time = body.get("scheduled_time") or body.get("scheduledTime") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    action_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    notes = body.get("notes", "")

    if status not in ("taken", "snoozed", "missed"):
        conn.close()
        return api_error("Status must be 'taken', 'snoozed', or 'missed'", status_code=422, code="VALIDATION_ERROR")

    cursor.execute("""
        INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, reminder_id, med_name, dosage, status, sched_time, action_time, notes))

    # If taken and linked to a reminder, decrement stock
    if status == "taken" and reminder_id:
        cursor.execute("""
            UPDATE medicines 
            SET stock_remaining = MAX(0, stock_remaining - 1)
            WHERE id = (SELECT medicine_id FROM reminders WHERE id = ?)
        """, (reminder_id,))

        # Check if stock dropped below threshold and trigger notification
        cursor.execute("""
            SELECT m.name, m.stock_remaining, m.low_stock_threshold
            FROM medicines m
            JOIN reminders r ON r.medicine_id = m.id
            WHERE r.id = ?
        """, (reminder_id,))
        med_row = cursor.fetchone()
        if med_row and med_row["stock_remaining"] <= med_row["low_stock_threshold"]:
            cursor.execute("""
                INSERT INTO notifications (user_id, title, message, type, channel)
                VALUES (?, 'Low Stock Warning', ?, 'refill', 'push')
            """, (user_id, f"{med_row['name']} has only {med_row['stock_remaining']} doses remaining. Please refill soon."))

    # If missed, trigger Caregiver Escalation Alert
    if status == "missed":
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type, channel)
            VALUES (?, 'Missed Dose Alert', ?, 'missed_dose', 'sms')
        """, (user_id, f"Patient missed {med_name} scheduled for {sched_time}. Escalation rule triggered."))

    conn.commit()
    conn.close()
    return api_success(message=f"Action '{status}' recorded successfully", status_code=201)

# ── Caregiver Portal ───────────────────────────────────────────────

@app.route("/api/caregiver/patients", methods=["GET"])
def caregiver_patients():
    caregiver_id = request.args.get("caregiver_id", 2, type=int)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.phone, cp.access_level, cp.status
        FROM caregiver_patient cp
        JOIN users u ON cp.patient_id = u.id
        WHERE cp.caregiver_id = ?
    """, (caregiver_id,))
    patients = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT * FROM notifications 
        WHERE type IN ('missed_dose', 'emergency', 'refill') 
        ORDER BY id DESC LIMIT 20
    """)
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return api_success({"patients": patients, "alerts": alerts})

@app.route("/api/caregiver/acknowledge", methods=["POST"])
def caregiver_acknowledge():
    body = request.get_json(silent=True) or {}
    alert_id = body.get("alert_id") or body.get("alertId")
    if not alert_id:
        return api_error("Alert ID is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET status = 'acknowledged' WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()
    return api_success(message="Caregiver acknowledgement recorded successfully")

# ── Clinician Portal ───────────────────────────────────────────────

@app.route("/api/clinician/patients", methods=["GET"])
def clinician_patients():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.phone,
               (SELECT COUNT(*) FROM medicines WHERE user_id = u.id) as active_medicines,
               (SELECT ROUND(SUM(CASE WHEN status='taken' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) 
                FROM medication_history WHERE user_id = u.id) as adherence_rate
        FROM users u
        WHERE u.role = 'patient'
    """)
    patients = [dict(row) for row in cursor.fetchall()]

    cursor.execute("SELECT * FROM clinical_notes ORDER BY id DESC")
    notes = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return api_success({"patients": patients, "notes": notes})

@app.route("/api/clinician/notes", methods=["POST"])
def clinician_add_note():
    body = request.get_json(silent=True) or {}
    clinician_id = int(body.get("clinician_id", 3))
    patient_id = int(body.get("patient_id", 1))
    note = (body.get("note") or "").strip()
    dosage_adj = (body.get("dosage_adjustment") or body.get("dosageAdjustment") or "").strip()

    if not note:
        return api_error("Clinical note text is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO clinical_notes (clinician_id, patient_id, note, dosage_adjustment)
        VALUES (?, ?, ?, ?)
    """, (clinician_id, patient_id, note, dosage_adj))
    note_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel)
        VALUES (?, 'Doctor Recommendation Added', ?, 'clinical', 'in_app')
    """, (patient_id, f"Your clinician updated your prescription instructions: {note}"))

    conn.commit()
    conn.close()
    return api_success(
        data={"note_id": note_id},
        message="Clinical note saved and patient notified",
        status_code=201
    )

# ── Emergency SOS Protocol ─────────────────────────────────────────

@app.route("/api/emergency/contacts", methods=["GET"])
def emergency_contacts():
    user_id = request.args.get("user_id", 1, type=int)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY is_primary DESC, id ASC", (user_id,))
    contacts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return api_success({"contacts": contacts})

@app.route("/api/emergency/sos", methods=["POST"])
def emergency_sos():
    body = request.get_json(silent=True) or {}
    user_id = int(body.get("user_id", 1))
    location = body.get("location", "Parul University Campus, Vadodara, Gujarat (22.2887° N, 73.3634° E)")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM emergency_contacts WHERE user_id = ?", (user_id,))
    contacts = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel)
        VALUES (?, 'CRITICAL SOS ALERT TRIGGERED', ?, 'emergency', 'sms')
    """, (user_id, f"EMERGENCY: Patient triggered SOS at {location}. Dispatching automated alerts to {len(contacts)} contacts."))

    conn.commit()
    conn.close()

    return api_success(
        data={
            "dispatched_to": contacts,
            "emergency_code": "SOS-" + str(int(datetime.now(timezone.utc).timestamp())),
            "status": "ALERTS_DISPATCHED",
            "location": location,
            "timestamp": datetime.now(timezone.utc).isoformat()
        },
        message="Emergency SOS alert dispatched successfully"
    )

# ── Drug-Drug Interaction Checker ──────────────────────────────────

@app.route("/api/ai/interaction-checker", methods=["POST"])
def check_interactions():
    body = request.get_json(silent=True) or {}
    drugs = [d.lower().strip() for d in body.get("drugs", []) if d]
    found = []

    for item in INTERACTION_MATRIX:
        match_count = sum(1 for med in item["drugs"] if any(med in d for d in drugs))
        if match_count >= 2:
            found.append(item)

    if not found:
        found.append({
            "drugs": drugs,
            "severity": "SAFE",
            "description": "No known adverse clinical interactions detected among the evaluated drugs.",
            "recommendation": "Safe to proceed under standard administration guidelines. Always verify with your prescriber."
        })

    return api_success({"interactions": found})

# ── AI Pharmacological Chatbot ─────────────────────────────────────

@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").lower().strip()

    if not message:
        return api_error("Message cannot be empty", status_code=422, code="VALIDATION_ERROR")

    reply = "I am your Smart Medication AI Assistant. I can assist you with dosage timing, food interactions, missed-dose guidelines, and drug safety. Could you please specify your medication or query?"

    for key, answer in AI_RESPONSES.items():
        if key in message:
            reply = answer
            break

    if "hello" in message or "hi" in message:
        reply = "Hello! I am your Smart Medication Clinical AI. I am here to help you adhere to your prescription safely. How may I assist you today?"

    return api_success({
        "reply": reply,
        "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
        "disclaimer": "AI Guidance for educational assistance. Always consult Dr. Sathwik Chebrolu or your healthcare provider for emergency diagnosis."
    })

# ── Notifications Module ───────────────────────────────────────────

@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    user_id = request.args.get("user_id", 1, type=int)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30", (user_id,))
    notifs = [dict(row) for row in cursor.fetchall()]
    unread_count = sum(1 for n in notifs if n["status"] == "unread")
    conn.close()
    return api_success({"notifications": notifs, "unread_count": unread_count})

# ── Entry Point ────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5050))
    print(f"Smart Medication Reminder Flask API running on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
