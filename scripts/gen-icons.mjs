// Renders the app icons to PNG with the pre-installed Playwright Chromium.
// Run: npm run icons   (outputs to public/icons/, which is committed)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// Mark: a peak line (route up the wall) over a bold "15".
// `pad` is the fraction of the canvas kept clear around the mark.
const mark = (size, { pad, bg, radius, fg = '#FFB020', fg2 = '#7CC8FF', mono = false }) => {
  const s = size;
  const inner = s * (1 - 2 * pad);
  const x0 = s * pad;
  const y0 = s * pad;
  const u = inner / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${bg ? `<rect width="${s}" height="${s}" rx="${radius * s}" fill="${bg}"/>` : ''}
  <g transform="translate(${x0} ${y0}) scale(${u})">
    <path d="M14 40 L38 14 L52 28 L64 18 L86 40" fill="none" stroke="${mono ? '#fff' : fg2}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="92" text-anchor="middle" font-family="Inter" font-weight="800" font-size="58" letter-spacing="-3" fill="${mono ? '#fff' : fg}">15</text>
  </g>
</svg>`;
};

const variants = [
  ['icon-192.png', 192, { pad: 0.14, bg: '#000', radius: 0.22 }],
  ['icon-512.png', 512, { pad: 0.14, bg: '#000', radius: 0.22 }],
  // Maskable: full-bleed background, mark inside the 80% safe zone.
  ['icon-maskable-192.png', 192, { pad: 0.24, bg: '#000', radius: 0 }],
  ['icon-maskable-512.png', 512, { pad: 0.24, bg: '#000', radius: 0 }],
  ['apple-touch-icon.png', 180, { pad: 0.16, bg: '#000', radius: 0 }],
  // Status-bar badge: Android uses only the alpha channel.
  ['badge-96.png', 96, { pad: 0.08, bg: null, radius: 0, mono: true }],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, opts] of variants) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${mark(size, opts)}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(new URL(name, out), await page.screenshot({ omitBackground: true }));
  console.log('wrote', name);
}
writeFileSync(new URL('icon.svg', out), mark(64, { pad: 0.1, bg: '#000', radius: 0.22 }));
await browser.close();
