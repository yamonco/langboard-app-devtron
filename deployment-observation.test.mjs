import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeploymentObservation, MissingDeploymentTimestamp } from './deployment-observation.mjs';

const historicalObservations = [
  {
    "resourceId": "app-17-env-9",
    "event_type": "deployment.succeeded",
    "occurred_at": "2026-11-01T01:03:04.000Z",
    "external_id": "wfr-1",
    "outcome": "success",
    "commit_sha": "",
    "event_id": "f74adfdf7e540e4f5d8b277d29d9e6d8df0856c563ab5c022bb6c1a59d93a23d"
  },
  {
    "resourceId": "helm-release-60f761f98ca4462f63ff31b7d2f892c97d80f4499197993b7fe30157dbe13f1a",
    "event_type": "deployment.succeeded",
    "occurred_at": "2026-11-03T09:11:03.869Z",
    "external_id": "helm-helm-release-60f761f98ca4462f63ff31b7d2f892c97d80f4499197993b7fe30157dbe13f1a-revision-1",
    "outcome": "success",
    "commit_sha": "",
    "event_id": "af229c33de14fa5148fd009b8f1a827ad8e8e532ccf93163d3a040082436083b"
  }
];
test('canonical observations preserve published occurrence and event identities', () => {
  for (const { resourceId, ...expected } of historicalObservations) {
    const actual = createDeploymentObservation({ phase: expected.event_type.slice('deployment.'.length),
      occurredAt: expected.occurred_at, deploymentId: expected.external_id, commitSha: expected.commit_sha }, resourceId);
    assert.deepEqual(actual, expected);
  }
});
test('domain rejects provider statuses and missing or ambiguous occurrence time', () => {
  const observation = { phase: 'succeeded', deploymentId: 'deployment-1', occurredAt: '2026-11-01T01:00:00Z' };
  assert.throws(() => createDeploymentObservation({ ...observation, phase: 'healthy' }, 'resource-1'), /phase/);
  assert.throws(() => createDeploymentObservation({ ...observation, occurredAt: null }, 'resource-1'), MissingDeploymentTimestamp);
  for (const occurredAt of [42, '2026-11-01T01:00:00', 'not-a-time']) {
    assert.throws(() => createDeploymentObservation({ ...observation, occurredAt }, 'resource-1'), /timestamp/);
  }
});



test('observation domain has no framework, SDK, transport or storage dependency', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e',
    "import { SourceTextModule } from 'node:vm'; import { readFileSync } from 'node:fs'; console.log(JSON.stringify(new SourceTextModule(readFileSync('deployment-observation.mjs', 'utf8')).dependencySpecifiers));"], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['node:crypto']);
});
