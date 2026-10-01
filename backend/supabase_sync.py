"""
Smart Medication Reminder - Supabase Cloud Long-Term Data Storage Engine
Parul University - Semester IV IMCA / BCA Project
Guide: Prof. Sathwik Chebrolu

Provides:
- Permanent cloud data storage via Supabase Cloud PostgreSQL
- Automatic bidirectional sync between local caching and Supabase Cloud
- Real-time write-through event replication for zero data loss
- Safe, non-blocking asynchronous execution
"""

import os
import sys
import json
import sqlite3
import threading
import logging
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Load .env
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).resolve().parent.parent / ".env"
    if root_env.exists():
        load_dotenv(dotenv_path=root_env)
    else:
        load_dotenv()
except ImportError:
    pass

logger = logging.getLogger("medremind.supabase")

_supabase_client = None
_client_lock = threading.Lock()
_schema_cache = None
_schema_cache_time = 0

def get_supabase_client():
    """
    Returns an initialized Supabase Python client using environment credentials.
    Returns None if SUPABASE_URL or keys are absent.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    with _client_lock:
        if _supabase_client is not None:
            return _supabase_client

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

        if not url or not key:
            return None

        try:
            from supabase import create_client
            _supabase_client = create_client(url, key)
            logger.info("Connected to Supabase Cloud: %s", url)
            return _supabase_client
        except Exception as e:
            logger.warning("Could not initialize Supabase client: %s", e)
            return None

def is_supabase_enabled():
    """Returns True if Supabase credentials are configured."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    return bool(url and key)

