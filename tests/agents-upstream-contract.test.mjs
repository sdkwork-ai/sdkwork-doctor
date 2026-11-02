import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const contractPath = path.join(repoRoot, 'specs/agents-app-api.contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const upstreamOpenApi = path.resolve(repoRoot, contract.upstream.openapi);
const clientContract = await import(new URL('file:///' + path.join(
  repoRoot,
  'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent/src/contract.ts',
).replaceAll('\\', '/')).href);
const clientCatalog = await import(new URL('file:///' + path.join(
  repoRoot,
  'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent/src/catalog.ts',
).replaceAll('\\', '/')).href);

function operation(operationId) {
  const found = contract.operations.find((entry) => entry.operationId === operationId);
  assert.ok(found, 'the pinned contract must declare ' + operationId);
  return found;
}

/** Returns the lines of one 4-space-indented OpenAPI schema block. */
function schemaBlock(text, name) {
  const lines = text.split(/\r?\n/u);
  const header = '    ' + name + ':';
  const start = lines.findIndex((line) => line === header);
  if (start < 0) return null;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (/^ {0,5}\S/u.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

test('the pinned dependency contract is well formed', () => {
  assert.equal(contract.kind, 'sdkwork.doctor.agents-app-api-dependency');
  assert.equal(contract.apiAuthority, 'sdkwork-agents-app-api');
  assert.equal(contract.surfacePrefix, '/app/v3/api');
  assert.deepEqual(contract.operations.map((entry) => entry.operationId), [
    'agents.sessions.create',
    'agents.turns.stream',
    'agents.list',
  ]);
  assert.deepEqual(contract.enumValues.entrySurface, ['pc', 'h5', 'flutter', 'mini_program']);
  assert.equal(contract.catalogue.itemPath, 'data.items');
  assert.equal(contract.catalogue.clientPort, '@sdkwork/doctor-common-agent#createCareAgentCatalog');
});

test('our client constants match the pinned contract', () => {
  assert.equal(clientContract.CARE_AGENTS_API_PREFIX, contract.surfacePrefix);
  assert.equal(clientContract.CARE_AGENT_SESSION_KIND, contract.enumValues.sessionKind[0]);
  assert.equal(clientContract.CARE_AGENT_TURN_MODE, contract.enumValues.turnMode[0]);
  assert.equal(clientContract.CARE_AGENT_ASSISTANT_ITEM_KIND, contract.enumValues.assistantItemKind[0]);
  assert.equal(
    clientContract.careAgentsSessionsPath('agent.family-doctor'),
    operation('agents.sessions.create').path.replace('{agentId}', 'agent.family-doctor'),
  );
  assert.equal(
    clientContract.careAgentsTurnPath('agent.family-doctor', 'session.family.001'),
    operation('agents.turns.stream').path
      .replace('{agentId}', 'agent.family-doctor')
      .replace('{sessionId}', 'session.family.001'),
  );
  assert.equal(clientContract.CARE_AGENT_STREAM_QUERY, '?stream=true&event_protocol=kernel-v1');
  assert.equal(clientCatalog.CARE_AGENT_CATALOG_PATH, operation('agents.list').path);
  assert.equal(clientCatalog.CARE_AGENT_CATALOG_PAGE_SIZE, contract.catalogue.pageSize);
});

test('the upstream sdkwork-agents document still matches every pinned assumption', (context) => {
  if (!fs.existsSync(upstreamOpenApi)) {
    context.skip('sibling sdkwork-agents checkout is absent; the pinned contract carries the assumptions');
    return;
  }
  const text = fs.readFileSync(upstreamOpenApi, 'utf8');

  for (const entry of contract.operations) {
    assert.ok(text.includes(entry.path + ':'), 'upstream path moved: ' + entry.path);
    assert.ok(text.includes('operationId: ' + entry.operationId), 'upstream operationId moved: ' + entry.operationId);
  }

  const sessionRequest = schemaBlock(text, operation('agents.sessions.create').requestSchema);
  assert.ok(sessionRequest, 'upstream schema missing: ' + operation('agents.sessions.create').requestSchema);
  for (const field of contract.requiredRequestFields.session) {
    assert.match(sessionRequest, new RegExp('\\n      - ' + field + '\\n', 'u'), 'session request no longer requires ' + field);
  }

  const turnRequest = schemaBlock(text, operation('agents.turns.stream').requestSchema);
  assert.ok(turnRequest, 'upstream schema missing: ' + operation('agents.turns.stream').requestSchema);
  for (const field of contract.requiredRequestFields.turn) {
    assert.match(turnRequest, new RegExp('\\n      - ' + field + '\\n', 'u'), 'turn request no longer requires ' + field);
  }

  const sessionKind = schemaBlock(text, 'AgentSessionKind');
  for (const value of contract.enumValues.sessionKind) assert.match(sessionKind, new RegExp('- ' + value + '\\n', 'u'));

  const entrySurface = schemaBlock(text, 'AgentSessionEntrySurface');
  for (const value of contract.enumValues.entrySurface) {
    assert.match(entrySurface, new RegExp('- ' + value + '\\n', 'u'), 'entrySurface lost ' + value);
  }

  const itemKind = schemaBlock(text, 'AgentSessionItemKind');
  for (const value of contract.enumValues.assistantItemKind) {
    assert.match(itemKind, new RegExp('- ' + value + '\\n', 'u'), 'item kind lost ' + value);
  }

  const turnMode = schemaBlock(text, 'AgentTurnMode');
  for (const value of contract.enumValues.turnMode) assert.match(turnMode, new RegExp('- ' + value + '\\n', 'u'));

  const envelope = schemaBlock(text, 'SdkWorkApiResponse');
  assert.ok(envelope, 'upstream success envelope schema missing');
  assert.match(envelope, /\n      - code\n/u);
  assert.match(envelope, /\n      - traceId\n/u);

  const turnResponse = schemaBlock(text, operation('agents.turns.stream').responseSchema);
  assert.ok(turnResponse, 'upstream turn response schema missing');
  assert.match(turnResponse, /data\.item|item:/u, 'upstream turn response no longer carries data.item');

  const listResponse = schemaBlock(text, operation('agents.list').responseSchema);
  assert.ok(listResponse, 'upstream agent list response schema missing');
  for (const field of contract.catalogue.fields) {
    const record = schemaBlock(text, 'AgentRecord');
    if (field === 'agentId' || field === 'displayName' || field === 'description' || field === 'status') {
      assert.ok(record && record.includes(field + ':'), 'upstream AgentRecord lost ' + field);
    }
  }

  const streamEvent = schemaBlock(text, 'AgentTurnStreamEvent');
  for (const frame of contract.envelope.streamFrames) {
    assert.match(streamEvent, new RegExp('- ' + frame + '\\n', 'u'), 'stream frame lost ' + frame);
  }
});
