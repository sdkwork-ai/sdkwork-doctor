import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const L1_FILES = [
  'AGENTS.md',
  'README.md',
  'CLAUDE.md',
  'GEMINI.md',
  'CODEX.md',
  '.gitignore',
  '.sdkwork/README.md',
  '.sdkwork/.gitignore',
  '.sdkwork/skills/README.md',
  '.sdkwork/plugins/README.md',
];

test('repository declares the L1 baseline files', () => {
  for (const file of L1_FILES) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true, file + ' must exist');
  }
});

test('repository kind is application', () => {
  assert.match(read('README.md'), /^repository-kind: application$/mu);
});

test('AGENTS.md links the Canon documents', () => {
  const agents = read('AGENTS.md');
  for (const link of ['docs/README.md', 'docs/product/prd/PRD.md', 'docs/architecture/tech/TECH_ARCHITECTURE.md']) {
    assert.match(agents, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), 'AGENTS.md must link ' + link);
  }
});

test('each application root owns .sdkwork, specs, and AGENTS.md', () => {
  for (const app of ['sdkwork-doctor-pc', 'sdkwork-doctor-h5']) {
    const root = path.join(repoRoot, 'apps', app);
    for (const relative of ['AGENTS.md', '.sdkwork/README.md', '.sdkwork/skills/README.md', '.sdkwork/plugins/README.md', 'specs/component.spec.json', 'specs/README.md']) {
      assert.equal(fs.existsSync(path.join(root, relative)), true, app + '/' + relative + ' must exist');
    }
  }
});

test('dependency documentation points at the sibling standards checkout', () => {
  assert.match(read('AGENTS.md'), /\.\.\/sdkwork-specs\/README\.md/u);
  assert.equal(fs.existsSync(path.join(repoRoot, '..', 'sdkwork-specs', 'README.md')), true);
});
