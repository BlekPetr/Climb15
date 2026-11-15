/**
 * Climb 15 reminder Worker.
 *
 *   GET  /config       → { publicKey }            VAPID public key for subscribe()
 *   POST /subscribe    { id, subscription, time, tz, doneDay? }
 *   POST /done         { id, day }                skip today's reminder
 *   POST /unsubscribe  { id }
 *   cron (every minute) → push to every device whose local reminder time is due
 *
 * Single user, no accounts: a device is identified by a random UUID the app
 * generates. All devices live under one KV key, so each cron run costs one KV
 * read (and a write only when something was sent) — well within free limits.
 */
import { dueDay, isValidDay, isValidTime, isValidTimeZone, type Device } from './schedule';
import { importVapidKey, pushRequest } from './vapid';

// Minimal Workers types (avoids a dependency on @cloudflare/workers-types).
interface KVNamespace {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}
interface ExecutionContext {
  waitUntil(p: Promise<unknown>): void;
}
interface ScheduledController {
  scheduledTime: number;
}

export interface Env {
  REMINDERS: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  /** "mailto:you@example.com" or an https URL — required by push services. */
  VAPID_SUBJECT: string;
  /** The Pages origin, e.g. "https://climb15.pages.dev". "*" if unset. */
  ALLOWED_ORIGIN?: string;
}

const KEY = 'devices';
const MAX_DEVICES = 10;

type Devices = Record<string, Device>;

async function load(env: Env): Promise<Devices> {
  const v = await env.REMINDERS.get(KEY, 'json');
  return v && typeof v === 'object' ? (v as Devices) : {};
}

const save = (env: Env, d: Devices) => env.REMINDERS.put(KEY, JSON.stringify(d));

function cors(env: Env, req: Request): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed.split(',').map((s) => s.trim()).includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v);

function validSubscription(s: unknown): s is Device['subscription'] {
  if (!s || typeof s !== 'object') return false;
  const { endpoint } = s as { endpoint?: unknown };
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  try {
    return new URL(endpoint).protocol === 'https:';
  } catch {
    return false;
  }
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...cors(env, req) },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
  if (req.method === 'GET' && url.pathname === '/config') return json({ publicKey: env.VAPID_PUBLIC_KEY });
  if (req.method === 'GET' && url.pathname === '/') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  if (!isId(body.id)) return json({ error: 'invalid id' }, 400);
  const id = body.id;
  const devices = await load(env);

  switch (url.pathname) {
    case '/subscribe': {
      const { subscription, time, tz, doneDay } = body;
      if (!validSubscription(subscription)) return json({ error: 'invalid subscription' }, 400);
      if (typeof time !== 'string' || !isValidTime(time)) return json({ error: 'invalid time' }, 400);
      if (typeof tz !== 'string' || !isValidTimeZone(tz)) return json({ error: 'invalid tz' }, 400);
      const prev = devices[id];
      if (!prev && Object.keys(devices).length >= MAX_DEVICES) return json({ error: 'too many devices' }, 409);
      devices[id] = {
        subscription,
        time,
        tz,
        doneDay: typeof doneDay === 'string' && isValidDay(doneDay) ? doneDay : prev?.doneDay,
        // Changing the time re-arms today's reminder.
        lastSentDay: prev && prev.time === time ? prev.lastSentDay : undefined,
        updatedAt: Date.now(),
      };
      await save(env, devices);
      return json({ ok: true });
    }
    case '/done': {
      const { day } = body;
      if (typeof day !== 'string' || !isValidDay(day)) return json({ error: 'invalid day' }, 400);
      const d = devices[id];
      if (!d) return json({ error: 'unknown device' }, 404);
      if (!d.doneDay || day > d.doneDay) {
        d.doneDay = day;
        await save(env, devices);
      }
      return json({ ok: true });
    }
    case '/unsubscribe': {
      if (devices[id]) {
        delete devices[id];
        await save(env, devices);
      }
      return json({ ok: true });
    }
  }
  return json({ error: 'not found' }, 404);
}

export async function runCron(env: Env, now: Date, fetcher: typeof fetch = fetch): Promise<string[]> {
  const devices = await load(env);
  const due = Object.entries(devices)
    .map(([id, d]) => [id, d, dueDay(d, now)] as const)
    .filter(([, , day]) => day !== null);
  if (due.length === 0) return [];

  const key = await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const log: string[] = [];
  for (const [id, d, day] of due) {
    const req = await pushRequest(d.subscription.endpoint, key, env.VAPID_PUBLIC_KEY, env.VAPID_SUBJECT, Math.floor(now.getTime() / 1000));
    try {
      const res = await fetcher(req);
      if (res.status === 404 || res.status === 410) {
        delete devices[id]; // subscription expired or revoked
        log.push(`${id}: gone (${res.status})`);
      } else if (res.ok) {
        d.lastSentDay = day!;
        log.push(`${id}: sent`);
      } else {
        // Leave lastSentDay unset so the next minute retries (within the catch-up window).
        log.push(`${id}: failed ${res.status} ${await res.text().catch(() => '')}`);
      }
    } catch (e) {
      log.push(`${id}: error ${String(e)}`);
    }
  }
  await save(env, devices);
  return log;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors(env, req) });
    }
  },
  async scheduled(c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env, new Date(c.scheduledTime)).then((log) => log.forEach((l) => console.log(l))));
  },
};
