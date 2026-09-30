"""
Smart Medication Reminder - Database Initializer, Schema Migrations & Models (SQLite)
Parul University - Semester IV IMCA / BCA Project
Guide: Prof. Sathwik Chebrolu
"""
import sqlite3
import os
import hashlib
import hmac
import secrets
import argparse
from datetime import datetime, timedelta, timezone

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "medremind.db")

def get_connection(db_path=None):
    """
    Establish SQLite connection with foreign key enforcement and row factory.
    Respects DATABASE_PATH and DB_PATH env vars.
    """
    path = db_path or os.environ.get("DATABASE_PATH") or os.environ.get("DB_PATH") or DEFAULT_DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

# ── Password Security (PBKDF2-HMAC-SHA256) ─────────────────────────

def hash_password(password: str) -> str:
    """
    Hash a plaintext password using PBKDF2-HMAC-SHA256 with a unique random salt.
    Format: salt_hex$hash_hex
    """
    if not password:
        raise ValueError("Password cannot be empty")
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{salt.hex()}${key.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    """
    Verify a plaintext password against a stored PBKDF2 hash using constant-time comparison.
    Supports legacy mock hashes for graceful migration.
    """
    if not password or not stored_hash:
        return False

    # Check for legacy mock hash compatibility
    if stored_hash.startswith("hashed_"):
        return hmac.compare_digest(stored_hash, "hashed_" + password)
    if stored_hash == "sha256_mock_hash":
        return True

    if "$" not in stored_hash:
        return False

    try:
        salt_hex, key_hex = stored_hash.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
        return hmac.compare_digest(expected_key.hex(), key_hex)
    except Exception:
        return False

# ── Schema Definition & Migrations ─────────────────────────────────

SCHEMA_V1 = """
-- 1. Schema Migrations Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('patient', 'caregiver', 'clinician')),
    password_hash TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Medicines Table
CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dosage_amount TEXT NOT NULL,
    dosage_unit TEXT NOT NULL DEFAULT 'mg',
    frequency TEXT NOT NULL,
    meal_timing TEXT DEFAULT 'after_food',
    start_date TEXT NOT NULL,
    end_date TEXT,
    instructions TEXT,
    stock_remaining INTEGER DEFAULT 30,
    low_stock_threshold INTEGER DEFAULT 5,
    image_url TEXT,
    barcode TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medicine_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    scheduled_time TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
    sound_enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Medication History Table
CREATE TABLE IF NOT EXISTS medication_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id INTEGER,
    user_id INTEGER NOT NULL,
    medicine_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('taken', 'missed', 'snoozed')),
    scheduled_time TEXT NOT NULL,
    action_time TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Caregiver-Patient Mapping
CREATE TABLE IF NOT EXISTS caregiver_patient (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caregiver_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    access_level TEXT DEFAULT 'Full',
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Emergency Contacts Table
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. Notifications Log Table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('reminder', 'missed_dose', 'emergency', 'refill', 'clinical')),
    channel TEXT NOT NULL DEFAULT 'push',
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'acknowledged')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9. Clinical Notes Table
CREATE TABLE IF NOT EXISTS clinical_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinician_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    dosage_adjustment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (clinician_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. OTP Verification Codes Table (Phase 1/2/3 with per-OTP salt)
CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT NOT NULL,
    phone TEXT,
    otp_hash TEXT NOT NULL,
    salt TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 11. Sessions Table (Phase 1/2)
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 12. Patient Invites Table (Patient-Approved Linking)
CREATE TABLE IF NOT EXISTS patient_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'redeemed', 'expired')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 13. Concrete Scheduled Dose Instances Table (Phase 3)
CREATE TABLE IF NOT EXISTS dose_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medicine_id INTEGER NOT NULL,
    reminder_id INTEGER,
    medicine_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    meal_timing TEXT,
    scheduled_for TEXT NOT NULL,
    local_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'taken', 'snoozed', 'missed')),
    snooze_count INTEGER NOT NULL DEFAULT 0,
    snooze_until TEXT,
    action_time TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, medicine_id, scheduled_for),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
    FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE SET NULL
);

-- ── Indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_medicines_user ON medicines(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_med ON reminders(medicine_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON medication_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_patient_invites_code ON patient_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_doses_user_status ON dose_instances(user_id, status);
CREATE INDEX IF NOT EXISTS idx_doses_scheduled ON dose_instances(scheduled_for);
"""

SCHEMA_V2 = """
-- Migration V2: Add patient_invites and dose_instances tables
CREATE TABLE IF NOT EXISTS patient_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'redeemed', 'expired')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dose_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medicine_id INTEGER NOT NULL,
    reminder_id INTEGER,
    medicine_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    meal_timing TEXT,
    scheduled_for TEXT NOT NULL,
    local_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'taken', 'snoozed', 'missed')),
    snooze_count INTEGER NOT NULL DEFAULT 0,
    snooze_until TEXT,
    action_time TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, medicine_id, scheduled_for),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
    FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_invites_code ON patient_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_doses_user_status ON dose_instances(user_id, status);
CREATE INDEX IF NOT EXISTS idx_doses_scheduled ON dose_instances(scheduled_for);
"""

def apply_migrations(conn):
    """
    Apply database schema migrations.
    """
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cursor.execute("SELECT version FROM schema_migrations WHERE version = 1")
    if not cursor.fetchone():
        cursor.executescript(SCHEMA_V1)
        cursor.execute("INSERT INTO schema_migrations (version, name) VALUES (1, 'initial_production_schema');")
        cursor.execute("INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (2, 'phase_3_doses_and_invites');")
        conn.commit()
        return

    cursor.execute("SELECT version FROM schema_migrations WHERE version = 2")
    if not cursor.fetchone():
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';")
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute("ALTER TABLE otp_codes ADD COLUMN salt TEXT NOT NULL DEFAULT '';")
        except sqlite3.OperationalError:
            pass

        cursor.executescript(SCHEMA_V2)
        cursor.execute("INSERT INTO schema_migrations (version, name) VALUES (2, 'phase_3_doses_and_invites');")
        conn.commit()

def seed_data(cursor):
    """
    Seed initial baseline dataset for Parul University faculty demonstration.
    Uses PBKDF2 password hashes.
    """
    demo_password_hash = hash_password("DemoPassword123!")

    cursor.execute("""
        INSERT INTO users (id, name, email, phone, role, password_hash) VALUES
        (1, 'Himanshu Patel', 'himanshu@paruluniversity.ac.in', '+91 98765 43210', 'patient', ?),
        (2, 'Divyadarshan Chauhan', 'divyadarshan@paruluniversity.ac.in', '+91 98765 43211', 'caregiver', ?),
        (3, 'Prof. Sathwik Chebrolu', 'sathwik.chebrolu@paruluniversity.ac.in', '+91 98765 43212', 'clinician', ?)
    """, (demo_password_hash, demo_password_hash, demo_password_hash))

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    cursor.execute("""
        INSERT INTO medicines (id, user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock_remaining, low_stock_threshold, barcode) VALUES
        (1, 1, 'Metformin', '500', 'mg', 'twice', 'after_food', ?, 'Take with a glass of water after meals to minimize stomach upset.', 24, 6, 'MED-MET-500'),
        (2, 1, 'Atorvastatin', '20', 'mg', 'once', 'after_food', ?, 'Take in the evening before bedtime.', 18, 5, 'MED-ATO-020'),
        (3, 1, 'Lisinopril', '10', 'mg', 'once', 'before_food', ?, 'Take in the morning for blood pressure regulation.', 4, 5, 'MED-LIS-010'),
        (4, 1, 'Vitamin D3 & Calcium', '1000', 'IU', 'once', 'after_food', ?, 'Take once daily after breakfast.', 45, 10, 'MED-VIT-D03')
    """, (today, today, today, today))

    cursor.execute("""
        INSERT INTO reminders (id, medicine_id, user_id, scheduled_time, label, status) VALUES
        (1, 1, 1, '08:00', 'Morning Dose', 'active'),
        (2, 1, 1, '20:30', 'Night Dose', 'active'),
        (3, 2, 1, '21:00', 'Bedtime Dose', 'active'),
        (4, 3, 1, '07:30', 'Early Morning Dose', 'active'),
        (5, 4, 1, '09:00', 'Post Breakfast Dose', 'active')
    """)

    now = datetime.now(timezone.utc)
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    two_days_ago = (now - timedelta(days=2)).strftime("%Y-%m-%d")

    history_records = [
        (1, 4, 'Lisinopril', '10 mg', 'taken', f"{today} 07:30", f"{today} 07:32", 'Taken on time with water'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{today} 08:00", f"{today} 08:05", 'Taken after breakfast'),
        (1, 5, 'Vitamin D3 & Calcium', '1000 IU', 'snoozed', f"{today} 09:00", f"{today} 09:15", 'Snoozed for 15 mins during commute'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{yesterday} 08:00", f"{yesterday} 08:02", 'Taken on time'),
        (1, 2, 'Metformin', '500 mg', 'taken', f"{yesterday} 20:30", f"{yesterday} 20:35", 'Taken on time'),
        (1, 3, 'Atorvastatin', '20 mg', 'taken', f"{yesterday} 21:00", f"{yesterday} 21:03", 'Taken on time'),
        (1, 4, 'Lisinopril', '10 mg', 'missed', f"{two_days_ago} 07:30", f"{two_days_ago} 09:00", 'Patient missed dose - caregiver alert dispatched'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{two_days_ago} 08:00", f"{two_days_ago} 08:12", 'Taken late'),
        (1, 3, 'Atorvastatin', '20 mg', 'taken', f"{two_days_ago} 21:00", f"{two_days_ago} 21:05", 'Taken on time')
    ]

    for h in history_records:
        cursor.execute("""
            INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, h)

    # Seed data links may remain ONLY in DEMO_MODE
    is_demo = os.environ.get("DEMO_MODE", "true").lower() in ("true", "1", "yes")
    if is_demo:
        cursor.execute("""
            INSERT INTO caregiver_patient (caregiver_id, patient_id, access_level, status) VALUES
            (2, 1, 'Full Access & Emergency Escalation', 'Active')
        """)

        # Pre-seed demo dose instances for today
        demo_doses = [
            (1, 3, 4, 'Lisinopril', '10 mg', 'before_food', f"{today}T02:00:00Z", '07:30', 'taken', f"{today}T02:02:00Z"),
            (1, 1, 1, 'Metformin', '500 mg', 'after_food', f"{today}T02:30:00Z", '08:00', 'taken', f"{today}T02:35:00Z"),
            (1, 4, 5, 'Vitamin D3 & Calcium', '1000 IU', 'after_food', f"{today}T03:30:00Z", '09:00', 'pending', None),
            (1, 1, 2, 'Metformin', '500 mg', 'after_food', f"{today}T15:00:00Z", '20:30', 'pending', None),
            (1, 2, 3, 'Atorvastatin', '20 mg', 'after_food', f"{today}T15:30:00Z", '21:00', 'pending', None),
        ]
        for d in demo_doses:
            cursor.execute("""
                INSERT OR IGNORE INTO dose_instances 
                (user_id, medicine_id, reminder_id, medicine_name, dosage, meal_timing, scheduled_for, local_time, status, action_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, d)

    cursor.execute("""
        INSERT INTO emergency_contacts (user_id, name, phone, relation, is_primary) VALUES
        (1, 'Divyadarshan Chauhan', '+91 98765 43211', 'Primary Caregiver / Family', 1),
        (1, 'Parul Sevashram Hospital', '+91 2668 260300', 'Emergency Hospital Desk', 0),
        (1, 'Anuj Sharma', '+91 98765 43213', 'Emergency Contact / Colleague', 0)
    """)

    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel, status) VALUES
        (1, 'Low Stock Alert', 'Lisinopril 10mg has only 4 doses remaining. Please refill.', 'refill', 'push', 'unread'),
        (2, 'Missed Dose Alert', 'Patient Himanshu Patel missed Lisinopril scheduled for 07:30 AM.', 'missed_dose', 'sms', 'unread'),
        (1, 'Clinical Recommendation', 'Dr. Sathwik Chebrolu: BP readings look improved. Continue regular 10mg Lisinopril.', 'clinical', 'in_app', 'read')
    """)

    cursor.execute("""
        INSERT INTO clinical_notes (clinician_id, patient_id, note, dosage_adjustment) VALUES
        (3, 1, 'Patient compliance is at 89% over the past 14 days. Glycemic control is stable. Advised to stay consistent with morning Lisinopril timing.', 'Maintain current dosage of Metformin 500mg BID and Lisinopril 10mg OD.')
    """)

def init_db(db_path=None, force_reseed=False):
    """
    Initialize SQLite database, apply schema migrations, and seed default data.
    Ensures a fresh clone works immediately without an existing .db file in git.
    """
    conn = get_connection(db_path)
    apply_migrations(conn)

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]

    if count == 0 or force_reseed:
        if force_reseed and count > 0:
            cursor.execute("DELETE FROM dose_instances")
            cursor.execute("DELETE FROM patient_invites")
            cursor.execute("DELETE FROM medication_history")
            cursor.execute("DELETE FROM reminders")
            cursor.execute("DELETE FROM medicines")
            cursor.execute("DELETE FROM clinical_notes")
            cursor.execute("DELETE FROM notifications")
            cursor.execute("DELETE FROM emergency_contacts")
            cursor.execute("DELETE FROM caregiver_patient")
            cursor.execute("DELETE FROM otp_codes")
            cursor.execute("DELETE FROM sessions")
            cursor.execute("DELETE FROM users")

        seed_data(cursor)
        conn.commit()
        print(f"Database seeded successfully with default datasets.")

    conn.close()
    path = db_path or os.environ.get("DATABASE_PATH") or os.environ.get("DB_PATH", DEFAULT_DB_PATH)
    print(f"Database initialized successfully at: {path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MedRemind Database Management CLI")
    parser.add_argument("--init", action="store_true", help="Initialize schema and migrations")
    parser.add_argument("--seed", action="store_true", help="Force reseed default datasets")
    parser.add_argument("--db", type=str, default=None, help="Custom database path")
    args = parser.parse_args()

    init_db(db_path=args.db, force_reseed=args.seed)
