import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('vendored native SDK candidate bytes match provenance and npm lock integrity', async () => {
  const provenance = JSON.parse(await readFile(new URL('./vendor/sdk-candidate-provenance.json', import.meta.url)));
  const lock = JSON.parse(await readFile(new URL('./package-lock.json', import.meta.url)));
  const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
  assert.equal(provenance.published, false);
  for (const item of provenance.packages) {
    const bytes = await readFile(new URL('./vendor/' + item.file, import.meta.url));
    assert.equal(bytes.length, item.bytes, item.name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.name);
    const entry = lock.packages['node_modules/' + item.name];
    assert.equal(entry.version, item.version, item.name);
    assert.equal(entry.resolved, 'file:vendor/' + item.file, item.name);
    assert.equal(pkg.dependencies[item.name], entry.resolved, item.name);
    assert.equal(entry.integrity, 'sha512-' + createHash('sha512').update(bytes).digest('base64'), item.name);
  }
});
