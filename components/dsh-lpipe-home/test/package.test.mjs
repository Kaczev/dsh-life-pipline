import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('the package advertises a client, icon and bilingual metadata', async () => {
  assert.equal(pkg.name, 'dsh-lpipe-home');
  assert.equal(pkg.icon, 'assets/icon.png');
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.exports['./icon'], './assets/icon.png');
  assert.equal(pkg.exports['./locale/en.json'], './locale/en.json');
  assert.equal(pkg.exports['./locale/zh.json'], './locale/zh.json');
  assert.equal(pkg.scripts['build-client'], 'node scripts/build-client.mjs');
  for (const entry of ['src', 'lib', 'client', 'assets', 'locale']) {
    assert.ok(pkg.files.includes(entry), `${entry} must ship with the package`);
  }
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

test('both locales carry the series title and a description', async () => {
  const zh = JSON.parse(await readFile(new URL('locale/zh.json', root), 'utf8'));
  const en = JSON.parse(await readFile(new URL('locale/en.json', root), 'utf8'));
  assert.equal(zh.meta.title, '栖所管线（Lpipe Home）');
  assert.equal(en.meta.title, 'Lpipe Home');
  for (const locale of [zh, en]) {
    assert.ok(locale.meta.description.length > 0);
    for (const key of ['ownerName', 'location', 'customPath']) {
      assert.equal(typeof locale[key], 'string');
      assert.ok(locale[key].length > 0);
    }
  }
});
