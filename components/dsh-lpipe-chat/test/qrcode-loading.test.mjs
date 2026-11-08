import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

test('QR encoder survives repeated plugin and CommonJS cache eviction', async () => {
  const encoderUrl = new URL('../src/qrcode.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { dirname, sep } from 'node:path';
    import { pathToFileURL } from 'node:url';
    const require = createRequire(${JSON.stringify(import.meta.url)});
    const loader = require('internal/modules/esm/loader').getOrInitializeCascadedLoader();
    const encoderUrl = ${JSON.stringify(encoderUrl)};
    const entry = require.resolve('qrcode');
    const server = require.resolve('qrcode/lib/server.js');
    const root = dirname(require.resolve('qrcode/package.json')) + sep;
    const { PNG } = require('pngjs');
    let encodings = 0;
    async function encode() {
      const { default: QRCode } = await import(encoderUrl);
      const dataUrl = await QRCode.toDataURL('https://example.invalid/reload', { width: 320 });
      const buffer = await QRCode.toBuffer('https://example.invalid/reload', { width: 320 });
      for (const bytes of [Buffer.from(dataUrl.split(',')[1], 'base64'), buffer]) {
        const png = PNG.sync.read(bytes);
        assert.equal(png.width, 320); assert.equal(png.height, 320);
      }
      assert.equal(require.cache[server].loaded, true);
      encodings++;
    }
    await encode();
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const scope of ['plugin', 'entry-and-server', 'package']) {
        Map.prototype.delete.call(loader.loadCache, encoderUrl);
        const files = scope === 'plugin' ? [] : scope === 'entry-and-server'
          ? [entry, server] : Object.keys(require.cache).filter(file => file.startsWith(root));
        for (const file of files) {
          Map.prototype.delete.call(loader.loadCache, pathToFileURL(file).href);
          delete require.cache[file];
        }
        await encode();
      }
    }
    console.log(JSON.stringify({ encodings }));
  `;
  const { stdout } = await promisify(execFile)(process.execPath,
    ['--expose-internals', '--input-type=module', '-e', script], { timeout: 15000 });
  assert.deepEqual(JSON.parse(stdout), { encodings: 16 });
});
