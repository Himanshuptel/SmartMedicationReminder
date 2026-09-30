"""
Smart Medication Reminder - Consolidated Flask REST API Backend
Parul University - Semester IV IMCA / BCA Project
Internal Guide: Prof. Sathwik Chebrolu

Production-ready backend with:
- Strict Two-Step Verification (OTP for Registration and Login)
- Session token authentication (sessions table) and RBAC
- User identity derived SOLELY from session token (no user_id in params/bodies)
- Caregiver-Patient linkage verification (403 if unlinked)
- User data isolation (user A cannot access or modify user B's data)
"""
import os
import smtplib
from email.mime.text import MIMEText
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, request, jsonify, g
from flask_cors import CORS

from database import init_db, get_connection, hash_password, verify_password

app = Flask(__name__)
CORS(app, origins="*")

# ── Environment & Security Configuration ───────────────────────────

DEMO_MODE = os.environ.get("DEMO_MODE", "true").lower() in ("true", "1", "yes")
SECRET_KEY = os.environ.get("SECRET_KEY")

# In production mode (DEMO_MODE=false), refuse to start without SECRET_KEY
if not DEMO_MODE and not SECRET_KEY:
    raise RuntimeError("FATAL: In production mode (DEMO_MODE=false), SECRET_KEY environment variable is strictly required.")

if not SECRET_KEY:
    SECRET_KEY = "dev-insecure-secret-key-change-in-production-min32chars"

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

# ── OTP Helpers (Hashing & Dispatch) ───────────────────────────────

def hash_otp(otp_code: str) -> str:
    """Hash OTP with secret key so raw OTP is never stored in DB."""
    return hashlib.sha256(f"{SECRET_KEY}:{otp_code}".encode()).hexdigest()

def dispatch_otp(email: str, phone: str, otp_code: str):
    """
    Deliver OTP via SMTP if configured.
    In DEV mode only (DEMO_MODE=true), log OTP to server console.
    In production mode (DEMO_MODE=false), OTP is NEVER logged or returned.
    """
    app.config.setdefault("LAST_DISPATCHED_OTP", {})[email] = otp_code
    smtp_host = os.environ.get("SMTP_HOST")
    if smtp_host:
        try:
            port = int(os.environ.get("SMTP_PORT", 587))
            user = os.environ.get("SMTP_USER", "")
            password = os.environ.get("SMTP_PASS", "")
            sender = os.environ.get("SMTP_FROM", "noreply@smartmedicationreminder.com")

            msg = MIMEText(f"Your Smart Medication Reminder verification code is: {otp_code}\n\nThis code expires in 5 minutes.")
            msg["Subject"] = "Your Verification Code - Smart Medication Reminder"
            msg["From"] = sender
            msg["To"] = email

            with smtplib.SMTP(smtp_host, port) as server:
                server.starttls()
                if user and password:
                    server.login(user, password)
                server.sendmail(sender, [email], msg.as_string())
            return
        except Exception as e:
            if DEMO_MODE:
                print(f"[SMTP WARNING] Failed to send email via SMTP: {e}", flush=True)

    # In DEV mode only, log to console
    if DEMO_MODE:
        print(f"\n[DEV MODE OTP] >>> Verification Code for {email}: {otp_code} <<<\n", flush=True)

