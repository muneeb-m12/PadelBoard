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
  /** hour of day, 24h, e.g. 19 = 7:00 PM */
  startHour: number;
  /** 1, 2 or 3 at booking time; extensions can add 0.5 / 1 */
  durationHours: number;
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
