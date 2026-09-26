"""
Smart Medication Reminder - Flask REST API Backend
Parul University - Semester IV IMCA / BCA Project
Guide: Prof. Sathwik Chebrolu
"""
import os
import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS
from database import init_db, get_connection

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), "medremind.db")

@app.before_request
def setup():
    if not os.path.exists(DB_PATH):
        init_db()

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "Smart Medication Reminder Flask API",
        "version": "1.0.0",
        "institution": "Parul University"
    })

@app.route("/api/medicines", methods=["GET", "POST"])
def medicines():
    conn = get_connection()
    cursor = conn.cursor()
    if request.method == "GET":
        user_id = request.args.get("user_id", 1)
        cursor.execute("SELECT * FROM medicines WHERE user_id = ? ORDER BY id DESC", (user_id,))
        meds = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify({"success": True, "medicines": meds})
    else:
        data = request.json or {}
        cursor.execute("""
            INSERT INTO medicines (user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock_remaining, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (data.get("user_id", 1), data.get("name"), data.get("dosage_amount", "100"), data.get("dosage_unit", "mg"),
              data.get("frequency", "once"), data.get("meal_timing", "after_food"), data.get("start_date"),
              data.get("instructions"), data.get("stock_remaining", 30), data.get("barcode", "MED-001")))
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return jsonify({"success": True, "medicine_id": new_id})

@app.route("/api/history", methods=["GET", "POST"])
def history():
    conn = get_connection()
    cursor = conn.cursor()
    if request.method == "GET":
        user_id = request.args.get("user_id", 1)
        cursor.execute("SELECT * FROM medication_history WHERE user_id = ? ORDER BY id DESC", (user_id,))
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify({"success": True, "history": logs})
    else:
        d = request.json or {}
        cursor.execute("""
            INSERT INTO medication_history (user_id, reminder_id, medicine_name, dosage, status, scheduled_time, action_time, notes)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
        """, (d.get("user_id", 1), d.get("reminder_id"), d.get("medicine_name"), d.get("dosage"), d.get("status"), d.get("scheduled_time"), d.get("notes")))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "History recorded"})

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port, debug=True)
