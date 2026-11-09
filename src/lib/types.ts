export type BookingStatus = "booked" | "checked_in" | "completed" | "cancelled" | "no_show";

export interface Court {
  id: string;
  name: string;
  /** Only meaningful when manualOverride is true: the light state staff forced. */
  manualLightsOn: boolean;
  manualOverride: boolean;
}

export type PaymentMethod = "cash" | "jazzcash" | "easypaisa" | "card";

/** One player's share of a booking's court fee (split-payment prototype). */
export interface BookingShare {
  id: string;
  name: string;
  phone: string;
  /** rupees owed by this player; all shares of a booking sum to its totalAmount */
  amountDue: number;
  paid: boolean;
  method: PaymentMethod | null;
}

export interface Booking {
  id: string;
  courtId: string;
  customerName: string;
  customerPhone: string;
  /** local calendar date, "YYYY-MM-DD" */
  dateISO: string;
  /** minutes since midnight, e.g. 19:30 = 1170 — any start time is allowed */
  startMinutes: number;
  /** any length from 1 minute up; extensions add minutes too */
  durationMinutes: number;
  status: BookingStatus;
  checkedInAt: Date | null;
  lightsOffAt: Date | null;
  /** total court fee in rupees for this booking */
  totalAmount: number;
  /** true when the fee is split between players; false = organizer pays alone */
  splitPayment: boolean;
  /** per-player shares; a non-split booking has exactly one share (the organizer) */
  shares: BookingShare[];
}

export interface LightLogEntry {
  id: string;
  courtName: string;
  action: "on" | "off";
  reason: "check_in" | "automatic" | "manual" | "extension" | "power_restore";
  at: Date;
}

export interface ClubSettings {
  lightingPowerKw: number;
  electricityPricePerUnit: number;
  noShowWaitMinutes: number;
  openingHour: number;
  closingHour: number;
  /** default court fee per hour in rupees — a booking's total is rate × duration unless overridden in the form */
  courtRatePerHour: number;
}
