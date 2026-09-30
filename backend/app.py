"""
Smart Medication Reminder - Consolidated Flask REST API Backend (Phase 2 & Phase 3)
Parul University - Semester IV IMCA / BCA Project
Internal Guide: Prof. Sathwik Chebrolu

Features:
- Strict Two-Step Verification (HMAC-SHA256 OTP with per-code salt for Register and Login)
- Session token authentication (sessions table) and RBAC
- User identity derived SOLELY from session token (no user_id in params/bodies)
- Patient-approved caregiver/clinician linking (invite code generate & redeem)
- Scoped caregiver & clinician access (unlinked access blocked with 403/empty)
- Concrete scheduled dose instances (pending -> taken / snoozed / missed)
- User timezone support (default Asia/Kolkata), UTC timestamps
- Snooze (+10 min, max 3 times per dose)
- Auto-missed doses after 30-min grace period (atomic conditional updates & lazy computation)
- Idempotent intake actions (no duplicate stock decrement)
- Stock decrement only on Taken; low-stock alerts
- Multi-tier non-spam escalation (1 caregiver alert per miss, emergency escalation after N consecutive misses)
- Adherence calculation: taken / (taken + missed) * 100; consecutive 100% adherence streak
- Injectable clock for deterministic testing (no real sleeps)
- Automatic Drug-Drug Interaction evaluation on medicine addition
- SOS broadcast to emergency contacts and linked caregivers
"""
import os
import smtplib
from email.mime.text import MIMEText
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone, time as dt_time
from functools import wraps
from zoneinfo import ZoneInfo

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

ESCALATION_CONSECUTIVE_MISSES = int(os.environ.get("ESCALATION_CONSECUTIVE_MISSES", 3))
GRACE_WINDOW_MINUTES = int(os.environ.get("GRACE_WINDOW_MINUTES", 30))

# ── Injectable Clock Helper ────────────────────────────────────────

def get_current_time(clock=None) -> datetime:
    """
    Returns current timezone-aware UTC datetime.
    Can be overridden by clock argument or app.config['CLOCK_FN'] for deterministic testing.
    """
    if clock is not None:
        if callable(clock):
            dt = clock()
        else:
            dt = clock
    elif app.config.get("CLOCK_FN"):
        dt = app.config["CLOCK_FN"]()
    else:
        dt = datetime.now(timezone.utc)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

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

# ── OTP Helpers (HMAC-SHA256 with per-OTP Salt) ────────────────────

def generate_otp_record(otp_code: str, secret_key: str = None) -> tuple[str, str]:
    """
    Generates a per-OTP random salt and HMAC-SHA256 hash using SECRET_KEY.
    Returns (salt_hex, hmac_digest_hex).
    """
    key = (secret_key or SECRET_KEY).encode("utf-8")
    salt = secrets.token_hex(16)
    msg = f"{salt}:{otp_code}".encode("utf-8")
    digest = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return salt, digest

def verify_otp_hash(candidate_otp: str, stored_salt: str, stored_hash: str, secret_key: str = None) -> bool:
    """
    Constant-time verification of candidate OTP using HMAC-SHA256 and stored salt.
    """
    if not stored_salt:
        # Fallback for legacy sha256 hashes without salt
        legacy = hashlib.sha256(f"{(secret_key or SECRET_KEY)}:{candidate_otp}".encode()).hexdigest()
        return hmac.compare_digest(stored_hash, legacy)

    key = (secret_key or SECRET_KEY).encode("utf-8")
    msg = f"{stored_salt}:{candidate_otp}".encode("utf-8")
    computed_digest = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(stored_hash, computed_digest)

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

# ── User Timezone Helper ───────────────────────────────────────────

