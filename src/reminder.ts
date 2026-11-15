/** Client side of the daily reminder: Web Push via the Worker, and .ics fallback. */
import { buildIcs } from './engine/ics';
import { addDays, dayKey } from './engine/history';
import { deviceId, getPendingDone, getSettings, saveSettings, setPendingDone } from './store';

const API = (import.meta.env.VITE_REMINDER_API as string | undefined)?.replace(/\/$/, '') || '';

export type PushStatus = 'unsupported' | 'unconfigured' | 'denied' | 'available';

export function pushStatus(): PushStatus {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (!API) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  return 'available';
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
}

function urlB64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getSubscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing || !create) return existing;
  const cfg = (await (await fetch(`${API}/config`)).json()) as { publicKey: string };
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(cfg.publicKey),
  });
}

async function register(sub: PushSubscription, doneDay?: string | null): Promise<void> {
  await post('/subscribe', {
    id: deviceId(),
    subscription: sub.toJSON(),
    time: getSettings().reminderTime,
    tz: timeZone(),
    ...(doneDay ? { doneDay } : {}),
  });
}

/** Called from the "Enable reminder" tap — the only place we ask permission. */
export async function enableReminder(todayDone: boolean): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed.');
  const sub = await getSubscription(true);
  if (!sub) throw new Error('Could not subscribe to push.');
  await register(sub, todayDone ? dayKey(new Date()) : null);
  saveSettings({ reminderEnabled: true });
}

export async function disableReminder(): Promise<void> {
  saveSettings({ reminderEnabled: false });
  try {
    const sub = await getSubscription(false);
    await sub?.unsubscribe();
    await post('/unsubscribe', { id: deviceId() });
  } catch {
    /* best effort — the Worker also drops dead subscriptions on 404/410 */
  }
}

/** Re-send time/timezone/subscription (time changed, travelled, or app start). */
export async function syncReminder(): Promise<void> {
  if (!getSettings().reminderEnabled || pushStatus() !== 'available') return;
  if (Notification.permission !== 'granted') return;
  try {
    const sub = await getSubscription(true);
    if (sub) await register(sub);
  } catch {
    /* offline — try again next start */
  }
  await flushDone();
}

/** Tell the Worker today is done, so tonight's push is skipped. */
export async function reportDone(day: string): Promise<void> {
  if (!getSettings().reminderEnabled || !API) return;
  setPendingDone(day);
  await flushDone();
}

async function flushDone(): Promise<void> {
  const day = getPendingDone();
  if (!day || !API) return;
  // A completion from before yesterday no longer affects any reminder.
  if (day < addDays(dayKey(new Date()), -1)) return setPendingDone(null);
  try {
    await post('/done', { id: deviceId(), day });
    setPendingDone(null);
  } catch {
    /* keep pending; retried on 'online' and next start */
  }
}

window.addEventListener('online', () => void flushDone());

export function downloadIcs(): void {
  const { reminderTime } = getSettings();
  const ics = buildIcs({ time: reminderTime, startDay: dayKey(new Date()), url: location.origin + '/' });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'climb-15-daily.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
