"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Booking, BookingShare, Court, LightLogEntry, ClubSettings, PaymentMethod } from "@/lib/types";
import {
  bookingStart, canCheckIn, formatDuration, formatHour, formatMinutesOfDay, hasOverlap,
  isoAddDays, isoFromDate, isoToDate, minutesToTimeString, sessionEnd, timeStringToMinutes,
} from "@/lib/rules";
const uid = () => Math.random().toString(36).slice(2, 10);
const DURATION_CHIPS = [1, 15, 30, 45, 60, 90, 120, 180];
const DEFAULT_RATE_PER_HOUR = 4800;
const fmtRs = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;

/** Split a total equally; the rupee remainder goes +1 to the first shares so shares always sum to the total. */
function equalShares(total: number, players: { name: string; phone: string }[], paidCount = 0): BookingShare[] {
  const n = Math.max(1, players.length);
  const base = Math.floor(total / n);
  const rem = Math.round(total - base * n);
  return players.map((p, i) => ({
    id: uid(), name: p.name, phone: p.phone,
    amountDue: base + (i < rem ? 1 : 0),
    paid: i < paidCount, method: i < paidCount ? ("jazzcash" as PaymentMethod) : null,
  }));
}

function paymentSummary(b: Booking) {
  const collected = b.shares.reduce((s, sh) => s + (sh.paid ? sh.amountDue : 0), 0);
  return {
    collected,
    outstanding: Math.max(0, b.totalAmount - collected),
    paidCount: b.shares.filter((s) => s.paid).length,
    shareCount: b.shares.length,
    fullyPaid: b.totalAmount > 0 && collected >= b.totalAmount,
  };
}

