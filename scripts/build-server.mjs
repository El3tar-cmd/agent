import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('dist', { recursive: true });

const tscPath = path.join('node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [
  tscPath,
  'server.ts',
  '--module',
  'commonjs',
  '--target',
  'ES2022',
  '--outDir',
  'dist',
  '--esModuleInterop',
  '--skipLibCheck',
  '--moduleResolution',
  'node',
  '--types',
  'node',
  '--noEmit',
  'false',
], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const source = path.join('dist', 'server.js');
const destination = path.join('dist', 'server.cjs');

fs.rmSync(destination, { force: true });
fs.renameSync(source, destination);
