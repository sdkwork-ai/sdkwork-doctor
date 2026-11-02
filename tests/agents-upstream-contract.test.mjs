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
  assert.equal(contract.operations.length, 2);
  assert.deepEqual(contract.enumValues.entrySurface, ['pc', 'h5', 'flutter', 'mini_program']);
});

test('our client constants match the pinned contract', () => {
  assert.equal(clientContract.CARE_AGENTS_API_PREFIX, contract.surfacePrefix);
  assert.equal(clientContract.CARE_AGENT_SESSION_KIND, contract.enumValues.sessionKind[0]);
  assert.equal(clientContract.CARE_AGENT_TURN_MODE, contract.enumValues.turnMode[0]);
  assert.equal(clientContract.CARE_AGENT_ASSISTANT_ITEM_KIND, contract.enumValues.assistantItemKind[0]);
  assert.equal(
    clientContract.careAgentsSessionsPath('agent.family-doctor'),
    contract.operations[0].path.replace('{agentId}', 'agent.family-doctor'),
  );
  assert.equal(
    clientContract.careAgentsTurnPath('agent.family-doctor', 'session.family.001'),
    contract.operations[1].path
      .replace('{agentId}', 'agent.family-doctor')
      .replace('{sessionId}', 'session.family.001'),
  );
  assert.equal(clientContract.CARE_AGENT_STREAM_QUERY, '?stream=true&event_protocol=kernel-v1');
});

test('the upstream sdkwork-agents document still matches every pinned assumption', (context) => {
  if (!fs.existsSync(upstreamOpenApi)) {
    context.skip('sibling sdkwork-agents checkout is absent; the pinned contract carries the assumptions');
    return;
  }
  const text = fs.readFileSync(upstreamOpenApi, 'utf8');

  for (const operation of contract.operations) {
    assert.ok(text.includes(operation.path + ':'), 'upstream path moved: ' + operation.path);
    assert.ok(text.includes('operationId: ' + operation.operationId), 'upstream operationId moved: ' + operation.operationId);
  }

  const sessionRequest = schemaBlock(text, contract.operations[0].requestSchema);
  assert.ok(sessionRequest, 'upstream schema missing: ' + contract.operations[0].requestSchema);
  for (const field of contract.requiredRequestFields.session) {
    assert.match(sessionRequest, new RegExp('\\n      - ' + field + '\\n', 'u'), 'session request no longer requires ' + field);
  }

  const turnRequest = schemaBlock(text, contract.operations[1].requestSchema);
  assert.ok(turnRequest, 'upstream schema missing: ' + contract.operations[1].requestSchema);
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

  const turnResponse = schemaBlock(text, contract.operations[1].responseSchema);
  assert.ok(turnResponse, 'upstream turn response schema missing');
  assert.match(turnResponse, /data\.item|item:/u, 'upstream turn response no longer carries data.item');

  const streamEvent = schemaBlock(text, 'AgentTurnStreamEvent');
  for (const frame of contract.envelope.streamFrames) {
    assert.match(streamEvent, new RegExp('- ' + frame + '\\n', 'u'), 'stream frame lost ' + frame);
  }
});
