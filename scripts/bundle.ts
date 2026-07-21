// Bundle the three Electron entry points with Bun.build and copy the
// static renderer assets. Output layout (dist/) matches package.json#main
// and the loadFile/preload paths in src/main/main.ts.

import { cpSync, mkdirSync, rmSync } from 'node:fs';

const outbase = 'dist';
rmSync(outbase, { recursive: true, force: true });
mkdirSync(outbase, { recursive: true });

async function build(label: string, config: Parameters<typeof Bun.build>[0]) {
  const result = await Bun.build(config);
  if (!result.success) {
    console.error(`bundle failed: ${label}`);
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

// Main + preload run inside Electron's Node: keep electron external and
// target node (Bun.build has no electron target; node output is compatible).
await build('main', {
  entrypoints: ['src/main/main.ts'],
  outdir: `${outbase}/main`,
  target: 'node',
  format: 'cjs',
  external: ['electron'],
});

await build('preload', {
  entrypoints: ['src/preload/preload.ts'],
  outdir: `${outbase}/preload`,
  target: 'node',
  format: 'cjs',
  external: ['electron'],
});

await build('renderer', {
  entrypoints: ['src/renderer/index.tsx'],
  outdir: `${outbase}/renderer`,
  target: 'browser',
  format: 'iife',
});

cpSync('src/renderer/index.html', `${outbase}/renderer/index.html`);
cpSync('src/renderer/styles.css', `${outbase}/renderer/styles.css`);

console.log('bundled: dist/main dist/preload dist/renderer');
