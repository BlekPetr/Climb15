// Screenshots every screen at 360x800 against a running `npm run preview`.
// Usage: node scripts/screens.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// Seed some history so streaks and calendars have content.
await page.goto(base + '/');
await page.evaluate(() => {
  const days = [];
  const d = new Date();
  for (const back of [1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 20]) {
    const x = new Date(d);
    x.setDate(d.getDate() - back);
    days.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  }
  localStorage.setItem('climb15.history', JSON.stringify(days.sort()));
});

const overflow = async () =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const r of ['today', 'exercises', 'history', 'settings']) {
  await page.goto(`${base}/#/${r}`);
  await page.reload();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${r}.png`, fullPage: r !== 'today' });
  console.log(r, 'horizontal overflow:', await overflow());
}

await page.goto(`${base}/#/today`);
await page.click('#start');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/session-ready.png` });
console.log('session overflow:', await overflow());
await page.click('#skip'); // → fingers get-ready
await page.waitForTimeout(3600); // → first hang
await page.screenshot({ path: `${out}/session-hang.png` });
await page.waitForTimeout(10_200); // → rest
await page.screenshot({ path: `${out}/session-rest.png` });
await page.click('#toggle'); // pause
await page.screenshot({ path: `${out}/session-paused.png` });
for (let i = 0; i < 5; i++) await page.click('#skip');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/session-done.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
