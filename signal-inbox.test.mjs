import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceInbox as createInbox, visibleItems, provider } from './public/inbox.mjs';
test('provider request, pagination, filters and aborted response cleanup', async () => {
  const abort = new AbortController(); const requests = []; const states = [];
  const item = { provider, resource_name: 'demo', external_id: 'wfr-1', event_type: 'status', outcome: 'success', commit_sha: 'abc' };
  const inbox = createInbox({ signal: abort.signal, request: async (operation, params) => { requests.push([operation, params]); return { items: [item, {provider: 'other'}], next_cursor: params.after ? null : 'Cursor1' }; } }, state => states.push(state), provider);
  await inbox.start(); await inbox.load(true);
  assert.deepEqual(requests, [['signals.list', {provider}], ['signals.list', {provider, after: 'Cursor1'}]]);
  assert.equal(states.at(-1).items.length, 2); assert.equal(states.at(-1).nextCursor, null);
  assert.equal(visibleItems([item], 'WFR', 'success').length, 1); assert.equal(visibleItems([item], 'demo', 'failed').length, 0);
  abort.abort(); const before = requests.length; await inbox.load(); assert.equal(requests.length, before);
  const pendingAbort = new AbortController(); let release; const published = [];
  const pending = createInbox({signal: pendingAbort.signal, request: () => new Promise(resolve => {release = resolve})}, state => published.push(state), provider);
  const task = pending.start(); pendingAbort.abort(); release({items: [item], next_cursor: null}); await task;
  assert.equal(published.length, 1);
});
test('request failures are visible and refresh remains available', async () => {
  const states = []; const session = {signal: new AbortController().signal, request: async () => {throw new Error('signals.read permission required')}};
  await createInbox(session, state => states.push(state), provider).start();
  assert.equal(states.at(-1).busy, false); assert.match(states.at(-1).error, /permission required/);
});

