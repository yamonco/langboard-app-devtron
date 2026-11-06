import test from 'node:test';
import assert from 'node:assert/strict';
import { panelServer, declaration, configuration } from './server.mjs';
import { createSourceInbox as createInbox, visibleItems, provider } from './public/inbox.mjs';

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
  await inbox.start();
  assert.deepEqual(requests,[{provider:'devtron-panel'}]);
  assert.deepEqual(visibleItems(states.at(-1).items,'','','devtron-panel'),[item]);
});
