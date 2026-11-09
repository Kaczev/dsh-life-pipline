import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const snapshot = new URL('src/vendor/storyboard/', root);
const manifest = JSON.parse(await readFile(new URL('upstream.json', snapshot), 'utf8'));
const imports = text => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([a-zA-Z0-9_@./:-]+)['"]/g)].map(m => m[1]);

test('vendored snapshot preserves the pinned source and licensing byte for byte', async () => {
  assert.equal(manifest.version, '0.7.1');
  assert.equal(manifest.commit, '60aedccd32b7f28815770e0a283f49ebac2e106a');
  for (const name of ['LICENSE', 'NOTICE', 'CREDITS.md', 'ocr_bridge.py']) assert.ok(manifest.files[name]);
  for (const [path, sha256] of Object.entries(manifest.files)) {
    const bytes = await readFile(new URL(path, snapshot));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, path);
  }
  const { OCR_BRIDGE } = await import('../src/vendor/storyboard/lib/ocr.js');
  await access(OCR_BRIDGE);
});

test('every source dependency stays within the snapshot or Node builtins', async () => {
  const seen = new Set();
  async function visit(url) {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    assert.ok(url.href.startsWith(snapshot.href));
    const path = url.href.slice(snapshot.href.length);
    assert.ok(manifest.files[path], `missing snapshot entry: ${path}`);
    for (const spec of imports(await readFile(url, 'utf8'))) {
      if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${path}: ${spec}`);
      await visit(new URL(spec, url));
    }
  }
  for (const entry of manifest.entries) await visit(new URL(entry, snapshot));
  assert.equal(seen.size, Object.keys(manifest.files).filter(p => p.endsWith('.js')).length);
});

test('Bili imports only local storyboard entries and has no upstream npm dependency', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.equal(pkg[field]?.['dsh-video-storyboard'], undefined);
  }
  assert.ok(pkg.files.includes('src'));
  const watch = await readFile(new URL('src/watch.mjs', root), 'utf8');
  const worker = await readFile(new URL('src/storyboard-worker.mjs', root), 'utf8');
  assert.ok(imports(watch).includes('./vendor/storyboard/lib/ytdlp.js'));
  assert.ok(imports(watch).includes('./vendor/storyboard/lib/probe.js'));
  assert.ok(imports(worker).includes('./vendor/storyboard/lib/pipeline.js'));
  assert.ok(![...imports(watch), ...imports(worker)].some(s => s.startsWith('dsh-video-storyboard')));
  const { runStoryboard, formatManifest } = await import('../src/vendor/storyboard/lib/pipeline.js');
  assert.equal(typeof runStoryboard, 'function');
  assert.equal(typeof formatManifest, 'function');
});
