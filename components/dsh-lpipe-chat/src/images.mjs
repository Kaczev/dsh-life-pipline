/**
 * Inbound images, shared by both channels.
 *
 * WeChat hands us ciphertext plus an AES key, QQ hands us a CDN URL; both end
 * up as plain bytes here. The bytes are only sniffed, never re-encoded: the
 * attachment service normalizes whatever we store, and it is the one that can
 * say no.
 */

/** One image may not exceed this many bytes; the store has its own, lower cap. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;


/** Media types the attachment service accepts, keyed by what the bytes say. */
const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Identify an image by its magic bytes.
 * @param {Uint8Array} bytes - downloaded payload.
 * @returns {'image/png'|'image/jpeg'|'image/webp'|'image/gif'|null} media type, or null when it is not one of the four.
 */
export function sniffImageMediaType(bytes) {
  if (!bytes || bytes.byteLength < 12) return null;
  const at = (index) => bytes[index];
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'image/gif';
  const riff = String.fromCharCode(at(0), at(1), at(2), at(3));
  const tag = String.fromCharCode(at(8), at(9), at(10), at(11));
  if (riff === 'RIFF' && tag === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Download one image over HTTPS, refusing anything that is not a bounded image.
 * @param {string} url - CDN address from the platform.
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, maxBytes?: number }} [options]
 * @returns {Promise<{ data: Uint8Array, mediaType: string }>}
 */
export async function downloadImage(url, { fetchImpl = fetch, signal, maxBytes = MAX_IMAGE_BYTES } = {}) {
  let target;
  try {
    target = new URL(String(url ?? ''));
  } catch {
    throw new Error('图片地址无效。');
  }
  // A platform CDN never speaks plain HTTP, and a redirected host is not one we
  // vetted, so both are refused rather than followed.
  if (target.protocol !== 'https:') throw new Error('图片地址不是 HTTPS。');
  const response = await fetchImpl(target, { method: 'GET', signal, redirect: 'manual' });
  if (!response?.ok) throw new Error(`图片下载失败：HTTP ${response?.status ?? '?'}`);
  const declared = Number(response.headers?.get?.('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('图片超过大小上限。');
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error('图片超过大小上限。');
  const mediaType = sniffImageMediaType(buffer);
  if (!mediaType || !MEDIA_TYPES.has(mediaType)) throw new Error('这个文件不是可用的图片格式。');
  return { data: buffer, mediaType };
}

/**
 * Normalize one already-decoded payload into a prompt image.
 * @param {Uint8Array} bytes - decoded image bytes.
 * @param {{ name?: string, mediaType?: string }} [meta]
 * @returns {{ name: string, mediaType: string, data: Uint8Array } | null} null when the bytes are not a supported image or exceed the cap.
 */
export function toInboundImage(bytes, { name = '', mediaType = '' } = {}) {
  if (!bytes || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const sniffed = sniffImageMediaType(bytes);
  const kind = MEDIA_TYPES.has(mediaType) ? mediaType : sniffed;
  if (!kind || !MEDIA_TYPES.has(kind)) return null;
  return { name: String(name ?? ''), mediaType: kind, data: bytes };
}

/**
 * Archive-safe description of an inbound image: never the bytes themselves.
 * @param {{ name?: string, mediaType?: string, data?: Uint8Array }} image
 * @returns {{ name: string, mediaType: string, bytes: number }}
 */
export function imageRecord(image) {
  return {
    name: String(image?.name ?? ''),
    mediaType: String(image?.mediaType ?? ''),
    bytes: Number(image?.data?.byteLength ?? 0),
  };
}
