import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveDeployment, cardLifecycle } from './archive.mjs';
test('archiving retains deployments and never stops or deletes a service', () => {
  assert.deepEqual(archiveDeployment(), { state: 'retained', external_action: 'none' });
  assert.equal(cardLifecycle.deployment.archive.mode, 'retain');
});
