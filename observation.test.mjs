import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runObservation, runDiscovery, buildConfig } from './observation.mjs';
const config = { hostOrigin: 'https://host.example', providerOrigin: 'https://devtron.example',
 scope: { boardUID: 'board000001', resourceUID: 'resour00001', appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64),
 appId: 1064, environmentId: 146, externalId: 'app-1064', limit: 50 } };
const credentials = { hostToken: 'lbac_' + 'a'.repeat(43), providerToken: 'private-provider-test' };
test('partial batch failure saves all events and explicit recovery retains identities', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'devtron-observation-'));
 try {
  const path = join(directory, 'batch.json'); let reads = 0; const bodies = [];
  const request = async (url, options) => {
   if (url.startsWith(config.providerOrigin)) {
    reads++;
    return new Response(JSON.stringify({ code: 200, result: { cdWorkflows: ['one','two','three'].map((name, i) => ({
      id: 100 + i, workflow_type: 'DEPLOY', status: 'Succeeded', finished_on: `2026-10-11T00:00:0${i}Z`, message: 'private' })) } }));
   }
   bodies.push(options.body); assert.equal((await stat(path)).mode & 0o777, 0o600);
   if (bodies.length === 2) throw new Error('Unknown receipt');
   return new Response(JSON.stringify({ signal_uid: 'signal00001', duplicate: true }));
  };
  const args = { path, config, credentials };
  await assert.rejects(runObservation(args, request), /Unknown receipt/);
  const saved = await readFile(path, 'utf8');
  assert.equal(JSON.parse(saved).envelopes.length, 3);
  assert.ok(!saved.includes('private') && !saved.includes(credentials.hostToken) && !saved.includes(credentials.providerToken));
  const result = await runObservation({ ...args, resend: true }, request);
  assert.equal(result.receipts.length, 3); assert.equal(reads, 1);
  const resent = bodies.slice(2, 5).map(String);
  assert.equal(resent.length, 3);
  assert.ok(bodies.slice(0, 2).map(String).every(body => resent.includes(body)));
  await assert.rejects(runObservation({ ...args, config: { ...config, hostOrigin: 'https://other.example' }, resend: true }, request), /destination changed/);
  assert.equal(bodies.length, 5); assert.equal(await readFile(path, 'utf8'), saved);
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('init builds a validated operator config without embedding credentials', () => {
  const env = { DEVTRON_ORIGIN: 'https://devtron.example', LANGBOARD_HOST_ORIGIN: 'https://host.example' };
  const config = buildConfig(env, { appId: 1064, environmentId: 146 });
  assert.equal(config.providerOrigin, 'https://devtron.example');
  assert.equal(config.hostOrigin, 'https://host.example');
  assert.equal(config.scope.externalId, 'app-1064-env-146');
  assert.equal(config.scope.limit, 50);
  assert.throws(() => buildConfig(env, { appId: 0, environmentId: 146 }), /Invalid application-environment/);
  assert.throws(() => buildConfig({ ...env, DEVTRON_ORIGIN: 'http://devtron.example' }, { appId: 1, environmentId: 1 }), /HTTPS origin/);
  assert.throws(() => buildConfig({ ...env, LANGBOARD_HOST_ORIGIN: 'https://host.example/path' }, { appId: 1, environmentId: 1 }), /HTTP\(S\) origin/);
  assert.ok(!JSON.stringify(config).includes('token') && !JSON.stringify(config).includes('Token'));
});

test('discovery reads provider only and never touches the signal store', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'devtron-discovery-'));
 try {
  const path = join(directory, 'batch.json'); let reads = 0;
  const request = async (url) => {
   reads++;
   if (!url.startsWith(config.providerOrigin)) throw new Error('unexpected host write');
   if (!url.endsWith('/app/list')) throw new Error('unexpected provider route');
   return new Response(JSON.stringify({ code: 200, result: { appCount: 1, appContainers: [
     { appId: 1064, appName: 'core-api', environments: [{ appId: 1064, appName: 'core-api', environmentId: 146, environmentName: 'prod' }] } ] } }));
  };
  const page = await runDiscovery(config, credentials, { search: 'core' }, request);
  assert.deepEqual(page.resources, [{ appId: 1064, appName: 'core-api', environmentId: 146, environmentName: 'prod' }]);
  assert.equal(reads, 1);
  assert.equal(await readFile(path, 'utf8').then(() => true, () => false), false);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
