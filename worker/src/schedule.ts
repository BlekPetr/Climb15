/** Pure scheduling logic for the reminder cron. */

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys?: { p256dh: string; auth: string };
}

export interface Device {
  subscription: PushSubscriptionJSON;
  /** "HH:MM" local time. */
  time: string;
  /** IANA time zone, e.g. "Europe/Prague". */
  tz: string;
  /** Local day the routine was last completed. */
  doneDay?: string;
  /** Local day the last reminder was sent. */
  lastSentDay?: string;
  updatedAt: number;
}

/** If the cron misses the exact minute, still send up to this long after. */
export const CATCH_UP_MINUTES = 60;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export const isValidDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Local calendar day and minute-of-day for `now` in `tz`. */
export function localParts(now: Date, tz: string): { day: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Returns the local day to mark as sent, or null if no push is due. */
export function dueDay(device: Device, now: Date): string | null {
  const { day, minutes } = localParts(now, device.tz);
  if (device.doneDay === day || device.lastSentDay === day) return null;
  const [h, m] = device.time.split(':').map(Number);
  const target = h * 60 + m;
  return minutes >= target && minutes < target + CATCH_UP_MINUTES ? day : null;
}
