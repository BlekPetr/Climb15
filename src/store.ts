/** localStorage persistence. Every read is defensive: bad data → defaults. */
import { DEFAULT_ROUTINE, isValidRoutine, type Routine } from './engine/routine';
import type { TimerState } from './engine/timer';

const K = {
  settings: 'climb15.settings',
  history: 'climb15.history',
  routine: 'climb15.routine',
  session: 'climb15.session',
  device: 'climb15.deviceId',
  pending: 'climb15.pendingDone',
} as const;

export interface Settings {
  reminderTime: string; // "HH:MM"
  reminderEnabled: boolean;
  sound: boolean;
  vibration: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  reminderTime: '18:00',
  reminderEnabled: false,
  sound: true,
  vibration: true,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / blocked — nothing sensible to do */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getSettings(): Settings {
  const s = read<Partial<Settings>>(K.settings);
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  write(K.settings, next);
  return next;
}

export function getHistory(): string[] {
  const h = read<unknown>(K.history);
  return Array.isArray(h) ? h.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
}

export function saveHistory(days: string[]): void {
  write(K.history, days);
}

export function getRoutine(): Routine {
  const r = read<unknown>(K.routine);
  return isValidRoutine(r) ? r : structuredClone(DEFAULT_ROUTINE);
}

export function saveRoutine(r: Routine): void {
  write(K.routine, r);
}

export function resetRoutine(): void {
  remove(K.routine);
}

export interface StoredSession {
  routine: Routine;
  timer: TimerState;
  savedAt: number;
}

/** Sessions older than this are discarded instead of resumed. */
const SESSION_MAX_AGE = 3 * 60 * 60 * 1000;

export function getSession(now = Date.now()): StoredSession | null {
  const s = read<StoredSession>(K.session);
  if (!s || !isValidRoutine(s.routine) || !s.timer || now - s.savedAt > SESSION_MAX_AGE) return null;
  return s;
}

export function saveSession(s: StoredSession | null): void {
  if (s) write(K.session, s);
  else remove(K.session);
}

export function deviceId(): string {
  let id = read<string>(K.device);
  if (!id) {
    id = crypto.randomUUID();
    write(K.device, id);
  }
  return id;
}

export function getPendingDone(): string | null {
  return read<string>(K.pending);
}

export function setPendingDone(day: string | null): void {
  if (day) write(K.pending, day);
  else remove(K.pending);
}

export function resetAll(): void {
  Object.values(K).forEach((k) => {
    if (k !== K.device) remove(k);
  });
}
