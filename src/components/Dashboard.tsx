"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Booking, Court, LightLogEntry, ClubSettings } from "@/lib/types";
import { canCheckIn, formatHour, hasOverlap, lightsOffTime } from "@/lib/rules";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const uid = () => Math.random().toString(36).slice(2, 10);

function seed(): { courts: Court[]; bookings: Booking[]; log: LightLogEntry[] } {
  const now = new Date();
  const h = Math.min(21, Math.max(16, now.getHours()));
  const courts: Court[] = [
    { id: "c1", name: "Court 1", manualLightsOn: false, manualOverride: false },
    { id: "c2", name: "Court 2", manualLightsOn: false, manualOverride: false },
    { id: "c3", name: "Court 3", manualLightsOn: false, manualOverride: false },
  ];
  const checkedIn1 = new Date(now.getTime() - 19 * 60_000);
  const checkedIn3 = new Date(now.getTime() - 47 * 60_000);
  const bookings: Booking[] = [
    { id: uid(), courtId: "c1", customerName: "Ali", customerPhone: "0300 0000001", startHour: h, durationHours: 1, status: "checked_in", checkedInAt: checkedIn1, lightsOffAt: lightsOffTime(checkedIn1, 1) },
    { id: uid(), courtId: "c3", customerName: "Sara", customerPhone: "0300 0000002", startHour: h, durationHours: 1, status: "checked_in", checkedInAt: checkedIn3, lightsOffAt: lightsOffTime(checkedIn3, 1) },
    { id: uid(), courtId: "c2", customerName: "Hamza", customerPhone: "0300 0000003", startHour: h + 1 <= 23 ? h + 1 : h, durationHours: 1, status: "booked", checkedInAt: null, lightsOffAt: null },
  ];
  const log: LightLogEntry[] = [
    { id: uid(), courtName: "Court 1", action: "on", reason: "check_in", at: checkedIn1 },
    { id: uid(), courtName: "Court 3", action: "on", reason: "check_in", at: checkedIn3 },
  ];
  return { courts, bookings, log };
}

