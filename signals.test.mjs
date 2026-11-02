import test from 'node:test';
import assert from 'node:assert/strict';
import { devtronApi, DevtronReadError } from './provider-api.mjs';
import { normalizeDeployment, refreshDeployments, MissingDeploymentTimestamp } from './signals.mjs';
import { declaration, configuration } from './server.mjs';

const scope = { appId: 1064, environmentId: 146, boardUID: '12345678901', resourceUID: '12345678902', appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64), externalId: 'app-1064' };
const row = { id: 19767, workflow_type: 'DEPLOY', status: 'Succeeded', started_on: '2026-10-11T01:00:00Z', finished_on: '2026-10-11T01:04:00Z',
  gitTriggers: { material: { Commit: '8A0C22983AE7ACAE10ABE7569026AE25D889E159', Author: 'dev <dev@example>' } }, log_file_path: '/private/log', message: 'private' };
const host = { origin: 'https://host.example', token: 'lbac_' + 'x'.repeat(43) };

test('official read uses filter criteria and never sends provider writes', async () => {
  const calls = [];
  const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async (url, init) => {
    calls.push([url, init]); return Response.json({ code: 200, status: 'OK', result: { cdWorkflows: [row] } });
  });
  assert.deepEqual(await api.readDeployments(scope), [row]);
  const [url, init] = calls[0];
  assert.match(url, /^https:\/\/devtron\.example\/orchestrator\/resource\/history\/deployment\/cd-pipeline\/v1\?/);
  const params = new URL(url).searchParams;
  assert.deepEqual(params.getAll('filterCriteria'), ['application/devtron-application|id|1064', 'environment|id|146']);
  assert.equal(params.get('offset'), '0');
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.token, 'secret-token');
});
test('invalid scope, wrapper and byte discipline stop before signal publication', async () => {
  const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' });
  await assert.rejects(api.readDeployments({ ...scope, appId: 0 }), /Invalid deployment scope/);
  await assert.rejects(api.readDeployments({ ...scope, limit: 251 }), /Invalid deployment scope/);
  const wrapper = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () =>
    Response.json({ code: 403, result: null }));
  await assert.rejects(wrapper.readDeployments(scope), /Invalid Devtron deployment inventory/);
  assert.throws(() => devtronApi({ origin: 'http://devtron.example', token: 'secret-token' }), /HTTPS origin/);
  assert.throws(() => devtronApi({ origin: 'https://devtron.example/path', token: 'secret-token' }), /HTTPS origin/);
});
test('statuses, commits and zero timestamps normalize without private fields', () => {
  const evidence = normalizeDeployment(row, scope);
  assert.equal(evidence.event_type, 'deployment.succeeded');
  assert.equal(evidence.outcome, 'success');
  assert.equal(evidence.external_id, 'wfr-19767');
  assert.equal(evidence.commit_sha, '8a0c22983ae7acae10abe7569026ae25d889e159');
  assert.equal(evidence.occurred_at, '2026-10-11T01:04:00.000Z');
  assert.ok(!JSON.stringify(evidence).includes('private'));
  assert.equal(normalizeDeployment({ ...row, status: 'Progressing' }, scope).event_type, 'deployment.started');
  assert.equal(normalizeDeployment({ ...row, status: 'Failed' }, scope).outcome, 'failure');
  assert.equal(normalizeDeployment({ ...row, status: 'Degraded' }, scope).outcome, 'failure');
  assert.equal(normalizeDeployment({ ...row, status: 'Cancelled' }, scope).event_type, 'deployment.cancelled');
  assert.throws(() => normalizeDeployment({ ...row, status: 'Unknown' }, scope), /Unsupported deployment status/);
  assert.throws(() => normalizeDeployment({ ...row, finished_on: '0001-01-01T00:00:00Z' }, scope), MissingDeploymentTimestamp);
});
test('refresh caps the batch, persists first and publishes bounded envelopes', async () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ ...row, id: 20000 + index, finished_on: `2026-10-11T01:00:${String(index % 60).padStart(2, '0')}Z` }));
  const api = { readDeployments: async () => rows };
  const saved = [];
  const published = [];
  await refreshDeployments({ api, scope, host, saveEnvelopes: envelopes => saved.push(envelopes) }, async (url, init) => {
    published.push(init.body); return Response.json({ signal_uid: 's' + published.length, duplicate: false });
  });
  assert.equal(saved.length, 1); assert.equal(saved[0].length, 25); assert.equal(published.length, 25);
  assert.equal(saved[0].every(envelope => envelope.board_uid === scope.boardUID), true);
});
test('generic discovery lists bounded app-environment resources', async () => {
  const calls = [];
  const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async (url, init) => {
    calls.push([url, init]); return Response.json({ code: 200, result: { appCount: 2, appContainers: [
      { appId: 1064, appName: 'core-api', environments: [
        { appId: 1064, appName: 'core-api', environmentId: 146, environmentName: 'prod' },
        { appId: 1064, appName: 'core-api', environmentId: 147, environmentName: 'staging' } ] },
      { appId: 1065, appName: 'worker', environments: [] } ] } });
  });
  const page = await api.listApplications({ search: 'core', offset: 0, size: 50 });
  assert.equal(page.total, 2);
  assert.deepEqual(page.resources.map(r => [r.appId, r.environmentName]),
    [[1064, 'prod'], [1064, 'staging']]);
  const [url, init] = calls[0];
  assert.equal(url, 'https://devtron.example/orchestrator/app/list');
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body), { appNameSearch: 'core', offset: 0, size: 50 });
  const missing = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () =>
    Response.json({ code: 400, result: null }));
  await assert.rejects(missing.listApplications(), /Invalid Devtron application inventory/);
  await assert.rejects(api.listApplications({ size: 251 }), /Invalid application page/);
  await assert.rejects(api.listApplications({ search: 'x'.repeat(201) }), /Invalid application search/);
  const malformed = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () =>
    Response.json({ code: 200, result: { appContainers: [{ appId: 0, appName: 'bad', environments: [] }] } }));
  await assert.rejects(malformed.listApplications(), /Invalid Devtron application inventory/);
});

test('declaration starts read-only and optional capabilities stay explicit', () => {
  const config = configuration({ HOST_ORIGIN: 'https://host.example', PUBLIC_URL: 'https://panel.example' });
  const base = declaration(config);
  assert.equal(base.key, 'devtron-panel'); assert.deepEqual(base.signal_sources, ['devtron']);
  assert.deepEqual(base.capabilities, ['panels.render', 'signals.read']);
  const cards = declaration(config, { workflowCards: true });
  assert.equal(cards.schema_version, 2);
  assert.equal(cards.card_lifecycle.deployment.restore, 'retain_external_state');
  assert.equal(cards.capabilities.includes('execution.run'), false);
  const publish = declaration(config, { publishSignals: true });
  assert.deepEqual(publish.signal_sources, ['devtron', 'devtron-panel']);
  assert.deepEqual(publish.signal_policy.event_types, ['deployment.queued','deployment.started','deployment.succeeded','deployment.failed','deployment.cancelled']);
  assert.equal(publish.signal_policy.commit_mode, 'optional');
  assert.equal(publish.signal_policy.time_basis, 'provider_occurrence');
});
