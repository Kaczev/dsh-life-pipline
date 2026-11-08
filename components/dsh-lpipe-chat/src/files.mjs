import { defaultDownloadsDirectory } from './download-cleanup.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { open, mkdir, unlink } from 'node:fs/promises';
import { join, resolve, basename, extname } from 'node:path';
import { homeDir } from './paths.mjs';
import { extractWeixinFiles } from './weixin/vendor/weixin-api.mjs';
import { parseBytes, DEFAULT_DOWNLOAD_BYTES } from './content.mjs';

export function registerFile(channel, source) {
  const id = source.referenceKey ? (() => {
    const hex = createHash('sha256').update(`${channel}:${source.referenceKey}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  })() : randomUUID();
  const dir = join(homeDir(), 'attachments');
  mkdirSync(dir, { recursive: true });
  const name = String(source.filename || source.file_name || 'file');
  const size = Number(source.size ?? source.len);
  const record = { id, channel, source, name, ...(Number.isFinite(size) && size >= 0 ? { size } : {}) };
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(record), { mode: 0o600 });
  return { id, name, ...(record.size !== undefined ? { size } : {}) };
}
async function boundedFetch(url, options, maxBytes, fetchImpl = fetch) {
  const parsed = new URL(String(url).startsWith('//') ? `https:${url}` : url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('附件 URL 必须使用 HTTPS');
  const allowed = /(^|\.)(qq\.com|qq\.com\.cn|wechat\.com)$/i;
  if (!allowed.test(parsed.hostname)) throw new Error('附件下载域名不受信任');
  const response = await fetchImpl(parsed, { ...options, redirect: 'error' });
  if (!response.ok) throw new Error(`附件下载失败：HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('附件超过下载上限'); }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > maxBytes) throw new Error('附件超过下载上限');
      chunks.push(Buffer.from(value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return new Response(Buffer.concat(chunks), { status: 200 });
}
export function readFileReference(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error('附件 ID 无效');
  return JSON.parse(readFileSync(join(homeDir(), 'attachments', `${id}.json`), 'utf8'));
}
export async function downloadFile(args, config, { fetchImpl: transport = fetch } = {}) {
  const record = readFileReference(args.id);
  if (args.action !== 'download') return { id: record.id, name: record.name, size: record.size ?? null, summary: `${record.name}；大小：${record.size ?? '未知'} B；尚未执行下载。` };
  const limit = parseBytes(config.downloadBytes ?? DEFAULT_DOWNLOAD_BYTES);
  if (record.size > limit) throw new Error('附件超过下载上限');
  const signal = AbortSignal.timeout(120_000);
  const fetchImpl = (url, options) => boundedFetch(url, { ...options, signal }, limit + (record.channel === 'weixin' ? 16 : 0), transport);
  const bytes = record.channel === 'weixin'
    ? await extractWeixinFiles({ item_list: [{ file_item: record.source }] }, { fetchImpl })[0].load({ signal })
    : Buffer.from(await (await fetchImpl(record.source.url, {})).arrayBuffer());
  if (bytes.length > limit) throw new Error('附件超过下载上限');
  const dir = args.directory ? resolve(args.directory) : defaultDownloadsDirectory();
  await mkdir(dir, { recursive: true });
  let clean = basename(record.name.replaceAll('\\', '/')).replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 180) || 'file';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) clean = `_${clean}`;
  const ext = extname(clean); const stem = clean.slice(0, clean.length - ext.length);
  for (let n = 0; n < 10000; n++) {
    const path = join(dir, n ? `${stem}（${n}）${ext}` : clean);
    let handle;
    try { handle = await open(path, 'wx'); } catch (error) { if (error.code === 'EEXIST') continue; throw error; }
    try { await handle.writeFile(bytes); await handle.close(); }
    catch (error) { await handle.close().catch(() => {}); await unlink(path).catch(() => {}); throw error; }
    return { id: record.id, path, size: bytes.length, summary: `已下载 ${record.name}：${path}（${bytes.length} B）` };
  }
  throw new Error('同名文件过多');
}
