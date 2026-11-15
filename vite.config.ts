import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Builds src/sw.ts into dist/sw.js after the bundle is written, injecting the
 * list of every emitted file (so the whole app works offline) and a version
 * hash derived from their contents. Replaces Workbox with ~30 lines.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'climb15-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(p);
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      const urls = files
        .map((f) => '/' + relative(outDir, f).split(sep).join('/'))
        .filter((u) => u !== '/sw.js' && !u.endsWith('.map') && u !== '/_headers' && u !== '/_redirects')
        .sort();
      for (const u of urls) hash.update(u).update(readFileSync(join(outDir, u)));
      // Cloudflare Pages 308-redirects /index.html → /, and a redirected
      // response can't be used for navigations, so cache the shell as "/".
      const precache = urls.map((u) => (u === '/index.html' ? '/' : u));
      const src = readFileSync('src/sw.ts', 'utf8');
      const js = ts.transpileModule(src, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText
        .replace(/^export \{\};\s*$/m, '')
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)));
      writeFileSync(join(outDir, 'sw.js'), js);
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  plugins: [serviceWorker()],
});
