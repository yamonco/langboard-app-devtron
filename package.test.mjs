import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const profile of [
  { name: 'publishing', args: ['--publish-signals'], publish: true },
  { name: 'workflow cards', args: ['--workflow-cards'], cards: true },
  { name: 'publishing and workflow cards', args: ['--publish-signals', '--workflow-cards'], publish: true, cards: true },
]) test(`native SDK accepts portable ${profile.name} packages without tenant trust targets`, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devtron-package-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'app.zip');
  const { PUBLIC_URL, HOST_ORIGIN, ...env } = process.env;
  const result = spawnSync(process.execPath, ['package.mjs', ...profile.args, output], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const inspect = spawnSync(env.PYTHON || 'python3', ['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"manifest":json.loads(z.read("manifest.json")),"files":z.namelist()}))', output], { env, encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr);
  const { manifest, files } = JSON.parse(inspect.stdout);
  assert.ok(files.every(path => !path.endsWith(".test.mjs")), "Production packages must exclude colocated tests");
  const metadata = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.declaration.version, metadata.version,
    'Official installation requires the package declaration to match the release tag v' + metadata.version);
  assert.equal(manifest.declaration.capabilities.includes('signals.publish'), Boolean(profile.publish));
  assert.equal(manifest.declaration.capabilities.includes('cards.create'), Boolean(profile.cards));
  if (profile.cards) assert.equal(manifest.declaration.card_lifecycle.deployment.archive.mode, 'retain');
  assert.deepEqual(manifest.declaration.trust.data_origins, []);
  assert.equal(Boolean(manifest.declaration.signal_policy), Boolean(profile.publish));
  assert.equal(manifest.panel_entry, 'panel/index.html');
});