/** wa.me link with a pre-filled payment reminder for one player's share. */
function whatsappReminderLink(b: Booking, sh: BookingShare, courtName: string): string {
  let digits = sh.phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  const text = `Salam ${sh.name}, your share for ${courtName} (${formatMinutesOfDay(b.startMinutes)}, ${formatDuration(b.durationMinutes)}) is ${fmtRs(sh.amountDue)}. Please pay the club via JazzCash/Easypaisa or cash at the counter before the game. — PadelBoard`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

interface DayData { courts: Court[]; bookings: Booking[]; log: LightLogEntry[] }

function seedDay(offset: number): { bookings: Booking[]; log: LightLogEntry[] } {
  const base = new Date(); base.setDate(base.getDate() + offset);
  const dateISO = isoFromDate(base);
  const now = new Date();
  if (offset === 0) {
    // Session ends are anchored to the BOOKED end (start + duration + comp),
    // so seed the starts relative to "now" — both live sessions are mid-flight
    // whenever the demo is opened. Ali checked in on time and later received
    // +10 min club-delay comp; Sara checked in 12 min late (her own fault),
    // so her end stayed at the booked end and she lost those minutes.
    const base = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    const atMin = (mins: number) => { const d = isoToDate(dateISO); d.setMinutes(mins); return d; };
    const aliStart = Math.max(0, base - 25);
    const saraStart = Math.max(0, base - 40);
    const checkedIn1 = atMin(aliStart);
    const checkedIn3 = new Date(Math.min(atMin(saraStart + 12).getTime(), now.getTime()));
    const aliCompAt = new Date(checkedIn1.getTime() + 15 * 60_000);
    // Court 2 changeover demo: Adnan's session ended ~1 minute ago and Rayan's
    // booking starts exactly at that end (back-to-back) but he hasn't checked
    // in — so Court 2 sits inside the 3-minute changeover grace, lights held
    // on. If nobody checks in, the grace expires and the lights go off.
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const coEnd = nowMin - 1;
    const coStart = coEnd - 60;
    const changeoverPair: Booking[] = coStart >= 0 ? [
      { id: uid(), courtId: "c2", customerName: "Adnan Malik", customerPhone: "0300 7778899", dateISO, startMinutes: coStart, durationMinutes: 60, compMinutes: 0, status: "checked_in", checkedInAt: atMin(coStart), lightsOffAt: atMin(coEnd), totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: false, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Adnan Malik", phone: "0300 7778899" }], 1) },
      { id: uid(), courtId: "c2", customerName: "Rayan Ali", customerPhone: "0321 7779900", dateISO, startMinutes: coEnd, durationMinutes: 60, compMinutes: 0, status: "booked", checkedInAt: null, lightsOffAt: null, totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: true, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Rayan Ali", phone: "0321 7779900" }, { name: "Usman Sheikh", phone: "0301 5550099" }, { name: "Talha Iqbal", phone: "0333 5558877" }, { name: "Danish Ali", phone: "0309 5556655" }], 0) },
    ] : [];
    return {
      bookings: [
        { id: uid(), courtId: "c1", customerName: "Ali Raza", customerPhone: "0300 1112233", dateISO, startMinutes: aliStart, durationMinutes: 60, compMinutes: 10, status: "checked_in", checkedInAt: checkedIn1, lightsOffAt: atMin(aliStart + 70), totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: true, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Ali Raza", phone: "0300 1112233" }, { name: "Daniyal Sheikh", phone: "0321 5551234" }, { name: "Omar Farooq", phone: "0333 5559876" }, { name: "Zain Ul Abideen", phone: "0301 5553456" }], 3) },
        { id: uid(), courtId: "c3", customerName: "Sara Khan", customerPhone: "0321 4455667", dateISO, startMinutes: saraStart, durationMinutes: 60, compMinutes: 0, status: "checked_in", checkedInAt: checkedIn3, lightsOffAt: atMin(saraStart + 60), totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: true, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Sara Khan", phone: "0321 4455667" }, { name: "Mahnoor Fatima", phone: "0302 5557788" }, { name: "Hira Shahid", phone: "0345 5552211" }, { name: "Areeba Khan", phone: "0311 5556644" }], 2) },
        ...changeoverPair,
        { id: uid(), courtId: "c2", customerName: "Hamza Tariq", customerPhone: "0333 9988776", dateISO, startMinutes: Math.min(coEnd + 75, 1435), durationMinutes: 60, compMinutes: 0, status: "booked", checkedInAt: null, lightsOffAt: null, totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: true, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Hamza Tariq", phone: "0333 9988776" }, { name: "Ahmed Raza", phone: "0300 5554321" }, { name: "Bilal Hussain", phone: "0322 5558765" }, { name: "Fahad Iqbal", phone: "0303 5552109" }], 1) },
      ],
      log: [
        { id: uid(), courtName: "Court 1", action: "on", reason: "club_delay", at: aliCompAt },
        { id: uid(), courtName: "Court 1", action: "on", reason: "check_in", at: checkedIn1 },
        { id: uid(), courtName: "Court 3", action: "on", reason: "check_in", at: checkedIn3 },
        ...(coStart >= 0 ? [{ id: uid(), courtName: "Court 2", action: "on" as const, reason: "check_in" as const, at: atMin(coStart) }] : []),
      ],
    };
  }
  if (offset === 1) {
    return {
      bookings: [
        { id: uid(), courtId: "c1", customerName: "Usman Malik", customerPhone: "0301 2233445", dateISO, startMinutes: 19 * 60, durationMinutes: 90, compMinutes: 0, status: "booked", checkedInAt: null, lightsOffAt: null, totalAmount: DEFAULT_RATE_PER_HOUR * 1.5, splitPayment: true, shares: equalShares(DEFAULT_RATE_PER_HOUR * 1.5, [{ name: "Usman Malik", phone: "0301 2233445" }, { name: "Talha Mehmood", phone: "0312 5553344" }, { name: "Shahzaib Ali", phone: "0331 5559988" }, { name: "Waqas Ahmad", phone: "0309 5551122" }], 0) },
        { id: uid(), courtId: "c2", customerName: "Ayesha Noor", customerPhone: "0345 6677889", dateISO, startMinutes: 20 * 60 + 30, durationMinutes: 60, compMinutes: 0, status: "booked", checkedInAt: null, lightsOffAt: null, totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: false, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Ayesha Noor", phone: "0345 6677889" }], 0) },
      ],
      log: [],
    };
  }
  if (offset === -1) {
    const y = isoToDate(dateISO); y.setHours(19, 5, 0, 0); // checked in 5 min late (his own fault)…
    const yStart = isoToDate(dateISO); yStart.setHours(19, 0, 0, 0);
    const off = new Date(yStart.getTime() + 60 * 60_000); // …so the session still ended at the booked end, 20:00
    return {
      bookings: [
        { id: uid(), courtId: "c1", customerName: "Bilal Ahmed", customerPhone: "0308 1122334", dateISO, startMinutes: 19 * 60, durationMinutes: 60, compMinutes: 0, status: "completed", checkedInAt: y, lightsOffAt: off, totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: true, shares: equalShares(DEFAULT_RATE_PER_HOUR, [{ name: "Bilal Ahmed", phone: "0308 1122334" }, { name: "Hassan Javed", phone: "0305 5556677" }, { name: "Imran Khalid", phone: "0323 5554433" }, { name: "Noman Aslam", phone: "0313 5552211" }], 4) },
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
const btnCls = "rounded-full border border-pb-border bg-pb-surface px-3 py-1.5 text-sm font-medium hover:bg-pb-surface2";
const chipCls = "rounded-full border border-pb-border bg-pb-surface2 px-2.5 py-0.5 text-xs font-semibold";

// Compact-tile (Variant B court cards, approved 2026-11-10) button sizes.
const tileBtnCls = "inline-flex h-[30px] items-center whitespace-nowrap rounded-full border border-pb-border bg-pb-surface px-3 text-[12.5px] font-semibold hover:bg-pb-surface2";
const tileTinyCls = "inline-flex h-[26px] items-center whitespace-nowrap rounded-full border border-pb-border bg-pb-surface px-2 text-[11.5px] font-semibold hover:bg-pb-surface2";
const tilePrimaryCls = "inline-flex h-[30px] items-center whitespace-nowrap rounded-full bg-pb-accent px-3 text-[12.5px] font-bold text-white hover:brightness-110";

/** Variant B countdown ring: the arc shows the ELAPSED fraction of the period
 *  the centred countdown belongs to; fraction null renders the bare track
 *  (idle court / not today). Tones: accent = live session, amber = the
 *  transitional states (checked-in waiting for its start, changeover). */
function ProgressRing({ fraction, label, tone }: { fraction: number | null; label: string; tone: "accent" | "amber" | "dim" }) {
  const C = 2 * Math.PI * 26;
  const f = fraction === null ? 0 : Math.min(1, Math.max(0, fraction));
  const toneCls = tone === "amber" ? "text-pb-amber" : tone === "dim" ? "text-pb-dim" : "text-pb-accent";
  return (
    <div className="relative h-16 w-16 flex-none" aria-hidden="true">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" className="text-pb-border" />
        <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} transform="rotate(-90 32 32)" className={toneCls} />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${label.length > 5 ? "text-[11px]" : "text-[15px]"}`}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [bookingsView, setBookingsView] = useState<"grid" | "list">("grid");
  const [gridFilter, setGridFilter] = useState<"all" | "live" | "booked" | "completed" | "no_show">("all");
  // Schedule grid shows a 5-hour window of the day at a time (paginated);
  // null = the default window for the selected date (see grid section).
  const [gridWindowStart, setGridWindowStart] = useState<number | null>(null);
  const [days, setDays] = useState<Record<string, DayData>>(() => seedAll());
  const [settings, setSettings] = useState<ClubSettings>({ lightingPowerKw: 2, electricityPricePerUnit: 50, noShowWaitMinutes: 15, openingHour: 10, closingHour: 23, courtRatePerHour: DEFAULT_RATE_PER_HOUR, changeoverGraceMinutes: 3 });
  const [now, setNow] = useState(() => new Date());
  const todayISO = isoFromDate(now);
  const [selectedISO, setSelectedISO] = useState<string>(() => isoFromDate(new Date()));
  // Transient action notices ("Court 2 lights OFF manually."): each one pops
  // as a toast and is kept in the notification panel until it has been read.
  const [notices, setNotices] = useState<{ id: string; text: string; read: boolean }[]>([]);
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [focusedBookingId, setFocusedBookingId] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const setNotice = (text: string) => {
    if (!text) return;
    const item = { id: uid(), text, read: false };
    setNotices((prev) => [item, ...prev].slice(0, 10));
    setToast(item);
  };
  const closeNotifications = () => {
    setShowNotifications(false);
    setNotices((prev) => prev.filter((n) => !n.read));
  };
  const toggleNotifications = () => {
    if (showNotifications) closeNotifications();
    else {
      setShowNotifications(true);
      setNotices((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", courtId: "c1", dateISO: todayISO, startTime: "19:00", durationMinutes: 60, totalAmount: DEFAULT_RATE_PER_HOUR, splitPayment: true, extraPlayers: [{ name: "", phone: "" }, { name: "", phone: "" }, { name: "", phone: "" }] as { name: string; phone: string }[] });
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [focusedCourtId, setFocusedCourtId] = useState<string | null>(null);
  const [shareMethods, setShareMethods] = useState<Record<string, PaymentMethod>>({});
  const completedRef = useRef<Set<string>>(new Set());
  const noShowRef = useRef<Set<string>>(new Set());
  const startedRef = useRef<Set<string>>(new Set());
  const changeoverRef = useRef<Set<string>>(new Set());

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
  const addLog = (iso: string, courtName: string, action: LightLogEntry["action"], reason: LightLogEntry["reason"], detail?: string) =>
    patchDay(iso, (d) => ({ ...d, log: [{ id: uid(), courtName, action, reason, at: new Date(), detail }, ...d.log] }));

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

  // Bookings view: grid by default; restore the saved choice like the theme.
  useEffect(() => {
    const saved = window.localStorage.getItem("pb-bookings-view");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the saved view on mount
    if (saved === "grid" || saved === "list") setBookingsView(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("pb-bookings-view", bookingsView);
  }, [bookingsView]);

  // Grid window: fall back to the new day's default window whenever the
  // selected date changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the grid window when the day changes
    setGridWindowStart(null);
  }, [selectedISO]);

  // Toast auto-dismiss (~6s). The notice itself stays in the notification
  // panel until the panel is opened and it is marked read.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur && cur.id === toast.id ? null : cur)), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Notification panel: close on outside click or Escape.
  useEffect(() => {
    if (!showNotifications) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) closeNotifications();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeNotifications(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showNotifications]);

  // A session is live only until its lights-off time (= sessionEnd: the booked
  // end + comp minutes); light state is DERIVED from this, never stored — a
  // stored copy once let courts show ON after time-up.
  const liveSessionForCourt = (courtId: string, at: Date) =>
    bookings.find((b) => b.courtId === courtId && b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > at);
  // Lights burn only INSIDE the booked window: a checked-in session counts
  // toward lights-on only once its BOOKED START has arrived. An early check-in
  // (inside the 15-min window) registers the arrival but the court stays dark
  // until the start; a check-in at/after the start lights it immediately.
  const lightsSessionForCourt = (courtId: string, at: Date) => {
    const s = liveSessionForCourt(courtId, at);
    return s && bookingStart(s) <= at ? s : undefined;
  };
  // The booking that follows `prev` on its court closely enough to count as
  // consecutive: it starts at prev's session end, or within the changeover
  // grace after it.
  const consecutiveNext = (prev: Booking, graceMinutes: number) => {
    if (!prev.lightsOffAt) return undefined;
    const endMs = prev.lightsOffAt.getTime();
    return bookings
      .filter((n) => n.courtId === prev.courtId && n.id !== prev.id
        && bookingStart(n).getTime() > bookingStart(prev).getTime()
        && bookingStart(n).getTime() <= endMs + graceMinutes * 60_000)
      .sort((a, b) => a.startMinutes - b.startMinutes)[0];
  };
  // Changeover grace (decided 2026-11-10): when a session ends and a
  // consecutive booking follows on the same court, the lights do NOT switch
  // off at the end — they hold on for up to `changeoverGraceMinutes` waiting
  // for the next team. This is a derived LIGHTS state only: the finishing
  // session still ends at its booked end (status, fee, shares untouched), and
  // with no next booking the grace can never apply — lights go off at the
  // end, immediately. Once the next team checks in, their own session logic
  // owns the lights and the changeover ends.
  const changeoverForCourt = (courtId: string, at: Date) => {
    const grace = settings.changeoverGraceMinutes;
    if (grace <= 0) return undefined;
    const prev = bookings
      .filter((b) => b.courtId === courtId && b.checkedInAt !== null
        && (b.status === "checked_in" || b.status === "completed")
        && b.lightsOffAt !== null && b.lightsOffAt.getTime() <= at.getTime()
        && at.getTime() < b.lightsOffAt.getTime() + grace * 60_000)
      .sort((a, b) => (b.lightsOffAt as Date).getTime() - (a.lightsOffAt as Date).getTime())[0];
    if (!prev || !prev.lightsOffAt) return undefined;
    const prevEnd = prev.lightsOffAt;
    // If staff already switched this court off by hand during that session
    // (e.g. End session), the lights are off — there is no changeover to hold.
    const courtName = courts.find((c) => c.id === courtId)?.name;
    const cutByHand = log.some((e) => e.courtName === courtName && e.action === "off" && e.reason === "manual"
      && e.at.getTime() >= bookingStart(prev).getTime() && e.at.getTime() < prevEnd.getTime());
    if (cutByHand) return undefined;
    const next = consecutiveNext(prev, grace);
    if (!next || next.status !== "booked") return undefined;
    // The next booking's own window must not have fully passed already.
    if (bookingStart(next).getTime() + next.durationMinutes * 60_000 <= at.getTime()) return undefined;
    return { prev, next, until: new Date(prevEnd.getTime() + grace * 60_000) };
  };
  const lightsOnFor = (court: Court, at: Date) =>
    court.manualOverride ? court.manualLightsOn
      : lightsSessionForCourt(court.id, at) !== undefined || changeoverForCourt(court.id, at) !== undefined;

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
    const grace = settings.changeoverGraceMinutes;
    const heldForChangeover = (b: Booking) => {
      if (grace <= 0) return false;
      const succ = consecutiveNext(b, grace);
      return succ !== undefined && (succ.status === "booked" || succ.status === "checked_in");
    };
    const offEntries = due.filter((b) => !courts.find((c) => c.id === b.courtId)?.manualOverride && !heldForChangeover(b));
    if (offEntries.length > 0)
      patchDay(todayISO, (d) => ({ ...d, log: [...offEntries.map((b) => ({ id: uid(), courtName: courts.find((c) => c.id === b.courtId)?.name ?? "Court", action: "off" as const, reason: "automatic" as const, at: new Date() })), ...d.log] }));
    if (due.length > 0) {
      const held = due.filter(heldForChangeover);
      setNotice(held.length > 0
        ? `Time up — ${due.map((b) => b.customerName).join(", ")}: session completed. Lights held on for the changeover — they go off ${grace} min after the end if the next team doesn't check in.`
        : `Time up — ${due.map((b) => b.customerName).join(", ")}: session completed, lights off automatically.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isToday]);

  // Start sweep (today only): a session that was checked in EARLY only had its
  // arrival logged — when its booked start arrives, the lights turn on, so log
  // that switch-on exactly once (same ref-guarded pattern as the expiry sweep).
  useEffect(() => {
    if (!isToday) return;
    const starting = bookings.filter((b) => b.status === "checked_in" && b.checkedInAt !== null && b.checkedInAt < bookingStart(b) && bookingStart(b) <= now && !startedRef.current.has(b.id));
    if (starting.length === 0) return;
    starting.forEach((b) => startedRef.current.add(b.id));
    patchDay(todayISO, (d) => ({ ...d, log: [...starting.map((b) => ({ id: uid(), courtName: courts.find((c) => c.id === b.courtId)?.name ?? "Court", action: "on" as const, reason: "check_in" as const, at: new Date() })), ...d.log] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isToday]);

  // Changeover sweep (today only): a session that ended with a consecutive
  // booking behind it had its lights held on for the grace — no "off" was
  // logged at its end. If the next team never checked in, log that switch-off
  // exactly once when the grace expires (reason "changeover"). If they did
  // check in, their own session owns the lights and nothing is logged here.
  useEffect(() => {
    if (!isToday) return;
    const grace = settings.changeoverGraceMinutes;
    if (grace <= 0) return;
    const expired = bookings.filter((b) => {
      if (b.status !== "completed" || b.checkedInAt === null || b.lightsOffAt === null) return false;
      if (changeoverRef.current.has(b.id)) return false;
      const end = b.lightsOffAt;
      if (now.getTime() < end.getTime() + grace * 60_000) return false;
      if (courts.find((c) => c.id === b.courtId)?.manualOverride) return false;
      if (!consecutiveNext(b, grace)) return false;
      const tookOver = bookings.some((n) => n.courtId === b.courtId && n.id !== b.id && n.checkedInAt !== null
        && (n.status === "checked_in" || n.status === "completed")
        && bookingStart(n).getTime() > bookingStart(b).getTime()
        && bookingStart(n).getTime() <= end.getTime() + grace * 60_000);
      return !tookOver;
    });
    if (expired.length === 0) return;
    expired.forEach((b) => changeoverRef.current.add(b.id));
    patchDay(todayISO, (d) => ({ ...d, log: [...expired.map((b) => ({ id: uid(), courtName: courts.find((c) => c.id === b.courtId)?.name ?? "Court", action: "off" as const, reason: "changeover" as const, at: new Date(), detail: "Changeover grace expired — next team did not check in" })), ...d.log] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isToday]);

  const activeForCourt = (courtId: string) => liveSessionForCourt(courtId, now);

  // Alerts for the selected day (live ones only make sense today). These are
  // STANDING alerts: they live in the header notification panel and clear
  // themselves when the underlying condition resolves — never dismissible.
  interface StandingAlert { id: string; text: string; severity: "alert" | "info"; bookingId?: string; courtId?: string }
  const alerts: StandingAlert[] = [];
  if (isToday) {
    for (const b of bookings) {
      if (b.status === "checked_in" && b.lightsOffAt && b.lightsOffAt.getTime() - now.getTime() <= 5 * 60_000 && b.lightsOffAt > now)
        alerts.push({ id: `ending-${b.id}`, severity: "info", bookingId: b.id, text: `${b.customerName} on ${courts.find((c) => c.id === b.courtId)?.name} ends in ${countdown(b.lightsOffAt, now)} — offer an extension.` });
      if (b.status === "booked" && bookingStart(b) <= now && bookingStart(b).getTime() + b.durationMinutes * 60_000 > now.getTime())
        alerts.push({ id: `noshow-${b.id}`, severity: "alert", bookingId: b.id, text: `${b.customerName} has not checked in (${formatMinutesOfDay(b.startMinutes)} booking) — release the slot if they're a no-show.` });
      const pay = paymentSummary(b);
      if ((b.status === "booked" || b.status === "checked_in") && pay.outstanding > 0) {
        const unpaidNames = b.shares.filter((s) => !s.paid).map((s) => s.name).join(", ");
        if (b.status === "checked_in")
          alerts.push({ id: `unpaid-live-${b.id}`, severity: "alert", bookingId: b.id, text: `${fmtRs(pay.outstanding)} still unpaid on ${b.customerName}'s live session — ${unpaidNames} ${b.shares.filter((s) => !s.paid).length === 1 ? "has" : "have"} not paid. Collect at the counter or send a WhatsApp reminder from Payments.` });
        else if (bookingStart(b).getTime() - now.getTime() <= 3 * 60 * 60_000 && bookingStart(b).getTime() + b.durationMinutes * 60_000 > now.getTime())
          alerts.push({ id: `unpaid-${b.id}`, severity: "alert", bookingId: b.id, text: `${fmtRs(pay.outstanding)} unpaid for ${b.customerName}'s booking at ${formatMinutesOfDay(b.startMinutes)} — unpaid: ${unpaidNames}. Send reminders from Payments.` });
      }
    }
    for (const c of courts)
      if (lightsOnFor(c, now) && !activeForCourt(c.id) && !c.manualOverride && !changeoverForCourt(c.id, now))
        alerts.push({ id: `lights-${c.id}`, severity: "alert", courtId: c.id, text: `${c.name} lights are on with no active session.` });
  }
  const unreadNotices = notices.filter((n) => !n.read).length;
  const badgeCount = alerts.length + unreadNotices;

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
    const totalAmount = Math.round(form.totalAmount);
    if (!totalAmount || totalAmount < 0) { setNotice("Enter the court fee for this booking."); return; }
    const extras = form.extraPlayers.filter((p) => p.name.trim());
    if (form.splitPayment && extras.some((p) => !p.phone.trim())) { setNotice("Every split player needs a WhatsApp number, so payment requests can be sent."); return; }
    const players = [{ name: form.name.trim(), phone: form.phone.trim() }, ...(form.splitPayment ? extras.map((p) => ({ name: p.name.trim(), phone: p.phone.trim() })) : [])];
    const shares = equalShares(totalAmount, players, 0);
    patchBookings(form.dateISO, (b) => [...b, { id: uid(), courtId: form.courtId, customerName: form.name.trim(), customerPhone: form.phone.trim(), dateISO: form.dateISO, startMinutes, durationMinutes, status: "booked", checkedInAt: null, lightsOffAt: null, compMinutes: 0, totalAmount, splitPayment: form.splitPayment && players.length > 1, shares }]);
    setNotice(form.splitPayment && players.length > 1
      ? `Booking created for ${form.name} — ${fmtRs(totalAmount)} split ${players.length} ways (${fmtRs(Math.floor(totalAmount / players.length))} each). Payment requests ready in the booking's Payments panel.`
      : `Booking created for ${form.name} — ${formatMinutesOfDay(startMinutes)}–${formatMinutesOfDay(startMinutes + durationMinutes)} (${formatDuration(durationMinutes)}), fee ${fmtRs(totalAmount)}.`);
    setShowForm(false); setForm((f) => ({ ...f, name: "", phone: "", extraPlayers: [{ name: "", phone: "" }, { name: "", phone: "" }, { name: "", phone: "" }] }));
  }

  function handleCheckIn(b: Booking) {
    const check = canCheckIn(b, new Date());
    if (!check.ok) { setNotice(check.message); return; }
    const at = new Date();
    // The end is anchored to the BOOKED end (start + duration + comp), never to
    // the check-in moment: a late arrival through the player's own fault loses
    // the missed minutes. Lights-on is anchored to the BOOKED START: checking
    // in early (15-min window) only registers the arrival — the court stays
    // dark until the start; checking in at/after the start lights it at once.
    const off = sessionEnd(b);
    const start = bookingStart(b);
    const courtName = courts.find((c) => c.id === b.courtId)?.name ?? "Court";
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "checked_in", checkedInAt: at, lightsOffAt: off } : x)));
    patchCourts((cs) => cs.map((c) => (c.id === b.courtId ? { ...c, manualOverride: false, manualLightsOn: false } : c)));
    if (at < start) {
      addLog(b.dateISO, courtName, "arrived", "check_in", `Checked in — lights on at ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      setNotice(`${b.customerName} checked in — arrival registered. Lights stay off and turn on at the booked start (${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}); the session ends at the booked end — lights off at ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
    } else {
      addLog(b.dateISO, courtName, "on", "check_in");
      setNotice(`${b.customerName} checked in — lights on. Session ends at the booked end — lights off at ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
    }
  }

  function handleExtend(b: Booking, extraMinutes: number) {
    // The session really occupies start → start + duration + comp, so the clash
    // check must include any club-delay comp already granted.
    const clash = hasOverlap(bookings, b.courtId, b.startMinutes, b.durationMinutes + b.compMinutes + extraMinutes, b.id);
    if (clash) { setNotice(`Can't extend — the next slot is booked by ${clash.customerName}.`); return; }
    if (!b.lightsOffAt) return;
    const off = new Date(b.lightsOffAt.getTime() + extraMinutes * 60_000);
    const extraFee = Math.round((settings.courtRatePerHour * extraMinutes) / 60);
    patchBookings(b.dateISO, (prev) => prev.map((x) => {
      if (x.id !== b.id) return x;
      const newTotal = x.totalAmount + extraFee;
      // Re-split the new total equally, keeping who has already paid (and how) intact.
      const redistributed = equalShares(newTotal, x.shares.map((s) => ({ name: s.name, phone: s.phone })), 0);
      const shares = x.shares.map((s, i) => ({ ...s, amountDue: redistributed[i].amountDue }));
      return { ...x, durationMinutes: x.durationMinutes + extraMinutes, lightsOffAt: off, totalAmount: newTotal, shares };
    }));
    setNotice(`Extended by ${formatDuration(extraMinutes)} (+${fmtRs(extraFee)} added to the fee, re-split between players). New lights-off: ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  }

  /** Club delay: the delay was the club's fault, so staff grant FREE minutes.
   *  They accumulate in compMinutes — deliberately kept out of durationMinutes
   *  so the fee (totalAmount) and the split shares are never touched — and the
   *  grant is recorded in the light log as "Club delay +N min". */
  function handleClubDelay(b: Booking, compMins: number) {
    if (!b.lightsOffAt) return;
    const off = new Date(b.lightsOffAt.getTime() + compMins * 60_000);
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id ? { ...x, compMinutes: x.compMinutes + compMins, lightsOffAt: off } : x)));
    addLog(b.dateISO, courts.find((c) => c.id === b.courtId)?.name ?? "Court", "on", "club_delay", `Club delay +${compMins} min`);
    setNotice(`Club delay: +${compMins} min free for ${b.customerName} — no charge, fee and split shares unchanged. Session now ends ${off.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
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

  function handleToggleSharePaid(b: Booking, share: BookingShare) {
    const method = shareMethods[share.id] ?? "cash";
    patchBookings(b.dateISO, (prev) => prev.map((x) => (x.id === b.id
      ? { ...x, shares: x.shares.map((s) => (s.id === share.id ? { ...s, paid: !s.paid, method: !s.paid ? method : null } : s)) }
      : x)));
    const sum = paymentSummary({ ...b, shares: b.shares.map((s) => (s.id === share.id ? { ...s, paid: !s.paid } : s)) });
    setNotice(share.paid
      ? `${share.name}'s share (${fmtRs(share.amountDue)}) marked unpaid again.`
      : `${share.name} paid ${fmtRs(share.amountDue)} via ${method}. ${sum.fullyPaid ? "Booking is now paid in full." : `${fmtRs(sum.outstanding)} still outstanding on this booking.`}`);
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
    completedRef.current.clear(); noShowRef.current.clear(); startedRef.current.clear(); changeoverRef.current.clear();
    setDays(seedAll());
    setSettings({ lightingPowerKw: 2, electricityPricePerUnit: 50, noShowWaitMinutes: 15, openingHour: 10, closingHour: 23, courtRatePerHour: DEFAULT_RATE_PER_HOUR, changeoverGraceMinutes: 3 });
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
      // "arrived" rows are not switch events (early check-in, lights still
      // off) — only a real "off" closes an open interval.
      else if (e.action === "off") { const s = onSince.get(e.courtName); if (s !== undefined) { lightMinutes += (e.at.getTime() - s) / 60_000; onSince.delete(e.courtName); } }
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
  const moneyBookings = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const collectedToday = moneyBookings.reduce((s, b) => s + paymentSummary(b).collected, 0);
  const outstandingToday = moneyBookings.reduce((s, b) => s + paymentSummary(b).outstanding, 0);

  // ---- KICKS-style layout data (sidebar stats, stat chips, trend panel) ----
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const liveNowCount = isToday ? bookings.filter((b) => b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > now && bookingStart(b) <= now).length : 0;
  const courtsLive = isToday ? courts.filter((c) => lightsOnFor(c, now)).length : 0;
  const nextBooking = [...bookings]
    .filter((b) => b.status === "booked" && (!isToday || bookingStart(b) > now))
    .sort((a, b) => a.startMinutes - b.startMinutes)[0];
  const trendCountFor = (iso: string) => (days[iso]?.bookings ?? []).filter((b) => b.status !== "cancelled").length;
  const trendDays = Array.from({ length: 7 }, (_, i) => {
    const iso = isoAddDays(selectedISO, i - 6);
    return {
      iso,
      cur: trendCountFor(iso),
      prev: trendCountFor(isoAddDays(iso, -7)),
      dow: isoToDate(iso).toLocaleDateString([], { weekday: "narrow" }),
      dayNum: isoToDate(iso).getDate(),
    };
  });
  const trendMax = Math.max(1, ...trendDays.flatMap((d) => [d.cur, d.prev]));
  const trendCurTotal = trendDays.reduce((s, d) => s + d.cur, 0);
  const trendPrevTotal = trendDays.reduce((s, d) => s + d.prev, 0);
  const collectedPct = collectedToday + outstandingToday > 0 ? Math.round((collectedToday / (collectedToday + outstandingToday)) * 100) : 0;

  // ---- Schedule grid (court × time) ----
  // Blocks sit at their TRUE start/duration (flexible bookings are not
  // snapped to hours); the visible range covers the day's bookings with an
  // hour of padding, and never shows less than the club's opening hours.
  const GRID_PX_PER_MIN = 64 / 60; // one hour row = 64px
  const gridBookings = bookings.filter((b) => b.status !== "cancelled");
  let gridStartMin = settings.openingHour * 60;
  let gridEndMin = settings.closingHour * 60;
  if (gridBookings.length > 0) {
    const earliest = Math.min(...gridBookings.map((b) => b.startMinutes));
    const latest = Math.max(...gridBookings.map((b) => b.startMinutes + b.durationMinutes + b.compMinutes));
    gridStartMin = Math.max(0, Math.min(gridStartMin, Math.floor((earliest - 60) / 30) * 30));
    gridEndMin = Math.min(1440, Math.max(gridEndMin, Math.ceil((latest + 60) / 30) * 30));
  }
  if (gridEndMin - gridStartMin < 180) gridEndMin = Math.min(1440, gridStartMin + 180);
  const nowMinToday = now.getHours() * 60 + now.getMinutes();
  // Block styling reuses the same derivations as the list/court cards:
  // live = checked in and inside the booked window; pending = checked in
  // early, lights still off until the booked start.
  const gridBlockState = (b: Booking): { cls: string; note: string; live: boolean; pending: boolean; kind: "live" | "booked" | "completed" | "no_show"; pay: ReturnType<typeof paymentSummary> } => {
    const pay = paymentSummary(b);
    const live = isToday && b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > now && bookingStart(b) <= now;
    if (live) return { cls: "live-block border-transparent text-white", note: "", live, pending: false, kind: "live", pay };
    const pending = isToday && b.status === "checked_in" && b.lightsOffAt !== null && b.lightsOffAt > now && bookingStart(b) > now;
    if (pending) return { cls: "border-pb-amber bg-pb-surface2 text-pb-text", note: "", live, pending, kind: "booked", pay };
    if (b.status === "no_show") return { cls: "border-red-500/60 bg-red-500/10 text-pb-dim", note: "no-show", live, pending, kind: "no_show", pay };
    if (b.status === "completed" || b.status === "checked_in") return { cls: "border-pb-border bg-pb-surface2 text-pb-dim", note: "", live, pending, kind: "completed", pay };
    return { cls: "border-pb-accent/60 bg-pb-booked text-pb-booked-text", note: "", live, pending, kind: "booked", pay };
  };
  // Filter chips under the grid: counts classify every block through the
  // same gridBlockState derivation the blocks themselves render with
  // (pending blocks count as Booked — they are upcoming bookings).
  const gridFilterCounts: Record<"all" | "live" | "booked" | "completed" | "no_show", number> = { all: gridBookings.length, live: 0, booked: 0, completed: 0, no_show: 0 };
  for (const b of gridBookings) gridFilterCounts[gridBlockState(b).kind] += 1;

  // ---- Grid 5-hour window + pagination ----
  // The grid renders a 300-minute window of the full range at a time;
  // blocks are clipped to the window (see the grid render below). Default
  // window: for today, the current hour floored; for any other day, the
  // range start. When the full range fits in 300 minutes the whole range
  // shows and pagination is disabled.
  const GRID_WINDOW_MINUTES = 300;
  const gridPaginates = gridEndMin - gridStartMin > GRID_WINDOW_MINUTES;
  const maxGridWindowStart = Math.max(gridStartMin, gridEndMin - GRID_WINDOW_MINUTES);
  const defaultGridWindowStart = isToday
    ? Math.max(gridStartMin, Math.min(Math.floor(nowMinToday / 60) * 60, maxGridWindowStart))
    : gridStartMin;
  const winStartMin = Math.max(gridStartMin, Math.min(gridWindowStart ?? defaultGridWindowStart, maxGridWindowStart));
  const winEndMin = Math.min(winStartMin + GRID_WINDOW_MINUTES, gridEndMin);
  const gridHeightPx = (winEndMin - winStartMin) * GRID_PX_PER_MIN;
  const gridHourMarks: number[] = [];
  for (let t = Math.ceil(winStartMin / 60) * 60; t < winEndMin; t += 60) gridHourMarks.push(t);
  if (gridHourMarks[gridHourMarks.length - 1] !== winEndMin) gridHourMarks.push(winEndMin);
  const showNowLine = isToday && nowMinToday >= winStartMin && nowMinToday <= winEndMin;
  const showGridNowButton = gridPaginates && isToday && (nowMinToday < winStartMin || nowMinToday >= winEndMin);
  const stepGridWindow = (delta: number) =>
    setGridWindowStart(Math.max(gridStartMin, Math.min(winStartMin + delta, maxGridWindowStart)));

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
    if (b.status === "checked_in" && b.lightsOffAt && b.lightsOffAt > now && bookingStart(b) > now) return { text: `Checked in · lights on at ${formatMinutesOfDay(b.startMinutes)}`, cls: "bg-pb-surface2 text-pb-dim" };
    if (b.status === "checked_in" && b.lightsOffAt && b.lightsOffAt > now) return { text: "Checked in · lights on", cls: "bg-pb-amber text-pb-amber-ink" };
    if (b.status === "completed") return { text: "Completed · lights off", cls: "bg-pb-surface2 text-pb-dim" };
    if (b.status === "booked") return { text: "Booked", cls: "bg-pb-surface2" };
    if (b.status === "no_show") return { text: "No-show · released", cls: "bg-pb-surface2 text-pb-dim" };
    if (b.status === "cancelled") return { text: "Cancelled", cls: "bg-pb-surface2 text-pb-dim" };
    return { text: b.status.replace("_", " "), cls: "bg-pb-surface2" };
  };

  const navItems: { label: string; glyph: string; action: () => void }[] = [
    { label: "Dashboard", glyph: "⌂", action: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    { label: "Courts", glyph: "◎", action: () => scrollToId("courts") },
    { label: "Bookings", glyph: "▦", action: () => scrollToId("bookings") },
    { label: "Payments", glyph: "◈", action: () => scrollToId("bookings") },
    { label: "Light Log", glyph: "☰", action: () => scrollToId("light-log") },
    { label: "Settings", glyph: "⚙", action: () => { setShowSettings(true); setTimeout(() => scrollToId("settings-panel"), 60); } },
  ];

  // Clicking a standing alert in the notification panel jumps to the thing it
  // is about: unpaid alerts also open that booking's Payments panel (where
  // the WhatsApp reminders live); the lights alert jumps to the court card.
  const handleAlertClick = (a: StandingAlert) => {
    closeNotifications();
    if (a.bookingId) {
      if (a.id.startsWith("unpaid")) setExpandedBookingId(a.bookingId);
      setFocusedBookingId(a.bookingId);
      setTimeout(() => scrollToId(`booking-row-${a.bookingId}`), 60);
    } else if (a.courtId) {
      setFocusedCourtId(a.courtId);
      setTimeout(() => scrollToId(`court-card-${a.courtId}`), 60);
    }
  };

  // Clicking a grid block reuses the list's machinery exactly like the
  // bell's click-to-jump: open the booking's Payments panel in the list and
  // scroll to its row, where Check-in / Club delay / Extend / End session
  // and the share controls all live.
  const handleGridBlockClick = (b: Booking) => {
    setExpandedBookingId(b.id);
    setFocusedBookingId(b.id);
    setBookingsView("list");
    setTimeout(() => scrollToId(`booking-row-${b.id}`), 60);
  };

  return (
    <div className="flex w-full text-pb-text">
      {/* Sidebar — KICKS-style: wordmark, icon nav, day stats. Icon rail on
          medium screens, full labels + stats on xl; hidden on phones, where
          the header below carries the branding and actions. */}
      <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col border-r border-pb-border bg-pb-chrome md:flex xl:w-60">
        <div className="px-3 py-5 text-center xl:px-5 xl:text-left">
          <p className="text-xl font-extrabold uppercase leading-none tracking-wider">Padel<span className="text-pb-accent">Board</span></p>
          <p className="mt-1 hidden text-xs text-pb-dim xl:block">Demo Padel Club</p>
        </div>
        <nav className="flex flex-col gap-1 px-2 xl:px-3">
          {navItems.map((item) => (
            <button key={item.label} onClick={item.action} title={item.label} className={`flex items-center justify-center gap-3 rounded-[10px] px-3 py-2 text-sm xl:justify-start ${item.label === "Dashboard" ? "bg-pb-booked font-bold text-pb-accent" : "font-medium hover:bg-pb-surface2"}`}>
              <span aria-hidden className="w-5 text-center text-base leading-none">{item.glyph}</span>
              <span className="hidden xl:inline">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto px-3 pb-6">
          <div className="text-center xl:hidden">
            <p className="text-2xl font-extrabold tabular-nums">{courtsLive}</p>
            <p className="text-[10px] font-semibold uppercase text-pb-dim">courts live</p>
          </div>
          <div className="hidden space-y-3 xl:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-pb-dim">{isToday ? "Today at a glance" : "Selected day"}</p>
            {[
              ["Bookings", String(counts.total)],
              ["Occupancy", `${utilization}%`],
              ["Courts live now", String(courtsLive)],
              ["Collected", fmtRs(collectedToday)],
              ["Outstanding", fmtRs(outstandingToday)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-pb-dim">{label}</span>
                <span className="text-sm font-bold tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-2">
        {/* Compact brand for phones — the sidebar carries the branding on md+ screens */}
        <span className="text-lg font-extrabold uppercase leading-none tracking-wide md:hidden">Padel<span className="text-pb-accent">Board</span><span className="ml-1.5 text-xs font-semibold normal-case tracking-normal text-pb-dim">· Demo Padel Club</span></span>
        <button onClick={() => setSelectedISO(isoAddDays(selectedISO, -1))} className={btnCls}>← Prev day</button>
        <span className="px-1 text-[17px] font-semibold">{dateLabel}</span>
        <button onClick={() => setSelectedISO(isoAddDays(selectedISO, 1))} className={btnCls}>Next day →</button>
        <input type="date" value={selectedISO} onChange={(e) => e.target.value && setSelectedISO(e.target.value)} className="rounded-full border border-pb-border bg-pb-surface px-3 py-1.5 text-sm" />
        {!isToday && <button onClick={() => setSelectedISO(todayISO)} className={btnCls}>Back to today</button>}
        <span className="flex items-center gap-2 text-sm font-semibold text-pb-dim">
          <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-pb-accent" />
          Live · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <div className="ml-auto flex gap-2">
          {/* Notification bell: standing alerts + unread action notices */}
          <div className="relative" ref={notifRef}>
            <button onClick={toggleNotifications} className={`${btnCls} relative`} title="Notifications" aria-label="Notifications" aria-expanded={showNotifications}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="block h-5 w-5" aria-hidden><path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
              {badgeCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black leading-none text-white">{badgeCount}</span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[min(92vw,380px)] overflow-y-auto rounded-[14px] border border-pb-border bg-pb-surface p-3 text-left shadow-2xl">
                <p className="flex items-baseline justify-between px-1 pb-2">
                  <span className="text-sm font-bold">Notifications</span>
                  {badgeCount > 0 && <span className="text-xs font-semibold text-pb-dim">{alerts.length} active{unreadNotices > 0 ? ` · ${unreadNotices} new` : ""}</span>}
                </p>
                {alerts.length === 0 && notices.length === 0 && (
                  <p className="px-1 py-3 text-sm text-pb-dim">All clear — no notifications.</p>
                )}
                {alerts.length > 0 && (
                  <div className="space-y-2">
                    {alerts.map((a) => (
                      <button key={a.id} onClick={() => handleAlertClick(a)} title="Jump to it"
                        className={`flex w-full items-start gap-2 rounded-[10px] border px-3 py-2 text-left text-[13px] font-medium leading-snug ${a.severity === "alert" ? "border-red-500/50 bg-red-500/10 hover:bg-red-500/15" : "border-pb-amber bg-pb-amber/15 hover:bg-pb-amber/20"}`}>
                        <span aria-hidden>{a.severity === "alert" ? "⚠" : "◷"}</span><span>{a.text}</span>
                      </button>
                    ))}
                  </div>
                )}
                {notices.length > 0 && (
                  <div className={alerts.length > 0 ? "mt-3" : ""}>
                    <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-pb-dim">Recent activity</p>
                    <div className="space-y-2">
                      {notices.map((n) => (
                        <div key={n.id} className={`rounded-[10px] border border-pb-border bg-pb-surface2 px-3 py-2 text-[13px] font-medium leading-snug ${n.read ? "opacity-70" : ""}`}>{n.text}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} className={btnCls} title="Switch theme">{theme === "dark" ? "☀ Light" : "☾ Dark"}</button>
          <button onClick={() => openForm()} className="accent-shadow rounded-[10px] bg-pb-accent px-4 py-2 text-sm font-bold text-white">+ Add booking</button>
        </div>
      </header>

      {/* Stat chips — the day's headline numbers; the last chip carries
          the next booking that used to live on the hero card */}
      <section className="mt-5 flex flex-wrap gap-2" aria-label="Day at a glance">
        {[
          { label: isToday ? "Bookings today" : "Bookings", value: String(counts.total), amber: false },
          { label: "Occupancy", value: `${utilization}%`, amber: false },
          { label: "Collected", value: fmtRs(collectedToday), amber: false },
          { label: "Outstanding", value: fmtRs(outstandingToday), amber: true },
          { label: isToday ? "Lights saved today" : "Lights saved", value: `Rs ${Math.round(saved).toLocaleString()}`, amber: false },
        ].map((chip) => (
          <div key={chip.label} className="panel-shadow rounded-xl border border-pb-border bg-pb-surface px-3.5 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-pb-dim">{chip.label} </span>
            <span className={`text-[15px] font-extrabold tabular-nums ${chip.amber ? "text-pb-amber" : ""}`}>{chip.value}</span>
          </div>
        ))}
        <div className="panel-shadow rounded-xl border border-pb-border bg-pb-surface px-3.5 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-pb-dim">Next </span>
          <span className="text-[15px] font-extrabold">{nextBooking ? <>{nextBooking.customerName} · {courts.find((c) => c.id === nextBooking.courtId)?.name} · {formatMinutesOfDay(nextBooking.startMinutes)}</> : "No upcoming bookings"}</span>
        </div>
      </section>

      {/* Bookings — Doc §4: court × time schedule grid by default, list one tap away */}
      <section id="bookings" className="mt-6 scroll-mt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-semibold">Bookings — {dateLabel}</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bookingsView === "grid" && gridPaginates && (
              <span className="flex items-center gap-1.5" role="group" aria-label="Grid time window">
                <button onClick={() => stepGridWindow(-GRID_WINDOW_MINUTES)} disabled={winStartMin <= gridStartMin} className={`${btnCls} disabled:cursor-not-allowed disabled:opacity-40`}>‹ Earlier</button>
                <span className="text-sm font-semibold tabular-nums">{formatMinutesOfDay(winStartMin)} – {formatMinutesOfDay(winEndMin)}</span>
                <button onClick={() => stepGridWindow(GRID_WINDOW_MINUTES)} disabled={winStartMin >= maxGridWindowStart} className={`${btnCls} disabled:cursor-not-allowed disabled:opacity-40`}>Later ›</button>
                {showGridNowButton && <button onClick={() => setGridWindowStart(defaultGridWindowStart)} className={btnCls}>Now</button>}
              </span>
            )}
            <span className="flex gap-0.5 rounded-full border border-pb-border bg-pb-surface p-0.5" role="group" aria-label="Bookings view">
              <button onClick={() => setBookingsView("grid")} aria-pressed={bookingsView === "grid"} className={bookingsView === "grid" ? "rounded-full bg-pb-accent px-3 py-1 text-sm font-bold text-white" : "rounded-full px-3 py-1 text-sm font-medium text-pb-dim hover:bg-pb-surface2"}>▦ Grid</button>
              <button onClick={() => setBookingsView("list")} aria-pressed={bookingsView === "list"} className={bookingsView === "list" ? "rounded-full bg-pb-accent px-3 py-1 text-sm font-bold text-white" : "rounded-full px-3 py-1 text-sm font-medium text-pb-dim hover:bg-pb-surface2"}>☰ List</button>
            </span>
          </div>
        </div>
        {bookingsView === "grid" ? (
          <>
            <div className="panel-shadow overflow-x-auto rounded-[14px] border border-pb-border bg-pb-surface">
              <div style={{ minWidth: `${56 + courts.length * 172}px` }}>
                {/* Court header row */}
                <div className="flex border-b border-pb-border">
                  <div className="shrink-0" style={{ width: 56 }} />
                  {courts.map((c) => (
                    <div key={c.id} className="flex-1 border-l border-pb-border px-2 py-3 text-center">
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-pb-dim">LED · {settings.lightingPowerKw} kW</p>
                    </div>
                  ))}
                </div>
                {/* Time body: hour + half-hour gridlines, blocks at true positions */}
                <div className="relative flex" style={{ height: gridHeightPx }}>
                  <div className="relative shrink-0" style={{ width: 56 }}>
                    {gridHourMarks.map((t) => (
                      <span key={t} className="absolute right-2 whitespace-nowrap text-[11px] font-medium text-pb-dim" style={{ top: (t - winStartMin) * GRID_PX_PER_MIN, transform: t === winEndMin ? "translateY(-100%)" : "translateY(-50%)" }}>{formatMinutesOfDay(t)}</span>
                    ))}
                    {showNowLine && (
                      <span className="absolute right-0.5 z-30 whitespace-nowrap rounded-full bg-red-500 px-1.5 py-px text-[10px] font-black text-white" style={{ top: (nowMinToday - winStartMin) * GRID_PX_PER_MIN, transform: "translateY(-50%)" }}>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    )}
                  </div>
                  <div className="relative flex flex-1" style={{ backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 30%, transparent) 1px, transparent 1px)", backgroundSize: `100% ${60 * GRID_PX_PER_MIN}px, 100% ${30 * GRID_PX_PER_MIN}px` }}>
                    {courts.map((c) => {
                      const co = isToday && !c.manualOverride ? changeoverForCourt(c.id, now) : undefined;
                      const coEndMin = co && co.prev.lightsOffAt ? co.prev.lightsOffAt.getHours() * 60 + co.prev.lightsOffAt.getMinutes() : 0;
                      return (
                        <div key={c.id} title="Tap an empty time to create a booking for it" className="relative flex-1 border-l border-pb-border/60"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const mins = winStartMin + Math.floor(((e.clientY - rect.top) / GRID_PX_PER_MIN) / 30) * 30;
                            openForm(c.id, Math.max(winStartMin, Math.min(mins, winEndMin - 30)), selectedISO);
                          }}>
                          {gridBookings.filter((b) => b.courtId === c.id).map((b) => {
                            const st = gridBlockState(b);
                            if (gridFilter !== "all" && st.kind !== gridFilter) return null;
                            // Blocks are clipped to the visible window: only
                            // the part inside [winStartMin, winEndMin) renders,
                            // with a flat edge where the booking runs past it.
                            const clipStart = Math.max(b.startMinutes, winStartMin);
                            const clipEnd = Math.min(b.startMinutes + b.durationMinutes, winEndMin);
                            if (clipEnd <= clipStart) return null;
                            const clippedTop = b.startMinutes < winStartMin;
                            const clippedBottom = b.startMinutes + b.durationMinutes > winEndMin;
                            const top = (clipStart - winStartMin) * GRID_PX_PER_MIN + (clippedTop ? 0 : 1);
                            const height = Math.max(20, (clipEnd - clipStart) * GRID_PX_PER_MIN - (clippedTop ? 0 : 1) - (clippedBottom ? 0 : 1));
                            return (
                              <button key={b.id} onClick={(e) => { e.stopPropagation(); handleGridBlockClick(b); }}
                                title={`${b.customerName} · ${formatMinutesOfDay(b.startMinutes)}–${formatMinutesOfDay(b.startMinutes + b.durationMinutes)} — tap for details and payments`}
                                className={`absolute inset-x-1 z-10 overflow-hidden rounded-[10px] border px-2 py-1.5 text-left ${st.cls}${clippedTop ? " rounded-t-none" : ""}${clippedBottom ? " rounded-b-none" : ""}`}
                                style={{ top, height }}>
                                <span className="block truncate text-[12.5px] font-bold leading-tight">{b.customerName}</span>
                                <span className="block truncate text-[10px] leading-tight opacity-80">{formatMinutesOfDay(b.startMinutes)} – {formatMinutesOfDay(b.startMinutes + b.durationMinutes)}{st.note ? ` · ${st.note}` : ""}</span>
                                {st.live && height >= 46 && <span className="mt-0.5 inline-block rounded-full bg-pb-amber px-1.5 py-px text-[9px] font-black text-pb-amber-ink">● LIVE · LIGHTS ON</span>}
                                {st.pending && height >= 46 && <span className="mt-0.5 inline-block rounded-full bg-pb-amber px-1.5 py-px text-[9px] font-black text-pb-amber-ink">LIGHTS ON AT {formatMinutesOfDay(b.startMinutes)}</span>}
                                {!st.live && st.pay.outstanding > 0 && b.status !== "no_show" && height >= 46 && <span className="mt-0.5 inline-block rounded-full bg-red-500 px-1.5 py-px text-[9px] font-black text-white">{fmtRs(st.pay.outstanding)} UNPAID</span>}
                              </button>
                            );
                          })}
                          {co && coEndMin > winStartMin && coEndMin < winEndMin && (
                            <div onClick={(e) => e.stopPropagation()} title={`Changeover — lights held for ${co.next.customerName}`}
                              className="absolute inset-x-0 z-20 flex items-center justify-center"
                              style={{ top: Math.max(0, Math.min((coEndMin - winStartMin) * GRID_PX_PER_MIN - 7, gridHeightPx - 14)), height: 14, backgroundImage: "repeating-linear-gradient(45deg, var(--amber) 0 6px, rgba(0,0,0,0.55) 6px 12px)" }}>
                              <span className="whitespace-nowrap bg-black/60 px-1 text-[9px] font-black uppercase tracking-wide text-white">Changeover · {settings.changeoverGraceMinutes} min</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {showNowLine && <div className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-red-500" style={{ top: (nowMinToday - winStartMin) * GRID_PX_PER_MIN }} />}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter grid by booking state" data-grid-filters>
              {([
                { key: "all", label: "All", dotCls: "bg-pb-dim", activeDotCls: "bg-white" },
                { key: "live", label: "Live", dotCls: "bg-pb-accent", activeDotCls: "bg-white" },
                { key: "booked", label: "Booked", dotCls: "border border-pb-accent/60 bg-pb-booked", activeDotCls: "border border-white/70 bg-white/30" },
                { key: "completed", label: "Completed", dotCls: "border border-pb-border bg-pb-surface2", activeDotCls: "border border-white/70 bg-white/30" },
                { key: "no_show", label: "No-show", dotCls: "bg-red-500/50", activeDotCls: "bg-red-200" },
              ] as const).map((f) => {
                const active = gridFilter === f.key;
                return (
                  <button key={f.key} onClick={() => setGridFilter(f.key)} aria-pressed={active}
                    className={active ? "flex items-center gap-1.5 rounded-full bg-pb-accent px-2.5 py-1 text-xs font-bold text-white" : "flex items-center gap-1.5 rounded-full border border-pb-border bg-pb-surface px-2.5 py-1 text-xs font-semibold text-pb-dim hover:bg-pb-surface2"}>
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${active ? f.activeDotCls : f.dotCls}`} />
                    {f.label} {gridFilterCounts[f.key]}
                  </button>
                );
              })}
              <span className="ml-auto text-xs font-semibold text-pb-dim">Tap a booking for its details and payments · tap an empty time to book it</span>
            </div>
          </>
        ) : (
        <div className="panel-shadow divide-y divide-pb-border rounded-[14px] border border-pb-border bg-pb-surface">
          {bookings.length === 0 && <p className="p-4 text-sm text-pb-dim">No bookings for this day yet.</p>}
          {[...bookings].sort((a, b) => a.startMinutes - b.startMinutes).map((b) => {
            const chip = statusChip(b);
            const start = bookingStart(b);
            const end = new Date(start.getTime() + (b.durationMinutes + b.compMinutes) * 60_000);
            const check = canCheckIn(b, now);
            const noShowWaiting = isToday && b.status === "booked" && start <= now && end > now;
            const timeUp = b.status === "completed" && b.lightsOffAt;
            const pay = paymentSummary(b);
            const expanded = expandedBookingId === b.id;
            const courtName = courts.find((c) => c.id === b.courtId)?.name ?? "Court";
            return (
              <div key={b.id} id={`booking-row-${b.id}`} className={`scroll-mt-4 p-3 text-sm ${focusedBookingId === b.id ? "bg-pb-accent/10" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono font-semibold">{formatMinutesOfDay(b.startMinutes)}–{formatMinutesOfDay(b.startMinutes + b.durationMinutes)}</span>
                <span className="text-pb-dim">({formatDuration(b.durationMinutes)})</span>
                <span>{courts.find((c) => c.id === b.courtId)?.name}</span>
                <span className="font-semibold">{b.customerName}</span>
                <span className="text-pb-dim">{b.customerPhone}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip.cls}`}>{chip.text}</span>
                {b.status !== "cancelled" && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pay.fullyPaid ? "bg-emerald-500/20 text-emerald-600" : pay.collected > 0 ? "bg-pb-amber/25" : "bg-red-500/15 text-red-500"}`}>
                    {pay.fullyPaid ? `Paid in full · ${fmtRs(b.totalAmount)}` : b.splitPayment ? `Split · ${pay.paidCount}/${pay.shareCount} paid · ${fmtRs(pay.outstanding)} left` : `Unpaid · ${fmtRs(b.totalAmount)}`}
                  </span>
                )}
                {timeUp ? <span className="text-xs text-pb-dim">Time&apos;s up — lights went off at {b.lightsOffAt!.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
                {b.status === "checked_in" && b.lightsOffAt ? <span className="text-xs text-pb-dim">Ends {b.lightsOffAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{b.compMinutes > 0 ? ` · incl. +${b.compMinutes} min club delay` : ""}</span> : null}
                {noShowWaiting && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-500">No-show waiting</span>}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {b.status !== "cancelled" && <button onClick={() => setExpandedBookingId(expanded ? null : b.id)} className={btnCls}>{expanded ? "Hide payments" : "Payments"}</button>}
                  {b.status === "booked" && (
                    <>
                      <button disabled={!check.ok} title={check.ok ? "" : check.message} onClick={() => handleCheckIn(b)} className="rounded-full bg-pb-accent px-3.5 py-1 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Check in</button>
                      {!check.ok && check.message && <span className="text-xs text-pb-dim">{check.message}</span>}
                      <button onClick={() => handleReleaseNoShow(b)} className={btnCls}>Release slot</button>
                      <button onClick={() => handleCancel(b)} className={btnCls}>Cancel</button>
                    </>
                  )}
                  {b.status === "checked_in" && isToday && (
                    <>
                      <button onClick={() => handleExtend(b, 30)} className={btnCls}>+30m</button>
                      <button onClick={() => handleExtend(b, 60)} className={btnCls}>+60m</button>
                      <span className="flex items-center gap-1 text-xs font-semibold text-pb-dim" title="Free minutes when the delay was the club's fault — no charge, fee unchanged">Club delay {[5, 10, 15].map((mins) => <button key={mins} onClick={() => handleClubDelay(b, mins)} className={btnCls}>+{mins}m</button>)}</span>
                      <button onClick={() => handleEndSession(b)} className={btnCls}>End session</button>
                    </>
                  )}
                </span>
              </div>
              {expanded && b.status !== "cancelled" && (
                <div className="mt-3 rounded-xl border border-pb-border bg-pb-surface2/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold uppercase tracking-wide text-xs">{b.splitPayment ? "Split payment" : "Payment"} — {courtName}</span>
                    <span className="text-xs text-pb-dim">Total {fmtRs(b.totalAmount)} · Collected {fmtRs(pay.collected)} · Outstanding {fmtRs(pay.outstanding)}</span>
                    <span className="ml-auto text-xs text-pb-dim">Prototype: players pay the club&apos;s JazzCash/Easypaisa or cash, staff mark each share paid. Automatic in-app payment is a later phase.</span>
                  </div>
                  <div className="mt-2 divide-y divide-pb-border">
                    {b.shares.map((sh) => (
                      <div key={sh.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="font-semibold">{sh.name}</span>
                        <span className="text-pb-dim">{sh.phone}</span>
                        <span className="font-mono font-semibold">{fmtRs(sh.amountDue)}</span>
                        {sh.paid
                          ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-600">Paid{sh.method ? ` · ${sh.method}` : ""}</span>
                          : <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-500">Unpaid</span>}
                        <span className="ml-auto flex flex-wrap items-center gap-2">
                          {!sh.paid && (
                            <>
                              <select value={shareMethods[sh.id] ?? "cash"} onChange={(e) => setShareMethods((m) => ({ ...m, [sh.id]: e.target.value as PaymentMethod }))} className="rounded-[10px] border border-pb-border bg-pb-surface px-2 py-1 text-xs">
                                <option value="cash">Cash</option>
                                <option value="jazzcash">JazzCash</option>
                                <option value="easypaisa">Easypaisa</option>
                                <option value="card">Card</option>
                              </select>
                              <a href={whatsappReminderLink(b, sh, courtName)} target="_blank" rel="noreferrer" className={btnCls}>WhatsApp reminder</a>
                            </>
                          )}
                          <button onClick={() => handleToggleSharePaid(b, sh)} className={sh.paid ? btnCls : "rounded-full bg-pb-accent px-3 py-1 text-xs font-bold text-white"}>{sh.paid ? "Undo paid" : "Mark paid"}</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </div>
        )}
      </section>

      {/* Court cards — Doc §4 */}
      <section id="courts" className="mt-6 grid scroll-mt-4 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courts.map((court) => {
          const active = isToday ? activeForCourt(court.id) : undefined;
          const lightsOn = isToday && lightsOnFor(court, now);
          const pending = active !== undefined && bookingStart(active) > now;
          const changeover = isToday && !active && !court.manualOverride ? changeoverForCourt(court.id, now) : undefined;
          // Ring = elapsed fraction of whatever the countdown counts down:
          // live session (booked start → effective end incl. extensions/comp),
          // the 15-min check-in window when waiting for the booked start, or
          // the changeover grace window. No period → bare track.
          const ring = active
            ? pending
              ? { fraction: (now.getTime() - (bookingStart(active).getTime() - 15 * 60_000)) / (15 * 60_000), label: countdown(bookingStart(active), now), tone: "amber" as const }
              : { fraction: active.lightsOffAt ? (now.getTime() - bookingStart(active).getTime()) / (active.lightsOffAt.getTime() - bookingStart(active).getTime()) : null, label: countdown(active.lightsOffAt, now), tone: "accent" as const }
            : changeover
              ? { fraction: (now.getTime() - (changeover.until.getTime() - settings.changeoverGraceMinutes * 60_000)) / (settings.changeoverGraceMinutes * 60_000), label: countdown(changeover.until, now), tone: "amber" as const }
              : { fraction: null, label: "—", tone: "dim" as const };
          return (
            <div key={court.id} id={`court-card-${court.id}`} className={`panel-shadow rounded-[14px] border px-[18px] pb-3 pt-4 ${lightsOn ? "lit-glow border-pb-accent/60 bg-pb-accent/[0.07]" : "border-pb-border bg-pb-surface"} ${focusedCourtId === court.id ? "ring-2 ring-pb-accent/70" : ""}`}>
              <div className="flex items-center gap-4">
                <ProgressRing fraction={ring.fraction} label={ring.label} tone={ring.tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{court.name}</h2>
                    <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${lightsOn ? "bg-pb-amber text-pb-amber-ink" : "bg-pb-surface2 text-pb-dim"}`}>
                      {lightsOn && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-pb-amber-ink" />}
                      {lightsOn ? "Lights ON" : "Lights off"}
                    </span>
                  </div>
                  {active ? (
                    <>
                      <p className="mt-1 text-sm font-semibold">{active.customerName} <span className="font-medium text-pb-dim">· {active.customerPhone}</span></p>
                      {pending ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-pb-dim">Checked in · lights on at {formatMinutesOfDay(active.startMinutes)} · Ends {active.lightsOffAt?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{active.compMinutes > 0 ? ` · incl. +${active.compMinutes} min club delay` : ""}{court.manualOverride ? " · Manual override" : ""}</p>
                      ) : (
                        <p className="mt-0.5 text-xs leading-relaxed text-pb-dim">Ends {active.lightsOffAt?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{active.compMinutes > 0 ? ` · incl. +${active.compMinutes} min club delay` : ""}{court.manualOverride ? " · Manual override" : ""}</p>
                      )}
                    </>
                  ) : changeover ? (
                    <>
                      <p className="mt-1 text-[13.5px] font-medium">{changeover.prev.customerName} finished · next {changeover.next.customerName} at {formatMinutesOfDay(changeover.next.startMinutes)}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-pb-dim">Changeover · lights off at {changeover.until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} if {changeover.next.customerName} doesn&apos;t check in</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-pb-dim">
                      {!isToday ? "Sessions show live on the day" : lightsOn && court.manualOverride ? "Manual override — lights forced on by staff" : "No active session"}{court.manualOverride && isToday ? " · Manual override active" : ""}
                    </p>
                  )}
                </div>
              </div>
              {isToday && (
                <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                  <button onClick={() => handleToggleLights(court)} className={lightsOn ? tilePrimaryCls : tileBtnCls}>{lightsOn ? "Turn off manually" : "Turn on manually"}</button>
                  {court.manualOverride && <button onClick={() => handleBackToAuto(court)} className={tileBtnCls}>Back to auto</button>}
                  {active && <><button onClick={() => handleExtend(active, 30)} className={tileBtnCls}>Extend 30m</button><button onClick={() => handleExtend(active, 60)} className={tileBtnCls}>+1h</button><span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-pb-dim" title="Free minutes when the delay was the club's fault — no charge, fee unchanged">Club delay {[5, 10, 15].map((mins) => <button key={mins} onClick={() => handleClubDelay(active, mins)} className={tileTinyCls}>+{mins}</button>)}</span><button onClick={() => handleEndSession(active)} className="ml-auto px-1 py-1 text-xs font-semibold text-red-500 hover:text-red-400">End session</button></>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Free slots grid — Doc §4 */}
      <section className="mt-6 overflow-x-auto">
        <h2 className="mb-2 text-[17px] font-semibold">Free slots</h2>
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
                  const live = occ && occ.status === "checked_in" && isToday && occ.lightsOffAt !== null && occ.lightsOffAt > now && bookingStart(occ) <= now;
                  return (
                    <button key={`${h}-${c.id}`} disabled={!!occ} onClick={() => openForm(c.id, h * 60, selectedISO)}
                      className={`rounded-[10px] px-2 py-2 text-sm ${live ? "bg-pb-accent font-bold text-white" : occ ? "bg-pb-surface2 font-medium text-pb-dim" : past ? "bg-pb-surface text-pb-dim/60 hover:bg-pb-surface2" : "bg-pb-surface font-medium hover:bg-pb-accent/15"}`}>
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

      {/* Bottom panels — KICKS-style: performance trend + day state */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel-shadow rounded-[14px] border border-pb-border bg-pb-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Performance trend</h2>
            <p className="text-xs text-pb-dim">Bookings per day · 7 days to {dateLabel} vs the 7 before</p>
          </div>
          <div className="mt-4 flex h-36 items-end gap-2">
            {trendDays.map((d) => (
              <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 items-end gap-1">
                  <div title={`Previous period: ${d.prev} booking${d.prev === 1 ? "" : "s"}`} className="w-3 rounded-t bg-pb-dim/40" style={{ height: `${d.prev === 0 ? 0 : Math.max(6, (d.prev / trendMax) * 100)}%` }} />
                  <div title={`This period: ${d.cur} booking${d.cur === 1 ? "" : "s"}`} className="w-3 rounded-t bg-pb-accent" style={{ height: `${d.cur === 0 ? 0 : Math.max(6, (d.cur / trendMax) * 100)}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-pb-dim">{d.dow} {d.dayNum}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-pb-border pt-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-pb-accent" /> This 7 days · {trendCurTotal}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-pb-dim/40" /> Previous 7 days · {trendPrevTotal}</span>
            <span className={trendCurTotal >= trendPrevTotal ? "text-pb-accent" : "text-red-500"}>
              {trendCurTotal >= trendPrevTotal ? "▲" : "▼"} {Math.abs(trendCurTotal - trendPrevTotal)} vs previous
            </span>
          </div>
        </div>

        <div className="panel-shadow rounded-[14px] border border-pb-border bg-pb-surface p-5">
          <h2 className="text-[15px] font-semibold">{isToday ? "Today at the club" : "This day at the club"}</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              ["Bookings", String(counts.total)],
              ["Live sessions", String(liveNowCount)],
              ["No-shows", String(counts.noShow)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-pb-surface2 px-2 py-3">
                <p className="text-2xl font-extrabold tabular-nums">{value}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-pb-dim">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">Collected <span className="font-black">{fmtRs(collectedToday)}</span></span>
              <span className="text-pb-dim">Outstanding <span className="font-bold text-pb-text">{fmtRs(outstandingToday)}</span></span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-pb-surface2">
              <div className="h-full rounded-full bg-pb-accent" style={{ width: `${collectedPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-pb-dim">{collectedPct}% of the day&apos;s court fees collected (cancelled and no-show bookings excluded).</p>
          </div>
        </div>
      </section>

      {/* Today's numbers — Doc §6 */}
      <section className="mt-6">
        <h2 className="mb-2 text-[17px] font-semibold">{isToday ? "Today's numbers" : "Day numbers"}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Collected (court fees)", fmtRs(collectedToday)],
            ["Outstanding (court fees)", fmtRs(outstandingToday)],
            ["Light hours", lightHours.toFixed(1)],
            ["Electricity cost", `Rs ${Math.round(actualCost).toLocaleString()}`],
            ["Saved vs lights-on-all-day", `Rs ${Math.round(saved).toLocaleString()}`],
            ["Utilization", `${utilization}%`],
            ["Bookings", String(counts.total)],
            ["Completed / no-shows", `${counts.completed} / ${counts.noShow}`],
          ].map(([label, value]) => (
            <div key={label} className="panel-shadow rounded-[14px] border border-pb-border bg-pb-surface p-5"><p className="text-xs font-semibold uppercase text-pb-dim">{label}</p><p className="mt-1 text-xl font-extrabold">{value}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-pb-dim">Savings assume lights would otherwise stay on for all opening hours ({settings.openingHour}–{settings.closingHour}) on every court, at {settings.lightingPowerKw} kW × Rs {settings.electricityPricePerUnit}/unit. Light hours are summed from the day&apos;s light log.</p>
      </section>

      {/* Light log + settings */}
      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div id="light-log" className="panel-shadow scroll-mt-4 rounded-[14px] border border-pb-border bg-pb-surface p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Light log — {dateLabel}</h2>
          <ul className="space-y-1.5 text-sm">
            {[...log].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12).map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.action === "on" ? "bg-pb-amber text-pb-amber-ink" : "bg-pb-surface2 text-pb-dim"}`}>{l.action === "arrived" ? "ARRIVED" : l.action.toUpperCase()}</span>
                <span>{l.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — {l.detail ?? (l.action === "arrived" ? `${l.courtName} — checked in, lights still off` : `${l.courtName} lights ${l.action}`)}</span>
                <span className="text-pb-dim">({l.reason.replace("_", " ")})</span>
              </li>
            ))}
            {log.length === 0 && <li className="text-pb-dim">No switches logged this day.</li>}
          </ul>
        </div>

        {showSettings && (
          <div id="settings-panel" className="panel-shadow scroll-mt-4 rounded-[14px] border border-pb-border bg-pb-surface p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Club settings (Doc §6.1)</h2>
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
              <label className="block text-sm">Court fee (Rs / hour)
                <input type="number" min={0} step={100} value={settings.courtRatePerHour} onChange={(e) => setSettings({ ...settings, courtRatePerHour: Number(e.target.value) })} className={inputCls} /></label>
              <label className="block text-sm">Changeover grace (minutes)
                <input type="number" min={0} value={settings.changeoverGraceMinutes} onChange={(e) => setSettings({ ...settings, changeoverGraceMinutes: Number(e.target.value) })} className={inputCls} /></label>
            </div>
            <p className="mt-2 text-xs text-pb-dim">Cost of 1 hour of lights = {settings.lightingPowerKw} kW × Rs {settings.electricityPricePerUnit} = Rs {settings.lightingPowerKw * settings.electricityPricePerUnit}</p>
            <p className="mt-1 text-xs text-pb-dim">Changeover grace: with back-to-back bookings on a court, the lights hold on this many minutes past a session&apos;s end waiting for the next team (the session itself still ends on time). 0 turns the grace off — lights go off the moment a session ends.</p>
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

      {/* Action-notice toast: auto-dismisses after ~6s; the notice itself
          stays in the notification panel until it has been read. */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] items-start gap-3 rounded-[14px] border border-pb-border bg-pb-surface px-4 py-3 shadow-2xl">
          <p className="flex-1 text-sm font-medium leading-snug">{toast.text}</p>
          <button onClick={() => setToast(null)} className="-mr-1 -mt-0.5 text-xl leading-none text-pb-dim" aria-label="Dismiss notification">×</button>
        </div>
      )}

      {/* Booking modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={handleAddBooking} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-pb-surface p-5 shadow-xl sm:rounded-[14px]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add booking</h2>
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
                <input type="number" required min={1} max={1440} step={1} value={form.durationMinutes} onChange={(e) => setForm((f) => { const v = Number(e.target.value); const prevAuto = Math.round((settings.courtRatePerHour * Math.floor(f.durationMinutes)) / 60); return { ...f, durationMinutes: v, totalAmount: f.totalAmount === prevAuto ? Math.round((settings.courtRatePerHour * Math.floor(v || 0)) / 60) : f.totalAmount }; })} className={inputCls} />
              </label>
              <label className="text-xs font-semibold text-pb-dim">Court fee — total (Rs)
                <input type="number" required min={0} step={50} value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: Number(e.target.value) })} className={inputCls} />
              </label>
              <p className="self-end pb-2 text-xs text-pb-dim">Auto from {fmtRs(settings.courtRatePerHour)}/hour × duration — edit the total if this booking has a different price.</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((m) => <button type="button" key={m} onClick={() => setForm((f) => { const prevAuto = Math.round((settings.courtRatePerHour * Math.floor(f.durationMinutes)) / 60); return { ...f, durationMinutes: m, totalAmount: f.totalAmount === prevAuto ? Math.round((settings.courtRatePerHour * m) / 60) : f.totalAmount }; })} className={chipCls}>{formatDuration(m)}</button>)}
            </div>
            <p className="mt-3 rounded-[10px] bg-pb-surface2 px-3 py-2 text-sm font-semibold">
              {durationValid ? `${formatDuration(Math.floor(form.durationMinutes))} · ${formatMinutesOfDay(timeStringToMinutes(form.startTime))} – ${formatMinutesOfDay(timeStringToMinutes(form.startTime) + Math.floor(form.durationMinutes))} · Fee ${fmtRs(form.totalAmount || 0)}` : "Duration must be between 1 minute and 24 hours."}
            </p>
            {/* Split payment (prototype) */}
            <div className="mt-3 rounded-[10px] border border-pb-border p-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={form.splitPayment} onChange={(e) => setForm({ ...form, splitPayment: e.target.checked })} className="h-4 w-4" />
                Split payment between players
              </label>
              <p className="mt-1 text-xs text-pb-dim">Each player gets their own share and a WhatsApp payment request — nobody has to chase the captain, and the club chases nobody. The customer above is Player 1.</p>
              {form.splitPayment && (
                <div className="mt-2 space-y-2">
                  {form.extraPlayers.map((p, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-2">
                      <input placeholder={`Player ${i + 2} name`} value={p.name} onChange={(e) => setForm((f) => ({ ...f, extraPlayers: f.extraPlayers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} className={inputCls} />
                      <input placeholder={`Player ${i + 2} WhatsApp number`} value={p.phone} onChange={(e) => setForm((f) => ({ ...f, extraPlayers: f.extraPlayers.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) }))} className={inputCls} />
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    {form.extraPlayers.length < 7 && <button type="button" onClick={() => setForm((f) => ({ ...f, extraPlayers: [...f.extraPlayers, { name: "", phone: "" }] }))} className={btnCls}>+ Add player</button>}
                    {form.extraPlayers.length > 1 && <button type="button" onClick={() => setForm((f) => ({ ...f, extraPlayers: f.extraPlayers.slice(0, -1) }))} className={btnCls}>Remove last</button>}
                    <span className="text-xs font-semibold text-pb-dim">
                      {(() => { const n = 1 + form.extraPlayers.filter((p) => p.name.trim()).length; return `${fmtRs(form.totalAmount || 0)} ÷ ${n} player${n === 1 ? "" : "s"} = ${fmtRs(Math.floor((form.totalAmount || 0) / n))} each`; })()}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={!durationValid} className="flex-1 rounded-[10px] bg-pb-accent px-4 py-2.5 font-bold text-white disabled:opacity-40">Save booking</button>
              <button type="button" onClick={() => setShowForm(false)} className={btnCls}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <footer className="mt-10 border-t border-pb-border pt-4 text-xs text-pb-dim">PadelBoard — bookings, court lights and payments, all in one place.</footer>
    </main>
    </div>
  );
}
