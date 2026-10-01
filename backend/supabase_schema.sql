-- ==============================================================================
-- Smart Medication Reminder - Supabase Cloud PostgreSQL Schema
-- Parul University - IMCA / BCA Project
-- Guide: Prof. Sathwik Chebrolu
-- 
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dtjalwifzgtwtezobjvr/sql
-- ==============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('patient', 'caregiver', 'clinician')),
    password_hash TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    totp_secret TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 2. Medicines Table
CREATE TABLE IF NOT EXISTS public.medicines (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Reminders Table
CREATE TABLE IF NOT EXISTS public.reminders (
    id SERIAL PRIMARY KEY,
    medicine_id INTEGER NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    scheduled_time TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
    sound_enabled INTEGER DEFAULT 1,
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Medication History Table
CREATE TABLE IF NOT EXISTS public.medication_history (
    id SERIAL PRIMARY KEY,
    reminder_id INTEGER REFERENCES public.reminders(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    medicine_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('taken', 'missed', 'snoozed')),
    scheduled_time TEXT NOT NULL,
    action_time TEXT NOT NULL,
    notes TEXT
);

-- 5. Caregiver-Patient Links
CREATE TABLE IF NOT EXISTS public.caregiver_patient (
    id SERIAL PRIMARY KEY,
    caregiver_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    access_level TEXT DEFAULT 'Full Access & Emergency Escalation',
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Emergency Contacts Table
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Notifications Log Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('reminder', 'missed_dose', 'emergency', 'refill', 'clinical')),
    channel TEXT NOT NULL DEFAULT 'push',
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'acknowledged')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Clinical Notes Table
CREATE TABLE IF NOT EXISTS public.clinical_notes (
    id SERIAL PRIMARY KEY,
    clinician_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    dosage_adjustment TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. OTP Verification Codes Table
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    phone TEXT,
    otp_hash TEXT NOT NULL,
    salt TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Patient Invites Table
CREATE TABLE IF NOT EXISTS public.patient_invites (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invite_code TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'redeemed', 'expired')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Dose Instances Table
CREATE TABLE IF NOT EXISTS public.dose_instances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    medicine_id INTEGER NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
-- Ensure unique constraint for dose idempotence
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_med_scheduled'
    ) THEN
        ALTER TABLE public.dose_instances 
        ADD CONSTRAINT uq_user_med_scheduled UNIQUE (user_id, medicine_id, scheduled_for);
    END IF;
END $$;

-- 13. Request Rate Limits Table
CREATE TABLE IF NOT EXISTS public.request_rate_limits (
    id SERIAL PRIMARY KEY,
    limiter_key TEXT NOT NULL,
    timestamp BIGINT NOT NULL
);

-- ── Performance Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_medicines_user ON public.medicines(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_med ON public.reminders(medicine_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON public.medication_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_email ON public.otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_patient_invites_code ON public.patient_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_doses_user_status ON public.dose_instances(user_id, status);
CREATE INDEX IF NOT EXISTS idx_doses_scheduled ON public.dose_instances(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_time ON public.request_rate_limits(limiter_key, timestamp);

-- ── Row Level Security (RLS) Permissive Access for Service Role ───
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_rate_limits ENABLE ROW LEVEL SECURITY;

-- Allow all service_role and backend operations:
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
