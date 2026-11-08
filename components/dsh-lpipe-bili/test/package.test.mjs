import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('the package advertises a client, icon and bilingual metadata', async () => {
  assert.equal(pkg.name, 'dsh-lpipe-bili');
  assert.equal(pkg.icon, 'assets/icon.png');
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.exports['./icon'], './assets/icon.png');
  assert.equal(pkg.exports['./locale/en.json'], './locale/en.json');
  assert.equal(pkg.exports['./locale/zh.json'], './locale/zh.json');
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json');
  for (const lang of ['en-US', 'zh-CN']) {
    const resolved = import.meta.resolve(`dsh-lpipe-bili/locale/${lang}.json`);
    const locale = JSON.parse(await readFile(new URL(resolved), 'utf8'));
    assert.ok(locale.meta.title);
    assert.ok(locale.meta.description);
  }
  assert.equal(pkg.scripts['build-client'], 'node scripts/build-client.mjs');
  assert.ok(pkg.files.includes('lib'));
  assert.ok(pkg.files.includes('client'));
  assert.ok(pkg.files.includes('assets'));
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-ui-slots',
  ]);
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
});

test('the icon is a square 512px transparent PNG', async () => {
  const file = new URL('assets/icon.png', root);
  const bytes = await readFile(file);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
  assert.equal(bytes[25], 6, 'PNG color type 6 is RGBA');
  await stat(file);
});

test('both locales carry a title and a description', async () => {
  for (const lang of ['zh', 'en']) {
    const locale = JSON.parse(await readFile(new URL(`locale/${lang}.json`, root), 'utf8'));
    assert.equal(typeof locale.meta.title, 'string');
    assert.ok(locale.meta.title.length > 0);
    assert.equal(typeof locale.meta.description, 'string');
    assert.ok(locale.meta.description.length > 0);
  }
});
