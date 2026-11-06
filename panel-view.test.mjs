import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanel } from './public/view.mjs';
import { provider } from './public/inbox.mjs';

function renderHistory(inboxState) {
  let index = 0;
  const initial = [{ busy: false, source: provider, ...inboxState }, '', '', provider];
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: () => [initial[index++], () => {}],
    useMemo: factory => factory(), useEffect: () => {},
  };
  const widgets = { React, Button: Symbol('HostButton'), Badge: Symbol('HostBadge'), Input: Symbol('HostInput') };
  const tree = createPanel(widgets, { context: { language: 'ko' }, state: null,
    signal: new AbortController().signal, saveState: () => {}, request: async () => ({ items: [], next_cursor: null }) })();
  const nodes = [];
  const visit = node => { if (node && typeof node === 'object') { nodes.push(node); for (const child of node.children || []) visit(child); } };
  visit(tree);
  return { nodes, widgets };
}

test('render uses host widgets, Korean labels and readonly deployment evidence', () => {
  const row = { provider, signal_uid: '1', resource_name: 'demo', external_id: 'wfr-1', event_type: 'observed',
    outcome: 'failed', occurred_at: '2026-10-10', time_basis: 'observation' };
  const { nodes, widgets } = renderHistory({ items: [row], nextCursor: 'Cursor1' });
  assert.equal(nodes.filter(node => node.type === widgets.Button).length, 2);
  assert.equal(nodes.filter(node => node.type === widgets.Badge).length, 1);
  assert.equal(nodes.filter(node => node.type === widgets.Input).length, 1);
  assert.ok(nodes.some(node => node.children?.includes('새로고침')));
  assert.ok(nodes.some(node => node.children?.some(child => typeof child === 'string' && child.includes('관측'))));
});
test('failure copy gives recovery without exposing SDK or provider diagnostics', () => {
  const { nodes } = renderHistory({ items: [], error: 'private diagnostic token=not-a-real-token' });
  const rendered = JSON.stringify(nodes);
  assert.ok(!rendered.includes('private diagnostic'));
  assert.ok(rendered.includes('새로고침으로 다시 시도하세요'));
  assert.ok(nodes.some(node => node.props?.role === 'alert'));
});
