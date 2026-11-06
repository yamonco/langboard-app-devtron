import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeployment, publishDeploymentObservations } from './signals.mjs';

const scope = { appId: 1064, environmentId: 146, boardUID: '12345678901', resourceUID: '12345678902', appRevision: 'a'.repeat(64), bindingRevision: 'b'.repeat(64), externalId: 'app-1064' };
const row = { id: 19767, workflow_type: 'DEPLOY', status: 'Succeeded', started_on: '2026-10-11T01:00:00Z', finished_on: '2026-10-11T01:04:00Z',
  gitTriggers: { material: { Commit: '8A0C22983AE7ACAE10ABE7569026AE25D889E159', Author: 'dev <dev@example>' } }, log_file_path: '/private/log', message: 'private' };
const host = { origin: 'https://host.example', token: 'lbac_' + 'x'.repeat(43) };

test('refresh caps the batch, persists first and publishes bounded envelopes', async () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ ...row, id: 20000 + index, finished_on: `2026-10-11T01:00:${String(index % 60).padStart(2, '0')}Z` }));
  const api = { readDeployments: async () => rows };
  const saved = [];
  const published = [];
  await publishDeploymentObservations({ api, scope, host, saveEnvelopes: envelopes => saved.push(envelopes) }, async (url, init) => {
    published.push(init.body); return Response.json({ signal_uid: 's' + published.length, duplicate: false });
  });
  assert.equal(saved.length, 1); assert.equal(saved[0].length, 25); assert.equal(published.length, 25);
  assert.equal(saved[0].every(envelope => envelope.board_uid === scope.boardUID), true);
});
test('external Helm preserves pending time and does not invent superseded release success', async () => {
  const { externalHelmScope } = await import('./provider-api.mjs');
  const selected = { ...scope, ...externalHelmScope('7|team-a|sample') };
  delete selected.appId; delete selected.environmentId;
  const history = (version, status) => ({ kind: 'helm', helmAppId: selected.helmAppId,
    version, status, deployedAt: { seconds: 1793697063 } });
  const pending = normalizeDeployment(history(3, 'pending-upgrade'), selected);
  assert.equal(pending.event_type, 'deployment.started');
  assert.equal(pending.outcome, 'running');
  const result = await publishDeploymentObservations({ api: { readDeployments: async () => [history(1, 'superseded'), history(2, 'deployed')] },
    scope: selected, host, saveEnvelopes: async envelopes => assert.equal(envelopes.length, 1) },
    async () => Response.json({ signal_uid: 'signal00001', duplicate: false }));
  assert.equal(result.receipts.length, 1);
  assert.deepEqual(result.unreported, [{ deployment_id: 1, reason: 'provider_outcome_unavailable' }]);
});