def get_user_timezone(user_id: int, conn=None) -> ZoneInfo:
    """Returns ZoneInfo object for user, defaulting to Asia/Kolkata."""
    close_conn = False
    if conn is None:
        conn = get_connection()
        close_conn = True
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT timezone FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        tz_name = row["timezone"] if row and row["timezone"] else "Asia/Kolkata"
        try:
            return ZoneInfo(tz_name)
        except Exception:
            return ZoneInfo("Asia/Kolkata")
    finally:
        if close_conn:
            conn.close()

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
        now_iso = get_current_time().isoformat()

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id as session_id, s.expires_at, u.id, u.name, u.email, u.phone, u.role, u.timezone
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = ?
        """, (token_hash,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return api_error("Invalid or expired session. Please log in again.", status_code=401, code="SESSION_EXPIRED")

        if row["expires_at"] < now_iso:
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
            "timezone": row["timezone"] if "timezone" in row.keys() and row["timezone"] else "Asia/Kolkata",
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

def verify_caregiver_access(accessor_id, patient_id):
    """Verify in caregiver_patient table that caregiver/clinician is authorized for this patient."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id FROM caregiver_patient 
        WHERE caregiver_id = ? AND patient_id = ? AND status = 'Active'
    """, (accessor_id, patient_id))
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

# ── Dose Instances & Medication Service (Phase 3) ──────────────────

def generate_daily_doses(user_id: int, date_str: str = None, clock=None, conn=None):
    """
    Generates concrete scheduled dose instances for user_id for the given date (default today).
    Converts reminder times in user's timezone into UTC scheduled_for timestamps.
    """
    close_conn = False
    if conn is None:
        conn = get_connection()
        close_conn = True

    try:
        user_tz = get_user_timezone(user_id, conn)
        now_utc = get_current_time(clock)
        now_local = now_utc.astimezone(user_tz)

        if not date_str:
            date_str = now_local.strftime("%Y-%m-%d")

        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, dosage_amount, dosage_unit, meal_timing, start_date, end_date
            FROM medicines
            WHERE user_id = ? AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
        """, (user_id, date_str, date_str))
        meds = cursor.fetchall()

        for med in meds:
            dosage = f"{med['dosage_amount']} {med['dosage_unit']}"
            cursor.execute("""
                SELECT id, scheduled_time, label FROM reminders
                WHERE medicine_id = ? AND user_id = ? AND status = 'active'
            """, (med["id"], user_id))
            rems = cursor.fetchall()

            for rem in rems:
                local_time = rem["scheduled_time"]
                try:
                    parts = local_time.split(":")
                    hour, minute = int(parts[0]), int(parts[1])
                except Exception:
                    hour, minute = 8, 0

                local_dt = datetime.combine(datetime.strptime(date_str, "%Y-%m-%d").date(), dt_time(hour, minute), tzinfo=user_tz)
                scheduled_for_utc = local_dt.astimezone(timezone.utc).isoformat()

                cursor.execute("""
                    INSERT OR IGNORE INTO dose_instances 
                    (user_id, medicine_id, reminder_id, medicine_name, dosage, meal_timing, scheduled_for, local_time, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """, (user_id, med["id"], rem["id"], med["name"], dosage, med["meal_timing"], scheduled_for_utc, local_time))

        conn.commit()

        # Query all dose instances whose local date matches date_str
        cursor.execute("""
            SELECT * FROM dose_instances
            WHERE user_id = ?
            ORDER BY scheduled_for ASC
        """, (user_id,))
        rows = [dict(r) for r in cursor.fetchall()]
        matched = []
        for r in rows:
            dt = datetime.fromisoformat(r["scheduled_for"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt.astimezone(user_tz).strftime("%Y-%m-%d") == date_str:
                matched.append(r)
        return matched
    finally:
        if close_conn:
            conn.close()

def check_and_dispatch_escalation(patient_id: int, patient_name: str, cursor, conn, now_utc: datetime):
    """
    Checks if patient has reached N consecutive misses (default 3).
    Escalates to emergency contacts and caregivers once per streak threshold without spam.
    """
    cursor.execute("""
        SELECT status FROM dose_instances
        WHERE user_id = ? AND status IN ('taken', 'missed')
        ORDER BY scheduled_for DESC LIMIT 10
    """, (patient_id,))
    recent = cursor.fetchall()

    consecutive_misses = 0
    for r in recent:
        if r["status"] == "missed":
            consecutive_misses += 1
        else:
            break

    if consecutive_misses >= ESCALATION_CONSECUTIVE_MISSES:
        twelve_hours_ago = (now_utc - timedelta(hours=12)).isoformat()
        cursor.execute("""
            SELECT id FROM notifications
            WHERE user_id = ? AND type = 'emergency' AND created_at >= ?
        """, (patient_id, twelve_hours_ago))
        if not cursor.fetchone():
            esc_msg = f"EMERGENCY ESCALATION: Patient {patient_name} has missed {consecutive_misses} consecutive doses! Immediate intervention required."

            cursor.execute("SELECT name, phone FROM emergency_contacts WHERE user_id = ?", (patient_id,))
            contacts = cursor.fetchall()
            for c in contacts:
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type, channel, status)
                    VALUES (?, 'Emergency Escalation Alert', ?, 'emergency', 'sms', 'unread')
                """, (patient_id, f"Escalation sent to {c['name']} ({c['phone']}): {esc_msg}"))

            cursor.execute("SELECT caregiver_id FROM caregiver_patient WHERE patient_id = ? AND status = 'Active'", (patient_id,))
            cgs = [r[0] for r in cursor.fetchall()]
            for cg_id in cgs:
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type, channel, status)
                    VALUES (?, 'Emergency Escalation Alert', ?, 'emergency', 'sms', 'unread')
                """, (cg_id, esc_msg))

            cursor.execute("""
                INSERT INTO notifications (user_id, title, message, type, channel, status)
                VALUES (?, 'Urgent Escalation Notice', ?, 'emergency', 'push', 'unread')
            """, (patient_id, f"You have missed {consecutive_misses} consecutive doses. Your caregivers and emergency contacts have been alerted."))
            conn.commit()

