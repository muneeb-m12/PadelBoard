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
  /** rupees owed by this player; all shares of a booking sum to its balance (totalAmount − advanceAmount) */
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
  /** any length from 1 minute up; PAID extensions add minutes (and fee) here */
  durationMinutes: number;
  /** FREE minutes granted when a delay was the club's fault. Kept separate from
   *  durationMinutes on purpose: comp pushes the session end later but never
   *  changes totalAmount and never re-splits the shares. */
  compMinutes: number;
  status: BookingStatus;
  checkedInAt: Date | null;
  lightsOffAt: Date | null;
  /** total court fee in rupees for this booking */
  totalAmount: number;
  /** Advance taken at booking time to secure the slot (Pakistan custom: part
   *  advance, balance after the match — nobody pays the full fee upfront).
   *  Paid by the organizer as ONE payment; the per-player shares below split
   *  only the BALANCE (totalAmount − advanceAmount). 0 = no advance. */
  advanceAmount: number;
  advancePaid: boolean;
  advanceMethod: PaymentMethod | null;
  /** true when the fee is split between players; false = organizer pays alone */
  splitPayment: boolean;
  /** per-player shares of the balance after the advance; a non-split booking
   *  has exactly one share (the organizer). Shares sum to totalAmount − advanceAmount. */
  shares: BookingShare[];
}

export interface LightLogEntry {
  id: string;
  courtName: string;
  /** "arrived" is NOT a switch event: it records an early check-in (arrival
   *  registered while the lights are still off — they turn on at the booked
   *  start, which gets its own "on" entry when it arrives). Light-hours maths
   *  must ignore "arrived" rows. */
  action: "on" | "off" | "arrived";
  reason: "check_in" | "automatic" | "manual" | "extension" | "power_restore" | "club_delay" | "changeover";
  at: Date;
  /** Optional line shown instead of "<court> lights on/off" — used for club-delay grants, e.g. "Club delay +10 min". */
  detail?: string;
}

export interface ClubSettings {
  lightingPowerKw: number;
  electricityPricePerUnit: number;
  noShowWaitMinutes: number;
  openingHour: number;
  closingHour: number;
  /** default court fee per hour in rupees — a booking's total is rate × duration unless overridden in the form */
  courtRatePerHour: number;
  /** default advance (rupees, flat per booking) taken to secure a slot —
   *  Rs 1,000 is the usual figure in Pakistan; editable per booking, 0 = none */
  defaultAdvanceAmount: number;
  /** Changeover grace (minutes): with a consecutive booking on the same court
   *  (starting at the session end or within this window after it), the lights
   *  hold on up to this many minutes past the end waiting for the next team.
   *  It is a lights state only — never a session extension — and it can never
   *  apply without a next booking. 0 disables it. */
  changeoverGraceMinutes: number;
}
