import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Doc §3 step 6 + §10: runs every minute (see vercel.json).
 * Marks checked-in sessions whose lights_off_at has passed as completed and
 * turns their courts' lights off — unless a manual override is active.
 * In demo mode (no Supabase keys) it simply reports that it is not configured.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "demo", message: "Supabase not configured — automatic switch-off runs in the browser in demo mode." });
  }
  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("bookings")
    .select("id, court_id")
    .eq("status", "checked_in")
    .lte("lights_off_at", nowIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let switchedOff = 0;
  for (const booking of due ?? []) {
    const { data: court } = await supabase.from("courts").select("manual_override").eq("id", booking.court_id).single();
    if (court?.manual_override) continue;
    await supabase.from("bookings").update({ status: "completed" }).eq("id", booking.id);
    await supabase.from("courts").update({ lights_on: false }).eq("id", booking.court_id);
    await supabase.from("light_log").insert({ court_id: booking.court_id, booking_id: booking.id, action: "off", reason: "automatic" });
    switchedOff++;
  }
  return NextResponse.json({ ok: true, switchedOff });
}
