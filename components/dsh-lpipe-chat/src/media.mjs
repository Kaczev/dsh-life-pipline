import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { downloadFile } from './files.mjs';
import { parseBytes, DEFAULT_DOWNLOAD_BYTES } from './content.mjs';

export async function sendMediaParts(args, { getConfig, channels, store, sendText }, exec) {
  const prepared = [];
  for (const item of args.media) {
    if (!['image', 'file'].includes(item.kind)) throw new Error('原生表情发送不受上游支持，不会静默改为图片。');
    if (!!item.path === !!item.attachmentId) throw new Error('每个媒体须且仅须提供 path 或 attachmentId。');
    const path = item.path || (await downloadFile({ id: item.attachmentId, action: 'download' }, getConfig())).path;
    const size = statSync(path).size;
    if (size > parseBytes(getConfig().downloadBytes ?? DEFAULT_DOWNLOAD_BYTES)) throw new Error('发送文件超过大小上限');
    prepared.push({ kind: item.kind, file: { bytes: readFileSync(path), fileName: basename(path) } });
  }
  const results = []; const ids = []; const channel = args.channel;
  const options = { scope: args.scope || 'c2c', targetId: args.targetId, msgId: args.msgId };
  if (String(args.text ?? '').trim()) {
    try {
      const sent = await sendText({ ...args, media: undefined, completed: false }, exec);
      results.push('文字：已发送'); ids.push(...(sent.messageIds || []));
    } catch (error) { return { sent: false, channel, messageIds: ids, summary: `文字失败，未继续发送媒体：${error.message}；不自动重试。` }; }
  }
  for (const { kind, file } of prepared) {
    try {
      const sent = await channels[channel].sendMedia(file, kind, options);
      const partIds = sent.messageIds || (sent.messageId ? [sent.messageId] : []);
      ids.push(...partIds);
      results.push(`${file.fileName}：已发送${kind === 'image' ? '（动画呈现未验证）' : ''}`);
      try { store.appendMessage({ channel, direction: 'out', senderId: 'self', text: `〔${kind}：${file.fileName}〕`, messageIds: partIds }); }
      catch { results.push('本地归档失败；媒体已发送，不要重发。'); }
    } catch (error) {
      results.push(`${file.fileName}：失败或结果未知：${error.message}；后续未发送，不自动重试`);
      return { sent: false, channel, messageIds: ids, summary: results.join('\n') };
    }
  }
  if (args.completed === true) exec?.concludeTurn?.();
  return { sent: true, channel, messageIds: ids, summary: results.join('\n') };
}