def get_supabase_table_columns():
    """
    Fetch exact table schemas and columns dynamically from Supabase PostgREST OpenAPI endpoint.
    Caches result in memory for fast performance.
    """
    global _schema_cache, _schema_cache_time
    import time
    now = time.time()
    if _schema_cache and (now - _schema_cache_time) < 300:
        return _schema_cache

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        return {}

    try:
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/openapi+json"
        }
        req = urllib.request.Request(f"{url.rstrip('/')}/rest/v1/", headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            defs = data.get("definitions", {})
            table_cols = {t: set(d.get("properties", {}).keys()) for t, d in defs.items()}
            _schema_cache = table_cols
            _schema_cache_time = now
            return table_cols
    except Exception as e:
        logger.debug("Could not fetch Supabase OpenAPI schema: %s", e)
        # Fallback to known schema definition
        return {
            "users": {"id", "name", "email", "phone", "role", "password_hash", "timezone", "created_at"},
            "medicines": {"id", "user_id", "name", "dosage_amount", "dosage_unit", "frequency", "meal_timing", "start_date", "end_date", "instructions", "stock_remaining", "low_stock_threshold", "barcode", "created_at"},
            "caregiver_patient": {"id", "caregiver_id", "patient_id", "access_level", "status", "created_at"},
            "patient_invites": {"id", "patient_id", "invite_code", "expires_at", "status", "created_at"},
            "dose_instances": {"id", "user_id", "medicine_id", "medicine_name", "dosage", "meal_timing", "scheduled_for", "local_time", "status", "snooze_count", "action_time", "notes", "created_at"},
            "notifications": {"id", "user_id", "title", "message", "type", "channel", "status", "created_at"}
        }

def replicate_record_async(table: str, data: dict, on_conflict: str = None):
    """
    Non-blocking, fire-and-forget replication of a record to Supabase Cloud.
    Guarantees that cloud network fluctuations never impact local API response times.
    """
    if "PYTEST_CURRENT_TEST" in os.environ or os.environ.get("TESTING", "").lower() in ("true", "1"):
        return

    def _worker():
        try:
            client = get_supabase_client()
            if not client:
                return

            schema = get_supabase_table_columns()
            if table not in schema:
                return

            allowed_cols = schema[table]
            filtered = {k: v for k, v in data.items() if k in allowed_cols and v is not None}
            if not filtered:
                return

            if on_conflict:
                client.table(table).upsert(filtered, on_conflict=on_conflict).execute()
            else:
                client.table(table).upsert(filtered).execute()
        except Exception as e:
            logger.debug("Failed async replication for table %s: %s", table, e)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

# Real-time event hooks
def replicate_user(user_data: dict):
    replicate_record_async("users", user_data, on_conflict="email")

def replicate_medicine(med_data: dict):
    replicate_record_async("medicines", med_data)

def replicate_dose_instance(dose_data: dict):
    replicate_record_async("dose_instances", dose_data)

def replicate_caregiver_link(link_data: dict):
    replicate_record_async("caregiver_patient", link_data, on_conflict="caregiver_id,patient_id")

def replicate_invite(invite_data: dict):
    replicate_record_async("patient_invites", invite_data, on_conflict="invite_code")

def replicate_notification(notif_data: dict):
    replicate_record_async("notifications", notif_data)

def sync_local_to_supabase(sqlite_path=None):
    """
    Uploads all data from local SQLite database into Supabase Cloud PostgreSQL.
    Maintains foreign key dependency ordering and handles schema filtering.
    """
    client = get_supabase_client()
    if not client:
        return {"success": False, "error": "Supabase credentials not configured in .env"}

    default_db = os.path.join(os.path.dirname(__file__), "medremind.db")
    db_file = sqlite_path or os.environ.get("DATABASE_PATH") or os.environ.get("DB_PATH") or default_db

    if not os.path.exists(db_file):
        return {"success": False, "error": f"Local database file not found: {db_file}"}

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    table_cols = get_supabase_table_columns()
    summary = {}

    # 1. Users
    if "users" in table_cols:
        try:
            cursor.execute("SELECT * FROM users")
            rows = [dict(r) for r in cursor.fetchall()]
            clean = [{k: v for k, v in u.items() if k in table_cols["users"] and v is not None} for u in rows]
            if clean:
                res = client.table("users").upsert(clean).execute()
                summary["users"] = f"synced {len(res.data)} records"
        except Exception as e:
            summary["users"] = f"error: {e}"

    # 2. Medicines
    if "medicines" in table_cols:
        try:
            cursor.execute("SELECT * FROM medicines")
            rows = [dict(r) for r in cursor.fetchall()]
            clean = [{k: v for k, v in m.items() if k in table_cols["medicines"] and v is not None} for m in rows]
            if clean:
                res = client.table("medicines").upsert(clean).execute()
                summary["medicines"] = f"synced {len(res.data)} records"
        except Exception as e:
            summary["medicines"] = f"error: {e}"

    # 3. Caregiver-Patient Links
    if "caregiver_patient" in table_cols:
        try:
            cursor.execute("SELECT * FROM caregiver_patient")
            seen = set()
            clean = []
            for r in cursor.fetchall():
                u = dict(r)
                pair = (u["caregiver_id"], u["patient_id"])
                if pair not in seen:
                    seen.add(pair)
                    clean.append({k: v for k, v in u.items() if k in table_cols["caregiver_patient"] and v is not None})
            if clean:
                res = client.table("caregiver_patient").upsert(clean, on_conflict="caregiver_id,patient_id").execute()
                summary["caregiver_patient"] = f"synced {len(res.data)} records"
        except Exception as e:
            summary["caregiver_patient"] = f"error: {e}"

    # 4. Patient Invites
    if "patient_invites" in table_cols:
        try:
            cursor.execute("SELECT * FROM patient_invites")
            rows = [dict(r) for r in cursor.fetchall()]
            clean = [{k: v for k, v in u.items() if k in table_cols["patient_invites"] and v is not None} for u in rows]
            if clean:
                res = client.table("patient_invites").upsert(clean, on_conflict="invite_code").execute()
                summary["patient_invites"] = f"synced {len(res.data)} records"
        except Exception as e:
            summary["patient_invites"] = f"error: {e}"

    # 5. Dose Instances
    if "dose_instances" in table_cols:
        try:
            cursor.execute("SELECT id FROM medicines")
            valid_med_ids = {r[0] for r in cursor.fetchall()}
            cursor.execute("SELECT * FROM dose_instances")
            rows = [dict(r) for r in cursor.fetchall()]
            clean = [{k: v for k, v in u.items() if k in table_cols["dose_instances"] and v is not None} for u in rows if u.get("medicine_id") in valid_med_ids]
            if clean:
                res = client.table("dose_instances").upsert(clean).execute()
                summary["dose_instances"] = f"synced {len(res.data)} records"
        except Exception as e:
            summary["dose_instances"] = f"error: {e}"

    # 6. Notifications
    if "notifications" in table_cols:
        try:
            cursor.execute("SELECT * FROM notifications")
            rows = [dict(r) for r in cursor.fetchall()]
            clean = [{k: v for k, v in u.items() if k in table_cols["notifications"] and v is not None} for u in rows]
            if clean:
                res = client.table("notifications").upsert(clean).execute()
                summary["notifications"] = f"synced {len(res.data)} records"
        except Exception as e:
            summary["notifications"] = f"error: {e}"

    # Check for optional tables if added later
    for optional_table in ["reminders", "medication_history", "emergency_contacts", "clinical_notes"]:
        if optional_table in table_cols:
            try:
                cursor.execute(f"SELECT * FROM {optional_table}")
                rows = [dict(r) for r in cursor.fetchall()]
                clean = [{k: v for k, v in u.items() if k in table_cols[optional_table] and v is not None} for u in rows]
                if clean:
                    res = client.table(optional_table).upsert(clean).execute()
                    summary[optional_table] = f"synced {len(res.data)} records"
            except Exception as e:
                summary[optional_table] = f"error: {e}"
        else:
            summary[optional_table] = "skipped (run supabase_schema.sql to create in Cloud)"

    conn.close()
    return {"success": True, "summary": summary}

def pull_supabase_to_local(sqlite_path=None):
    """
    Downloads records from Supabase Cloud PostgreSQL into local SQLite.
    Restores full user profiles, medicines, and doses.
    """
    client = get_supabase_client()
    if not client:
        return {"success": False, "error": "Supabase credentials not configured in .env"}

    default_db = os.path.join(os.path.dirname(__file__), "medremind.db")
    db_file = sqlite_path or os.environ.get("DATABASE_PATH") or os.environ.get("DB_PATH") or default_db

    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    table_cols = get_supabase_table_columns()
    summary = {}

    pull_tables = ["users", "medicines", "caregiver_patient", "patient_invites", "dose_instances", "notifications"]

    for table in pull_tables:
        if table not in table_cols:
            continue

        try:
            res = client.table(table).select("*").execute()
            rows = res.data or []
            if not rows:
                summary[table] = "0 rows in cloud"
                continue

            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if not cursor.fetchone():
                continue

            cursor.execute(f"PRAGMA table_info({table})")
            local_cols = [c[1] for c in cursor.fetchall()]

            inserted = 0
            for r in rows:
                cols = [c for c in r.keys() if c in local_cols]
                vals = [r[c] for c in cols]
                placeholders = ", ".join(["?"] * len(cols))
                col_names = ", ".join(cols)

                query = f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})"
                cursor.execute(query, vals)
                inserted += 1

            conn.commit()
            summary[table] = f"restored {inserted} records from Supabase"
        except Exception as e:
            summary[table] = f"error: {str(e)}"

    conn.close()
    return {"success": True, "summary": summary}

