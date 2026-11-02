import test from 'node:test';
import assert from 'node:assert/strict';
import { panelServer, configuration, declaration } from './server.mjs';
import { createInbox, visibleItems, provider } from './public/inbox.mjs';

test('public static routes, opaque iframe module CORS and declaration', async t => {
  const config = configuration({ HOST_ORIGIN: 'https://host.example', PUBLIC_URL: 'https://panel.example' });
  const server = panelServer(config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/panel.mjs', '/inbox.mjs', '/view.mjs', '/config.mjs', '/sdk/index.mjs', '/manifest.json']) {
    const response = await fetch(url + path); assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors https:\/\/host.example/);
  }
  const manifest = await (await fetch(url + '/manifest.json')).json();
  assert.deepEqual(manifest, declaration(config));
  assert.deepEqual(manifest.signal_sources, ['devtron']);
  for (const path of ['/server.mjs', '/package.json', '/sdk/index.mjs?other', '/%2e%2e/server.mjs']) assert.equal((await fetch(url + path)).status, 404);
  assert.equal((await fetch(url + '/', { method: 'POST' })).status, 405);
  assert.throws(() => configuration({ HOST_ORIGIN: 'https://host.example/path' }));
  assert.throws(() => configuration({ PUBLIC_URL: 'http://panel.example' }));
});
test('provider request, pagination, filters and aborted response cleanup', async () => {
  const abort = new AbortController(); const requests = []; const states = [];
  const item = { provider, resource_name: 'demo', external_id: 'wfr-1', event_type: 'status', outcome: 'success', commit_sha: 'abc' };
  const inbox = createInbox({ signal: abort.signal, request: async (operation, params) => { requests.push([operation, params]); return { items: [item, {provider: 'other'}], next_cursor: params.after ? null : 'Cursor1' }; } }, state => states.push(state));
  await inbox.load(); await inbox.load(true);
  assert.deepEqual(requests, [['signals.list', {provider}], ['signals.list', {provider, after: 'Cursor1'}]]);
  assert.equal(states.at(-1).items.length, 2); assert.equal(states.at(-1).nextCursor, null);
  assert.equal(visibleItems([item], 'WFR', 'success').length, 1); assert.equal(visibleItems([item], 'demo', 'failed').length, 0);
  abort.abort(); const before = requests.length; await inbox.load(); assert.equal(requests.length, before);
  const pendingAbort = new AbortController(); let release; const published = [];
  const pending = createInbox({signal: pendingAbort.signal, request: () => new Promise(resolve => {release = resolve})}, state => published.push(state));
  const task = pending.load(); pendingAbort.abort(); release({items: [item], next_cursor: null}); await task;
  assert.equal(published.length, 1);
});
test('request failures are visible and refresh remains available', async () => {
  const states = []; const session = {signal: new AbortController().signal, request: async () => {throw new Error('signals.read permission required')}};
  await createInbox(session, state => states.push(state)).load();
  assert.equal(states.at(-1).busy, false); assert.match(states.at(-1).error, /permission required/);
});

import { createPanel } from './public/view.mjs';
test('render uses host widgets, Korean labels and readonly signal evidence', () => {
  const row = {provider, signal_uid: '1', resource_name: 'demo', external_id: 'wfr-1', event_type: 'observed', outcome: 'failed', occurred_at: '2026-10-10', time_basis: 'observation'};
  let index = 0;
  const initial = [{items:[row], nextCursor:'Cursor1', busy:false, error:'', source:provider}, '', '', provider];
  const React = {
    createElement: (type, props, ...children) => ({type, props, children}),
    useState: () => [initial[index++], () => {}],
    useMemo: factory => factory(), useEffect: () => {},
  };
  const Button = Symbol('HostButton'), Badge = Symbol('HostBadge'), Input = Symbol('HostInput');
  const tree = createPanel({React, Button, Badge, Input}, {context:{language:'ko'}, state:null, signal:new AbortController().signal, saveState: () => {}, request: async () => ({items:[],next_cursor:null})})();
  const nodes = [];
  const walk = node => {if (node && typeof node === 'object') {nodes.push(node); for(const child of node.children || []) walk(child);}};
  walk(tree);
  assert.equal(nodes.filter(node => node.type === Button).length, 2);
  assert.equal(nodes.filter(node => node.type === Badge).length, 1);
  assert.ok(nodes.some(node => node.children?.includes('새로고침')));
  assert.ok(nodes.some(node => node.children?.some(child => typeof child === 'string' && child.includes('관측'))));
  assert.equal(nodes.filter(node => node.type === Input).length, 1);
});

test('HTTP manifest preserves the explicit workflow profile', async t => {
  const config = configuration({ HOST_ORIGIN: 'https://host.example', PUBLIC_URL: 'https://panel.example' });
  const profile = { workflowCards: true };
  const server = panelServer(config, profile);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const manifest = await (await fetch(`http://127.0.0.1:${server.address().port}/manifest.json`)).json();
  assert.deepEqual(manifest, declaration(config, profile));
  assert.equal(manifest.schema_version, 2);
  assert.ok(manifest.capabilities.includes('cards.create'));
});

test('publishing profile exposes declared sources and reads external app evidence separately', async t => {
  const config = configuration();
  const server = panelServer(config, { publishSignals:true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const manifest = await (await fetch(url+'/manifest.json')).json();
  const module = await (await fetch(url+'/config.mjs')).text();
  const browser = JSON.parse(module.slice('export default '.length, -1));
  assert.deepEqual(browser.signalSources, ['devtron','devtron-panel']);
  assert.deepEqual(browser.signalSources, manifest.signal_sources);
  const states=[],requests=[];
  const item={provider:'devtron-panel',external_id:'wfr-1',outcome:'success'};
  const inbox=createInbox({signal:new AbortController().signal,request:async(_,params)=>{requests.push(params);return {items:[item,{provider:'devtron',external_id:'old'}],next_cursor:null}}},state=>states.push(state),'devtron-panel');
  await inbox.load();
  assert.deepEqual(requests,[{provider:'devtron-panel'}]);
  assert.deepEqual(visibleItems(states.at(-1).items,'','','devtron-panel'),[item]);
});
