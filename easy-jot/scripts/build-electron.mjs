import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  absWorkingDir: root,
};

async function build() {
  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'main/index.ts')],
    outfile: path.join(root, 'dist-electron/main.js'),
    format: 'esm',
    external: ['electron', 'better-sqlite3'],
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'preload/index.ts')],
    outfile: path.join(root, 'dist-electron/preload.cjs'),
    format: 'cjs',
    external: ['electron'],
  });
}

if (watch) {
  const ctxMain = await esbuild.context({
    ...common,
    entryPoints: [path.join(root, 'main/index.ts')],
    outfile: path.join(root, 'dist-electron/main.js'),
    format: 'esm',
    external: ['electron', 'better-sqlite3'],
  });
  const ctxPreload = await esbuild.context({
    ...common,
    entryPoints: [path.join(root, 'preload/index.ts')],
    outfile: path.join(root, 'dist-electron/preload.cjs'),
    format: 'cjs',
    external: ['electron'],
  });
  await Promise.all([ctxMain.watch(), ctxPreload.watch()]);
  console.log('[esbuild] watching main + preload');
} else {
  await build();
}
