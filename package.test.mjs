import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('native SDK accepts portable publishing packages without tenant trust targets', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devtron-package-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'app.zip');
  const { PUBLIC_URL, HOST_ORIGIN, ...env } = process.env;
  const result = spawnSync(process.execPath, ['package.mjs', '--publish-signals', output], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const inspect = spawnSync(env.PYTHON || 'python3', ['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("manifest.json").decode())', output], { env, encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr);
  const manifest = JSON.parse(inspect.stdout);
  assert.ok(manifest.declaration.capabilities.includes('signals.publish'));
  assert.deepEqual(manifest.declaration.trust.data_origins, []);
  assert.ok(manifest.declaration.signal_policy);
  assert.equal(manifest.panel_entry, 'panel/index.html');
});
