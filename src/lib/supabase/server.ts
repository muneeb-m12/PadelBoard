import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-only Supabase client (service role). Used by the cron switch-off route. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || url.includes("your-project-ref")) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
