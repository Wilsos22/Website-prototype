// Server-only Supabase client (service role). The proficiency tables (mastery,
// mastery_history, recommendations) deny anon access entirely — all reads/writes
// go through API routes using this client. NEVER import from client components:
// SUPABASE_SERVICE_ROLE_KEY must not reach the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // build-safe, mirrors getSupabase()
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
