import type { Booking } from "./types";

/** Doc §5: reject any booking that overlaps another active booking on the same court.
 *  All times are minutes since midnight; any start time and any duration (>= 1 min) is allowed. */
export function hasOverlap(bookings: Booking[], courtId: string, startMinutes: number, durationMinutes: number, ignoreId?: string): Booking | null {
  const end = startMinutes + durationMinutes;
  for (const b of bookings) {
    if (b.courtId !== courtId || b.id === ignoreId) continue;
    if (b.status !== "booked" && b.status !== "checked_in") continue;
    const bEnd = b.startMinutes + b.durationMinutes;
    if (startMinutes < bEnd && b.startMinutes < end) return b;
  }
  return null;
}

/** Local "YYYY-MM-DD" for a Date. */
export function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isoAddDays(iso: string, days: number): string {
  const d = isoToDate(iso); d.setDate(d.getDate() + days);
  return isoFromDate(d);
}

/** The moment a booking starts, as a Date. */
export function bookingStart(booking: Booking): Date {
  const start = isoToDate(booking.dateISO); start.setMinutes(booking.startMinutes);
  return start;
}

/** Doc §3: check-in opens 15 minutes before the booked start, closes at booked end. */
export function canCheckIn(booking: Booking, now: Date, earlyMinutes = 15): { ok: boolean; message: string } {
  if (booking.status !== "booked") return { ok: false, message: "This booking is not awaiting check-in." };
  const start = bookingStart(booking);
  const end = new Date(start.getTime() + booking.durationMinutes * 60_000);
  const opens = new Date(start.getTime() - earlyMinutes * 60_000);
  if (now < opens) return { ok: false, message: `Check-in opens at ${opens.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (15 min before start).` };
  if (now > end) return { ok: false, message: "This booking has already ended. A new booking is needed." };
  return { ok: true, message: "" };
}

/** The booked end of a session: booked start + booked length. Paid extensions
 *  add their minutes to durationMinutes, so they are already included here. */
export function bookedEnd(booking: Booking): Date {
  return new Date(bookingStart(booking).getTime() + booking.durationMinutes * 60_000);
}

/** Timing rule (decided 2026-11-10): the session end is anchored to the BOOKED
 *  end — booked start + duration (paid extensions included) + club-delay comp
 *  minutes. Check-in time never moves the end: a player who checks in late
 *  through his own fault loses that time, and only paid extensions or free
 *  club-delay comp push the end later. Lights-on is anchored to the booked
 *  START (correction, 2026-11-10): an early check-in inside the 15-min window
 *  only registers the arrival — lights stay off and turn on exactly at the
 *  booked start; a check-in at/after the start turns them on immediately.
 *  Changeover grace (2026-11-10) does NOT move this end: with a consecutive
 *  booking on the same court, the derived lights state (Dashboard) may hold
 *  the lights on for up to `changeoverGraceMinutes` past it waiting for the
 *  next team, but the session itself still ends exactly here. */
export function sessionEnd(booking: Booking): Date {
  return new Date(bookedEnd(booking).getTime() + booking.compMinutes * 60_000);
}

/** 1170 -> "7:30 PM" (wraps past midnight). */
export function formatMinutesOfDay(minutes: number): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setMinutes(minutes);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** 1 -> "1 min", 45 -> "45 min", 60 -> "1 h", 90 -> "1 h 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function timeStringToMinutes(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function minutesToTimeString(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