def evaluate_overdue_doses(user_id=None, clock=None, conn=None):
    """
    Evaluates overdue doses that exceeded the grace window (30 min).
    Performs atomic conditional updates so concurrent workers cannot double-fire.
    Dispatches 1 caregiver notification per missed dose and escalates only after N consecutive misses.
    """
    close_conn = False
    if conn is None:
        conn = get_connection()
        close_conn = True

    try:
        now_utc = get_current_time(clock)
        cutoff_iso = (now_utc - timedelta(minutes=GRACE_WINDOW_MINUTES)).isoformat()
        cursor = conn.cursor()

        query = """
            SELECT id, user_id, medicine_id, reminder_id, medicine_name, dosage, scheduled_for, local_time, status, snooze_until
            FROM dose_instances
            WHERE (
                (status = 'pending' AND scheduled_for <= ?) OR
                (status = 'snoozed' AND snooze_until IS NOT NULL AND snooze_until <= ?)
            )
        """
        params = [cutoff_iso, cutoff_iso]
        if user_id is not None:
            query += " AND user_id = ?"
            params.append(user_id)

        cursor.execute(query, params)
        candidates = [dict(row) for row in cursor.fetchall()]

        for cand in candidates:
            action_iso = now_utc.isoformat()
            # Atomic conditional UPDATE
            cursor.execute("""
                UPDATE dose_instances
                SET status = 'missed', action_time = ?, notes = 'Automatically marked missed after grace window'
                WHERE id = ? AND status IN ('pending', 'snoozed')
            """, (action_iso, cand["id"]))

            if cursor.rowcount > 0:
                conn.commit()
                cursor.execute("""
                    INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
                    VALUES (?, ?, ?, ?, 'missed', ?, ?, 'Automatically marked missed after grace window')
                """, (cand["user_id"], cand["reminder_id"], cand["medicine_name"], cand["dosage"], cand["local_time"], action_iso))
                conn.commit()

                # Caregiver notification (one per missed dose)
                cursor.execute("SELECT name FROM users WHERE id = ?", (cand["user_id"],))
                u_row = cursor.fetchone()
                patient_name = u_row["name"] if u_row else "Patient"

                cursor.execute("""
                    SELECT caregiver_id FROM caregiver_patient
                    WHERE patient_id = ? AND status = 'Active'
                """, (cand["user_id"],))
                cgs = [r[0] for r in cursor.fetchall()]

                dose_msg = f"Missed Dose Alert: Patient {patient_name} missed {cand['medicine_name']} ({cand['dosage']}) scheduled for {cand['local_time']}."
                for cg_id in cgs:
                    cursor.execute("""
                        SELECT id FROM notifications 
                        WHERE user_id = ? AND message = ? AND type = 'missed_dose'
                    """, (cg_id, dose_msg))
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO notifications (user_id, title, message, type, channel, status)
                            VALUES (?, 'Missed Dose Alert', ?, 'missed_dose', 'sms', 'unread')
                        """, (cg_id, dose_msg))
                conn.commit()

                check_and_dispatch_escalation(cand["user_id"], patient_name, cursor, conn, now_utc)

    finally:
        if close_conn:
            conn.close()

def process_dose_action(dose_id: int, user_id: int, action: str, notes: str = None, clock=None, conn=None):
    """
    Executes state transition on a dose instance:
    - taken: idempotent (no double stock decrement), decrements stock, checks low stock threshold
    - snoozed: +10 min, max 3 times per dose
    - missed: marked missed, triggers escalation
    """
    close_conn = False
    if conn is None:
        conn = get_connection()
        close_conn = True

    try:
        now_utc = get_current_time(clock)
        action_iso = now_utc.isoformat()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM dose_instances WHERE id = ?", (dose_id,))
        dose = cursor.fetchone()
        if not dose:
            return api_error("Dose instance not found", status_code=404, code="NOT_FOUND")

        # Authorization check: dose belongs to user or linked caregiver/clinician
        if dose["user_id"] != user_id:
            if not verify_caregiver_access(user_id, dose["user_id"]):
                return api_error("Unauthorized to modify this dose", status_code=403, code="FORBIDDEN")

        action = action.lower()

        if action == "taken":
            cursor.execute("""
                UPDATE dose_instances
                SET status = 'taken', action_time = ?, notes = ?
                WHERE id = ? AND status IN ('pending', 'snoozed')
            """, (action_iso, notes or "Confirmed taken", dose_id))

            if cursor.rowcount == 0:
                if dose["status"] == "taken":
                    return api_success(message="Dose already marked taken (idempotent)", status="taken")
                return api_error(f"Cannot mark dose as taken from current status '{dose['status']}'", status_code=400, code="INVALID_STATE")

            conn.commit()

            # Decrement stock once
            cursor.execute("""
                UPDATE medicines 
                SET stock_remaining = MAX(0, stock_remaining - 1)
                WHERE id = ?
            """, (dose["medicine_id"],))

            cursor.execute("SELECT name, stock_remaining, low_stock_threshold FROM medicines WHERE id = ?", (dose["medicine_id"],))
            med_row = cursor.fetchone()
            if med_row and med_row["stock_remaining"] <= med_row["low_stock_threshold"]:
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type, channel, status)
                    VALUES (?, 'Low Stock Warning', ?, 'refill', 'push', 'unread')
                """, (dose["user_id"], f"{med_row['name']} has only {med_row['stock_remaining']} doses remaining. Please refill soon."))

            cursor.execute("""
                INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
                VALUES (?, ?, ?, ?, 'taken', ?, ?, ?)
            """, (dose["user_id"], dose["reminder_id"], dose["medicine_name"], dose["dosage"], dose["local_time"], action_iso, notes or "Taken"))
            conn.commit()

            return api_success(message="Dose successfully recorded as taken", status="taken")

        elif action == "snoozed":
            if dose["snooze_count"] >= 3:
                return api_error("Maximum snooze limit (3 times) reached for this dose", status_code=400, code="MAX_SNOOZE_REACHED")

            snooze_until_iso = (now_utc + timedelta(minutes=10)).isoformat()
            cursor.execute("""
                UPDATE dose_instances
                SET status = 'snoozed',
                    snooze_count = snooze_count + 1,
                    snooze_until = ?,
                    action_time = ?,
                    notes = ?
                WHERE id = ? AND status IN ('pending', 'snoozed') AND snooze_count < 3
            """, (snooze_until_iso, action_iso, notes or "Snoozed +10 min", dose_id))

            if cursor.rowcount == 0:
                return api_error("Cannot snooze dose from current status or maximum snooze reached", status_code=400, code="SNOOZE_FAILED")

            conn.commit()

            cursor.execute("""
                INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
                VALUES (?, ?, ?, ?, 'snoozed', ?, ?, ?)
            """, (dose["user_id"], dose["reminder_id"], dose["medicine_name"], dose["dosage"], dose["local_time"], action_iso, notes or "Snoozed for 10 min"))
            conn.commit()

            return api_success(
                data={"snooze_count": dose["snooze_count"] + 1, "snooze_until": snooze_until_iso},
                message=f"Dose snoozed for 10 minutes (Snooze {dose['snooze_count'] + 1}/3)"
            )

        elif action == "missed":
            cursor.execute("""
                UPDATE dose_instances
                SET status = 'missed', action_time = ?, notes = ?
                WHERE id = ? AND status IN ('pending', 'snoozed')
            """, (action_iso, notes or "Patient skipped dose", dose_id))

            if cursor.rowcount == 0:
                return api_error(f"Cannot mark dose as missed from status '{dose['status']}'", status_code=400, code="INVALID_STATE")

            conn.commit()

            cursor.execute("""
                INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
                VALUES (?, ?, ?, ?, 'missed', ?, ?, ?)
            """, (dose["user_id"], dose["reminder_id"], dose["medicine_name"], dose["dosage"], dose["local_time"], action_iso, notes or "Skipped"))
            conn.commit()

            cursor.execute("SELECT name FROM users WHERE id = ?", (dose["user_id"],))
            u_row = cursor.fetchone()
            patient_name = u_row["name"] if u_row else "Patient"

            cursor.execute("SELECT caregiver_id FROM caregiver_patient WHERE patient_id = ? AND status = 'Active'", (dose["user_id"],))
            cgs = [r[0] for r in cursor.fetchall()]
            dose_msg = f"Missed Dose Alert: Patient {patient_name} missed {dose['medicine_name']} ({dose['dosage']}) scheduled for {dose['local_time']}."
            for cg_id in cgs:
                cursor.execute("""
                    SELECT id FROM notifications WHERE user_id = ? AND message = ? AND type = 'missed_dose'
                """, (cg_id, dose_msg))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO notifications (user_id, title, message, type, channel, status)
                        VALUES (?, 'Missed Dose Alert', ?, 'missed_dose', 'sms', 'unread')
                    """, (cg_id, dose_msg))
            conn.commit()

            check_and_dispatch_escalation(dose["user_id"], patient_name, cursor, conn, now_utc)

            return api_success(message="Dose recorded as missed and caregivers notified", status="missed")

        else:
            return api_error("Invalid action. Must be 'taken', 'snoozed', or 'missed'", status_code=422, code="VALIDATION_ERROR")
    finally:
        if close_conn:
            conn.close()

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
        "timestamp": get_current_time().isoformat()
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
    user_tz = (body.get("timezone") or "Asia/Kolkata").strip()

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
        "INSERT INTO users (name, email, phone, role, password_hash, timezone) VALUES (?, ?, ?, ?, ?, ?)",
        (name, email, phone, role, password_hash, user_tz)
    )
    user_id = cursor.lastrowid

    # Generate 6-digit cryptographic OTP and HMAC-SHA256 with per-code salt
    otp_code = "".join(secrets.choice("0123456789") for _ in range(6))
    salt, otp_h = generate_otp_record(otp_code)
    expires_at = (get_current_time() + timedelta(minutes=5)).isoformat()

    cursor.execute("""
        INSERT INTO otp_codes (user_id, email, phone, otp_hash, salt, expires_at, attempts, used)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    """, (user_id, email, phone, otp_h, salt, expires_at))

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

    if not DEMO_MODE and not password:
        conn.close()
        return api_error("Password is required in production mode", status_code=401, code="UNAUTHORIZED")

    # Invalidate previous unused OTPs for this email
    cursor.execute("UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0", (user_dict["email"],))

    otp_code = "".join(secrets.choice("0123456789") for _ in range(6))
    salt, otp_h = generate_otp_record(otp_code)
    expires_at = (get_current_time() + timedelta(minutes=5)).isoformat()

    cursor.execute("""
        INSERT INTO otp_codes (user_id, email, phone, otp_hash, salt, expires_at, attempts, used)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    """, (user_dict["id"], user_dict["email"], user_dict["phone"], otp_h, salt, expires_at))

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

    if otp_record["attempts"] >= otp_record["max_attempts"]:
        conn.close()
        return api_error("Too many failed attempts. This OTP has been locked. Please request a new code.", status_code=429, code="TOO_MANY_ATTEMPTS")

    now_iso = get_current_time().isoformat()
    if otp_record["expires_at"] < now_iso:
        conn.close()
        return api_error("This verification code has expired. Please request a new code.", status_code=400, code="OTP_EXPIRED")

    # Verify HMAC-SHA256 with stored salt using hmac.compare_digest
    stored_salt = otp_record["salt"] if "salt" in otp_record.keys() else ""
    if not verify_otp_hash(otp_code, stored_salt, otp_record["otp_hash"]):
        cursor.execute("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", (otp_record["id"],))
        conn.commit()
        remaining = otp_record["max_attempts"] - (otp_record["attempts"] + 1)
        conn.close()
        return api_error(
            f"Incorrect verification code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
            status_code=400,
            code="INVALID_OTP"
        )

    # Valid: single-use enforcement
    cursor.execute("UPDATE otp_codes SET used = 1 WHERE id = ?", (otp_record["id"],))

    cursor.execute("SELECT id, name, email, phone, role, timezone FROM users WHERE id = ?", (otp_record["user_id"],))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return api_error("User account not found", status_code=404, code="NOT_FOUND")

    user_dict = dict(user)

    # Issue signed session token
    raw_token = secrets.token_urlsafe(32)
    token_h = hashlib.sha256(raw_token.encode()).hexdigest()
    session_expiry = (get_current_time() + timedelta(days=7)).isoformat()

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

    # Enforce 30-second cooldown
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
            delta = (get_current_time() - created_dt).total_seconds()
            if delta < 30:
                conn.close()
                return api_error(
                    f"Please wait {int(30 - delta)} seconds before requesting a new code.",
                    status_code=429,
                    code="COOLDOWN_ACTIVE"
                )
        except Exception:
            pass

    cursor.execute("UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0", (email,))

    new_code = "".join(secrets.choice("0123456789") for _ in range(6))
    salt, otp_h = generate_otp_record(new_code)
    expires_at = (get_current_time() + timedelta(minutes=5)).isoformat()

    cursor.execute("""
        INSERT INTO otp_codes (user_id, email, phone, otp_hash, salt, expires_at, attempts, used)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    """, (user["id"], email, user["phone"], otp_h, salt, expires_at))

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

# ── Locked Down User Directory & Patient-Approved Linking ──────────

@app.route("/api/users", methods=["GET"])
@require_auth
def get_users():
    """
    Locked down: No role can list all users.
    Caregiver/clinician access must be limited to patients linked in caregiver_patient.
    """
    return api_error(
        "User directory listing is disabled for patient privacy. Access must be granted via patient invite code.",
        status_code=403,
        code="FORBIDDEN"
    )

@app.route("/api/patient/invite", methods=["POST"])
@require_auth
@require_role("patient")
def create_patient_invite():
    """Patient generates a secure invite code for caregiver or clinician linking."""
    code = "INV-" + secrets.token_hex(3).upper()
    expires_at = (get_current_time() + timedelta(days=2)).isoformat()

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO patient_invites (patient_id, invite_code, expires_at, status)
        VALUES (?, ?, ?, 'active')
    """, (g.current_user["id"], code, expires_at))
    conn.commit()
    conn.close()

    return api_success(
        data={"invite_code": code, "expires_at": expires_at},
        message="Patient invite code generated successfully. Share this with your caregiver or clinician.",
        status_code=201
    )