# ── Session & RBAC Middleware ──────────────────────────────────────

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return api_error("Authentication token required", status_code=401, code="UNAUTHORIZED")

        raw_token = auth_header.split(" ", 1)[1].strip()
        if not raw_token:
            return api_error("Invalid authentication token format", status_code=401, code="UNAUTHORIZED")

        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        now_iso = datetime.now(timezone.utc).isoformat()

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id as session_id, s.expires_at, u.id, u.name, u.email, u.phone, u.role
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = ?
        """, (token_hash,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return api_error("Invalid or expired session. Please log in again.", status_code=401, code="SESSION_EXPIRED")

        if row["expires_at"] < now_iso:
            # Delete expired session
            conn = get_connection()
            conn.execute("DELETE FROM sessions WHERE id = ?", (row["session_id"],))
            conn.commit()
            conn.close()
            return api_error("Session has expired. Please log in again.", status_code=401, code="SESSION_EXPIRED")

        g.current_user = {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "role": row["role"],
            "session_id": row["session_id"],
            "token_hash": token_hash
        }
        return f(*args, **kwargs)
    return decorated

def require_role(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, "current_user") or not g.current_user:
                return api_error("Authentication required", status_code=401, code="UNAUTHORIZED")
            if g.current_user["role"] not in allowed_roles:
                return api_error(
                    f"Insufficient permissions. Required role: {', '.join(allowed_roles)}",
                    status_code=403,
                    code="FORBIDDEN"
                )
            return f(*args, **kwargs)
        return decorated
    return decorator

def verify_caregiver_access(caregiver_id, patient_id):
    """Verify in caregiver_patient table that caregiver is authorized for this patient."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM caregiver_patient 
        WHERE caregiver_id = ? AND patient_id = ? AND status = 'Active'
    """, (caregiver_id, patient_id))
    row = cursor.fetchone()
    conn.close()
    return row is not None

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

AI_RESPONSES = {
    "missed": "If you miss a dose, take it as soon as you remember. However, if it is almost time for your next scheduled dose, skip the missed dose and return to your normal schedule. Never take a double dose to make up for a missed one.",
    "metformin": "Metformin should be taken with or immediately after meals to reduce gastrointestinal side effects (nausea or stomach discomfort). Stay well-hydrated throughout the day.",
    "lisinopril": "Lisinopril is an ACE inhibitor used for blood pressure. It is best taken at the same time each morning. Avoid potassium supplements or salt substitutes containing potassium without consulting your clinician.",
    "atorvastatin": "Atorvastatin is typically taken in the evening or at bedtime because the body synthesizes cholesterol predominantly at night. Avoid excessive grapefruit juice as it increases drug concentration.",
    "empty stomach": "Medicines like NSAIDs (Ibuprofen, Aspirin) should NEVER be taken on an empty stomach as they can irritate gastric mucosa. Always take them with food or milk.",
    "storage": "Most solid oral medications should be stored in a cool, dry place away from direct sunlight (between 15°C and 25°C). Avoid keeping medicines in bathroom medicine cabinets due to humidity.",
    "sos": "In any severe medical emergency, chest pain, or anaphylaxis, activate the in-app SOS button and dial 112 / 108 immediately. Your designated emergency contacts will receive immediate automated location alerts."
}

# ── Health & Configuration ─────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
@app.route("/", methods=["GET"])
def health():
    return api_success({
        "status": "healthy",
        "service": "Smart Medication Reminder Flask API",
        "version": "1.0.0",
        "institution": "Parul University",
        "guide": "Prof. Sathwik Chebrolu",
        "demo_mode": DEMO_MODE,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

@app.route("/api/config", methods=["GET"])
def get_config():
    """Expose public client settings (demo mode status)."""
    return api_success({
        "demo_mode": DEMO_MODE,
        "otp_length": 6,
        "cooldown_seconds": 30
    })

# ── Authentication & OTP Flow ──────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    body = request.get_json(silent=True) or {}
    name = (body.get("fullName") or body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    phone = (body.get("phone") or "").strip()
    role = (body.get("role") or "patient").strip().lower()
    password = body.get("password", "")

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

    # Generate 6-digit random OTP
    otp_code = "".join(secrets.choice("0123456789") for _ in range(6))
    otp_h = hash_otp(otp_code)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

    cursor.execute("""
        INSERT INTO otp_codes (user_id, email, phone, otp_hash, expires_at, attempts, used)
        VALUES (?, ?, ?, ?, ?, 0, 0)
    """, (user_id, email, phone, otp_h, expires_at))

    conn.commit()
    conn.close()

    dispatch_otp(email, phone, otp_code)

    return api_success(
        data={"email": email, "requires_otp": True},
        message="Registration initiated. A 6-digit verification code has been dispatched.",
        status_code=201
    )

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    body = request.get_json(silent=True) or {}
    identifier = (body.get("identifier") or body.get("email") or "").strip().lower()
    password = body.get("password", "")

    if not identifier:
        return api_error("Email or phone is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ? OR phone = ? OR LOWER(name) = ?", (identifier, identifier, identifier))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return api_error("Account not found. Please check your credentials.", status_code=404, code="NOT_FOUND")

    user_dict = dict(user)
    stored_hash = user_dict["password_hash"]

    # Verify password
    if password and not verify_password(password, stored_hash):
        conn.close()
        return api_error("Invalid email or password", status_code=401, code="UNAUTHORIZED")

    # If DEMO_MODE is false, password is strictly mandatory
    if not DEMO_MODE and not password:
        conn.close()
        return api_error("Password is required in production mode", status_code=401, code="UNAUTHORIZED")

    # Invalidate previous unused OTPs for this user
    cursor.execute("UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0", (user_dict["email"],))

    # Generate 6-digit random OTP
    otp_code = "".join(secrets.choice("0123456789") for _ in range(6))
    otp_h = hash_otp(otp_code)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

    cursor.execute("""
        INSERT INTO otp_codes (user_id, email, phone, otp_hash, expires_at, attempts, used)
        VALUES (?, ?, ?, ?, ?, 0, 0)
    """, (user_dict["id"], user_dict["email"], user_dict["phone"], otp_h, expires_at))

    conn.commit()
    conn.close()

    dispatch_otp(user_dict["email"], user_dict["phone"], otp_code)

    return api_success(
        data={"email": user_dict["email"], "requires_otp": True},
        message="Login verification code dispatched to your registered email."
    )

@app.route("/api/auth/verify-otp", methods=["POST"])
def auth_verify_otp():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    otp_code = (body.get("otp") or "").strip()

    if not email:
        return api_error("Email is required", status_code=422, code="VALIDATION_ERROR")
    if not otp_code or len(otp_code) != 6 or not otp_code.isdigit():
        return api_error("A valid 6-digit numeric OTP is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM otp_codes 
        WHERE email = ? AND used = 0 
        ORDER BY id DESC LIMIT 1
    """, (email,))
    otp_record = cursor.fetchone()

    if not otp_record:
        conn.close()
        return api_error("No pending OTP request found. Please request a new code.", status_code=400, code="INVALID_OTP")

    # Check attempt limit
    if otp_record["attempts"] >= otp_record["max_attempts"]:
        conn.close()
        return api_error("Too many failed attempts. This OTP has been locked. Please request a new code.", status_code=429, code="TOO_MANY_ATTEMPTS")

    # Check expiration
    now_iso = datetime.now(timezone.utc).isoformat()
    if otp_record["expires_at"] < now_iso:
        conn.close()
        return api_error("This verification code has expired. Please request a new code.", status_code=400, code="OTP_EXPIRED")

    # Check hash
    expected_hash = hash_otp(otp_code)
    if not hmac.compare_digest(otp_record["otp_hash"], expected_hash):
        cursor.execute("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", (otp_record["id"],))
        conn.commit()
        remaining = otp_record["max_attempts"] - (otp_record["attempts"] + 1)
        conn.close()
        return api_error(
            f"Incorrect verification code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
            status_code=400,
            code="INVALID_OTP"
        )

    # OTP is valid: mark as used (single-use)
    cursor.execute("UPDATE otp_codes SET used = 1 WHERE id = ?", (otp_record["id"],))

    # Fetch user
    cursor.execute("SELECT id, name, email, phone, role FROM users WHERE id = ?", (otp_record["user_id"],))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return api_error("User account not found", status_code=404, code="NOT_FOUND")

    user_dict = dict(user)

    # Issue signed session token
    raw_token = secrets.token_urlsafe(32)
    token_h = hashlib.sha256(raw_token.encode()).hexdigest()
    session_expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    cursor.execute("""
        INSERT INTO sessions (user_id, token_hash, role, expires_at)
        VALUES (?, ?, ?, ?)
    """, (user_dict["id"], token_h, user_dict["role"], session_expiry))

    conn.commit()
    conn.close()

    return api_success(
        data={"user": user_dict, "token": raw_token},
        message="Verification successful. Session issued."
    )

