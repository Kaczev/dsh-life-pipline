import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('the package advertises a client, icon, bilingual metadata, and depends only on dsh-life-core', async () => {
  assert.equal(pkg.name, 'dsh-lpipe-focus');
  assert.equal(pkg.icon, 'assets/icon.png');
  assert.equal(pkg.exports['.'], './src/index.js');
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.exports['./icon'], './assets/icon.png');
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json');
  assert.equal(pkg.scripts['build-client'], 'node scripts/build-client.mjs');
  assert.deepEqual(Object.keys(pkg.dependencies), ['dsh-life-core']);
  for (const entry of ['src', 'lib', 'client', 'assets', 'locale', 'cordis.patch.yml']) {
    assert.ok(pkg.files.includes(entry), `${entry} must ship with the package`);
  }
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-ui-slots',
  ]);
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
});

test('the icon is a square 512px transparent RGBA PNG under 256 KiB', async () => {
  const file = new URL('assets/icon.png', root);
  const bytes = await readFile(file);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
  assert.equal(bytes[25], 6, 'PNG color type 6 is RGBA');
  const info = await stat(file);
  assert.ok(info.size > 0 && info.size <= 256 * 1024);
});

test('both locales carry title and description', async () => {
  const zh = JSON.parse(await readFile(new URL('locale/zh.json', root), 'utf8'));
  const en = JSON.parse(await readFile(new URL('locale/en.json', root), 'utf8'));
  assert.match(zh.meta.title, /聚焦管线/);
  assert.equal(en.meta.title, 'Lpipe Focus');
  assert.ok(zh.meta.description.length > 0);
  assert.ok(en.meta.description.length > 0);
});
