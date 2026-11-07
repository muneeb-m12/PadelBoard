import type { Booking } from "./types";

/** Doc §5: reject any booking that overlaps another active booking on the same court. */
export function hasOverlap(bookings: Booking[], courtId: string, startHour: number, durationHours: number, ignoreId?: string): Booking | null {
  const end = startHour + durationHours;
  for (const b of bookings) {
    if (b.courtId !== courtId || b.id === ignoreId) continue;
    if (b.status !== "booked" && b.status !== "checked_in") continue;
    const bEnd = b.startHour + b.durationHours;
    if (startHour < bEnd && b.startHour < end) return b;
  }
  return null;
}

/** Doc §3: check-in opens 15 minutes before the booked start, closes at booked end. */
export function canCheckIn(booking: Booking, now: Date, earlyMinutes = 15): { ok: boolean; message: string } {
  if (booking.status !== "booked") return { ok: false, message: "This booking is not awaiting check-in." };
  const start = new Date(now); start.setHours(booking.startHour, 0, 0, 0);
  const end = new Date(start); end.setHours(start.getHours() + booking.durationHours);
  const opens = new Date(start.getTime() - earlyMinutes * 60_000);
  if (now < opens) return { ok: false, message: `Check-in opens at ${opens.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (15 min before start).` };
  if (now > end) return { ok: false, message: "This booking has already ended. A new booking is needed." };
  return { ok: true, message: "" };
}

/** Doc §3 timing rule: lights-off = check-in time + booked length. */
export function lightsOffTime(checkedInAt: Date, durationHours: number): Date {
  return new Date(checkedInAt.getTime() + durationHours * 3_600_000);
}

export function formatHour(h: number): string {
  const d = new Date(); d.setHours(h % 24, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric" });
}
