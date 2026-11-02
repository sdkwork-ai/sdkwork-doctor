#!/usr/bin/env node
/**
 * Remove reproducible browser build output only.
 *
 * The target list is enumerated, never globbed or walked, and every target is
 * verified to resolve inside this repository before removal
 * (DESTRUCTIVE_OPERATION_SPEC.md, CODE_STYLE_SPEC.md section 7).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const appSurfaces = {
  pc: 'apps/sdkwork-doctor-pc',
  h5: 'apps/sdkwork-doctor-h5',
};

const requested = process.argv.includes('--all') ? Object.keys(appSurfaces) : [process.argv[process.argv.indexOf('--surface') + 1]].filter(Boolean);
if (requested.length === 0) {
  console.error('usage: clean-dist.mjs <--all|--surface <pc|h5>>');
  process.exit(2);
}

for (const surface of requested) {
  const relative = appSurfaces[surface];
  if (!relative) {
    console.error('unknown surface: ' + surface);
    process.exit(2);
  }
  const target = path.resolve(repoRoot, relative, 'dist');
  if (!target.startsWith(repoRoot + path.sep)) {
    console.error('refusing to delete outside the repository: ' + target);
    process.exit(1);
  }
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('removed ' + path.relative(repoRoot, target));
  } else {
    console.log('nothing to remove: ' + path.relative(repoRoot, target));
  }
}
