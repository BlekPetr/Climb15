import { describe, expect, it } from 'vitest';
import worker, { runCron, type Env } from './index';
import { dueDay, localParts, type Device } from './schedule';
import { b64urlDecode, b64urlEncode, importVapidKey, vapidJwt } from './vapid';

async function vapidKeys() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = b64urlEncode(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { pub, priv: jwk.d!, verifyKey: kp.publicKey };
}

function memoryEnv(keys: { pub: string; priv: string }): Env & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    REMINDERS: {
      async get(k: string) {
        const v = store.get(k);
        return v ? JSON.parse(v) : null;
      },
      async put(k: string, v: string) {
        store.set(k, v);
      },
    },
    VAPID_PUBLIC_KEY: keys.pub,
    VAPID_PRIVATE_KEY: keys.priv,
    VAPID_SUBJECT: 'mailto:test@example.com',
    ALLOWED_ORIGIN: 'https://climb.test',
  };
}

const device = (p: Partial<Device> = {}): Device => ({
  subscription: { endpoint: 'https://push.example.com/abc' },
  time: '07:30',
  tz: 'Europe/Prague',
  updatedAt: 0,
  ...p,
});

describe('schedule', () => {
  it('computes local day and minutes in the device time zone', () => {
    // 2026-11-15 23:30 UTC = 2026-11-16 00:30 in Prague (UTC+1)
    expect(localParts(new Date(Date.UTC(2026, 10, 15, 23, 30)), 'Europe/Prague')).toEqual({ day: '2026-11-16', minutes: 30 });
    expect(localParts(new Date(Date.UTC(2026, 10, 15, 23, 30)), 'America/New_York')).toEqual({ day: '2026-11-15', minutes: 18 * 60 + 30 });
  });

  it('is due from the reminder time for an hour, once per day', () => {
    const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 16, h - 1, m)); // Prague = UTC+1
    expect(dueDay(device(), at(7, 29))).toBeNull();
    expect(dueDay(device(), at(7, 30))).toBe('2026-11-16');
    expect(dueDay(device(), at(8, 29))).toBe('2026-11-16');
    expect(dueDay(device(), at(8, 30))).toBeNull();
    expect(dueDay(device({ lastSentDay: '2026-11-16' }), at(7, 31))).toBeNull();
    expect(dueDay(device({ lastSentDay: '2026-11-15' }), at(7, 31))).toBe('2026-11-16');
  });

  it('is skipped when today is already done', () => {
    const t = new Date(Date.UTC(2026, 10, 16, 6, 45));
    expect(dueDay(device({ doneDay: '2026-11-16' }), t)).toBeNull();
    expect(dueDay(device({ doneDay: '2026-11-15' }), t)).toBe('2026-11-16');
  });

  it('respects DST (Prague summer time is UTC+2)', () => {
    expect(dueDay(device(), new Date(Date.UTC(2026, 6, 1, 5, 30)))).toBe('2026-07-01');
    expect(dueDay(device(), new Date(Date.UTC(2026, 6, 1, 6, 29)))).toBe('2026-07-01');
    expect(dueDay(device(), new Date(Date.UTC(2026, 6, 1, 4, 30)))).toBeNull();
  });
});

describe('vapid', () => {
  it('base64url round-trips', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63]);
    expect([...b64urlDecode(b64urlEncode(bytes))]).toEqual([...bytes]);
  });

  it('signs a verifiable ES256 JWT', async () => {
    const k = await vapidKeys();
    const key = await importVapidKey(k.pub, k.priv);
    const jwt = await vapidJwt(key, 'https://push.example.com', 'mailto:a@b.c', 1000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(c)))).toEqual({ aud: 'https://push.example.com', exp: 1000 + 43200, sub: 'mailto:a@b.c' });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.verifyKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it('rejects a malformed public key', async () => {
    await expect(importVapidKey('AAAA', 'AAAA')).rejects.toThrow();
  });
});

