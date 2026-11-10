import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homeDir } from './paths.mjs';
import { imageRecord, downloadImage, toInboundImage, MAX_IMAGE_BYTES } from './images.mjs';
import { extractWeixinImages } from './weixin/vendor/weixin-api.mjs';

// References are archived immediately; bytes are cached only when requested.
export function archiveInboundImages(images = []) {
  const dir = join(homeDir(), 'images');
  return images.map(image => {
    const metadata = imageRecord(image);
    if (image.remote) {
      const id = `chat-image:${randomUUID()}`;
      const dir = join(homeDir(), 'image-refs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, id.slice(11) + '.json'), JSON.stringify({ remote: image.remote, name: metadata.name }), { mode: 0o600, flag: 'wx' });
      return { ...metadata, id, deferred: true };
    }
    try {
      if (!image.data?.byteLength) throw new Error('图片字节缺失');
      const digest = createHash('sha256').update(image.data).digest('hex');
      mkdirSync(dir, { recursive: true });
      const path = join(dir, digest);
      if (!existsSync(path)) writeFileSync(path, image.data, { flag: 'wx' });
      return { ...metadata, id: `chat-image:${randomUUID()}`, sha256: digest };
    } catch (error) {
      return { ...metadata, unavailable: String(error.message).split('\n')[0] };
    }
  });
}

export function imageHistoryHints(row) {
  return (row.images ?? []).map((image, index) => image.id
    ? `〔图片 ${index + 1}：${image.name || 'image'}；图片 ID：${image.id}；用 chat_history(image="${image.id}") 查看〕`
    : `〔图片 ${index + 1}：未保存可补读引用${image.unavailable ? '（保存失败）' : '（旧记录）'}〕`).join('\n');
}

const pending = new Map();
export async function resolveInboundImage(image, { fetchImpl = fetch, signal, maxBytes = MAX_IMAGE_BYTES } = {}) {
  signal?.throwIfAborted();
  if (image.data) return image;
  if (image.deferred) {
    if (!/^chat-image:[0-9a-f-]{36}$/.test(image.id)) throw new Error('图片 ID 无效。');
    const key = join(homeDir(), 'image-refs', image.id.slice(11) + '.json');
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const record = JSON.parse(readFileSync(key, 'utf8'));
      if (record.cached) return resolveInboundImage(record.cached, { signal, maxBytes });
      const remote = record.remote;
      const timeout = AbortSignal.timeout(30000);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let loaded;
      try {
        if (remote.channel === 'qq') loaded = await downloadImage(remote.url, { fetchImpl, signal: requestSignal, maxBytes: Math.min(MAX_IMAGE_BYTES, maxBytes) });
        else if (remote.channel === 'weixin') {
          const item = extractWeixinImages({ item_list: [{ image_item: remote.imageItem }] }, { fetchImpl })[0];
          loaded = toInboundImage(await item.load({ signal: requestSignal, maxBytes: Math.min(MAX_IMAGE_BYTES, maxBytes) }), { name: image.name });
        }
        if (!loaded) throw new Error('图片格式不可用。');
      } catch (error) {
        throw new Error(`图片下载失败（链接或凭据可能已过期，请重新发送）：${String(error.message).replace(/https?:\/\/\S+/g, '[图片地址]').slice(0, 180)}`);
      }
      const cached = archiveInboundImages([{ ...loaded, name: image.name }])[0];
      if (!cached.sha256) throw new Error('图片缓存保存失败。');
      writeFileSync(key, JSON.stringify({ cached, remote }), { mode: 0o600 });
      return { ...loaded, name: image.name };
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  if (!/^[a-f0-9]{64}$/.test(image.sha256 ?? '')) throw new Error('这张图片的旧记录未保存可补读引用，请重新发送。');
  let data;
  try { data = readFileSync(join(homeDir(), 'images', image.sha256)); }
  catch { throw new Error('这张图片的本地归档已不可用，请重新发送。'); }
  if (data.length !== image.bytes || createHash('sha256').update(data).digest('hex') !== image.sha256) throw new Error('图片归档校验失败。');
  return { data, mediaType: image.mediaType, name: image.name };
}

export async function openArchivedImage(id, rows, attachments, options = {}) {
  const row = rows.find(row => row.id === id || row.messageId === id);
  if (row) throw new Error('查看图片只能使用图片 ID；请用 chat_history(messageId="' + id + '") 查找图片 ID。');
  const image = rows.flatMap(row => row.images ?? []).find(image => image.id === id);
  if (!image) {
    if (String(id).startsWith('chat-image:')) throw new Error('图片 ID 未在聊天归档中找到。');
    return null; // The caller may resolve an older QQ forwarded attachment ID.
  }
  if (!attachments?.saveImage) throw new Error('图片附件服务尚未就绪，请稍后重试。');
  const resolved = await resolveInboundImage(image, options);
  const { data } = resolved;
  if (options.maxBytes !== undefined && data.length > options.maxBytes) throw new Error('图片超过通知／历史共享大小上限；请提高该设置后重试。');
  const attachment = await attachments.saveImage({ data, mediaType: resolved.mediaType, name: image.name });
  return { summary: `聊天历史图片 ${image.id}，属于引用的历史内容。`, attachment };
}