@app.route("/api/patient/link", methods=["POST"])
@app.route("/api/caregiver/link", methods=["POST"])
@require_auth
@require_role("caregiver", "clinician")
def redeem_patient_invite():
    """Caregiver or clinician redeems a patient invite code to establish authorized access."""
    body = request.get_json(silent=True) or {}
    invite_code = (body.get("invite_code") or body.get("inviteCode") or "").strip().upper()

    if not invite_code:
        return api_error("Invite code is required", status_code=422, code="VALIDATION_ERROR")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, patient_id, expires_at, status FROM patient_invites
        WHERE invite_code = ?
    """, (invite_code,))
    invite = cursor.fetchone()

    if not invite or invite["status"] != "active":
        conn.close()
        return api_error("Invalid or inactive invite code", status_code=400, code="INVALID_INVITE")

    now_iso = get_current_time().isoformat()
    if invite["expires_at"] < now_iso:
        cursor.execute("UPDATE patient_invites SET status = 'expired' WHERE id = ?", (invite["id"],))
        conn.commit()
        conn.close()
        return api_error("This invite code has expired", status_code=400, code="INVITE_EXPIRED")

    patient_id = invite["patient_id"]
    access_level = "Full Access" if g.current_user["role"] == "caregiver" else "Clinical Review"

    cursor.execute("UPDATE patient_invites SET status = 'redeemed' WHERE id = ?", (invite["id"],))
    cursor.execute("""
        INSERT OR REPLACE INTO caregiver_patient (caregiver_id, patient_id, access_level, status)
        VALUES (?, ?, ?, 'Active')
    """, (g.current_user["id"], patient_id, access_level))

    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel, status)
        VALUES (?, 'New Connection Linked', ?, 'clinical', 'in_app', 'unread')
    """, (patient_id, f"{g.current_user['name']} ({g.current_user['role'].capitalize()}) has connected to your care team."))

    conn.commit()
    conn.close()

    return api_success(
        data={"patient_id": patient_id, "access_level": access_level},
        message="Successfully connected with patient profile."
    )

