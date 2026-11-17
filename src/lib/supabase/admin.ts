import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Service-role client. SERVER ONLY — bypasses RLS.
 * Used exclusively for sending Supabase Auth invitation emails after the
 * caller's permission was already verified through RLS-protected RPCs.
 * Returns null when the key is not configured (feature degrades gracefully).
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  const { url } = supabaseEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
