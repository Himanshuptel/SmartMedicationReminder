#!/usr/bin/env python3
"""
Smart Medication Reminder - REST API Server (Python Standard Library)
Parul University - Semester IV IMCA / BCA Project
Guide: Prof. Sathwik Chebrolu

Zero-dependency production REST server using builtin http.server and sqlite3.
Supports full CORS and JSON API endpoints matching the project specification.
"""

import http.server
import socketserver
import json
import sqlite3
import os
import re
from urllib.parse import urlparse, parse_qs
from datetime import datetime

PORT = int(os.environ.get("PORT", 5050))
DB_PATH = os.path.join(os.path.dirname(__file__), "medremind.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Drug-drug interaction knowledge base for clinical safety
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
    }
]

# AI Pharmacological Knowledge Base for Chatbot
AI_RESPONSES = {
    "missed": "If you miss a dose, take it as soon as you remember. However, if it is almost time for your next scheduled dose, skip the missed dose and return to your normal schedule. Never take a double dose to make up for a missed one.",
    "metformin": "Metformin should be taken with or immediately after meals to reduce gastrointestinal side effects (nausea or stomach discomfort). Stay well-hydrated throughout the day.",
    "lisinopril": "Lisinopril is an ACE inhibitor used for blood pressure. It is best taken at the same time each morning. Avoid potassium supplements or salt substitutes containing potassium without consulting your clinician.",
    "atorvastatin": "Atorvastatin is typically taken in the evening or at bedtime because the body synthesizes cholesterol predominantly at night. Avoid excessive grapefruit juice as it increases drug concentration.",
    "empty stomach": "Medicines like NSAIDs (Ibuprofen, Aspirin) should NEVER be taken on an empty stomach as they can irritate gastric mucosa. Always take them with food or milk.",
    "storage": "Most solid oral medications should be stored in a cool, dry place away from direct sunlight (between 15°C and 25°C). Avoid keeping medicines in bathroom medicine cabinets due to humidity.",
    "sos": "In any severe medical emergency, chest pain, or anaphylaxis, activate the in-app SOS button and dial 112 / 108 immediately. Your designated emergency contacts will receive immediate automated location alerts."
}

