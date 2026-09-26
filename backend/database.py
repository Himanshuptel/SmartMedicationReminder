"""
Smart Medication Reminder - Database Initializer and Models (SQLite)
Parul University - Semester IV IMCA / BCA Project
Guide: Prof. Sathwik Chebrolu
"""
import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "medremind.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('patient', 'caregiver', 'clinician')),
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Medicines Table
    cursor.execute("""
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
    """)

    # 3. Reminders Table
    cursor.execute("""
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
    """)

    # 4. Medication History Table
    cursor.execute("""
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
    """)

    # 5. Caregiver-Patient Mapping
    cursor.execute("""
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
    """)

    # 6. Emergency Contacts Table
    cursor.execute("""
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
    """)

    # 7. Notifications Log Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('reminder', 'missed_dose', 'emergency', 'refill', 'clinical')),
        channel TEXT NOT NULL DEFAULT 'push',
        status TEXT NOT NULL DEFAULT 'unread',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 8. Clinical Notes Table
    cursor.execute("""
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
    """)

    conn.commit()

    # Seed data if users table is empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        seed_data(cursor)
        conn.commit()

    conn.close()
    print("Database initialized successfully at:", DB_PATH)

def seed_data(cursor):
    # Seed 3 core role users matching project report
    cursor.execute("""
        INSERT INTO users (id, name, email, phone, role, password_hash) VALUES
        (1, 'Himanshu Patel', 'himanshu@paruluniversity.ac.in', '+91 98765 43210', 'patient', 'sha256_mock_hash'),
        (2, 'Divyadarshan Chauhan', 'divyadarshan@paruluniversity.ac.in', '+91 98765 43211', 'caregiver', 'sha256_mock_hash'),
        (3, 'Prof. Sathwik Chebrolu', 'sathwik.chebrolu@paruluniversity.ac.in', '+91 98765 43212', 'clinician', 'sha256_mock_hash')
    """)

    today = datetime.now().strftime("%Y-%m-%d")

    # Seed medicines for patient
    cursor.execute("""
        INSERT INTO medicines (id, user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock_remaining, low_stock_threshold, barcode) VALUES
        (1, 1, 'Metformin', '500', 'mg', 'twice', 'after_food', ?, 'Take with a glass of water after meals to minimize stomach upset.', 24, 6, 'MED-MET-500'),
        (2, 1, 'Atorvastatin', '20', 'mg', 'once', 'after_food', ?, 'Take in the evening before bedtime.', 18, 5, 'MED-ATO-020'),
        (3, 1, 'Lisinopril', '10', 'mg', 'once', 'before_food', ?, 'Take in the morning for blood pressure regulation.', 4, 5, 'MED-LIS-010'),
        (4, 1, 'Vitamin D3 & Calcium', '1000', 'IU', 'once', 'after_food', ?, 'Take once daily after breakfast.', 45, 10, 'MED-VIT-D03')
    """, (today, today, today, today))

    # Seed reminders
    cursor.execute("""
        INSERT INTO reminders (id, medicine_id, user_id, scheduled_time, label, status) VALUES
        (1, 1, 1, '08:00', 'Morning Dose', 'active'),
        (2, 1, 1, '20:30', 'Night Dose', 'active'),
        (3, 2, 1, '21:00', 'Bedtime Dose', 'active'),
        (4, 3, 1, '07:30', 'Early Morning Dose', 'active'),
        (5, 4, 1, '09:00', 'Post Breakfast Dose', 'active')
    """)

    # Seed past medication history
    now = datetime.now()
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    two_days_ago = (now - timedelta(days=2)).strftime("%Y-%m-%d")

    history_records = [
        (1, 1, 'Lisinopril', '10 mg', 'taken', f"{today} 07:30", f"{today} 07:32", 'Taken on time with water'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{today} 08:00", f"{today} 08:05", 'Taken after breakfast'),
        (1, 1, 'Vitamin D3 & Calcium', '1000 IU', 'snoozed', f"{today} 09:00", f"{today} 09:15", 'Snoozed for 15 mins during commute'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{yesterday} 08:00", f"{yesterday} 08:02", 'Taken on time'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{yesterday} 20:30", f"{yesterday} 20:35", 'Taken on time'),
        (1, 1, 'Atorvastatin', '20 mg', 'taken', f"{yesterday} 21:00", f"{yesterday} 21:03", 'Taken on time'),
        (1, 1, 'Lisinopril', '10 mg', 'missed', f"{two_days_ago} 07:30", f"{two_days_ago} 09:00", 'Patient missed dose - caregiver alert dispatched'),
        (1, 1, 'Metformin', '500 mg', 'taken', f"{two_days_ago} 08:00", f"{two_days_ago} 08:12", 'Taken late'),
        (1, 1, 'Atorvastatin', '20 mg', 'taken', f"{two_days_ago} 21:00", f"{two_days_ago} 21:05", 'Taken on time')
    ]

    for h in history_records:
        cursor.execute("""
            INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, h)

    # Seed caregiver relation
    cursor.execute("""
        INSERT INTO caregiver_patient (caregiver_id, patient_id, access_level, status) VALUES
        (2, 1, 'Full Access & Emergency Escalation', 'Active')
    """)

    # Seed emergency contacts
    cursor.execute("""
        INSERT INTO emergency_contacts (user_id, name, phone, relation, is_primary) VALUES
        (1, 'Divyadarshan Chauhan', '+91 98765 43211', 'Primary Caregiver / Family', 1),
        (1, 'Parul Sevashram Hospital', '+91 2668 260300', 'Emergency Hospital Desk', 0),
        (1, 'Anuj Sharma', '+91 98765 43213', 'Emergency Contact / Colleague', 0)
    """)

    # Seed notifications
    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, channel, status) VALUES
        (1, 'Low Stock Alert', 'Lisinopril 10mg has only 4 doses remaining. Please refill.', 'refill', 'push', 'unread'),
        (2, 'Missed Dose Alert', 'Patient Himanshu Patel missed Lisinopril scheduled for 07:30 AM.', 'missed_dose', 'sms', 'unread'),
        (1, 'Clinical Recommendation', 'Dr. Sathwik Chebrolu: BP readings look improved. Continue regular 10mg Lisinopril.', 'clinical', 'in_app', 'read')
    """)

    # Seed clinical note
    cursor.execute("""
        INSERT INTO clinical_notes (clinician_id, patient_id, note, dosage_adjustment) VALUES
        (3, 1, 'Patient compliance is at 89% over the past 14 days. Glycemic control is stable. Advised to stay consistent with morning Lisinopril timing.', 'Maintain current dosage of Metformin 500mg BID and Lisinopril 10mg OD.')
    """)

if __name__ == "__main__":
    init_db()
