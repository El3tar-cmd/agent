#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const serverEntry = path.join(repoRoot, 'server.ts');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: agent [workspace-root] [--root <path>]

Starts the platform from any directory.
If a workspace root is provided, it is used as the server root.
Otherwise the current working directory becomes the workspace root.`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('agent 0.0.0');
  process.exit(0);
}

let workspaceRoot = process.cwd();

if (args[0] === '--root' || args[0] === '-r') {
  workspaceRoot = path.resolve(args[1] ?? workspaceRoot);
  args.splice(0, 2);
} else if (args[0] && !args[0].startsWith('-')) {
  workspaceRoot = path.resolve(args[0]);
  args.shift();
}

if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
  console.error(`agent: workspace root does not exist or is not a directory: ${workspaceRoot}`);
  process.exit(1);
}

process.chdir(workspaceRoot);
process.env.AGENT_ROOT = workspaceRoot;

register();

await import(pathToFileURL(serverEntry).href);
