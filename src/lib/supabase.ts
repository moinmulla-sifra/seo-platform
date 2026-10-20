import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// These are intentionally public browser settings for the shared LocalPulse SaaS project.
// Supabase publishable keys are not secrets; tenant isolation is enforced by database RLS.
// Override through VITE_* values for a separate development/staging project.
const defaultProjectUrl = 'https://qrmglpizfjaoumbejcww.supabase.co';
const defaultPublishableKey = 'sb_publishable_3g6kOrgNK3PTgxOQszZtHw_UV9b0tzc';

const url = (import.meta.env.VITE_SUPABASE_URL || defaultProjectUrl).trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || defaultPublishableKey).trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);

/**
 * Only the public/publishable Supabase key belongs in a browser app.
 * Never put service_role keys or Google/Dodo private secrets in browser code or VITE_* variables.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
