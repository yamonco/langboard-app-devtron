import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderPanel } from './public/provider-view.mjs';
function render({ supported = true, legacy = false, state = {} } = {}) {
  let index = 0;
  const values = [legacy, { resources: [], items: [], selected: '', busy: false, error: '', ...state }];
  const React = { createElement: (type, props, ...children) => ({ type, props, children }),
    useState: () => [values[index++], () => {}], useMemo: f => f(), useEffect: () => {}, Fragment: Symbol('Fragment') };
  const widgets = { React, Button: Symbol('HostButton'), Badge: Symbol('HostBadge') };
  const session = { context: { language: 'ko' }, supportedOperations: supported ? ['connections.read'] : [], signal: new AbortController().signal };
  const Panel = createProviderPanel(widgets, session, { LegacyPanel: () => React.createElement('p', null, 'LEGACY') });
  const nodes = [];
  function visit(node) { if (!node || typeof node !== 'object') return; if (typeof node.type === 'function') return visit(node.type(node.props)); nodes.push(node); for (const child of node.children || []) visit(child); }
  visit(Panel()); return { nodes, rendered: JSON.stringify(nodes), widgets };
}
test('default panel shows current-resource selection and labels published observations separately', () => {
  const { rendered, nodes, widgets } = render({ state: { resources: [{ resource_uid: 'Resource001', name: 'Sample' }] } });
  assert.ok(rendered.includes('권한이 있는 리소스')); assert.ok(rendered.includes('발행된 관측 기록'));
  assert.ok(!rendered.includes('LEGACY')); assert.equal(nodes.filter(n => n.type === widgets.Button).length, 3);
});
test('unsupported hosts do not silently mount the legacy inbox', () => {
  const { rendered } = render({ supported: false });
  assert.ok(rendered.includes('지원하지 않습니다')); assert.ok(!rendered.includes('LEGACY'));
});
test('explicit legacy mode identifies retained evidence rather than current provider results', () => {
  const { rendered } = render({ legacy: true });
  assert.ok(rendered.includes('현재 배포 조회 결과가 아닙니다')); assert.ok(rendered.includes('LEGACY'));
});
test('error and record UI uses safe copy and host widgets without asserting application health', () => {
  const { rendered, nodes, widgets } = render({ state: { error: 'private-token-detail', selected: 'Resource001', items: [{ kind: 'revision', id: '5', status: 'deployed', time: null }] } });
  assert.ok(!rendered.includes('private-token-detail')); assert.ok(rendered.includes('연결을 확인'));
  assert.ok(rendered.includes('시각 미상')); assert.equal(nodes.filter(n => n.type === widgets.Badge).length, 1);
  assert.ok(rendered.includes('정상 동작을 판단하지 않습니다'));
});
