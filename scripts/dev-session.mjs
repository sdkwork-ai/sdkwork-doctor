#!/usr/bin/env node
/**
 * Repository development session supervisor.
 *
 * `start` launches both browser surfaces (PC and H5) against one deployment
 * profile, records the session in the ignored `.sdkwork/local/dev/` directory,
 * and tears the children down on exit. `stop` reclaims only the processes this
 * repository recorded; it never performs a workspace-wide process sweep
 * (PNPM_SCRIPT_SPEC.md section 3).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sessionDir = path.join(repoRoot, '.sdkwork', 'local', 'dev');
const sessionFile = path.join(sessionDir, 'session.json');
const surfaces = ['pc', 'h5'];

function readOption(name) {
  const index = process.argv.indexOf('--' + name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readSession() {
  try {
    return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killTree(pid) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already exited */
    }
  }
}

function stopSession({ quiet } = {}) {
  const session = readSession();
  if (!session) {
    if (!quiet) console.log('[sdkwork-doctor] no recorded development session');
    return;
  }
  for (const child of session.children ?? []) {
    if (typeof child.pid === 'number' && isAlive(child.pid)) {
      killTree(child.pid);
      if (!quiet) console.log('[sdkwork-doctor] stopped ' + child.surface + ' (pid ' + child.pid + ')');
    }
  }
  fs.rmSync(sessionFile, { force: true });
}

function startSession() {
  const deploymentProfile = readOption('deployment-profile') ?? 'standalone';
  const environment = readOption('environment') ?? 'development';
  const mode = deploymentProfile + '.' + environment;

  stopSession({ quiet: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const children = [];
  const shutdown = () => {
    for (const child of children) {
      if (typeof child.pid === 'number') killTree(child.pid);
    }
    fs.rmSync(sessionFile, { force: true });
  };

  for (const surface of surfaces) {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'dev-surface.mjs'), '--surface', surface, '--mode', mode], {
      cwd: repoRoot,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    children.push({ surface, pid: child.pid });
    child.on('exit', (code) => {
      if (code !== 0) console.error('[sdkwork-doctor] ' + surface + ' surface exited with code ' + String(code));
    });
  }

  fs.writeFileSync(sessionFile, JSON.stringify({ startedAt: new Date().toISOString(), mode, children }, null, 2));
  console.log('[sdkwork-doctor] development session started (' + mode + '): ' + children.map((child) => child.surface + '=' + String(child.pid)).join(', '));

  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
}

const command = process.argv[2];
if (command === 'start') {
  startSession();
} else if (command === 'stop') {
  stopSession({});
} else {
  console.error('usage: dev-session.mjs <start|stop> [--deployment-profile <standalone|cloud>] [--environment <name>]');
  process.exit(2);
}