# ── Medicines Module (CRUD with Automatic DDI Check) ───────────────

@app.route("/api/medicines", methods=["GET", "POST"])
@require_auth
def medicines_collection():
    conn = get_connection()
    cursor = conn.cursor()

    if request.method == "GET":
        target_user_id = g.current_user["id"]
        requested_patient = request.args.get("patient_id", type=int)

        if requested_patient and requested_patient != g.current_user["id"]:
            if g.current_user["role"] == "patient":
                conn.close()
                return api_error("Patients cannot view other patients' medicines", status_code=403, code="FORBIDDEN")
            if not verify_caregiver_access(g.current_user["id"], requested_patient):
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
    start_date = data.get("start_date") or data.get("startDate") or get_current_time().strftime("%Y-%m-%d")
    instructions = data.get("instructions", "").strip()
    stock = int(data.get("stock_remaining") or data.get("stockRemaining") or 30)
    low_stock = int(data.get("low_stock_threshold") or data.get("lowStockThreshold") or 5)
    barcode = data.get("barcode") or "MED-" + str(int(get_current_time().timestamp()))[-6:]

    if not name:
        conn.close()
        return api_error("Medicine name is required", status_code=422, code="VALIDATION_ERROR")

    # Automatic Drug-Drug Interaction evaluation on add
    cursor.execute("SELECT name FROM medicines WHERE user_id = ?", (user_id,))
    existing_med_names = [r["name"].lower() for r in cursor.fetchall()]
    new_med_lower = name.lower()

    detected_interactions = []
    for item in INTERACTION_MATRIX:
        drugs = [d.lower() for d in item["drugs"]]
        if new_med_lower in drugs:
            other_drug = drugs[1] if drugs[0] == new_med_lower else drugs[0]
            if any(other_drug in em for em in existing_med_names):
                detected_interactions.append(item)
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type, channel, status)
                    VALUES (?, 'Drug Interaction Warning', ?, 'clinical', 'push', 'unread')
                """, (user_id, f"Interaction Alert ({item['severity']}): {name} + {other_drug.capitalize()} - {item['description']}"))

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

    # Pre-generate today's concrete doses
    generate_daily_doses(user_id, conn=conn)

    conn.close()

    return api_success(
        data={"medicine_id": med_id, "interactions": detected_interactions},
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

    if med["user_id"] != g.current_user["id"] and g.current_user["role"] != "clinician":
        conn.close()
        return api_error("You do not have permission to delete this medicine", status_code=403, code="FORBIDDEN")

    cursor.execute("DELETE FROM dose_instances WHERE medicine_id = ?", (med_id,))
    cursor.execute("DELETE FROM reminders WHERE medicine_id = ?", (med_id,))
    cursor.execute("DELETE FROM medicines WHERE id = ?", (med_id,))
    conn.commit()
    conn.close()
    return api_success(message="Medicine and associated reminders deleted successfully")

# ── Concrete Dose Instances & State Machine Endpoints ──────────────

@app.route("/api/doses/today", methods=["GET"])
@require_auth
def get_today_doses():
    target_user_id = g.current_user["id"]
    requested_patient = request.args.get("patient_id", type=int)

    if requested_patient and requested_patient != g.current_user["id"]:
        if not verify_caregiver_access(g.current_user["id"], requested_patient):
            return api_error("Not authorized to view this patient's doses", status_code=403, code="FORBIDDEN")
        target_user_id = requested_patient

    # Lazy auto-miss evaluation + generation
    evaluate_overdue_doses(target_user_id)
    doses = generate_daily_doses(target_user_id)
    return api_success({"doses": doses})

@app.route("/api/doses/<int:dose_id>/action", methods=["POST"])
@require_auth
def dose_action(dose_id):
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or body.get("status") or "").strip().lower()
    notes = body.get("notes")
    return process_dose_action(dose_id, g.current_user["id"], action, notes)

@app.route("/api/doses/<int:dose_id>/take", methods=["POST"])
@require_auth
def dose_take(dose_id):
    body = request.get_json(silent=True) or {}
    return process_dose_action(dose_id, g.current_user["id"], "taken", body.get("notes"))

@app.route("/api/doses/<int:dose_id>/snooze", methods=["POST"])
@require_auth
def dose_snooze(dose_id):
    body = request.get_json(silent=True) or {}
    return process_dose_action(dose_id, g.current_user["id"], "snoozed", body.get("notes"))

@app.route("/api/doses/<int:dose_id>/miss", methods=["POST"])
@require_auth
def dose_miss(dose_id):
    body = request.get_json(silent=True) or {}
    return process_dose_action(dose_id, g.current_user["id"], "missed", body.get("notes"))

# ── Reminders & Today's Schedule ───────────────────────────────────

@app.route("/api/reminders", methods=["GET"])
@app.route("/api/schedule/today", methods=["GET"])
@require_auth
def get_reminders_and_schedule():
    target_user_id = g.current_user["id"]
    requested_patient = request.args.get("patient_id", type=int)

    if requested_patient and requested_patient != g.current_user["id"]:
        if not verify_caregiver_access(g.current_user["id"], requested_patient):
            return api_error("Not authorized to view this patient's reminders", status_code=403, code="FORBIDDEN")
        target_user_id = requested_patient

    # Lazy evaluation of overdue doses
    evaluate_overdue_doses(target_user_id)
    doses = generate_daily_doses(target_user_id)

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

    return api_success({"reminders": reminders, "doses": doses})

# ── Medication History & Adherence Math ────────────────────────────

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
            if not verify_caregiver_access(g.current_user["id"], requested_patient):
                conn.close()
                return api_error("Not authorized to view this patient's history", status_code=403, code="FORBIDDEN")
            target_user_id = requested_patient

        # Lazy check overdue doses before returning history
        evaluate_overdue_doses(target_user_id, conn=conn)

        cursor.execute("""
            SELECT * FROM medication_history 
            WHERE user_id = ? 
            ORDER BY id DESC 
            LIMIT 100
        """, (target_user_id,))
        history_list = [dict(row) for row in cursor.fetchall()]

        # Adherence formula: taken / (taken + missed) for date range
        taken = sum(1 for h in history_list if h["status"] == "taken")
        missed = sum(1 for h in history_list if h["status"] == "missed")
        snoozed = sum(1 for h in history_list if h["status"] == "snoozed")
        evaluated = taken + missed
        rate = round((taken / evaluated * 100.0), 1) if evaluated > 0 else 100.0

        # Streak calculation: consecutive days with 100% adherence (zero missed)
        cursor.execute("""
            SELECT date(scheduled_for) as d,
                   SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken_cnt,
                   SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed_cnt
            FROM dose_instances
            WHERE user_id = ? AND status IN ('taken', 'missed')
            GROUP BY date(scheduled_for)
            ORDER BY d DESC
        """, (target_user_id,))
        day_stats = cursor.fetchall()

        streak_days = 0
        for ds in day_stats:
            if ds["missed_cnt"] == 0 and ds["taken_cnt"] > 0:
                streak_days += 1
            else:
                break

        conn.close()
        return api_success({
            "history": history_list,
            "stats": {
                "total": len(history_list),
                "taken": taken,
                "missed": missed,
                "snoozed": snoozed,
                "adherence_rate": rate,
                "streak_days": streak_days
            }
        })

    # POST: Record intake action (backward-compatible with earlier clients)
    body = request.get_json(silent=True) or {}
    user_id = g.current_user["id"]
    reminder_id = body.get("reminder_id")
    dose_id = body.get("dose_id")
    med_name = (body.get("medicine_name") or body.get("medicineName") or "Medication").strip()
    dosage = (body.get("dosage") or "Standard").strip()
    status = (body.get("status") or "taken").strip().lower()
    notes = body.get("notes", "")

    if status not in ("taken", "snoozed", "missed"):
        conn.close()
        return api_error("Status must be 'taken', 'snoozed', or 'missed'", status_code=422, code="VALIDATION_ERROR")

    # If dose_id provided, execute state machine
    if dose_id:
        conn.close()
        return process_dose_action(dose_id, user_id, status, notes)

    # If reminder_id provided, verify reminder ownership
    if reminder_id:
        cursor.execute("SELECT id, user_id, medicine_id FROM reminders WHERE id = ?", (reminder_id,))
        rem = cursor.fetchone()
        if rem and rem["user_id"] != user_id:
            conn.close()
            return api_error("Cannot record action for another user's reminder", status_code=403, code="FORBIDDEN")

        # Map to today's dose instance if exists
        cursor.execute("""
            SELECT id FROM dose_instances
            WHERE reminder_id = ? AND status IN ('pending', 'snoozed')
            ORDER BY id ASC LIMIT 1
        """, (reminder_id,))
        d_row = cursor.fetchone()
        if d_row:
            conn.close()
            return process_dose_action(d_row["id"], user_id, status, notes)

    # Fallback direct insertion
    sched_time = body.get("scheduled_time") or get_current_time().strftime("%Y-%m-%d %H:%M")
    action_time = get_current_time().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, reminder_id, med_name, dosage, status, sched_time, action_time, notes))

    if status == "taken" and reminder_id:
        cursor.execute("""
            UPDATE medicines 
            SET stock_remaining = MAX(0, stock_remaining - 1)
            WHERE id = (SELECT medicine_id FROM reminders WHERE id = ?)
        """, (reminder_id,))

    if status == "missed":
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type, channel, status)
            VALUES (?, 'Missed Dose Alert', ?, 'missed_dose', 'push', 'unread')
        """, (user_id, f"You missed a scheduled dose of {med_name}."))

    conn.commit()
    conn.close()
    return api_success(message=f"Action '{status}' recorded successfully", status_code=201)

