import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import './support/ts-resolve.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const agentRoot = 'apps/sdkwork-doctor-common/packages/sdkwork-doctor-common-agent';
const catalog = await import(
  new URL('file:///' + path.join(repoRoot, agentRoot, 'src/catalog.ts').replaceAll('\\', '/')).href
);

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function envelope(items) {
  return {
    code: 0,
    traceId: 'trace-catalog-1',
    data: {
      items,
      pageInfo: { mode: 'offset', page: 1, pageSize: 20, totalItems: String(items.length), totalPages: 1 },
    },
  };
}

const AGENTS = [
  { agentId: 'agent.family-doctor', displayName: 'Family doctor', status: 'active', description: 'Triages the household.' },
  { agentId: 'agent.other', displayName: 'Other', status: 'draft' },
];

test('an empty deployment URL selects offline and never calls the network', async () => {
  let calls = 0;
  const port = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: '',
    accessTokens: { getAccessToken: () => 'token' },
    fetchImpl: async () => { calls += 1; return response(envelope(AGENTS)); },
  });
  assert.equal(port.mode, 'offline');
  assert.deepEqual(await port.list(), []);
  assert.equal(calls, 0);
});

test('a hosted catalogue issues one offset-paginated GET with the IAM token', async () => {
  const requests = [];
  const port = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com',
    accessTokens: { getAccessToken: () => 'iam-token' },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return response(envelope(AGENTS));
    },
  });
  assert.equal(port.mode, 'hosted');
  const agents = await port.list();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://agents.example.com' + catalog.CARE_AGENT_CATALOG_PATH + '?page=1&page_size=20');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer iam-token');
  assert.deepEqual(agents.map((agent) => agent.agentId), ['agent.family-doctor', 'agent.other']);
  assert.equal(catalog.findCareAgent(agents, 'agent.family-doctor')?.status, 'active');
  assert.equal(catalog.findCareAgent(agents, 'agent.missing'), undefined);
});

test('a gateway URL that already ends with the surface prefix is accepted once', async () => {
  const urls = [];
  const port = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com/app/v3/api',
    accessTokens: { getAccessToken: () => 'token' },
    fetchImpl: async (url) => { urls.push(url); return response(envelope([])); },
  });
  await port.list();
  assert.equal(urls[0], 'https://agents.example.com/app/v3/api/ai/agents?page=1&page_size=20');
});

test('a missing credential, a problem response, and a malformed envelope all fail loudly', async () => {
  const noToken = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com',
    accessTokens: { getAccessToken: () => null },
    fetchImpl: async () => response(envelope([])),
  });
  await assert.rejects(() => noToken.list(), /IAM access token/u);

  const problem = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com',
    accessTokens: { getAccessToken: () => 'token' },
    fetchImpl: async () => response({ title: 'nope' }, 503),
  });
  await assert.rejects(() => problem.list(), /HTTP 503/u);

  const badEnvelope = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com',
    accessTokens: { getAccessToken: () => 'token' },
    fetchImpl: async () => response({ code: 1, traceId: 'trace', data: { items: [] } }),
  });
  await assert.rejects(() => badEnvelope.list(), /success code 0/u);

  const notJson = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com',
    accessTokens: { getAccessToken: () => 'token' },
    fetchImpl: async () => response('<html>'),
  });
  await assert.rejects(() => notJson.list(), /not JSON/u);
});

test('malformed agent entries are dropped instead of breaking the status probe', async () => {
  const port = catalog.createCareAgentCatalog({
    agentsApiBaseUrl: 'https://agents.example.com',
    accessTokens: { getAccessToken: () => 'token' },
    fetchImpl: async () => response(envelope([AGENTS[0], { agentId: 'missing-name' }, { displayName: 'no id' }, null])),
  });
  const agents = await port.list();
  assert.deepEqual(agents.map((agent) => agent.agentId), ['agent.family-doctor']);
  assert.ok(fs.existsSync(path.join(repoRoot, 'specs/agents-app-api.contract.json')));
});