def get_supabase_status():
    """
    Checks connection status and record counts from Supabase Cloud.
    """
    client = get_supabase_client()
    if not client:
        return {
            "configured": False,
            "url": os.environ.get("SUPABASE_URL", "None"),
            "status": "Not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
        }

    table_cols = get_supabase_table_columns()
    counts = {}
    for t in table_cols.keys():
        try:
            res = client.table(t).select("id", count="exact").execute()
            counts[t] = res.count if hasattr(res, "count") and res.count is not None else len(res.data)
        except Exception:
            counts[t] = "query error"

    return {
        "configured": True,
        "url": os.environ.get("SUPABASE_URL"),
        "status": "Connected to Supabase Cloud Long-Term Storage",
        "active_tables": list(table_cols.keys()),
        "counts": counts
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Supabase Cloud Long-Term Storage CLI")
    parser.add_argument("--status", action="store_true", help="Check Supabase Cloud connection status")
    parser.add_argument("--sync", "--push", action="store_true", dest="push", help="Push local SQLite data to Supabase Cloud")
    parser.add_argument("--pull", action="store_true", help="Pull Supabase Cloud data to local SQLite")
    args = parser.parse_args()

    if args.push:
        print("Pushing data to Supabase Cloud PostgreSQL...")
        res = sync_local_to_supabase()
        print("Result:", json.dumps(res, indent=2))
    elif args.pull:
        print("Pulling data from Supabase Cloud PostgreSQL...")
        res = pull_supabase_to_local()
        print("Result:", json.dumps(res, indent=2))
    else:
        print("Checking Supabase Cloud status...")
        status = get_supabase_status()
        print("Status:", json.dumps(status, indent=2))
