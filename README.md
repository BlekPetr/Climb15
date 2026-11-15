# Climb 15

A mobile-first PWA for a guided 15-minute daily home climbing routine, with an optional daily push reminder. Single user, no accounts, all data in `localStorage`.

- **App**: Vite + vanilla TypeScript, no UI framework. Runtime dependency: just the Inter font files (`@fontsource-variable/inter`), self-hosted.
- **Offline**: hand-written service worker. The build precaches every emitted file, so the app (fonts included) works offline after the first load.
- **Reminder**: a Cloudflare Worker (`worker/`) with a per-minute cron sends Web Push at your local reminder time. It skips the push if you've already finished that day. As a fallback, Settings can download an `.ics` daily calendar event.

```
src/engine/   pure logic + unit tests: routine data, timer, history/streaks, .ics
src/screens/  Today, Session, Exercises, History, Settings
src/sw.ts     service worker (precache + push + notification click)
worker/       Cloudflare Worker: /config /subscribe /done /unsubscribe + cron
scripts/      icon generation, VAPID key generation, layout screenshots
```

## Local development

Requires Node 22+.

```sh
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # unit tests: timer engine, history, .ics, Worker
npm run typecheck  # app, service worker, Worker
npm run build      # → dist/ (includes dist/sw.js)
npm run preview    # http://localhost:4173, serves dist/ with the service worker
```

To try push locally, run the Worker (see below) with `npx wrangler dev`, then build the app with `VITE_REMINDER_API=http://localhost:8787 npm run build && npm run preview`.

### How the timer works

The routine (`src/engine/routine.ts`) is data. Settings stores an edited copy. `buildTimeline()` flattens it into segments laid end to end: a 3 s *get ready* before each step, then either one WORK block or the step's interval phases (HANG/REST, HOLD). The timer state is only `{accumulated, runningSince}`, so the position is `accumulated + (now − runningSince)`. Everything else comes from that one number: current step, countdown, progress, beeps. As a result:

- there's no drift, because nothing counts ticks;
- a backgrounded or throttled tab (or a reload, since state is in `localStorage`) shows the right position as soon as it's visible again;
- pause, resume, skip and back are small pure functions.

When the tab was hidden for a while, only the latest missed cue plays, not a burst of stale beeps. Browsers don't run audio for hidden tabs, so beeps only play while the app is open on screen. The Screen Wake Lock keeps it on screen.

## Deploy

You need a Cloudflare account. `npx wrangler login` once.

### 1. Generate VAPID keys

```sh
node scripts/gen-vapid.mjs
```

This prints `VAPID_PUBLIC_KEY` (base64url, 65-byte uncompressed P-256 point) and `VAPID_PRIVATE_KEY` (base64url, 32 bytes). Keys from `npx web-push generate-vapid-keys` use the same format and also work. Keep the private key secret. If you change keys later, existing subscriptions stop working until the app re-subscribes.

### 2. Deploy the Worker

```sh
cd worker
npx wrangler kv namespace create REMINDERS     # copy the id into wrangler.toml
# edit wrangler.toml: VAPID_SUBJECT (mailto: or https URL) and ALLOWED_ORIGIN (your Pages URL)
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy
```

Note the Worker URL, e.g. `https://climb15-reminder.<you>.workers.dev`. Check it with `curl <url>/config`. Logs: `npx wrangler tail`.

### 3. Deploy the app to Cloudflare Pages

**Git integration** (Pages dashboard → Create → Connect to Git):

| Setting | Value |
|---|---|
| Root directory | (repo root) |
| Build command | `npm run build` |
| Build output | `dist` |
| Env vars | `VITE_REMINDER_API` = your Worker URL · `NODE_VERSION` = `22` |

**Or direct upload:**

```sh
VITE_REMINDER_API=https://climb15-reminder.<you>.workers.dev npm run build
npx wrangler pages deploy dist --project-name climb15
```

`public/_headers` makes `sw.js`, `/` and the manifest revalidate, and hashed assets cache for a long time. If you deploy without `VITE_REMINDER_API`, the app works normally and Settings offers only the calendar reminder.

## Install on Android

1. Open the Pages URL in **Chrome** on the phone.
2. Tap **Install app** in the banner, or ⋮ → **Add to Home screen** → **Install**.
3. Open Climb 15 from the home screen. It runs full screen and works offline.
4. For reminders: **Settings → Reminder time → Enable reminder** and allow notifications. The app asks for permission only at this step, never on launch. Tapping the notification opens the Today screen.
   - If reminders don't show up, check Android Settings → Apps → Climb 15 (or Chrome) → Notifications. Battery saver can delay pushes.
   - Alternative: **Add to calendar (.ics)** creates a daily recurring event in your calendar app.

## Verification

- `npm test`: 40 unit tests (timer engine, cues, streaks, calendar grid, `.ics`, Worker scheduling/VAPID/handlers).
- Lighthouse 11.7 (the last version with the PWA category) against `npm run preview`: **PWA 100, Performance 100, Accessibility 100, Best Practices 100**. Accessibility is 100 on every screen.
- Layout checked at 360×800 with `node scripts/screens.mjs` (needs `npm run preview` running): no horizontal overflow, no console errors.
- Offline: after the first visit, reloading in airplane mode loads every screen and the font.

## Design decisions / assumptions

- **Payload-less pushes.** The Worker sends empty pushes, so it doesn't need to encrypt messages (RFC 8291). The service worker shows a fixed message.
- **One KV key** holds all devices (max 10). A per-minute cron then costs one KV read, well inside free-tier limits. If a cron minute is missed, the push still goes out up to 60 min late, never more than once per day. Changing the reminder time re-arms today's reminder.
- **No auth on the Worker.** Each device has an unguessable random UUID, and CORS is restricted to `ALLOWED_ORIGIN`.
- **"Done" means reaching the end of the session**, even if you skipped steps. Ending a session early with ✕ doesn't count.
- **Get-ready time** (3 s × 6) isn't counted in the 15-minute progress bar or the time remaining.
- **Pulling, core and antagonists** are single countdowns (sets are self-paced). Fingers and flexibility are interval steps. Any step can be given `intervals` in `routine.ts`.
- **Reminder skip** depends on the app reporting completion. If you finish offline, the report is queued and sent when you're back online.
- An unfinished session resumes after a reload for up to 3 hours.
