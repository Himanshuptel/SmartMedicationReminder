/**
 * Smart Medication Reminder - Direct Supabase Client
 * Parul University - IMCA / BCA Project
 *
 * Provides:
 * - Direct client-side access to Supabase Cloud PostgreSQL
 * - Supabase Session Management & Cross-Database Email Existence Verification
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dtjalwifzgtwtezobjvr.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Hv_0U2iuiGszopnoDqD6Sw_wA2FCvIW';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

export function isSupabaseAvailable() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Retrieve current active Supabase session if one exists.
 */
export async function getSupabaseSession() {
  if (!isSupabaseAvailable()) return null;
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Sign out of current Supabase Auth session.
 */
export async function signOutSupabase() {
  if (!isSupabaseAvailable()) return;
  try {
    await supabase.auth.signOut();
  } catch {}
}

/**
 * Directly verify whether an email address exists in Supabase public.users table.
 */
export async function checkEmailInSupabase(email) {
  if (!isSupabaseAvailable() || !email) return { exists: false };
  try {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role')
      .ilike('email', cleanEmail)
      .limit(1);

    if (!error && data && data.length > 0) {
      return { exists: true, user: data[0] };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}
