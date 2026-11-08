"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Booking, Court, LightLogEntry, ClubSettings } from "@/lib/types";
import {
  bookingStart, canCheckIn, formatDuration, formatHour, formatMinutesOfDay, hasOverlap,
  isoAddDays, isoFromDate, isoToDate, lightsOffTime, minutesToTimeString, timeStringToMinutes,
} from "@/lib/rules";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const uid = () => Math.random().toString(36).slice(2, 10);
const DURATION_CHIPS = [1, 15, 30, 45, 60, 90, 120, 180];

interface DayData { courts: Court[]; bookings: Booking[]; log: LightLogEntry[] }

function seedDay(offset: number): { bookings: Booking[]; log: LightLogEntry[] } {
  const base = new Date(); base.setDate(base.getDate() + offset);
  const dateISO = isoFromDate(base);
  const now = new Date();
  const h = Math.min(20, Math.max(16, now.getHours()));
  if (offset === 0) {
    const checkedIn1 = new Date(now.getTime() - 19 * 60_000);
    const checkedIn3 = new Date(now.getTime() - 47 * 60_000);
    return {
      bookings: [
        { id: uid(), courtId: "c1", customerName: "Ali Raza", customerPhone: "0300 1112233", dateISO, startMinutes: h * 60, durationMinutes: 60, status: "checked_in", checkedInAt: checkedIn1, lightsOffAt: lightsOffTime(checkedIn1, 60) },
        { id: uid(), courtId: "c3", customerName: "Sara Khan", customerPhone: "0321 4455667", dateISO, startMinutes: h * 60, durationMinutes: 60, status: "checked_in", checkedInAt: checkedIn3, lightsOffAt: lightsOffTime(checkedIn3, 60) },
        { id: uid(), courtId: "c2", customerName: "Hamza Tariq", customerPhone: "0333 9988776", dateISO, startMinutes: (h + 1 <= 23 ? h + 1 : h) * 60, durationMinutes: 60, status: "booked", checkedInAt: null, lightsOffAt: null },
      ],
      log: [
        { id: uid(), courtName: "Court 1", action: "on", reason: "check_in", at: checkedIn1 },
        { id: uid(), courtName: "Court 3", action: "on", reason: "check_in", at: checkedIn3 },
      ],
    };
  }
  if (offset === 1) {
    return {
      bookings: [
        { id: uid(), courtId: "c1", customerName: "Usman Malik", customerPhone: "0301 2233445", dateISO, startMinutes: 19 * 60, durationMinutes: 90, status: "booked", checkedInAt: null, lightsOffAt: null },
        { id: uid(), courtId: "c2", customerName: "Ayesha Noor", customerPhone: "0345 6677889", dateISO, startMinutes: 20 * 60 + 30, durationMinutes: 60, status: "booked", checkedInAt: null, lightsOffAt: null },
      ],
      log: [],
    };
  }
  if (offset === -1) {
    const y = isoToDate(dateISO); y.setHours(19, 5, 0, 0);
    const off = new Date(y.getTime() + 60 * 60_000);
    return {
      bookings: [
        { id: uid(), courtId: "c1", customerName: "Bilal Ahmed", customerPhone: "0308 1122334", dateISO, startMinutes: 19 * 60, durationMinutes: 60, status: "completed", checkedInAt: y, lightsOffAt: off },
      ],
      log: [
        { id: uid(), courtName: "Court 1", action: "off", reason: "automatic", at: off },
        { id: uid(), courtName: "Court 1", action: "on", reason: "check_in", at: y },
      ],
    };
  }
  return { bookings: [], log: [] };
}

function seedAll(): Record<string, DayData> {
  const courts: Court[] = [
    { id: "c1", name: "Court 1", manualLightsOn: false, manualOverride: false },
    { id: "c2", name: "Court 2", manualLightsOn: false, manualOverride: false },
    { id: "c3", name: "Court 3", manualLightsOn: false, manualOverride: false },
  ];
  const days: Record<string, DayData> = {};
  for (const off of [-1, 0, 1]) {
    const d = new Date(); d.setDate(d.getDate() + off);
    const s = seedDay(off);
    days[isoFromDate(d)] = { courts, bookings: s.bookings, log: s.log };
  }
  return days;
}

