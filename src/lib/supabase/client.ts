import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 * Returns null when env vars are not set yet — the dashboard then runs in
 * seeded demo mode so `npm run dev` works before you create a Supabase project.
 * See README.md for the 5-minute Supabase setup.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes("your-project-ref")) return null;
  if (!client) client = createClient(url, anonKey);
  return client;
}

export const isSupabaseConfigured = () => getSupabaseClient() !== null;
