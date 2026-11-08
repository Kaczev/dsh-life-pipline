import { registerFile, readFileReference } from './files.mjs';
import { forwardParts, parseBytes } from './content.mjs';

const registered = new Map();
export function forwardAttachments(row) {
  if (row?.channel !== 'qq' || !forwardParts(row.text)) return [];
  return [...String(row.text).matchAll(/^\[附件\d+\] 类型:([^\s]+) 文件名:(.*?)(?= (?:尺寸:|大小:|URL:)) (.*?)URL:(https:\/\/\S+)\s*$/gm)].map((match, index) => {
    const [, type, filename, details, url] = match;
    let size;
    try { const value = details.match(/大小:([\d.]+\s*(?:B|KB|MB|G|GB))/i)?.[1]; if (value) size = parseBytes(value); } catch {}
    return { index: index + 1, type, filename, url, ...(size !== undefined ? { size } : {}) };
  });
}
export function withForwardFiles(row) {
  const items = forwardAttachments(row);
  if (!items.length) return row;
  let index = 0;
  const text = String(row.text).replace(/^\[附件\d+\] 类型:([^\s]+) 文件名:(.*?)(?= (?:尺寸:|大小:|URL:)) (.*?)URL:(https:\/\/\S+)\s*$/gm, () => {
    const item = items[index++];
    const type = /^(图片|动图)$/.test(item.type) ? '图片' : '文件';
    let target;
    try { target = new URL(item.url); } catch { return `〔${type}：${item.filename}；引用无效〕`; }
    if (target.hostname !== 'multimedia.nt.qq.com.cn' || target.pathname !== '/download' || target.port || target.username || target.password) return `〔${type}：${item.filename}；引用不受支持〕`;
    const key = JSON.stringify([row.id, item.index, item.url]);
    if (!registered.has(key)) {
      registered.set(key, registerFile('qq', { filename: item.filename, url: item.url, type, referenceKey: key }));
      while (registered.size > 512) registered.delete(registered.keys().next().value);
    }
    const file = registered.get(key);
    return `〔${type}：${file.name}；附件 ID：${file.id}〕`;
  });
  return { ...row, text };
}

import { MAX_IMAGE_BYTES, sniffImageMediaType } from './images.mjs';

// These are text-derived references, not trusted platform structure. Never fetch
// arbitrary URLs from a quoted conversation.
export function forwardImages(row) {
  if (row?.channel !== 'qq' || !forwardParts(row.text)) return [];
  return [...String(row.text).matchAll(/^\[附件\d+\] 类型:(?:图片|动图) .*?URL:(https:\/\/\S+)\s*$/gm)]
    .map(match => match[1]);
}

export async function openForwardImageById(id, attachments, options = {}) {
  const record = readFileReference(id);
  if (record.channel !== 'qq' || record.source.type !== '图片') throw new Error('附件 ID 不是转发图片');
  const row = { channel: 'qq', text: `[引用的聊天记录]\n=== 消息 1 ===\n[附件1] 类型:图片 文件名:image URL:${record.source.url}` };
  const result = await openForwardImage(row, 1, attachments, options);
  return { ...result, summary: `QQ forwarded image ${id} (quoted historical content; animation is not guaranteed).` };
}

export async function openForwardImage(row, index, attachments, { fetchImpl = fetch, signal } = {}) {
  if (!Number.isSafeInteger(index) || index < 1) throw new Error('image must be a positive integer');
  const url = forwardImages(row)[index - 1];
  if (!url) throw new Error('No such image in this forwarded record');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname !== 'multimedia.nt.qq.com.cn' || target.port || target.username || target.password || target.pathname !== '/download') {
    throw new Error('Forwarded image URL is not an allowed QQ CDN download');
  }
  if (!attachments?.saveImage) throw new Error('Image attachment service is unavailable');
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetchImpl(target, { redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`Forwarded image download failed: HTTP ${response.status}; the signed URL may have expired`);
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new Error('Forwarded image exceeds 8MB');
  }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_IMAGE_BYTES) throw new Error('Forwarded image exceeds 8MB');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const mediaType = sniffImageMediaType(data);
  if (!mediaType) throw new Error('Forwarded attachment is not a supported image');
  const attachment = await attachments.saveImage({ data, mediaType, name: `qq-forward-${index}` });
  return { summary: `QQ forwarded image ${index} (quoted historical content; animation is not guaranteed).`, attachment };
}