function countdown(offAt: Date | null, now: Date): string {
  if (!offAt) return "";
  const ms = Math.max(0, offAt.getTime() - now.getTime());
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

const inputCls = "w-full rounded-[10px] border border-pb-border bg-pb-surface px-3 py-2 text-sm text-pb-text";
const btnCls = "rounded-[10px] border border-pb-border bg-pb-surface px-3 py-1.5 text-sm font-semibold hover:bg-pb-surface2";
const chipCls = "rounded-full border border-pb-border bg-pb-surface2 px-2.5 py-0.5 text-xs font-semibold";

export default function Dashboard() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [days, setDays] = useState<Record<string, DayData>>(() => seedAll());
  const [settings, setSettings] = useState<ClubSettings>({ lightingPowerKw: 2, electricityPricePerUnit: 50, noShowWaitMinutes: 15, openingHour: 10, closingHour: 23 });
  const [now, setNow] = useState(() => new Date());
  const todayISO = isoFromDate(now);
  const [selectedISO, setSelectedISO] = useState<string>(() => isoFromDate(new Date()));
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", courtId: "c1", dateISO: todayISO, startTime: "19:00", durationMinutes: 60 });
  const completedRef = useRef<Set<string>>(new Set());
  const noShowRef = useRef<Set<string>>(new Set());

  const day: DayData = days[selectedISO] ?? { courts: days[todayISO]?.courts ?? [], bookings: [], log: [] };
  const courts = day.courts;
  const bookings = day.bookings;
  const log = day.log;
  const isToday = selectedISO === todayISO;

  const patchDay = (iso: string, fn: (d: DayData) => DayData) =>
    setDays((prev) => {
      const cur = prev[iso] ?? { courts: prev[isoFromDate(new Date())]?.courts ?? [], bookings: [], log: [] };
      return { ...prev, [iso]: fn(cur) };
    });
  const patchBookings = (iso: string, fn: (bs: Booking[]) => Booking[]) => patchDay(iso, (d) => ({ ...d, bookings: fn(d.bookings) }));
  const patchCourts = (fn: (cs: Court[]) => Court[]) => {
    // Courts are shared across days in demo data — apply to every day bucket.
    setDays((prev) => Object.fromEntries(Object.entries(prev).map(([k, d]) => [k, { ...d, courts: fn(d.courts) }])));
  };
  const addLog = (iso: string, courtName: string, action: "on" | "off", reason: LightLogEntry["reason"]) =>
    patchDay(iso, (d) => ({ ...d, log: [{ id: uid(), courtName, action, reason, at: new Date() }, ...d.log] }));

  // tick every second for countdowns + live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Theme: dark by default; restore the saved choice, then keep <html> in sync.
  useEffect(() => {
    const saved = window.localStorage.getItem("pb-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the saved theme on mount
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("pb-theme", theme);
  }, [theme]);

  // A session is live only until its lights-off time; light state is DERIVED
  // from this, never stored — a stored copy once let courts show ON after time-up.
  const liveSessionForCourt = (courtId: string, at: Date) =>
    bookings.find((b) => b.courtId === courtId && b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > at);
  const lightsOnFor = (court: Court, at: Date) =>
    court.manualOverride ? court.manualLightsOn : liveSessionForCourt(court.id, at) !== undefined;

  // Doc §3 step 6 + no-show sweep (today only): complete expired sessions,
  // log automatic switch-off, auto-mark bookings past their end as no-show.
  useEffect(() => {
    if (!isToday) return;
    const due = bookings.filter((b) => b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt <= now && !completedRef.current.has(b.id));
    const late = bookings.filter((b) => b.status === "booked" && !noShowRef.current.has(b.id) && bookingStart(b).getTime() + b.durationMinutes * 60_000 <= now.getTime());
    if (due.length === 0 && late.length === 0) return;
    due.forEach((b) => completedRef.current.add(b.id));
    late.forEach((b) => noShowRef.current.add(b.id));
    patchBookings(todayISO, (prev) => prev.map((b) =>
      due.some((d) => d.id === b.id) ? { ...b, status: "completed" as const }
      : late.some((d) => d.id === b.id) ? { ...b, status: "no_show" as const } : b));
    const offEntries = due.filter((b) => !courts.find((c) => c.id === b.courtId)?.manualOverride);
    if (offEntries.length > 0)
      patchDay(todayISO, (d) => ({ ...d, log: [...offEntries.map((b) => ({ id: uid(), courtName: courts.find((c) => c.id === b.courtId)?.name ?? "Court", action: "off" as const, reason: "automatic" as const, at: new Date() })), ...d.log] }));
    if (due.length > 0) setNotice(`Time up — ${due.map((b) => b.customerName).join(", ")}: session completed, lights off automatically.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isToday]);

  const activeForCourt = (courtId: string) => liveSessionForCourt(courtId, now);

  // Alerts for the selected day (live ones only make sense today)
  const alerts: string[] = [];
  if (isToday) {
    for (const b of bookings) {
      if (b.status === "checked_in" && b.lightsOffAt && b.lightsOffAt.getTime() - now.getTime() <= 5 * 60_000 && b.lightsOffAt > now)
        alerts.push(`${b.customerName} on ${courts.find((c) => c.id === b.courtId)?.name} ends in ${countdown(b.lightsOffAt, now)} — offer an extension.`);
      if (b.status === "booked" && bookingStart(b) <= now && bookingStart(b).getTime() + b.durationMinutes * 60_000 > now.getTime())
        alerts.push(`${b.customerName} has not checked in (${formatMinutesOfDay(b.startMinutes)} booking) — release the slot if they're a no-show.`);
    }
    for (const c of courts)
      if (lightsOnFor(c, now) && !activeForCourt(c.id) && !c.manualOverride)
        alerts.push(`${c.name} lights are on with no active session.`);
  }

  function openForm(courtId?: string, startMinutes?: number, dateISO?: string) {
    setForm((f) => ({
      ...f,
      courtId: courtId ?? f.courtId,
      dateISO: dateISO ?? selectedISO,
      startTime: startMinutes !== undefined ? minutesToTimeString(startMinutes) : f.startTime,
    }));
    setShowForm(true);
  }

  function handleAddBooking(e: React.FormEvent) {
    e.preventDefault();
    const target = days[form.dateISO] ?? { courts, bookings: [], log: [] };
    if (!form.name.trim() || !form.phone.trim()) { setNotice("Enter the customer's name and phone."); return; }
    const startMinutes = timeStringToMinutes(form.startTime);
    const durationMinutes = Math.floor(form.durationMinutes);
    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 1440) { setNotice("Duration must be between 1 minute and 24 hours."); return; }
    const clash = hasOverlap(target.bookings, form.courtId, startMinutes, durationMinutes);
    if (clash) { setNotice(`That time clashes with ${clash.customerName} (${formatMinutesOfDay(clash.startMinutes)}–${formatMinutesOfDay(clash.startMinutes + clash.durationMinutes)}) on the same court.`); return; }
    patchBookings(form.dateISO, (b) => [...b, { id: uid(), courtId: form.courtId, customerName: form.name.trim(), customerPhone: form.phone.trim(), dateISO: form.dateISO, startMinutes, durationMinutes, status: "booked", checkedInAt: null, lightsOffAt: null }]);
    setNotice(`Booking created for ${form.name} — ${formatMinutesOfDay(startMinutes)}–${formatMinutesOfDay(startMinutes + durationMinutes)} (${formatDuration(durationMinutes)}).`);
    setShowForm(false); setForm((f) => ({ ...f, name: "", phone: "" }));
  }

  function handleCheckIn(b: Booking) {
    const check = canCheckIn(b, new Date());
    if (!check.ok) { setNotice(check.message); return; }
    const at = new Date();
    const off = lightsOffTime(at, b.durationMinutes);
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "checked_in", checkedInAt: at, lightsOffAt: off } : x)));
    patchCourts((cs) => cs.map((c) => (c.id === b.courtId ? { ...c, manualOverride: false, manualLightsOn: false } : c)));
    addLog(b.dateISO, courts.find((c) => c.id === b.courtId)?.name ?? "Court", "on", "check_in");
    setNotice(`${b.customerName} checked in. Lights off at ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  }

  function handleExtend(b: Booking, extraMinutes: number) {
    const clash = hasOverlap(bookings, b.courtId, b.startMinutes, b.durationMinutes + extraMinutes, b.id);
    if (clash) { setNotice(`Can't extend — the next slot is booked by ${clash.customerName}.`); return; }
    if (!b.lightsOffAt) return;
    const off = new Date(b.lightsOffAt.getTime() + extraMinutes * 60_000);
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, durationMinutes: x.durationMinutes + extraMinutes, lightsOffAt: off } : x)));
    setNotice(`Extended by ${formatDuration(extraMinutes)}. New lights-off: ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  }

  function handleEndSession(b: Booking) {
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "completed" } : x)));
    const court = courts.find((c) => c.id === b.courtId);
    const otherLive = bookings.some((x) => x.id !== b.id && x.courtId === b.courtId && x.status === "checked_in" && x.lightsOffAt !== null && x.lightsOffAt > now);
    if (court && !otherLive && !court.manualOverride) addLog(b.dateISO, court.name, "off", "manual");
    setNotice(`${b.customerName}'s session ended early — lights off.`);
  }

  function handleReleaseNoShow(b: Booking) {
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "no_show" } : x)));
    setNotice(`${b.customerName} marked no-show — the slot is free for walk-ins.`);
  }

  function handleCancel(b: Booking) {
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "cancelled" } : x)));
    setNotice("Booking cancelled. The slot is free again.");
  }

  function handleToggleLights(court: Court) {
    const nextOn = !lightsOnFor(court, new Date());
    patchCourts((cs) => cs.map((c) => (c.id === court.id ? { ...c, manualOverride: true, manualLightsOn: nextOn } : c)));
    addLog(selectedISO, court.name, nextOn ? "on" : "off", "manual");
    setNotice(`${court.name} lights ${nextOn ? "ON (manual override — auto switch-off will not override this)" : "OFF"} manually.`);
  }

  function handleBackToAuto(court: Court) {
    patchCourts((cs) => cs.map((c) => (c.id === court.id ? { ...c, manualOverride: false, manualLightsOn: false } : c)));
    setNotice(`${court.name} is back on automatic control — lights follow bookings.`);
  }

  function handleAddCourt() {
    const name = newCourtName.trim() || `Court ${courts.length + 1}`;
    patchCourts((cs) => [...cs, { id: uid(), name, manualLightsOn: false, manualOverride: false }]);
    setNewCourtName("");
    setNotice(`${name} added.`);
  }

  function handleReset() {
    completedRef.current.clear(); noShowRef.current.clear();
    setDays(seedAll());
    setSettings({ lightingPowerKw: 2, electricityPricePerUnit: 50, noShowWaitMinutes: 15, openingHour: 10, closingHour: 23 });
    setSelectedISO(isoFromDate(new Date()));
    setConfirmReset(false);
    setNotice("Demo data reset.");
  }

  // ---- Day numbers (Doc §6): real light-hours from the day's log pairs ----
  const openMinutes = (settings.closingHour - settings.openingHour) * 60;
  let lightMinutes = 0;
  {
    const sorted = [...log].sort((a, b) => a.at.getTime() - b.at.getTime());
    const onSince = new Map<string, number>();
    for (const e of sorted) {
      if (e.action === "on") { if (!onSince.has(e.courtName)) onSince.set(e.courtName, e.at.getTime()); }
      else { const s = onSince.get(e.courtName); if (s !== undefined) { lightMinutes += (e.at.getTime() - s) / 60_000; onSince.delete(e.courtName); } }
    }
    if (isToday) for (const s of onSince.values()) lightMinutes += (now.getTime() - s) / 60_000;
  }
  const lightHours = lightMinutes / 60;
  const actualCost = lightHours * settings.lightingPowerKw * settings.electricityPricePerUnit;
  const baselineCost = courts.length * (openMinutes / 60) * settings.lightingPowerKw * settings.electricityPricePerUnit;
  const saved = Math.max(0, baselineCost - actualCost);
  const bookedMinutes = bookings.filter((b) => b.status === "booked" || b.status === "checked_in" || b.status === "completed")
    .reduce((sum, b) => sum + b.durationMinutes, 0);
  const utilization = courts.length && openMinutes ? Math.round((bookedMinutes / (courts.length * openMinutes)) * 100) : 0;
  const counts = {
    total: bookings.filter((b) => b.status !== "cancelled").length,
    completed: bookings.filter((b) => b.status === "completed").length,
    noShow: bookings.filter((b) => b.status === "no_show").length,
  };

  const hours = Array.from({ length: settings.closingHour - settings.openingHour }, (_, i) => settings.openingHour + i);
  const durationValid = Math.floor(form.durationMinutes) >= 1 && Math.floor(form.durationMinutes) <= 1440;
  const dateLabel = (() => {
    const d = isoToDate(selectedISO);
    const label = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    if (selectedISO === todayISO) return `Today · ${label}`;
    if (selectedISO === isoAddDays(todayISO, 1)) return `Tomorrow · ${label}`;
    if (selectedISO === isoAddDays(todayISO, -1)) return `Yesterday · ${label}`;
    return label;
  })();

  const statusChip = (b: Booking): { text: string; cls: string } => {
    if (b.status === "checked_in" && b.lightsOffAt && b.lightsOffAt > now) return { text: "Checked in · lights on", cls: "bg-pb-amber text-pb-amber-ink" };
    if (b.status === "completed") return { text: "Completed · lights off", cls: "bg-pb-surface2 text-pb-dim" };
    if (b.status === "booked") return { text: "Booked", cls: "bg-pb-surface2" };
    if (b.status === "no_show") return { text: "No-show · released", cls: "bg-pb-surface2 text-pb-dim" };
    if (b.status === "cancelled") return { text: "Cancelled", cls: "bg-pb-surface2 text-pb-dim" };
    return { text: b.status.replace("_", " "), cls: "bg-pb-surface2" };
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 text-pb-text">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">PadelBoard</h1>
          <p className="text-sm text-pb-dim">Demo Padel Club · {isSupabaseConfigured() ? "Supabase connected" : "Demo mode (no Supabase keys yet — see README)"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} className={btnCls} title="Switch theme">{theme === "dark" ? "☀ Light" : "☾ Dark"}</button>
          <button onClick={() => setShowSettings((s) => !s)} className={btnCls}>Club settings</button>
          <button onClick={() => openForm()} className="rounded-[10px] bg-pb-amber px-4 py-2 text-sm font-extrabold text-pb-amber-ink">+ Add booking</button>
        </div>
      </header>

      {/* Date bar */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={() => setSelectedISO(isoAddDays(selectedISO, -1))} className={btnCls}>← Prev day</button>
        <span className="px-1 text-lg font-extrabold">{dateLabel}</span>
        <button onClick={() => setSelectedISO(isoAddDays(selectedISO, 1))} className={btnCls}>Next day →</button>
        <input type="date" value={selectedISO} onChange={(e) => e.target.value && setSelectedISO(e.target.value)} className="rounded-[10px] border border-pb-border bg-pb-surface px-2 py-1.5 text-sm" />
        {!isToday && <button onClick={() => setSelectedISO(todayISO)} className={btnCls}>Back to today</button>}
        <span className="ml-auto flex items-center gap-2 text-sm font-semibold text-pb-dim">
          <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Live · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>

      {notice && <div className="mt-4 rounded-[10px] border border-pb-amber bg-pb-amber/15 px-4 py-2 text-sm font-medium">{notice}</div>}

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-[10px] border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium">
              <span aria-hidden>⚠</span><span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* Court cards — Doc §4 */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courts.map((court) => {
          const active = isToday ? activeForCourt(court.id) : undefined;
          const lightsOn = isToday && lightsOnFor(court, now);
          return (
            <div key={court.id} className={`rounded-[10px] border p-4 ${lightsOn ? "lit-glow border-pb-amber bg-pb-amber text-pb-amber-ink" : "border-pb-border bg-pb-surface"}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold uppercase tracking-wide">{court.name}</h2>
                <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${lightsOn ? "bg-pb-amber-ink text-pb-amber" : "bg-pb-surface2 text-pb-dim"}`}>
                  {lightsOn && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-pb-amber" />}
                  {lightsOn ? "Lights ON" : "Lights off"}
                </span>
              </div>
              {active ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold">{active.customerName} · {active.customerPhone}</p>
                  <p className="font-black leading-none text-4xl tabular-nums">{countdown(active.lightsOffAt, now)}</p>
                  <p className={`mt-1 text-xs ${lightsOn ? "" : "text-pb-dim"} opacity-80`}>Lights off at {active.lightsOffAt?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{court.manualOverride ? " · Manual override" : ""}</p>
                </div>
              ) : (
                <p className={`mt-3 text-sm ${lightsOn ? "" : "text-pb-dim"}`}>
                  {!isToday ? "Sessions show live on the day" : lightsOn && court.manualOverride ? "Manual override — lights forced on by staff" : "No active session"}{court.manualOverride && isToday ? " · Manual override active" : ""}
                </p>
              )}
              {isToday && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => handleToggleLights(court)} className={lightsOn ? "rounded-[10px] bg-pb-amber-ink px-3 py-1.5 text-sm font-bold text-pb-amber" : btnCls}>{lightsOn ? "Turn off manually" : "Turn on manually"}</button>
                  {court.manualOverride && <button onClick={() => handleBackToAuto(court)} className={lightsOn ? "rounded-[10px] border border-pb-amber-ink/40 px-3 py-1.5 text-sm font-bold" : btnCls}>Back to auto</button>}
                  {active && <><button onClick={() => handleExtend(active, 30)} className={lightsOn ? "rounded-[10px] border border-pb-amber-ink/40 px-3 py-1.5 text-sm font-bold" : btnCls}>Extend 30m</button><button onClick={() => handleExtend(active, 60)} className={lightsOn ? "rounded-[10px] border border-pb-amber-ink/40 px-3 py-1.5 text-sm font-bold" : btnCls}>Extend 1h</button><button onClick={() => handleEndSession(active)} className={lightsOn ? "rounded-[10px] border border-pb-amber-ink/40 px-3 py-1.5 text-sm font-bold" : btnCls}>End session</button></>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Free slots grid — Doc §4 */}
      <section className="mt-8 overflow-x-auto">
        <h2 className="mb-2 font-extrabold uppercase tracking-wide">Free slots</h2>
        <div className="grid min-w-[560px] gap-1" style={{ gridTemplateColumns: `84px repeat(${courts.length}, 1fr)` }}>
          <div className="px-2 py-1 text-xs font-bold text-pb-dim">Time</div>
          {courts.map((c) => <div key={c.id} className="px-2 py-1 text-center text-xs font-bold text-pb-dim">{c.name}</div>)}
          {hours.map((h) => {
            const past = isToday && (h + 1) * 60 <= now.getHours() * 60 + now.getMinutes();
            return (
              <Fragment key={h}>
                <div className="px-2 py-2 text-sm font-semibold">{formatHour(h)}</div>
                {courts.map((c) => {
                  const occ = bookings.find((b) => b.courtId === c.id && (b.status === "booked" || b.status === "checked_in") && b.startMinutes < (h + 1) * 60 && h * 60 < b.startMinutes + b.durationMinutes);
                  const live = occ && occ.status === "checked_in" && isToday && occ.lightsOffAt !== null && occ.lightsOffAt > now;
                  return (
                    <button key={`${h}-${c.id}`} disabled={!!occ} onClick={() => openForm(c.id, h * 60, selectedISO)}
                      className={`rounded-[10px] px-2 py-2 text-sm ${live ? "bg-pb-amber font-bold text-pb-amber-ink" : occ ? "bg-pb-surface2 font-medium text-pb-dim" : past ? "bg-pb-surface text-pb-dim/60 hover:bg-pb-surface2" : "bg-pb-surface font-medium hover:bg-pb-amber/25"}`}>
                      {occ ? occ.customerName : "Free"}
                    </button>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-pb-dim">Tap a free slot to create a booking for it.</p>
      </section>

      {/* Bookings list — Doc §4 */}
      <section className="mt-8">
        <h2 className="mb-2 font-extrabold uppercase tracking-wide">Bookings — {dateLabel}</h2>
        <div className="divide-y divide-pb-border rounded-[10px] border border-pb-border bg-pb-surface">
          {bookings.length === 0 && <p className="p-4 text-sm text-pb-dim">No bookings for this day yet.</p>}
          {[...bookings].sort((a, b) => a.startMinutes - b.startMinutes).map((b) => {
            const chip = statusChip(b);
            const start = bookingStart(b);
            const end = new Date(start.getTime() + b.durationMinutes * 60_000);
            const check = canCheckIn(b, now);
            const noShowWaiting = isToday && b.status === "booked" && start <= now && end > now;
            const timeUp = b.status === "completed" && b.lightsOffAt;
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-mono font-semibold">{formatMinutesOfDay(b.startMinutes)}–{formatMinutesOfDay(b.startMinutes + b.durationMinutes)}</span>
                <span className="text-pb-dim">({formatDuration(b.durationMinutes)})</span>
                <span>{courts.find((c) => c.id === b.courtId)?.name}</span>
                <span className="font-semibold">{b.customerName}</span>
                <span className="text-pb-dim">{b.customerPhone}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip.cls}`}>{chip.text}</span>
                {timeUp ? <span className="text-xs text-pb-dim">Time&apos;s up — lights went off at {b.lightsOffAt!.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
                {noShowWaiting && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-500">No-show waiting</span>}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {b.status === "booked" && (
                    <>
                      <button disabled={!check.ok} title={check.ok ? "" : check.message} onClick={() => handleCheckIn(b)} className="rounded-[10px] bg-pb-amber px-3 py-1 font-bold text-pb-amber-ink disabled:cursor-not-allowed disabled:opacity-40">Check in</button>
                      {!check.ok && check.message && <span className="text-xs text-pb-dim">{check.message}</span>}
                      <button onClick={() => handleReleaseNoShow(b)} className={btnCls}>Release slot</button>
                      <button onClick={() => handleCancel(b)} className={btnCls}>Cancel</button>
                    </>
                  )}
                  {b.status === "checked_in" && isToday && (
                    <>
                      <button onClick={() => handleExtend(b, 30)} className={btnCls}>+30m</button>
                      <button onClick={() => handleExtend(b, 60)} className={btnCls}>+60m</button>
                      <button onClick={() => handleEndSession(b)} className={btnCls}>End session</button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Today's numbers — Doc §6 */}
      <section className="mt-8">
        <h2 className="mb-2 font-extrabold uppercase tracking-wide">{isToday ? "Today's numbers" : "Day numbers"}</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Light hours", lightHours.toFixed(1)],
            ["Electricity cost", `Rs ${Math.round(actualCost).toLocaleString()}`],
            ["Saved vs lights-on-all-day", `Rs ${Math.round(saved).toLocaleString()}`],
            ["Utilization", `${utilization}%`],
            ["Bookings", String(counts.total)],
            ["Completed / no-shows", `${counts.completed} / ${counts.noShow}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] border border-pb-border bg-pb-surface p-4"><p className="text-xs font-semibold uppercase text-pb-dim">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-pb-dim">Savings assume lights would otherwise stay on for all opening hours ({settings.openingHour}–{settings.closingHour}) on every court, at {settings.lightingPowerKw} kW × Rs {settings.electricityPricePerUnit}/unit. Light hours are summed from the day&apos;s light log.</p>
      </section>

      {/* Light log + settings */}
      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-[10px] border border-pb-border bg-pb-surface p-4">
          <h2 className="mb-3 font-extrabold uppercase tracking-wide">Light log — {dateLabel}</h2>
          <ul className="space-y-1.5 text-sm">
            {[...log].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12).map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.action === "on" ? "bg-pb-amber text-pb-amber-ink" : "bg-pb-surface2 text-pb-dim"}`}>{l.action.toUpperCase()}</span>
                <span>{l.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — {l.courtName} lights {l.action}</span>
                <span className="text-pb-dim">({l.reason.replace("_", " ")})</span>
              </li>
            ))}
            {log.length === 0 && <li className="text-pb-dim">No switches logged this day.</li>}
          </ul>
        </div>

        {showSettings && (
          <div className="rounded-[10px] border border-pb-border bg-pb-surface p-4">
            <h2 className="mb-3 font-extrabold uppercase tracking-wide">Club settings (Doc §6.1)</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Lighting power / court (kW)
                <input type="number" step="0.1" min={0} value={settings.lightingPowerKw} onChange={(e) => setSettings({ ...settings, lightingPowerKw: Number(e.target.value) })} className={inputCls} /></label>
              <label className="block text-sm">Electricity price (Rs / unit)
                <input type="number" min={0} value={settings.electricityPricePerUnit} onChange={(e) => setSettings({ ...settings, electricityPricePerUnit: Number(e.target.value) })} className={inputCls} /></label>
              <label className="block text-sm">Opening hour (24h)
                <input type="number" min={0} max={23} value={settings.openingHour} onChange={(e) => setSettings({ ...settings, openingHour: Number(e.target.value) })} className={inputCls} /></label>
              <label className="block text-sm">Closing hour (24h)
                <input type="number" min={1} max={24} value={settings.closingHour} onChange={(e) => setSettings({ ...settings, closingHour: Number(e.target.value) })} className={inputCls} /></label>
              <label className="block text-sm">No-show wait (minutes)
                <input type="number" min={0} value={settings.noShowWaitMinutes} onChange={(e) => setSettings({ ...settings, noShowWaitMinutes: Number(e.target.value) })} className={inputCls} /></label>
            </div>
            <p className="mt-2 text-xs text-pb-dim">Cost of 1 hour of lights = {settings.lightingPowerKw} kW × Rs {settings.electricityPricePerUnit} = Rs {settings.lightingPowerKw * settings.electricityPricePerUnit}</p>
            <div className="mt-4 flex gap-2">
              <input placeholder="New court name" value={newCourtName} onChange={(e) => setNewCourtName(e.target.value)} className={inputCls} />
              <button onClick={handleAddCourt} className={btnCls}>Add court</button>
            </div>
            <div className="mt-4 border-t border-pb-border pt-3">
              {!confirmReset
                ? <button onClick={() => setConfirmReset(true)} className="text-sm font-semibold text-red-600">Reset demo data…</button>
                : <span className="flex items-center gap-2 text-sm">Reset everything to fresh demo data? <button onClick={handleReset} className="rounded-[10px] bg-red-600 px-3 py-1 font-bold text-white">Yes, reset</button><button onClick={() => setConfirmReset(false)} className={btnCls}>Keep</button></span>}
            </div>
          </div>
        )}
      </section>

      {/* Booking modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={handleAddBooking} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-t-2xl bg-pb-surface p-5 shadow-xl sm:rounded-[10px]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold uppercase tracking-wide">Add booking</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-xl leading-none text-pb-dim">×</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required placeholder="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              <select value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })} className={inputCls}>
                {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" required value={form.dateISO} onChange={(e) => setForm({ ...form, dateISO: e.target.value })} className={inputCls} />
              <label className="text-xs font-semibold text-pb-dim">Start time
                <input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={inputCls} />
              </label>
              <label className="text-xs font-semibold text-pb-dim">Duration (minutes)
                <input type="number" required min={1} max={1440} step={1} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} className={inputCls} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((m) => <button type="button" key={m} onClick={() => setForm({ ...form, durationMinutes: m })} className={chipCls}>{formatDuration(m)}</button>)}
            </div>
            <p className="mt-3 rounded-[10px] bg-pb-surface2 px-3 py-2 text-sm font-semibold">
              {durationValid ? `${formatDuration(Math.floor(form.durationMinutes))} · ${formatMinutesOfDay(timeStringToMinutes(form.startTime))} – ${formatMinutesOfDay(timeStringToMinutes(form.startTime) + Math.floor(form.durationMinutes))}` : "Duration must be between 1 minute and 24 hours."}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={!durationValid} className="flex-1 rounded-[10px] bg-pb-amber px-4 py-2.5 font-extrabold text-pb-amber-ink disabled:opacity-40">Save booking</button>
              <button type="button" onClick={() => setShowForm(false)} className={btnCls}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <footer className="mt-10 border-t border-pb-border pt-4 text-xs text-pb-dim">PadelBoard Phase 1 demo — lights are simulated on screen. Production: Supabase (schema in /supabase) + Vercel Cron hitting /api/cron/switch-off every minute.</footer>
    </main>
  );
}
