import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderHistory } from './public/provider-history.mjs';
const resource = { app_key: 'devtron-panel', resource_type: 'application', resource_uid: 'Resource001', connection_uid: 'Connect0001', access_revision: 3, name: 'Example' };
function fixture(request) {
  const calls = [], states = [], abort = new AbortController();
  const session = { supportedOperations: ['connections.read', 'resources.list'], signal: abort.signal,
    request: async (operation, params) => { calls.push({ operation, params }); return request(operation, params); } };
  const history = createProviderHistory(session, state => states.push(state));
  return { history, calls, states, abort, session, get state() { return states.at(-1); } };
}
const page = { items: [resource], next_cursor: null };
const response = { ok: true, data: { items: [{ id: 7, workflow_type: 'DEPLOY', status: 'Succeeded', finished_on: '2026-11-15T00:00:00Z' }] } };
test('explicit selection sends only host identities and current resource revision', async () => {
  const f = fixture(op => op === 'resources.list' ? page : response);
  await f.history.refresh(); assert.equal(f.calls.length, 1);
  await f.history.select(resource.resource_uid);
  assert.deepEqual(f.calls[1], { operation: 'connections.read', params: { connection_uid: resource.connection_uid, read_key: 'deployments.list', input: { resource_uid: resource.resource_uid, access_revision: 3, limit: 50 } } });
  assert.equal(f.state.items[0].id, '7');
});
test('unsupported host makes no provider or resource calls and has no observer fallback', async () => {
  let called = 0, state;
  const h = createProviderHistory({ supportedOperations: [], signal: new AbortController().signal, request: () => called++ }, s => state = s);
  await h.refresh(); assert.equal(called, 0); assert.equal(state.error, 'unavailable');
});
for (const code of ['forbidden', 'stale_binding', 'unavailable', 'upstream_error']) test(`${code} clears old results with no retry`, async () => {
  let denied = false;
  const f = fixture(op => op === 'resources.list' ? page : denied ? { ok: false, error: { code, request_id: 'private-diagnostic' } } : response);
  await f.history.refresh(); await f.history.select(resource.resource_uid); denied = true;
  await f.history.select(resource.resource_uid);
  assert.deepEqual(f.state.items, []); assert.equal(f.calls.length, 3);
  assert.ok(!JSON.stringify(f.state).includes('private-diagnostic'));
});
test('refresh uses fresh access revision; revoked selection is not requested', async () => {
  let selected = resource;
  const f = fixture(op => op === 'resources.list' ? { items: selected ? [selected] : [] } : response);
  await f.history.refresh(); await f.history.select(resource.resource_uid);
  selected = { ...resource, access_revision: 4 }; await f.history.refresh();
  assert.equal(f.calls.at(-1).params.input.access_revision, 4);
  selected = null; await f.history.refresh();
  assert.equal(f.calls.at(-1).operation, 'resources.list'); assert.deepEqual(f.state.items, []); assert.equal(f.state.selected, '');
});
test('a newer selection suppresses a delayed response from the old resource', async () => {
  let release;
  const second = { ...resource, resource_uid: 'Resource002' };
  const f = fixture((op, params) => op === 'resources.list' ? { items: [resource, second] } : params.input.resource_uid === resource.resource_uid ? new Promise(resolve => release = resolve) : response);
  await f.history.refresh(); const pending = f.history.select(resource.resource_uid);
  await f.history.select(second.resource_uid); release({ ok: true, data: { items: [{ id: 99, workflow_type: 'DEPLOY', status: 'Failed' }] } }); await pending;
  assert.equal(f.state.selected, second.resource_uid); assert.equal(f.state.items[0].id, '7');
});
for (const close of ['dispose', 'abort']) test(`${close} suppresses pending results`, async () => {
  let release;
  const f = fixture(op => op === 'resources.list' ? page : new Promise(resolve => release = resolve));
  await f.history.refresh(); const pending = f.history.select(resource.resource_uid);
  if (close === 'dispose') f.history.dispose(); else f.abort.abort();
  const count = f.states.length; release(response); await pending; assert.equal(f.states.length, count);
});
test('Helm versions remain opaque revision identities and untrusted fields are omitted', async () => {
  const f = fixture(op => op === 'resources.list' ? page : { ok: true, data: { items: [{ version: 10, status: 'deployed', deployedAt: { seconds: '1794700000', nanos: 0 }, values: 'private', user: 'private' }] } });
  await f.history.refresh(); await f.history.select(resource.resource_uid);
  assert.equal(f.state.items[0].kind, 'revision'); assert.ok(!JSON.stringify(f.state.items).includes('private'));
});