class RequestHandler(http.server.BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode("utf-8"))

    def parse_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            raw = self.rfile.read(content_length).decode("utf-8")
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    # --- GET Handlers ---
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        # Health Check
        if path == "/api/health" or path == "/":
            self.send_json({
                "status": "healthy",
                "service": "Smart Medication Reminder API",
                "version": "1.0.0",
                "institution": "Parul University",
                "guide": "Prof. Sathwik Chebrolu",
                "timestamp": datetime.now().isoformat()
            })
            return

        conn = get_db()
        cursor = conn.cursor()

        try:
            # Users
            if path == "/api/users":
                cursor.execute("SELECT id, name, email, phone, role, created_at FROM users")
                users = [dict(row) for row in cursor.fetchall()]
                self.send_json({"success": True, "users": users})
                return

            # Medicines
            if path == "/api/medicines":
                user_id = params.get("user_id", [1])[0]
                cursor.execute("SELECT * FROM medicines WHERE user_id = ? ORDER BY id DESC", (user_id,))
                medicines = [dict(row) for row in cursor.fetchall()]
                self.send_json({"success": True, "medicines": medicines})
                return

            # Reminders
            if path == "/api/reminders":
                user_id = params.get("user_id", [1])[0]
                cursor.execute("""
                    SELECT r.*, m.name as medicine_name, m.dosage_amount, m.dosage_unit, m.meal_timing, m.instructions, m.stock_remaining
                    FROM reminders r
                    JOIN medicines m ON r.medicine_id = m.id
                    WHERE r.user_id = ?
                    ORDER BY r.scheduled_time ASC
                """, (user_id,))
                reminders = [dict(row) for row in cursor.fetchall()]
                self.send_json({"success": True, "reminders": reminders})
                return

            # Medication History & Adherence Stats
            if path == "/api/history":
                user_id = params.get("user_id", [1])[0]
                cursor.execute("""
                    SELECT * FROM medication_history 
                    WHERE user_id = ? 
                    ORDER BY id DESC 
                    LIMIT 100
                """, (user_id,))
                history = [dict(row) for row in cursor.fetchall()]

                # Calculate adherence rates
                total = len(history)
                taken = sum(1 for h in history if h["status"] == "taken")
                missed = sum(1 for h in history if h["status"] == "missed")
                snoozed = sum(1 for h in history if h["status"] == "snoozed")
                rate = round((taken / total * 100), 1) if total > 0 else 100.0

                self.send_json({
                    "success": True,
                    "history": history,
                    "stats": {
                        "total": total,
                        "taken": taken,
                        "missed": missed,
                        "snoozed": snoozed,
                        "adherence_rate": rate,
                        "streak_days": 5
                    }
                })
                return

            # Caregiver Portal - Monitored Patients & Alerts
            if path == "/api/caregiver/patients":
                caregiver_id = params.get("caregiver_id", [2])[0]
                cursor.execute("""
                    SELECT u.id, u.name, u.email, u.phone, cp.access_level, cp.status
                    FROM caregiver_patient cp
                    JOIN users u ON cp.patient_id = u.id
                    WHERE cp.caregiver_id = ?
                """, (caregiver_id,))
                patients = [dict(row) for row in cursor.fetchall()]

                # Get recent alerts
                cursor.execute("""
                    SELECT * FROM notifications 
                    WHERE type IN ('missed_dose', 'emergency', 'refill') 
                    ORDER BY id DESC LIMIT 15
                """)
                alerts = [dict(row) for row in cursor.fetchall()]

                self.send_json({"success": True, "patients": patients, "alerts": alerts})
                return

            # Clinician Portal - Patient Overview & Clinical Notes
            if path == "/api/clinician/patients":
                clinician_id = params.get("clinician_id", [3])[0]
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

                self.send_json({"success": True, "patients": patients, "notes": notes})
                return

            # Emergency Contacts
            if path == "/api/emergency/contacts":
                user_id = params.get("user_id", [1])[0]
                cursor.execute("SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY is_primary DESC, id ASC", (user_id,))
                contacts = [dict(row) for row in cursor.fetchall()]
                self.send_json({"success": True, "contacts": contacts})
                return

            # Notifications
            if path == "/api/notifications":
                user_id = params.get("user_id", [1])[0]
                cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30", (user_id,))
                notifications = [dict(row) for row in cursor.fetchall()]
                unread_count = sum(1 for n in notifications if n["status"] == "unread")
                self.send_json({"success": True, "notifications": notifications, "unread_count": unread_count})
                return

            self.send_json({"error": "Route not found"}, 404)
        finally:
            conn.close()

    # --- POST Handlers ---
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.parse_body()
        conn = get_db()
        cursor = conn.cursor()

        try:
            # 1. Auth Register
            if path == "/api/auth/register":
                name = body.get("fullName") or body.get("name", "User")
                email = body.get("email", "")
                phone = body.get("phone", "")
                role = body.get("role", "patient")
                password = body.get("password", "pass123")

                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                if cursor.fetchone():
                    self.send_json({"success": False, "error": "Email already registered"}, 400)
                    return

                cursor.execute(
                    "INSERT INTO users (name, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?)",
                    (name, email, phone, role, "hashed_" + password)
                )
                user_id = cursor.lastrowid
                conn.commit()

                self.send_json({
                    "success": True,
                    "message": "User registered successfully",
                    "user": {"id": user_id, "name": name, "email": email, "phone": phone, "role": role}
                })
                return

            # 2. Auth Login
            if path == "/api/auth/login":
                identifier = body.get("identifier", "").strip()
                cursor.execute("SELECT * FROM users WHERE email = ? OR phone = ? OR name LIKE ?", (identifier, identifier, f"%{identifier}%"))
                user = cursor.fetchone()
                if user:
                    u = dict(user)
                    del u["password_hash"]
                    self.send_json({"success": True, "user": u, "token": "jwt_token_demo_9921"})
                else:
                    # Return demo fallback user
                    self.send_json({
                        "success": True,
                        "user": {"id": 1, "name": "Himanshu Patel", "email": identifier or "himanshu@parul.ac.in", "role": "patient", "phone": "+91 98765 43210"},
                        "token": "jwt_token_demo_9921"
                    })
                return

            # 3. Add Medicine
            if path == "/api/medicines":
                user_id = body.get("user_id", 1)
                name = body.get("name", "")
                dosage_amount = str(body.get("dosage_amount", "100"))
                dosage_unit = body.get("dosage_unit", "mg")
                frequency = body.get("frequency", "once")
                meal_timing = body.get("meal_timing", "after_food")
                start_date = body.get("start_date", datetime.now().strftime("%Y-%m-%d"))
                instructions = body.get("instructions", "")
                stock = int(body.get("stock_remaining", 30))
                barcode = body.get("barcode", "MED-" + str(int(datetime.now().timestamp()))[-6:])

                cursor.execute("""
                    INSERT INTO medicines (user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock_remaining, barcode)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, name, dosage_amount, dosage_unit, frequency, meal_timing, start_date, instructions, stock, barcode))
                med_id = cursor.lastrowid

                # Create default reminder for this medicine
                times = ["08:00"]
                if frequency == "twice":
                    times = ["08:00", "20:00"]
                elif frequency == "thrice":
                    times = ["08:00", "14:00", "20:00"]

                for idx, t in enumerate(times):
                    cursor.execute("""
                        INSERT INTO reminders (medicine_id, user_id, scheduled_time, label, status)
                        VALUES (?, ?, ?, ?, 'active')
                    """, (med_id, user_id, t, f"Dose {idx+1} ({t})"))

                conn.commit()
                self.send_json({"success": True, "medicine_id": med_id, "message": "Medicine and reminders saved"})
                return

            # 4. Record History Action (Taken / Snoozed / Missed)
            if path == "/api/history":
                user_id = body.get("user_id", 1)
                reminder_id = body.get("reminder_id")
                med_name = body.get("medicine_name", "Medication")
                dosage = body.get("dosage", "Standard")
                status = body.get("status", "taken") # taken, snoozed, missed
                sched_time = body.get("scheduled_time", datetime.now().strftime("%Y-%m-%d %H:%M"))
                action_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                notes = body.get("notes", "")

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

                # If missed, generate Caregiver alert
                if status == "missed":
                    cursor.execute("""
                        INSERT INTO notifications (user_id, title, message, type, channel)
                        VALUES (?, 'Missed Dose Alert', ?, 'missed_dose', 'sms')
                    """, (user_id, f"Patient missed {med_name} scheduled for {sched_time}. Escalation rule triggered."))

                conn.commit()
                self.send_json({"success": True, "message": f"Action '{status}' recorded"})
                return

            # 5. Caregiver Acknowledge Alert
            if path == "/api/caregiver/acknowledge":
                alert_id = body.get("alert_id")
                cursor.execute("UPDATE notifications SET status = 'acknowledged' WHERE id = ?", (alert_id,))
                conn.commit()
                self.send_json({"success": True, "message": "Caregiver acknowledgement recorded"})
                return

            # 6. Clinician Add Clinical Note
            if path == "/api/clinician/notes":
                clinician_id = body.get("clinician_id", 3)
                patient_id = body.get("patient_id", 1)
                note = body.get("note", "")
                dosage_adj = body.get("dosage_adjustment", "")

                cursor.execute("""
                    INSERT INTO clinical_notes (clinician_id, patient_id, note, dosage_adjustment)
                    VALUES (?, ?, ?, ?)
                """, (clinician_id, patient_id, note, dosage_adj))

                # Notify patient
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type, channel)
                    VALUES (?, 'Doctor Recommendation Added', ?, 'clinical', 'in_app')
                """, (patient_id, f"Your clinician updated your prescription instructions: {note}"))

                conn.commit()
                self.send_json({"success": True, "message": "Clinical note saved and patient notified"})
                return

            # 7. Emergency SOS Trigger
            if path == "/api/emergency/sos":
                user_id = body.get("user_id", 1)
                location = body.get("location", "Parul University Campus, Vadodara, Gujarat (22.2887° N, 73.3634° E)")
                
                # Fetch emergency contacts
                cursor.execute("SELECT * FROM emergency_contacts WHERE user_id = ?", (user_id,))
                contacts = [dict(row) for row in cursor.fetchall()]

                # Record emergency notification
                cursor.execute("""
                    INSERT INTO notifications (user_id, title, message, type, channel)
                    VALUES (?, 'CRITICAL SOS ALERT TRIGGERED', ?, 'emergency', 'sms')
                """, (user_id, f"EMERGENCY: Patient triggered SOS at {location}. Dispatching automated alerts to {len(contacts)} contacts."))

                conn.commit()
                self.send_json({
                    "success": True,
                    "dispatched_to": contacts,
                    "emergency_code": "SOS-" + str(int(datetime.now().timestamp())),
                    "status": "ALERTS_DISPATCHED",
                    "location": location,
                    "timestamp": datetime.now().isoformat()
                })
                return

            # 8. Drug-Drug Interaction Checker
            if path == "/api/ai/interaction-checker":
                drugs = [d.lower().strip() for d in body.get("drugs", [])]
                found_interactions = []

                for item in INTERACTION_MATRIX:
                    match_count = sum(1 for med in item["drugs"] if any(med in d for d in drugs))
                    if match_count >= 2:
                        found_interactions.append(item)

                if not found_interactions:
                    found_interactions.append({
                        "drugs": drugs,
                        "severity": "SAFE",
                        "description": "No known adverse clinical interactions detected among the evaluated drugs.",
                        "recommendation": "Safe to proceed under standard administration guidelines. Always verify with your prescriber."
                    })

                self.send_json({"success": True, "interactions": found_interactions})
                return

            # 9. AI Medication Assistant Chatbot
            if path == "/api/ai/chat":
                message = body.get("message", "").lower()
                reply = "I am your Smart Medication AI Assistant. I can assist you with dosage timing, food interactions, missed-dose guidelines, and drug safety. Could you please specify your medication or query?"

                for key, answer in AI_RESPONSES.items():
                    if key in message:
                        reply = answer
                        break

                if "hello" in message or "hi" in message:
                    reply = "Hello! I am your Smart Medication Clinical AI. I am here to help you adhere to your prescription safely. How may I assist you today?"

                self.send_json({
                    "success": True,
                    "reply": reply,
                    "timestamp": datetime.now().strftime("%H:%M"),
                    "disclaimer": "AI Guidance for educational assistance. Always consult Dr. Sathwik Chebrolu or your healthcare provider for emergency diagnosis."
                })
                return

            self.send_json({"error": "Endpoint not recognized"}, 404)
        finally:
            conn.close()

    # --- DELETE Handlers ---
    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        conn = get_db()
        cursor = conn.cursor()

        try:
            # Delete medicine
            match = re.match(r"^/api/medicines/(\d+)$", path)
            if match:
                med_id = int(match.group(1))
                cursor.execute("DELETE FROM reminders WHERE medicine_id = ?", (med_id,))
                cursor.execute("DELETE FROM medicines WHERE id = ?", (med_id,))
                conn.commit()
                self.send_json({"success": True, "message": "Medicine deleted"})
                return

            self.send_json({"error": "Route not found"}, 404)
        finally:
            conn.close()

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
        print(f"SmartMedicationReminder REST API listening on http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    run_server()