describe('worker', () => {
  const call = (env: Env, path: string, body?: unknown, method = 'POST') =>
    worker.fetch(
      new Request(`https://w.test${path}`, {
        method,
        headers: { Origin: 'https://climb.test', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  const id = '3f1b6d2c-1111-4444-8888-123456789abc';
  const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x', auth: 'y' } };

  it('serves config with CORS for the allowed origin', async () => {
    const env = memoryEnv(await vapidKeys());
    const res = await call(env, '/config', undefined, 'GET');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://climb.test');
    expect(((await res.json()) as { publicKey: string }).publicKey).toBe(env.VAPID_PUBLIC_KEY);
  });

  it('validates input', async () => {
    const env = memoryEnv(await vapidKeys());
    expect((await call(env, '/subscribe', { id: 'x' })).status).toBe(400);
    expect((await call(env, '/subscribe', { id, subscription: sub, time: '25:00', tz: 'UTC' })).status).toBe(400);
    expect((await call(env, '/subscribe', { id, subscription: sub, time: '07:00', tz: 'Mars/Base' })).status).toBe(400);
    expect((await call(env, '/subscribe', { id, subscription: { endpoint: 'http://x' }, time: '07:00', tz: 'UTC' })).status).toBe(400);
  });

  it('subscribe → cron sends once → done skips → 410 removes', async () => {
    const env = memoryEnv(await vapidKeys());
    expect((await call(env, '/subscribe', { id, subscription: sub, time: '07:00', tz: 'UTC' })).status).toBe(200);

    const sent: Request[] = [];
    const ok = async (r: Request) => (sent.push(r), new Response(null, { status: 201 }));
    const day1 = (h: number, m: number) => new Date(Date.UTC(2026, 10, 16, h, m));

    expect(await runCron(env, day1(6, 59), ok as typeof fetch)).toEqual([]);
    expect(await runCron(env, day1(7, 0), ok as typeof fetch)).toEqual([`${id}: sent`]);
    expect(await runCron(env, day1(7, 1), ok as typeof fetch)).toEqual([]); // once per day
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(sub.endpoint);
    expect(sent[0].headers.get('Authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(sent[0].headers.get('TTL')).toBe('3600');

    // Next day: completed before the reminder → no push.
    expect((await call(env, '/done', { id, day: '2026-11-17' })).status).toBe(200);
    expect(await runCron(env, new Date(Date.UTC(2026, 10, 17, 7, 5)), ok as typeof fetch)).toEqual([]);

    // Day after: the push service says the subscription is gone.
    const gone = async () => new Response(null, { status: 410 });
    expect(await runCron(env, new Date(Date.UTC(2026, 10, 18, 7, 0)), gone as typeof fetch)).toEqual([`${id}: gone (410)`]);
    expect(JSON.parse(env.store.get('devices')!)).toEqual({});
  });

  it('a failed push is retried on the next run', async () => {
    const env = memoryEnv(await vapidKeys());
    await call(env, '/subscribe', { id, subscription: sub, time: '07:00', tz: 'UTC' });
    const fail = async () => new Response('boom', { status: 500 });
    const ok = async () => new Response(null, { status: 201 });
    expect((await runCron(env, new Date(Date.UTC(2026, 10, 16, 7, 0)), fail as typeof fetch))[0]).toMatch(/failed 500/);
    expect(await runCron(env, new Date(Date.UTC(2026, 10, 16, 7, 1)), ok as typeof fetch)).toEqual([`${id}: sent`]);
  });

  it('changing the reminder time re-arms today', async () => {
    const env = memoryEnv(await vapidKeys());
    const ok = async () => new Response(null, { status: 201 });
    await call(env, '/subscribe', { id, subscription: sub, time: '07:00', tz: 'UTC' });
    await runCron(env, new Date(Date.UTC(2026, 10, 16, 7, 0)), ok as typeof fetch);
    await call(env, '/subscribe', { id, subscription: sub, time: '19:00', tz: 'UTC' });
    expect(await runCron(env, new Date(Date.UTC(2026, 10, 16, 19, 0)), ok as typeof fetch)).toEqual([`${id}: sent`]);
  });

  it('unsubscribe removes the device', async () => {
    const env = memoryEnv(await vapidKeys());
    await call(env, '/subscribe', { id, subscription: sub, time: '07:00', tz: 'UTC' });
    await call(env, '/unsubscribe', { id });
    expect(JSON.parse(env.store.get('devices')!)).toEqual({});
  });
});
