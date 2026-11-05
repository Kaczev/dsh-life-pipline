import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';

import {
  MAX_IMAGE_BYTES,
  downloadImage,
  imageRecord,
  sniffImageMediaType,
  toInboundImage,
} from '../src/images.mjs';
import { weixinInboundImages } from '../src/weixin/channel.mjs';

// A real 1x1 PNG, so the sniffing test uses bytes an image decoder would accept.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBPVP8 ', 'latin1')]);

function response(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    arrayBuffer: async () => body,
  };
}

function ecbEncrypt(bytes, key) {
  const padding = (16 - (bytes.length % 16)) % 16;
  const padded = Buffer.concat([bytes, Buffer.alloc(padding)]);
  const cipher = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

test('the four image formats are recognised by their bytes, and nothing else is', () => {
  assert.equal(sniffImageMediaType(PNG), 'image/png');
  assert.equal(sniffImageMediaType(JPEG), 'image/jpeg');
  assert.equal(sniffImageMediaType(GIF), 'image/gif');
  assert.equal(sniffImageMediaType(WEBP), 'image/webp');
  assert.equal(sniffImageMediaType(Buffer.from('not an image at all')), null);
  assert.equal(sniffImageMediaType(Buffer.alloc(4)), null);
});

test('a downloaded image is sniffed, never trusted by its declared type', async () => {
  const image = await downloadImage('https://example.test/a.png', { fetchImpl: async () => response(PNG) });
  assert.equal(image.mediaType, 'image/png');
  assert.equal(image.data.byteLength, PNG.byteLength);

  await assert.rejects(
    downloadImage('https://example.test/a.png', { fetchImpl: async () => response(Buffer.from('plain text')) }),
    /不是可用的图片格式/,
  );
});

test('plain HTTP and oversized payloads are refused before they reach the session', async () => {
  let called = false;
  await assert.rejects(
    downloadImage('http://example.test/a.png', { fetchImpl: async () => { called = true; return response(PNG); } }),
    /HTTPS/,
  );
  assert.equal(called, false, 'an insecure URL must not even be fetched');

  await assert.rejects(
    downloadImage('https://example.test/a.png', {
      fetchImpl: async () => response(PNG, { 'content-length': String(MAX_IMAGE_BYTES + 1) }),
    }),
    /超过大小上限/,
  );

  await assert.rejects(
    downloadImage('https://example.test/a.png', { fetchImpl: async () => ({ ok: false, status: 410 }) }),
    /HTTP 410/,
  );
});

test('an image record keeps the facts and never the bytes', () => {
  const record = imageRecord({ name: 'image', mediaType: 'image/png', data: PNG });
  assert.deepEqual(record, { name: 'image', mediaType: 'image/png', bytes: PNG.byteLength });
  assert.equal('data' in record, false);
  assert.equal(toInboundImage(Buffer.from('nope')), null);
});

test('a WeChat picture is decrypted and arrives as an image part', async () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const ciphertext = ecbEncrypt(PNG, key);
  const message = {
    item_list: [{ type: 2, image_item: { aeskey: key.toString('hex'), media: { encrypt_query_param: 'token' } } }],
  };
  const images = await weixinInboundImages(message, {
    fetchImpl: async () => response(ciphertext),
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].mediaType, 'image/png');
  assert.equal(images[0].name, 'image');
  assert.deepEqual(Buffer.from(images[0].data.subarray(0, 8)), PngSignature);
});

test('a picture that will not decrypt is dropped, not thrown into the batch', async () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const message = {
    item_list: [{ type: 2, image_item: { aeskey: key.toString('hex'), media: { encrypt_query_param: 'token' } } }],
  };
  const refused = await weixinInboundImages(message, {
    // Not a whole AES block, so decryption fails.
    fetchImpl: async () => response(Buffer.from('short')),
  });
  assert.deepEqual(refused, []);
});

const PngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
