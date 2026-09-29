#!/usr/bin/env python3
"""
Smart Medication Reminder - Direct Database E2E Verification Script
Parul University - Semester IV IMCA / BCA Project

Verifies the single source of truth architecture:
1. Registers a new user via API
2. Adds a new medication regimen for that user via API
3. Directly opens SQLite (bypassing API) to verify user, medicine, and auto-generated reminders
"""
import sys
import os
import sqlite3
import time

# Ensure backend directory is in python search path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import app
from database import DEFAULT_DB_PATH, init_db

def run_verification():
    print("=" * 70)
    print("PHASE 1 VERIFICATION: Direct SQLite Database Verification")
    print("=" * 70)

    # Ensure database is initialized
    init_db(DEFAULT_DB_PATH)

    timestamp = int(time.time())
    test_email = f"verified_patient_{timestamp}@paruluniversity.ac.in"
    test_name = f"E2E Patient {timestamp}"
    test_password = "E2E_Password_994!"

    with app.test_client() as client:
        # Step 1: Register User via API
        print(f"\n[1/3] Registering new user via API: {test_email}...")
        reg_payload = {
            "fullName": test_name,
            "email": test_email,
            "phone": "+91 98111 22333",
            "role": "patient",
            "password": test_password
        }
        reg_res = client.post("/api/auth/register", json=reg_payload)
        assert reg_res.status_code == 201, f"Registration failed: {reg_res.get_json()}"
        reg_data = reg_res.get_json()
        user_id = reg_data["user"]["id"]
        print(f" -> User created with ID: {user_id}")

        # Step 2: Add Medicine via API
        print(f"\n[2/3] Adding new medicine via API for user ID {user_id}...")
        med_payload = {
            "user_id": user_id,
            "name": "Levothyroxine Sodium",
            "dosage_amount": "50",
            "dosage_unit": "mcg",
            "frequency": "twice",
            "meal_timing": "before_food",
            "stock_remaining": 60,
            "low_stock_threshold": 10,
            "instructions": "Take first dose early morning on empty stomach with water."
        }
        med_res = client.post("/api/medicines", json=med_payload)
        assert med_res.status_code == 201, f"Medicine addition failed: {med_res.get_json()}"
        med_data = med_res.get_json()
        medicine_id = med_data["medicine_id"]
        print(f" -> Medicine created with ID: {medicine_id}")

    # Step 3: Direct Low-Level SQLite Query (Bypassing API completely)
    print(f"\n[3/3] Inspecting SQLite database file directly at: {DEFAULT_DB_PATH}...")
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Verify User in DB
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    assert user_row is not None, "ASSERTION FAILED: User row missing in SQLite users table"
    assert user_row["email"] == test_email, "ASSERTION FAILED: Email mismatch in DB"
    assert user_row["role"] == "patient", "ASSERTION FAILED: Role mismatch in DB"
    assert "$" in user_row["password_hash"], "ASSERTION FAILED: Password not hashed with salt$key PBKDF2"
    assert user_row["password_hash"] != test_password, "ASSERTION FAILED: Plaintext password detected in DB"
    print(" -> [PASS] User record verified directly in SQLite users table.")
    print(f"      - ID: {user_row['id']}")
    print(f"      - Name: {user_row['name']}")
    print(f"      - Email: {user_row['email']}")
    print(f"      - PBKDF2 Hash: {user_row['password_hash'][:24]}... (Length: {len(user_row['password_hash'])})")

    # Verify Medicine in DB
    cursor.execute("SELECT * FROM medicines WHERE id = ?", (medicine_id,))
    med_row = cursor.fetchone()
    assert med_row is not None, "ASSERTION FAILED: Medicine row missing in SQLite medicines table"
    assert med_row["name"] == "Levothyroxine Sodium", "ASSERTION FAILED: Medicine name mismatch"
    assert med_row["user_id"] == user_id, "ASSERTION FAILED: Foreign key user_id mismatch"
    assert med_row["dosage_amount"] == "50", "ASSERTION FAILED: Dosage amount mismatch"
    assert med_row["dosage_unit"] == "mcg", "ASSERTION FAILED: Dosage unit mismatch"
    assert med_row["stock_remaining"] == 60, "ASSERTION FAILED: Stock mismatch"
    print(" -> [PASS] Medicine record verified directly in SQLite medicines table.")
    print(f"      - ID: {med_row['id']}")
    print(f"      - User ID: {med_row['user_id']}")
    print(f"      - Name: {med_row['name']}")
    print(f"      - Dosage: {med_row['dosage_amount']} {med_row['dosage_unit']}")
    print(f"      - Stock: {med_row['stock_remaining']} units (Threshold: {med_row['low_stock_threshold']})")

    # Verify Associated Reminders in DB
    cursor.execute("SELECT * FROM reminders WHERE medicine_id = ? ORDER BY scheduled_time ASC", (medicine_id,))
    rem_rows = cursor.fetchall()
    assert len(rem_rows) == 2, f"ASSERTION FAILED: Expected 2 reminder rows for 'twice' daily, found {len(rem_rows)}"
    print(f" -> [PASS] Auto-generated reminders verified directly in SQLite reminders table ({len(rem_rows)} doses).")
    for idx, r in enumerate(rem_rows, 1):
        assert r["user_id"] == user_id
        assert r["medicine_id"] == medicine_id
        print(f"      - Dose {idx}: ID {r['id']} at {r['scheduled_time']} ({r['label']}) [status: {r['status']}]")

    conn.close()

    print("\n" + "=" * 70)
    print("ALL DIRECT DATABASE ASSERTIONS PASSED SUCCESSFULLY!")
    print("The database is confirmed as the single source of truth.")
    print("=" * 70)

if __name__ == "__main__":
    run_verification()
