import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const digest = 'a'.repeat(64);
const image = `registry.example/panel:release-1@sha256:${digest}`;
const render = (...values) => spawnSync('helm', ['template', 'fixture-panel', 'deploy/chart',
  '-f', 'deploy/examples/values.yaml', ...values.flatMap(value => ['--set-string', value])],
{ encoding: 'utf8', timeout: 10000 });

test('the packaged chart contains the native Devtron image descriptor', async t => {
  const descriptor = JSON.parse(await readFile('deploy/chart/.image_descriptor_template.json', 'utf8'));
  assert.deepEqual(descriptor, { image: '{{.Name}}:{{.Tag}}' });
  const directory = await mkdtemp(join(tmpdir(), 'devtron-chart-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const packaged = spawnSync('helm', ['package', 'deploy/chart', '--destination', directory],
    { encoding: 'utf8', timeout: 10000 });
  assert.equal(packaged.status, 0, packaged.stderr);
  const archives = (await readdir(directory)).filter(name => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const inspected = spawnSync(process.env.PYTHON || 'python3', ['-c',
    'import json,sys,tarfile; t=tarfile.open(sys.argv[1]); n=[n for n in t.getnames() if n.endswith("/.image_descriptor_template.json")]; assert len(n)==1; print(json.dumps(json.load(t.extractfile(n[0]))))',
    join(directory, archives[0])], { encoding: 'utf8', timeout: 10000 });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.deepEqual(JSON.parse(inspected.stdout), descriptor);
});

test('native image updates do not require a manual source annotation', () => {
  const result = render(`image=${image}`, 'imageSourceRevision=');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`image: "${image}"`));
  assert.ok(!result.stdout.includes('org.opencontainers.image.revision'));
  const annotated = render(`image=${image}`, `imageSourceRevision=${'b'.repeat(40)}`);
  assert.equal(annotated.status, 0, annotated.stderr);
  assert.ok(annotated.stdout.includes(`org.opencontainers.image.revision: "${'b'.repeat(40)}"`));
  const invalidRevision = render(`image=${image}`, 'imageSourceRevision=invalid');
  assert.notEqual(invalidRevision.status, 0);
  assert.match(invalidRevision.stderr, /imageSourceRevision must be the image source commit/);
  const mutable = render('image=registry.example/panel:latest', 'imageSourceRevision=');
  assert.notEqual(mutable.status, 0);
  assert.match(mutable.stderr, /image must be the verified immutable digest reference/);
});