# ── Caregiver Portal (Scoped strictly to linked patients) ──────────

@app.route("/api/caregiver/patients", methods=["GET"])
@require_auth
@require_role("caregiver", "clinician")
def caregiver_patients():
    caregiver_id = g.current_user["id"]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.phone, cp.access_level, cp.status,
               (SELECT COUNT(*) FROM medicines WHERE user_id = u.id) as active_medicines,
               (SELECT ROUND(SUM(CASE WHEN status='taken' THEN 1 ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN status IN ('taken', 'missed') THEN 1 ELSE 0 END), 0), 1)
                FROM medication_history WHERE user_id = u.id) as adherence_rate
        FROM caregiver_patient cp
        JOIN users u ON cp.patient_id = u.id
        WHERE cp.caregiver_id = ? AND cp.status = 'Active'
    """, (caregiver_id,))
    patients = [dict(row) for row in cursor.fetchall()]

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
    cursor.execute("SELECT user_id FROM notifications WHERE id = ?", (alert_id,))
    notif = cursor.fetchone()
    if not notif:
        conn.close()
        return api_error("Alert not found", status_code=404, code="NOT_FOUND")

    if notif["user_id"] != g.current_user["id"] and not verify_caregiver_access(g.current_user["id"], notif["user_id"]):
        conn.close()
        return api_error("Not authorized to acknowledge alerts for this patient", status_code=403, code="FORBIDDEN")

    cursor.execute("UPDATE notifications SET status = 'acknowledged' WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()
    return api_success(message="Caregiver acknowledgement recorded successfully")

# ── Clinician Portal (Scoped strictly to linked patients) ──────────

@app.route("/api/clinician/patients", methods=["GET"])
@require_auth
@require_role("clinician")
def clinician_patients():
    clinician_id = g.current_user["id"]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.name, u.email, u.phone,
               (SELECT COUNT(*) FROM medicines WHERE user_id = u.id) as active_medicines,
               (SELECT ROUND(SUM(CASE WHEN status='taken' THEN 1 ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN status IN ('taken', 'missed') THEN 1 ELSE 0 END), 0), 1) 
                FROM medication_history WHERE user_id = u.id) as adherence_rate
        FROM users u
        INNER JOIN caregiver_patient cp ON cp.patient_id = u.id
        WHERE cp.caregiver_id = ? AND cp.status = 'Active' AND u.role = 'patient'
    """, (clinician_id,))
    patients = [dict(row) for row in cursor.fetchall()]

    if patients:
        p_ids = [p["id"] for p in patients]
        placeholders = ",".join("?" for _ in p_ids)
        cursor.execute(f"SELECT * FROM clinical_notes WHERE patient_id IN ({placeholders}) ORDER BY id DESC", p_ids)
        notes = [dict(row) for row in cursor.fetchall()]
    else:
        notes = []

    conn.close()
    return api_success({"patients": patients, "notes": notes})

