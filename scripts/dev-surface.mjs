#!/usr/bin/env node
/**
 * Start one SDKWork Doctor browser surface with Vite.
 *
 * The repository root owns process supervision (scripts/dev-session.mjs); this
 * script is the per-surface runner that resolves the surface root and port.
 * NO_PROXY/AUTO: it never starts API, gateway, or database processes.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const SURFACES = {
  pc: { root: 'apps/sdkwork-doctor-pc', portEnv: 'SDKWORK_DOCTOR_PC_DEV_PORT', defaultPort: '3911' },
  h5: { root: 'apps/sdkwork-doctor-h5', portEnv: 'SDKWORK_DOCTOR_H5_DEV_PORT', defaultPort: '3912' },
};

function readOption(name) {
  const index = process.argv.indexOf('--' + name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const surfaceName = readOption('surface');
const mode = readOption('mode') ?? 'standalone.development';
const surface = SURFACES[surfaceName ?? ''];

if (!surface) {
  console.error('usage: dev-surface.mjs --surface <pc|h5> [--mode <deployment-profile>.<environment>]');
  process.exit(2);
}

const repoRoot = path.resolve(import.meta.dirname, '..');
const surfaceRoot = path.join(repoRoot, surface.root);
const port = process.env[surface.portEnv] ?? surface.defaultPort;

console.log('[sdkwork-doctor] ' + surfaceName + ' surface: vite --mode ' + mode + ' on 127.0.0.1:' + port);

const child = spawn('pnpm', ['exec', 'vite', '--mode', mode, '--port', port], {
  cwd: surfaceRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SDKWORK_DOCTOR_SURFACE: surfaceName ?? '' },
});

const forward = (signal) => {
  try {
    child.kill(signal);
  } catch {
    /* already exited */
  }
};
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
