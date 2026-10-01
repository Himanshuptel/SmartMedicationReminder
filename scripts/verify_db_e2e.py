#!/usr/bin/env python3
"""
Smart Medication Reminder - Direct Database E2E Verification Script (Phase 2 & Phase 3)
Parul University - Semester IV IMCA / BCA Project

Verifies the single source of truth architecture with Phase 2/3 authentication:
1. Uses a strictly isolated temporary SQLite database (DATABASE_PATH env var)
2. Registers a new user via API (receives OTP challenge, HMAC-SHA256 with salt)
3. Verifies 6-digit OTP and receives signed session token
4. Adds a new medication regimen using the session token (user identity derived from token)
5. Directly opens SQLite (bypassing API) to verify user, session, medicine, reminders, and concrete doses
6. Cleans up temporary database on finish
"""
import sys
import os
import sqlite3
import time
import tempfile

# Ensure backend directory is in python search path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Enforce temporary database for isolation - never touch backend/medremind.db
temp_fd, temp_db_path = tempfile.mkstemp(suffix="_e2e_verify.db")
os.environ["DATABASE_PATH"] = temp_db_path
os.environ["DEMO_MODE"] = "true"
os.environ["SECRET_KEY"] = "verification-script-secret-key-32chars"

from app import app
from database import init_db

def run_verification():
    print("=" * 70)
    print("E2E VERIFICATION: Two-Step Auth & Direct SQLite Database Verification")
    print(f"Isolated Temp DB: {temp_db_path}")
    print("=" * 70)

    try:
        # Initialize clean database schema
        init_db(temp_db_path, force_reseed=True)

        timestamp = int(time.time())
        test_email = f"verified_patient_{timestamp}@paruluniversity.ac.in"
        test_name = f"E2E Patient {timestamp}"
        test_password = "E2E_Password_994!"

        with app.test_client() as client:
            # Step 1: Register User via API
            print(f"\n[1/4] Registering new user via API: {test_email}...")
            reg_payload = {
                "fullName": test_name,
                "email": test_email,
                "phone": "+91 98111 22333",
                "role": "patient",
                "password": test_password,
                "timezone": "Asia/Kolkata"
            }
            reg_res = client.post("/api/auth/register", json=reg_payload)
            assert reg_res.status_code == 201, f"Registration failed: {reg_res.get_json()}"
            reg_data = reg_res.get_json()
            assert reg_data["requires_otp"] is True, "Expected requires_otp=True"
            assert "token" not in reg_data, "No token should be issued prior to OTP verification"
            print(f" -> Registration initiated. OTP dispatched to {test_email}.")

            # Step 2: Verify OTP and acquire session token
            otp = app.config.get("LAST_DISPATCHED_OTP", {}).get(test_email)
            assert otp is not None, "Failed to capture dispatched OTP in test environment"
            print(f"\n[2/4] Verifying 6-digit OTP ({otp}) to obtain session token...")

            ver_res = client.post("/api/auth/verify-otp", json={
                "email": test_email,
                "otp": otp
            })
            assert ver_res.status_code == 200, f"OTP verification failed: {ver_res.get_json()}"
            ver_data = ver_res.get_json()
            assert "token" in ver_data, "Expected token in verification response"
            token = ver_data["token"]
            user_id = ver_data["user"]["id"]
            print(f" -> Session token issued successfully for user ID {user_id}: {token[:12]}...")

            # Step 3: Add new medication via session token
            print(f"\n[3/4] Adding new medicine using session token (identity derived from token)...")
            med_payload = {
                "name": "Levothyroxine Sodium",
                "dosage_amount": "50",
                "dosage_unit": "mcg",
                "frequency": "twice",
                "meal_timing": "before_food",
                "stock_remaining": 60,
                "low_stock_threshold": 10,
                "instructions": "Take in the morning on an empty stomach with a full glass of water."
            }
            auth_headers = {"Authorization": f"Bearer {token}"}
            med_res = client.post("/api/medicines", json=med_payload, headers=auth_headers)
            assert med_res.status_code == 201, f"Adding medicine failed: {med_res.get_json()}"
            medicine_id = med_res.get_json()["medicine_id"]
            print(f" -> Medicine created with ID: {medicine_id}")

        # Step 4: Direct SQLite Database Assertions (Bypassing API completely)
        print(f"\n[4/4] Inspecting SQLite database file directly at: {temp_db_path}...")
        conn = sqlite3.connect(temp_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Verify User in DB
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        assert user_row is not None, "ASSERTION FAILED: User row missing in SQLite users table"
        assert user_row["email"] == test_email, "ASSERTION FAILED: User email mismatch"
        assert user_row["name"] == test_name, "ASSERTION FAILED: User name mismatch"
        assert user_row["timezone"] == "Asia/Kolkata", "ASSERTION FAILED: Timezone mismatch"
        print(" -> [PASS] User record verified directly in SQLite users table.")
        print(f"      - ID: {user_row['id']}")
        print(f"      - Name: {user_row['name']}")
        print(f"      - Email: {user_row['email']}")
        print(f"      - Timezone: {user_row['timezone']}")

        # Verify Session in DB
        cursor.execute("SELECT * FROM sessions WHERE user_id = ?", (user_id,))
        session_row = cursor.fetchone()
        assert session_row is not None, "ASSERTION FAILED: Session row missing in SQLite sessions table"
        assert session_row["role"] == "patient", "ASSERTION FAILED: Session role mismatch"
        print(" -> [PASS] Session record verified directly in SQLite sessions table.")
        print(f"      - Token Hash: {session_row['token_hash'][:24]}...")
        print(f"      - Expires At: {session_row['expires_at']}")

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
        print(f"      - User ID: {med_row['user_id']} (correctly mapped from session)")
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

        # Verify Concrete Dose Instances in DB (Phase 3)
        cursor.execute("SELECT * FROM dose_instances WHERE user_id = ? AND medicine_id = ? ORDER BY scheduled_for ASC", (user_id, medicine_id))
        d_rows = cursor.fetchall()
        assert len(d_rows) >= 2, f"ASSERTION FAILED: Expected concrete dose instances in dose_instances table, found {len(d_rows)}"
        print(f" -> [PASS] Concrete scheduled dose instances verified directly in SQLite dose_instances table ({len(d_rows)} instances).")

        conn.close()

        print("\n" + "=" * 70)
        print("ALL DIRECT DATABASE ASSERTIONS PASSED SUCCESSFULLY!")
        print("Two-step verification, concrete doses & session authorization operational.")
        print("=" * 70)

    finally:
        # Cleanup temporary database file
        try:
            os.close(temp_fd)
            if os.path.exists(temp_db_path):
                os.unlink(temp_db_path)
        except Exception:
            pass

if __name__ == "__main__":
    run_verification()
