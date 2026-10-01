/**
 * Smart Medication Reminder - Direct Supabase Client
 * Parul University - IMCA / BCA Project
 *
 * Provides client-side direct access to Supabase Cloud PostgreSQL
 * for static deployments (e.g. GitHub Pages) and long-term cloud storage.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dtjalwifzgtwtezobjvr.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Hv_0U2iuiGszopnoDqD6Sw_wA2FCvIW';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function isSupabaseAvailable() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
