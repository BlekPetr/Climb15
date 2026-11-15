import { describe, expect, it } from 'vitest';
import { addDays, addDone, bestStreak, currentStreak, dayKey, lastDays, monthGrid } from './history';
import { buildIcs } from './ics';

describe('history', () => {
  it('day keys and arithmetic cross month/year boundaries', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // across a DST change (Europe: last Sunday of March)
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('current streak counts back from today, or from yesterday if today is open', () => {
    const done = ['2026-11-10', '2026-11-12', '2026-11-13', '2026-11-14'];
    expect(currentStreak(done, '2026-11-14')).toBe(3);
    expect(currentStreak(done, '2026-11-15')).toBe(3); // today not done yet
    expect(currentStreak(done, '2026-11-16')).toBe(0); // missed yesterday
    expect(currentStreak([...done, '2026-11-15'], '2026-11-15')).toBe(4);
    expect(currentStreak([], '2026-11-15')).toBe(0);
  });

  it('best streak finds the longest run', () => {
    expect(bestStreak([])).toBe(0);
    expect(bestStreak(['2026-01-01'])).toBe(1);
    expect(bestStreak(['2026-01-03', '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-02'])).toBe(3);
    expect(bestStreak(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'])).toBe(4);
  });

  it('lastDays is oldest-first and ends today', () => {
    expect(lastDays('2026-11-02', 3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('monthGrid is Monday-first with padding', () => {
    const g = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(g[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(g[0][6]).toBe('2026-11-01');
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });

  it('addDone is idempotent and sorted', () => {
    expect(addDone(['2026-11-02'], '2026-11-01')).toEqual(['2026-11-01', '2026-11-02']);
    const a = ['2026-11-01'];
    expect(addDone(a, '2026-11-01')).toBe(a);
  });
});

describe('ics', () => {
  it('builds a daily recurring event at the chosen local time', () => {
    const ics = buildIcs({ time: '07:30', startDay: '2026-11-16', now: new Date(Date.UTC(2026, 10, 15, 8)), url: 'https://x.test/' });
    expect(ics).toContain('DTSTART:20261116T073000\r\n');
    expect(ics).toContain('DTEND:20261116T074500\r\n');
    expect(ics).toContain('RRULE:FREQ=DAILY\r\n');
    expect(ics).toContain('DTSTAMP:20261115T080000Z');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('clamps the end time to the same day', () => {
    expect(buildIcs({ time: '23:50', startDay: '2026-11-16' })).toContain('DTEND:20261116T235900');
  });
});
