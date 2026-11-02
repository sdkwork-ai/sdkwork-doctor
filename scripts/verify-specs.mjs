#!/usr/bin/env node
/**
 * Run the canonical sdkwork-specs validators that govern this repository.
 *
 * The standards repository is a required sibling checkout at ../sdkwork-specs
 * (AGENTS_SPEC.md section 3). Each validator is authoritative; this script adds
 * no rules of its own and fails closed on the first non-zero exit.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const specsRoot = path.resolve(repoRoot, '..', 'sdkwork-specs');

if (!fs.existsSync(path.join(specsRoot, 'README.md'))) {
  console.error('sdkwork-specs is not present at ' + specsRoot);
  process.exit(1);
}

const checks = [
  ['audit-repository-baseline.mjs', ['--root', '.']],
  ['check-workspace-layout.mjs', ['--root', '.']],
  ['check-gitignore-standard.mjs', ['--root', '.']],
  ['check-repository-docs-standard.mjs', ['--root', '.']],
  ['check-agent-workflow-standard.mjs', ['--root', '.']],
  ['check-pnpm-script-standard.mjs', ['--root', '.', '--application-code-prefix', 'doctor']],
  ['check-app-manifest-standard.mjs', ['--root', '.']],
  ['check-apps-directory-index.mjs', ['--root', '.']],
  ['check-component-port-bindings.mjs', ['--root', '.']],
  ['check-workspace-member-protocol.mjs', ['--root', '.']],
  ['check-vite-workspace-aliases.mjs', ['--root', '.']],
];

let failed = 0;
for (const [tool, args] of checks) {
  const toolPath = path.join(specsRoot, 'tools', tool);
  if (!fs.existsSync(toolPath)) {
    console.error('missing validator: ' + tool);
    failed += 1;
    continue;
  }
  const result = spawnSync(process.execPath, [toolPath, ...args], { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
    console.error('validator failed: ' + tool);
  }
}

if (failed > 0) {
  console.error(String(failed) + ' validator(s) failed');
  process.exit(1);
}
console.log('all repository validators passed');
