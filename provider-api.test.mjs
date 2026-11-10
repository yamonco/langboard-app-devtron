import test from 'node:test';
import assert from 'node:assert/strict';
import { devtronApi, deploymentObservationFromProvider as normalizeDeployment } from './provider-api.mjs';
import { MissingDeploymentTimestamp } from './deployment-observation.mjs';

const scope = { appId: 1064, environmentId: 146, boardUID: '12345678901', resourceUID: '12345678902', appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64), externalId: 'app-1064' };
const row = { id: 19767, workflow_type: 'DEPLOY', status: 'Succeeded', started_on: '2026-10-11T01:00:00Z', finished_on: '2026-10-11T01:04:00Z',
  gitTriggers: { material: { Commit: '8A0C22983AE7ACAE10ABE7569026AE25D889E159', Author: 'dev <dev@example>' } }, log_file_path: '/private/log', message: 'private' };

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

test('discovery rejects incomplete oversized inventories instead of silently truncating them', async () => {
  const environment = { environmentId: 146, environmentName: 'prod' };
  const app = { appId: 1064, appName: 'core-api', environments: [environment] };
  for (const appContainers of [
    Array(251).fill(app),
    [{ ...app, environments: Array(251).fill(environment) }],
    [{ ...app, environments: { private: 'not an environment list' } }],
  ]) {
    const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () =>
      Response.json({ code: 200, result: { appContainers } }));
    await assert.rejects(api.listApplications(), /^Error: Invalid Devtron application inventory$/);
  }
});

test('native CD history applies the same inventory bound as Helm history', async () => {
  const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () =>
    Response.json({ code: 200, result: { cdWorkflows: Array(251).fill(row) } }));
  await assert.rejects(api.readDeployments(scope), /^Error: Invalid Devtron deployment inventory$/);
});

test('native Helm history binds installed identity and preserves provider revision time', async () => {
  const { appId, environmentId, ...binding } = scope;
  const helmScope = { ...binding, installedAppId: 17, externalId: 'helm-app-17' };
  const history = { version: 1, deployedAt: { seconds: 1793697063, nanos: 869895000 },
    status: 'Succeeded', deployedBy: 'private-user', message: 'private', dockerImages: ['private-image'] };
  const calls = [];
  const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async (url, init) => {
    calls.push([url, init]);
    return Response.json({ code: 200, result: { installedAppInfo: { installedAppId: 17 }, deploymentHistory: [history] } });
  });
  const [row] = await api.readDeployments(helmScope);
  assert.equal(new URL(calls[0][0]).pathname, '/orchestrator/application/deployment-history');
  assert.equal(new URL(calls[0][0]).searchParams.get('installedAppId'), '17');
  assert.equal(calls[0][1].method, 'GET');
  const evidence = normalizeDeployment(row, helmScope);
  assert.equal(evidence.external_id, 'helm-17-revision-1');
  assert.equal(evidence.occurred_at, '2026-11-03T09:11:03.869Z');
  assert.equal(evidence.outcome, 'success');
  assert.equal(evidence.commit_sha, '');
  assert.ok(!JSON.stringify(evidence).includes('private'));
  assert.throws(() => normalizeDeployment(row, { ...helmScope, installedAppId: 18 }), /identity/);
  assert.throws(() => normalizeDeployment({ ...row, deployedAt: { seconds: 0 } }, helmScope), MissingDeploymentTimestamp);
  const wrong = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () =>
    Response.json({ code: 200, result: { installedAppInfo: { installedAppId: 18 }, deploymentHistory: [history] } }));
  await assert.rejects(wrong.readDeployments(helmScope), /Helm deployment inventory/);
});

test('external Helm reads the exact tuple without requiring a Chart Store installation', async () => {
  const { externalHelmScope } = await import('./provider-api.mjs');
  const selected = externalHelmScope('7|team-a|sample');
  let calls = 0;
  const history = { version: 2, status: 'deployed', deployedAt: { seconds: 1793697063 },
    deployedBy: 'private-user', dockerImages: ['private-image'], message: 'private-message' };
  const api = devtronApi({ origin: 'https://devtron.example', token: 'test-provider-token' }, async (url, init) => {
    calls++;
    const target = new URL(url);
    assert.equal(target.pathname, '/orchestrator/application/deployment-history');
    assert.deepEqual([...target.searchParams], [['appId', selected.helmAppId]]);
    assert.equal(init.method, 'GET');
    return Response.json({ code: 200, result: { deploymentHistory: [history] } });
  });
  const [row] = await api.readDeployments(selected);
  const normalized = normalizeDeployment(row, selected);
  assert.equal(normalized.outcome, 'success');
  assert.equal(normalized.occurred_at, '2026-11-03T09:11:03.000Z');
  assert.ok(!JSON.stringify(normalized).includes('private'));
  assert.deepEqual(normalizeDeployment(row, selected), normalized);
  const other = externalHelmScope('7|team-b|sample');
  assert.throws(() => normalizeDeployment(row, other), /Invalid Helm deployment identity/);
  assert.notEqual(normalizeDeployment({ ...row, helmAppId: other.helmAppId }, other).event_id, normalized.event_id);
  await assert.rejects(api.readDeployments({ ...selected, installedAppId: 7 }), /Ambiguous/);
  for (const id of ['7', '07|team-a|sample', '0|team-a|sample', '7|TEAM-A|sample', '7|team-a|../sample', '7|team-a|sample|extra', '7||sample']) {
    await assert.rejects(api.readDeployments({ helmAppId: id }), /Invalid external Helm/);
  }
  assert.equal(calls, 1);
});



test('GET history and POST discovery share the decoded-byte limit', async () => {
  const api = devtronApi({ origin: 'https://devtron.example', token: 'test-provider-token' },
    async () => new Response(new Uint8Array(1048577), { headers: { 'Content-Length': '0' } }));
  await assert.rejects(api.readDeployments(scope), /byte limit/);
  await assert.rejects(api.listApplications(), /byte limit/);
});


test('mixed deployment selectors fail before any provider request', async () => {
  let requests = 0;
  const api = devtronApi({ origin: 'https://devtron.example', token: 'secret-token' }, async () => {
    requests++;
    throw new Error('Unexpected provider request');
  });
  for (const target of [
    { installedAppId: 17, appId: 1064 },
    { installedAppId: 17, environmentId: 146 },
    { installedAppId: 17, appId: 1064, environmentId: 146 },
    { helmAppId: '7|team-a|sample', appId: 1064 },
    { helmAppId: '7|team-a|sample', environmentId: 146 },
    { helmAppId: '7|team-a|sample', installedAppId: 17 },
  ]) await assert.rejects(api.readDeployments(target), /Ambiguous deployment scope/);
  assert.equal(requests, 0);
});