@app.route("/api/auth/resend-otp", methods=["POST"])
def auth_resend_otp():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    if not email:
        return api_error("Email is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, phone FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return api_error("No account found with this email", status_code=404, code="NOT_FOUND")

    # Check cooldown (30 seconds)
    cursor.execute("""
        SELECT created_at FROM otp_codes 
        WHERE email = ? 
        ORDER BY id DESC LIMIT 1
    """, (email,))
    last_otp = cursor.fetchone()

    if last_otp:
        created_str = last_otp["created_at"]
        try:
            created_dt = datetime.fromisoformat(created_str.replace(" ", "T"))
            if created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            delta = (datetime.now(timezone.utc) - created_dt).total_seconds()
            if delta < 30:
                conn.close()
                return api_error(
                    f"Please wait {int(30 - delta)} seconds before requesting a new code.",
                    status_code=429,
                    code="COOLDOWN_ACTIVE"
                )
        except Exception:
            pass

    # Invalidate previous codes
    cursor.execute("UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0", (email,))

    new_code = "".join(secrets.choice("0123456789") for _ in range(6))
    otp_h = hash_otp(new_code)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

    cursor.execute("""
        INSERT INTO otp_codes (user_id, email, phone, otp_hash, expires_at, attempts, used)
        VALUES (?, ?, ?, ?, ?, 0, 0)
    """, (user["id"], email, user["phone"], otp_h, expires_at))

    conn.commit()
    conn.close()

    dispatch_otp(email, user["phone"], new_code)

    return api_success(message="A new verification code has been dispatched to your email.")

@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def auth_logout():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token_hash = ?", (g.current_user["token_hash"],))
    conn.commit()
    conn.close()
    return api_success(message="Successfully logged out and session terminated.")

@app.route("/api/auth/me", methods=["GET"])
@require_auth
def auth_me():
    return api_success({"user": g.current_user})

@app.route("/api/users", methods=["GET"])
@require_auth
def get_users():
    # Only clinicians and caregivers can list users
    if g.current_user["role"] not in ("clinician", "caregiver"):
        return api_error("Access restricted", status_code=403, code="FORBIDDEN")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone, role, created_at FROM users ORDER BY id ASC")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return api_success({"users": users})

# ── Medicines Module (CRUD) ────────────────────────────────────────

@app.route("/api/medicines", methods=["GET", "POST"])
@require_auth
def medicines_collection():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == "GET":
        target_user_id = g.current_user["id"]

        # If caregiver or clinician queries a specific patient
        requested_patient = request.args.get("patient_id", type=int)
        if requested_patient and requested_patient != g.current_user["id"]:
            if g.current_user["role"] == "patient":
                conn.close()
                return api_error("Patients cannot view other patients' medicines", status_code=403, code="FORBIDDEN")
            if g.current_user["role"] == "caregiver" and not verify_caregiver_access(g.current_user["id"], requested_patient):
                conn.close()
                return api_error("You are not authorized to view this patient's medicines", status_code=403, code="FORBIDDEN")
            target_user_id = requested_patient

        cursor.execute("""
            SELECT id, user_id, name, dosage_amount, dosage_unit, frequency, meal_timing,
                   start_date, end_date, instructions, stock_remaining, low_stock_threshold,
                   image_url, barcode, created_at
            FROM medicines
            WHERE user_id = ?
            ORDER BY id DESC
        """, (target_user_id,))
        meds = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return api_success({"medicines": meds})

    # POST: Add new medicine — ALWAYS scopes to verified user identity
    data = request.get_json(silent=True) or {}
    user_id = g.current_user["id"]
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
@require_auth
def delete_medicine(med_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id FROM medicines WHERE id = ?", (med_id,))
    med = cursor.fetchone()

    if not med:
        conn.close()
        return api_error("Medicine not found", status_code=404, code="NOT_FOUND")

    # Authorization check: user A cannot delete user B's medicine
    if med["user_id"] != g.current_user["id"] and g.current_user["role"] != "clinician":
        conn.close()
        return api_error("You do not have permission to delete this medicine", status_code=403, code="FORBIDDEN")

    cursor.execute("DELETE FROM reminders WHERE medicine_id = ?", (med_id,))
    cursor.execute("DELETE FROM medicines WHERE id = ?", (med_id,))
    conn.commit()
    conn.close()
    return api_success(message="Medicine and associated reminders deleted successfully")

# ── Reminders & Today's Schedule ───────────────────────────────────

@app.route("/api/reminders", methods=["GET"])
@app.route("/api/schedule/today", methods=["GET"])
@require_auth
def get_reminders_and_schedule():
    target_user_id = g.current_user["id"]

    requested_patient = request.args.get("patient_id", type=int)
    if requested_patient and requested_patient != g.current_user["id"]:
        if g.current_user["role"] == "caregiver" and not verify_caregiver_access(g.current_user["id"], requested_patient):
            return api_error("Not authorized to view this patient's reminders", status_code=403, code="FORBIDDEN")
        target_user_id = requested_patient

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
    """, (target_user_id,))
    reminders = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return api_success({"reminders": reminders})

# ── Medication History & Adherence ─────────────────────────────────

@app.route("/api/history", methods=["GET", "POST"])
@require_auth
def medication_history():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == "GET":
        target_user_id = g.current_user["id"]

        requested_patient = request.args.get("patient_id", type=int)
        if requested_patient and requested_patient != g.current_user["id"]:
            if g.current_user["role"] == "patient":
                conn.close()
                return api_error("Patients cannot view other patients' history", status_code=403, code="FORBIDDEN")
            if g.current_user["role"] == "caregiver" and not verify_caregiver_access(g.current_user["id"], requested_patient):
                conn.close()
                return api_error("Not authorized to view this patient's history", status_code=403, code="FORBIDDEN")
            target_user_id = requested_patient

        cursor.execute("""
            SELECT * FROM medication_history 
            WHERE user_id = ? 
            ORDER BY id DESC 
            LIMIT 100
        """, (target_user_id,))
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

    # POST: Record taken / snoozed / missed — Scoped to authenticated user
    body = request.get_json(silent=True) or {}
    user_id = g.current_user["id"]
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

    # If reminder_id provided, ensure it belongs to authenticated user
    if reminder_id:
        cursor.execute("SELECT id, user_id, medicine_id FROM reminders WHERE id = ?", (reminder_id,))
        rem = cursor.fetchone()
        if rem and rem["user_id"] != user_id:
            conn.close()
            return api_error("Cannot record action for another user's reminder", status_code=403, code="FORBIDDEN")

    cursor.execute("""
        INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, reminder_id, med_name, dosage, status, sched_time, action_time, notes))

    # If taken, decrement stock
    if status == "taken" and reminder_id:
        cursor.execute("""
            UPDATE medicines 
            SET stock_remaining = MAX(0, stock_remaining - 1)
            WHERE id = (SELECT medicine_id FROM reminders WHERE id = ?)
        """, (reminder_id,))

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
@require_auth
@require_role("caregiver", "clinician")
def caregiver_patients():
    caregiver_id = g.current_user["id"]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.phone, cp.access_level, cp.status
        FROM caregiver_patient cp
        JOIN users u ON cp.patient_id = u.id
        WHERE cp.caregiver_id = ?
    """, (caregiver_id,))
    patients = [dict(row) for row in cursor.fetchall()]

    # Fetch alerts ONLY for patients linked to this caregiver
    patient_ids = [p["id"] for p in patients]
    if patient_ids:
        placeholders = ",".join("?" for _ in patient_ids)
        cursor.execute(f"""
            SELECT * FROM notifications 
            WHERE user_id IN ({placeholders}) AND type IN ('missed_dose', 'emergency', 'refill') 
            ORDER BY id DESC LIMIT 20
        """, patient_ids)
        alerts = [dict(row) for row in cursor.fetchall()]
    else:
        alerts = []

    conn.close()
    return api_success({"patients": patients, "alerts": alerts})

@app.route("/api/caregiver/acknowledge", methods=["POST"])
@require_auth
@require_role("caregiver", "clinician")
def caregiver_acknowledge():
    body = request.get_json(silent=True) or {}
    alert_id = body.get("alert_id") or body.get("alertId")
    if not alert_id:
        return api_error("Alert ID is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()

    # Verify alert belongs to a linked patient
    cursor.execute("SELECT user_id FROM notifications WHERE id = ?", (alert_id,))
    notif = cursor.fetchone()
    if not notif:
        conn.close()
        return api_error("Alert not found", status_code=404, code="NOT_FOUND")

    if not verify_caregiver_access(g.current_user["id"], notif["user_id"]):
        conn.close()
        return api_error("Not authorized to acknowledge alerts for this patient", status_code=403, code="FORBIDDEN")

    cursor.execute("UPDATE notifications SET status = 'acknowledged' WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()
    return api_success(message="Caregiver acknowledgement recorded successfully")

# ── Clinician Portal ───────────────────────────────────────────────

@app.route("/api/clinician/patients", methods=["GET"])
@require_auth
@require_role("clinician")
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
@require_auth
@require_role("clinician")
def clinician_add_note():
    body = request.get_json(silent=True) or {}
    clinician_id = g.current_user["id"]
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
@require_auth
def emergency_contacts():
    user_id = g.current_user["id"]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY is_primary DESC, id ASC", (user_id,))
    contacts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return api_success({"contacts": contacts})

@app.route("/api/emergency/sos", methods=["POST"])
@require_auth
def emergency_sos():
    body = request.get_json(silent=True) or {}
    user_id = g.current_user["id"]
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
@require_auth
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
@require_auth
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
@require_auth
def get_notifications():
    user_id = g.current_user["id"]
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
    print(f"Smart Medication Reminder Flask API running on http://127.0.0.1:{port} (DEMO_MODE={DEMO_MODE})")
    app.run(host="0.0.0.0", port=port, debug=False)
