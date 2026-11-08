export type BookingStatus = "booked" | "checked_in" | "completed" | "cancelled" | "no_show";

export interface Court {
  id: string;
  name: string;
  /** Only meaningful when manualOverride is true: the light state staff forced. */
  manualLightsOn: boolean;
  manualOverride: boolean;
}

export interface Booking {
  id: string;
  courtId: string;
  customerName: string;
  customerPhone: string;
  /** minutes since midnight, e.g. 19:30 = 1170 — any start time is allowed */
  startMinutes: number;
  /** any length from 1 minute up; extensions add minutes too */
  durationMinutes: number;
  status: BookingStatus;
  checkedInAt: Date | null;
  lightsOffAt: Date | null;
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
}
