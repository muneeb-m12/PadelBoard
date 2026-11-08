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

/** Doc §3: check-in opens 15 minutes before the booked start, closes at booked end. */
export function canCheckIn(booking: Booking, now: Date, earlyMinutes = 15): { ok: boolean; message: string } {
  if (booking.status !== "booked") return { ok: false, message: "This booking is not awaiting check-in." };
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setMinutes(booking.startMinutes);
  const end = new Date(start.getTime() + booking.durationMinutes * 60_000);
  const opens = new Date(start.getTime() - earlyMinutes * 60_000);
  if (now < opens) return { ok: false, message: `Check-in opens at ${opens.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (15 min before start).` };
  if (now > end) return { ok: false, message: "This booking has already ended. A new booking is needed." };
  return { ok: true, message: "" };
}

/** Doc §3 timing rule: lights-off = check-in time + booked length. */
export function lightsOffTime(checkedInAt: Date, durationMinutes: number): Date {
  return new Date(checkedInAt.getTime() + durationMinutes * 60_000);
}

export function formatHour(h: number): string {
  const d = new Date(); d.setHours(h % 24, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric" });
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