function countdown(offAt: Date | null, now: Date): string {
  if (!offAt) return "";
  const ms = offAt.getTime() - now.getTime();
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Dashboard() {
  const initial = useMemo(() => seed(), []);
  const [courts, setCourts] = useState<Court[]>(initial.courts);
  const [bookings, setBookings] = useState<Booking[]>(initial.bookings);
  const [log, setLog] = useState<LightLogEntry[]>(initial.log);
  const [settings, setSettings] = useState<ClubSettings>({ lightingPowerKw: 2, electricityPricePerUnit: 50, noShowWaitMinutes: 15, openingHour: 10, closingHour: 23 });
  const [now, setNow] = useState(() => new Date());
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", courtId: "c1", startHour: 19, durationHours: 1 });
  const [showForm, setShowForm] = useState(false);

  // tick every second for countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // A session is live only until its lights-off time. Light state is DERIVED
  // from this (see lightsOnFor below), never stored separately — a stored copy
  // is what previously let a court keep showing "Lights ON" after time was up.
  const liveSessionForCourt = (courtId: string, at: Date) =>
    bookings.find((b) => b.courtId === courtId && b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > at);

  /** Effective light state: manual override wins; otherwise on only while a session is live. */
  const lightsOnFor = (court: Court, at: Date) =>
    court.manualOverride ? court.manualLightsOn : liveSessionForCourt(court.id, at) !== undefined;

  // Doc §3 step 6: when time is up, complete the booking and log the automatic
  // switch-off (unless staff forced the lights on — then they stay on, Doc §5).
  // Runs outside any state updater, once per booking (guarded by a ref).
  const completedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const due = bookings.filter(
      (b) => b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt <= now && !completedRef.current.has(b.id)
    );
    if (due.length === 0) return;
    due.forEach((b) => completedRef.current.add(b.id));
    setBookings((prev) => prev.map((b) => (due.some((d) => d.id === b.id) ? { ...b, status: "completed" as const } : b)));
    const offEntries: LightLogEntry[] = due
      .filter((b) => !courts.find((c) => c.id === b.courtId)?.manualOverride)
      .map((b) => ({ id: uid(), courtName: courts.find((c) => c.id === b.courtId)?.name ?? "Court", action: "off" as const, reason: "automatic" as const, at: new Date() }));
    if (offEntries.length > 0) setLog((l) => [...offEntries, ...l]);
    setNotice(`Time up — ${due.map((b) => b.customerName).join(", ")}: session completed, lights off automatically.`);
  }, [now, bookings, courts]);

  const activeForCourt = (courtId: string) => liveSessionForCourt(courtId, now);

  function addLog(courtName: string, action: "on" | "off", reason: LightLogEntry["reason"]) {
    setLog((l) => [{ id: uid(), courtName, action, reason, at: new Date() }, ...l]);
  }

  function handleAddBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setNotice("Enter the customer's name and phone."); return; }
    const clash = hasOverlap(bookings, form.courtId, form.startHour, form.durationHours);
    if (clash) { setNotice(`That slot clashes with ${clash.customerName} (${formatHour(clash.startHour)}–${formatHour(clash.startHour + clash.durationHours)}) on the same court.`); return; }
    setBookings((b) => [...b, { id: uid(), courtId: form.courtId, customerName: form.name.trim(), customerPhone: form.phone.trim(), startHour: form.startHour, durationHours: form.durationHours, status: "booked", checkedInAt: null, lightsOffAt: null }]);
    setNotice(`Booking created for ${form.name} — ${formatHour(form.startHour)}, ${form.durationHours}h.`);
    setShowForm(false); setForm((f) => ({ ...f, name: "", phone: "" }));
  }

  function handleCheckIn(b: Booking) {
    const check = canCheckIn(b, new Date());
    if (!check.ok) { setNotice(check.message); return; }
    const at = new Date();
    const off = lightsOffTime(at, b.durationHours);
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "checked_in", checkedInAt: at, lightsOffAt: off } : x)));
    // Back to automatic mode for this court — the live session turns the lights on.
    setCourts((cs) => cs.map((c) => (c.id === b.courtId ? { ...c, manualOverride: false, manualLightsOn: false } : c)));
    addLog(courts.find((c) => c.id === b.courtId)?.name ?? "Court", "on", "check_in");
    setNotice(`${b.customerName} checked in. Lights off at ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  }

  function handleExtend(b: Booking, extraHours: number) {
    const clash = hasOverlap(bookings, b.courtId, b.startHour, b.durationHours + extraHours, b.id);
    if (clash) { setNotice(`Can't extend — the next slot is booked by ${clash.customerName}.`); return; }
    if (!b.lightsOffAt) return;
    const off = new Date(b.lightsOffAt.getTime() + extraHours * 3_600_000);
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, durationHours: x.durationHours + extraHours, lightsOffAt: off } : x)));
    setNotice(`Extended. New lights-off: ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  }

  function handleReleaseNoShow(b: Booking) {
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "no_show" } : x)));
    setNotice(`${b.customerName} marked no-show — the slot is free for walk-ins.`);
  }

  function handleCancel(b: Booking) {
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "cancelled" } : x)));
    setNotice("Booking cancelled. The slot is free again.");
  }

  function handleToggleLights(court: Court) {
    const nextOn = !lightsOnFor(court, new Date());
    setCourts((cs) => cs.map((c) => (c.id === court.id ? { ...c, manualOverride: true, manualLightsOn: nextOn } : c)));
    addLog(court.name, nextOn ? "on" : "off", "manual");
    setNotice(`${court.name} lights ${nextOn ? "ON (manual override — auto switch-off will not override this)" : "OFF"} manually.`);
  }

  function handleBackToAuto(court: Court) {
    setCourts((cs) => cs.map((c) => (c.id === court.id ? { ...c, manualOverride: false, manualLightsOn: false } : c)));
    setNotice(`${court.name} is back on automatic control — lights follow bookings.`);
  }

  function handleReset() {
    const fresh = seed();
    completedRef.current.clear();
    setCourts(fresh.courts); setBookings(fresh.bookings); setLog(fresh.log);
    setNotice("Demo data reset.");
  }

  const hours = Array.from({ length: settings.closingHour - settings.openingHour + 1 }, (_, i) => settings.openingHour + i);
  const lightHoursToday = log.filter((l) => l.action === "on").length; // placeholder demo metric; production sums log pairs
  const runningHours = bookings.filter((b) => b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > now).length;
  const bookedToday = bookings.filter((b) => b.status !== "cancelled").length;
  const utilization = Math.round((bookedToday / (courts.length * hours.length)) * 100);
  const estCost = Math.max(0, runningHours + lightHoursToday - 1) * settings.lightingPowerKw * settings.electricityPricePerUnit;
  const estSaving = 3 * settings.lightingPowerKw * settings.electricityPricePerUnit; // doc §6.1 example: 3 wasted hrs/night

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PadelBoard</h1>
          <p className="text-sm opacity-70">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · Demo Padel Club · {isSupabaseConfigured() ? "Supabase connected" : "Demo mode (no Supabase keys yet — see README)"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="rounded-lg border px-3 py-2 text-sm">Reset demo data</button>
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black">+ Add booking</button>
        </div>
      </header>

      {notice && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{notice}</div>}

      {showForm && (
        <form onSubmit={handleAddBooking} className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-5">
          <input required placeholder="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border px-3 py-2 bg-transparent" />
          <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded border px-3 py-2 bg-transparent" />
          <select value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })} className="rounded border px-3 py-2 bg-transparent">
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={form.startHour} onChange={(e) => setForm({ ...form, startHour: Number(e.target.value) })} className="rounded border px-3 py-2 bg-transparent">
            {hours.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} className="flex-1 rounded border px-3 py-2 bg-transparent">
              <option value={1}>1 hour</option><option value={2}>2 hours</option><option value={3}>3 hours</option>
            </select>
            <button type="submit" className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">Save</button>
          </div>
        </form>
      )}

      {/* Court cards — Doc §4 */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {courts.map((court) => {
          const active = activeForCourt(court.id);
          const lightsOn = lightsOnFor(court, now);
          return (
            <div key={court.id} className={`rounded-2xl border p-4 ${lightsOn ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{court.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${lightsOn ? "bg-amber-400 text-black" : "bg-neutral-200 dark:bg-neutral-800"}`}>{lightsOn ? "Lights ON" : "Lights off"}</span>
              </div>
              {active ? (
                <p className="mt-3 text-sm">{active.customerName} — lights off in <span className="font-mono font-bold">{countdown(active.lightsOffAt, now)}</span><br /><span className="opacity-70">Off at {active.lightsOffAt?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></p>
              ) : <p className="mt-3 text-sm opacity-70">No active session{court.manualOverride ? " · Manual override active" : ""}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => handleToggleLights(court)} className="rounded-lg border px-3 py-1.5 text-sm">{lightsOn ? "Turn off manually" : "Turn on manually"}</button>
                {court.manualOverride && <button onClick={() => handleBackToAuto(court)} className="rounded-lg border px-3 py-1.5 text-sm">Back to auto</button>}
                {active && <><button onClick={() => handleExtend(active, 0.5)} className="rounded-lg border px-3 py-1.5 text-sm">Extend 30m</button><button onClick={() => handleExtend(active, 1)} className="rounded-lg border px-3 py-1.5 text-sm">Extend 1h</button></>}
              </div>
            </div>
          );
        })}
      </section>

      {/* Free slots grid — Doc §4 */}
      <section className="mt-8 overflow-x-auto">
        <h2 className="mb-2 font-semibold">Free slots</h2>
        <table className="w-full min-w-[520px] border-collapse text-center text-sm">
          <thead><tr><th className="border p-2 text-left">Time</th>{courts.map((c) => <th key={c.id} className="border p-2">{c.name}</th>)}</tr></thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="border p-2 text-left font-medium">{formatHour(h)}</td>
                {courts.map((c) => {
                  const occ = bookings.find((b) => b.courtId === c.id && (b.status === "booked" || b.status === "checked_in") && h >= b.startHour && h < b.startHour + b.durationHours);
                  return (
                    <td key={c.id} onClick={() => { if (!occ) { setForm((f) => ({ ...f, courtId: c.id, startHour: h })); setShowForm(true); } }} className={`border p-2 ${occ ? "bg-neutral-200 font-medium dark:bg-neutral-800" : "cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40"}`}>
                      {occ ? occ.customerName : "Free"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs opacity-60">Tap a free slot to create a booking for it.</p>
      </section>

      {/* Bookings list — Doc §4 */}
      <section className="mt-8">
        <h2 className="mb-2 font-semibold">Today&apos;s bookings</h2>
        <div className="divide-y rounded-xl border">
          {bookings.length === 0 && <p className="p-4 text-sm opacity-70">No bookings yet.</p>}
          {[...bookings].sort((a, b) => a.startHour - b.startHour).map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-mono">{formatHour(b.startHour)}–{formatHour(b.startHour + b.durationHours)}</span>
              <span>{courts.find((c) => c.id === b.courtId)?.name}</span>
              <span className="font-medium">{b.customerName}</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize dark:bg-neutral-800">{b.status.replace("_", " ")}</span>
              <span className="ml-auto flex gap-2">
                {b.status === "booked" && <><button onClick={() => handleCheckIn(b)} className="rounded bg-amber-400 px-3 py-1 font-semibold text-black">Check in</button><button onClick={() => handleReleaseNoShow(b)} className="rounded border px-3 py-1">No-show</button><button onClick={() => handleCancel(b)} className="rounded border px-3 py-1">Cancel</button></>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Reports — Doc §6 */}
      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          ["Courts in use now", String(runningHours)],
          ["Utilization today", `${utilization}%`],
          ["Est. electricity cost today", `Rs ${estCost.toLocaleString()}`],
          ["Est. waste avoided / night", `Rs ${estSaving.toLocaleString()}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border p-4"><p className="text-xs uppercase opacity-60">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>
        ))}
      </section>

      {/* Settings + light log */}
      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="mb-3 font-semibold">Club settings (Doc §6.1)</h2>
          <label className="block text-sm">Lighting power per court (kW)
            <input type="number" step="0.1" value={settings.lightingPowerKw} onChange={(e) => setSettings({ ...settings, lightingPowerKw: Number(e.target.value) })} className="mt-1 w-full rounded border px-3 py-2 bg-transparent" /></label>
          <label className="mt-3 block text-sm">Electricity price (Rs / unit)
            <input type="number" value={settings.electricityPricePerUnit} onChange={(e) => setSettings({ ...settings, electricityPricePerUnit: Number(e.target.value) })} className="mt-1 w-full rounded border px-3 py-2 bg-transparent" /></label>
          <p className="mt-2 text-xs opacity-60">Cost of 1 hour of lights = {settings.lightingPowerKw} kW × Rs {settings.electricityPricePerUnit} = Rs {settings.lightingPowerKw * settings.electricityPricePerUnit}</p>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="mb-3 font-semibold">Light log (Doc §6.2)</h2>
          <ul className="space-y-1 text-sm">
            {log.slice(0, 10).map((l) => <li key={l.id}>{l.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — {l.courtName} lights <b>{l.action.toUpperCase()}</b> <span className="opacity-60">({l.reason.replace("_", " ")})</span></li>)}
            {log.length === 0 && <li className="opacity-70">No switches logged yet.</li>}
          </ul>
        </div>
      </section>

      <footer className="mt-10 border-t pt-4 text-xs opacity-60">PadelBoard Phase 1 demo — lights are simulated on screen. Production: Supabase (schema in /supabase) + Vercel Cron hitting /api/cron/switch-off every minute.</footer>
    </main>
  );
}