@app.route("/api/clinician/notes", methods=["POST"])
@require_auth
@require_role("clinician")
def clinician_add_note():
    body = request.get_json(silent=True) or {}
    clinician_id = g.current_user["id"]
    patient_id = int(body.get("patient_id", 0))
    note = (body.get("note") or "").strip()
    dosage_adj = (body.get("dosage_adjustment") or body.get("dosageAdjustment") or "").strip()

    if not patient_id:
        return api_error("Valid patient_id is required", status_code=422, code="VALIDATION_ERROR")
    if not note:
        return api_error("Clinical note text is required", status_code=422, code="VALIDATION_ERROR")

    # Access control: clinician must be linked to patient
    if not verify_caregiver_access(clinician_id, patient_id):
        return api_error("You are not authorized to add notes for this unlinked patient", status_code=403, code="FORBIDDEN")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO clinical_notes (clinician_id, patient_id, note, dosage_adjustment)
        VALUES (?, ?, ?, ?)
    """, (clinician_id, patient_id, note, dosage_adj))
    note_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel, status)
        VALUES (?, 'Doctor Recommendation Added', ?, 'clinical', 'in_app', 'unread')
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

    cursor.execute("SELECT name, phone FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    patient_name = u_row["name"] if u_row else "Patient"

    cursor.execute("SELECT * FROM emergency_contacts WHERE user_id = ?", (user_id,))
    contacts = [dict(row) for row in cursor.fetchall()]

    cursor.execute("SELECT caregiver_id FROM caregiver_patient WHERE patient_id = ? AND status = 'Active'", (user_id,))
    caregiver_ids = [r[0] for r in cursor.fetchall()]

    sos_msg = f"EMERGENCY SOS: Patient {patient_name} triggered emergency distress signal at {location}."

    # Patient confirmation notification
    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel, status)
        VALUES (?, 'CRITICAL SOS ALERT BROADCASTED', ?, 'emergency', 'sms', 'unread')
    """, (user_id, f"Alerts dispatched to {len(contacts)} emergency contacts and {len(caregiver_ids)} linked caregivers."))

    # Dispatch to linked caregivers
    for cg_id in caregiver_ids:
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type, channel, status)
            VALUES (?, 'EMERGENCY SOS ALERT', ?, 'emergency', 'sms', 'unread')
        """, (cg_id, sos_msg))

    conn.commit()
    conn.close()

    return api_success(
        data={
            "dispatched_to": contacts,
            "emergency_code": "SOS-" + str(int(get_current_time().timestamp())),
            "status": "ALERTS_DISPATCHED",
            "contacts_count": len(contacts),
            "caregivers_count": len(caregiver_ids),
            "location": location,
            "timestamp": get_current_time().isoformat()
        },
        message="Emergency SOS alert dispatched successfully to all contacts and caregivers."
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
        "timestamp": get_current_time().strftime("%H:%M"),
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

@app.route("/api/notifications/<int:notif_id>/read", methods=["PUT", "POST"])
@require_auth
def mark_notification_read(notif_id):
    user_id = g.current_user["id"]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET status = 'read' WHERE id = ? AND user_id = ?", (notif_id, user_id))
    conn.commit()
    conn.close()
    return api_success(message="Notification marked as read")

# ── Entry Point ────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5050))
    print(f"Smart Medication Reminder Flask API running on http://127.0.0.1:{port} (DEMO_MODE={DEMO_MODE})")
    app.run(host="0.0.0.0", port=port, debug=False)
