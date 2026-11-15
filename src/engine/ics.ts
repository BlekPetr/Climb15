/**
 * Daily recurring calendar event as an .ics file. Uses floating local time
 * (no TZID) so the event stays at the same wall-clock time in whatever time
 * zone the calendar is in — which is what a daily habit reminder wants.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function icsStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export interface IcsOptions {
  /** "HH:MM" local time. */
  time: string;
  /** First day, local "YYYY-MM-DD". */
  startDay: string;
  url?: string;
  now?: Date;
  uid?: string;
}

export function buildIcs(o: IcsOptions): string {
  const [hh, mm] = o.time.split(':').map(Number);
  const date = o.startDay.replace(/-/g, '');
  const start = `${date}T${pad(hh)}${pad(mm)}00`;
  const endMin = hh * 60 + mm + 15;
  // Clamp to the same day; a reminder at 23:50 just gets a shorter event.
  const endH = Math.min(23, Math.floor(endMin / 60));
  const endM = endMin >= 24 * 60 ? 59 : endMin % 60;
  const end = `${date}T${pad(endH)}${pad(endM)}00`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Climb 15//Daily routine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${o.uid ?? 'climb15-daily'}@climb15`,
    `DTSTAMP:${icsStamp(o.now ?? new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Climb 15 — daily routine',
    `DESCRIPTION:15 minutes: warm-up\\, fingers\\, pulling\\, core\\, antagonists\\, flexibility.${o.url ? `\\n${o.url}` : ''}`,
    ...(o.url ? [`URL:${o.url}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time for Climb 15',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
