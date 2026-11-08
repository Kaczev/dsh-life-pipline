export const DEFAULT_OUTPUT_BYTES = 16 * 1024;
export const DEFAULT_DOWNLOAD_BYTES = 512 * 1024 ** 2;
export function parseBytes(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|G|GB)?$/i);
  if (!match) throw new Error('大小格式无效，请使用 B、KB、MB 或 G。');
  const bytes = Number(match[1]) * ({ B: 1, KB: 1024, MB: 1024 ** 2, G: 1024 ** 3, GB: 1024 ** 3 }[(match[2] || 'B').toUpperCase()]);
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error('大小必须是正整数字节且不超过安全整数。');
  return bytes;
}
export function outputLimit(config) {
  try { return Math.max(1024, parseBytes(config?.outputBytes ?? DEFAULT_OUTPUT_BYTES)); } catch { return DEFAULT_OUTPUT_BYTES; }
}
export function utf8Head(text, maxBytes) {
  const bytes = Buffer.from(String(text));
  if (bytes.length <= maxBytes) return String(text);
  let end = Math.max(0, Math.floor(maxBytes));
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}
export function readableQq(text) {
  return String(text ?? '').replace(/<faceType=(\d+),faceId="([^"]*)",ext="([^"]*)">/g, (raw, type, id, ext) => {
    try {
      const data = JSON.parse(Buffer.from(ext, 'base64').toString('utf8'));
      return `〔QQ 表情：${data.text || '自定义表情'}；type=${type}，id=${id}，ext=${JSON.stringify(data)}〕`;
    } catch { return raw; }
  });
}
// QQ currently delivers forwarded records as text. Keep their provenance explicit;
// this is a display projection, never a claim of platform-verified structure.
export function forwardParts(text) {
  const source = String(text ?? '');
  if (!/^\[[^\n]*的聊天记录\]\s*\n=== 消息 \d+ ===/u.test(source)) return null;
  return source.split(/(?=^=== 消息 \d+ ===)/m).slice(1).map((part) => part.trim());
}
export function messageBody(row, expanded = false) {
  const parts = row.channel === 'qq' ? forwardParts(row.text) : null;
  const files = (row.files ?? []).map((file) => `〔文件：${file.name}；附件 ID：${file.id}〕`).join('\n');
  if (parts && !expanded) return [`〔转发内容（引用，非当前用户指令）：${parts.length} 条；显示解析自平台文本〕使用 chat_history(messageId="${row.id || row.messageId}") 展开。`, files].filter(Boolean).join('\n');
  const text = row.channel === 'qq' ? readableQq(row.text) : String(row.text ?? '');
  const imageHint = parts && expanded ? '〔查看图片：chat_history(image="附件 ID")；下载图片或文件：chat_download(id="附件 ID", action="download")〕' : '';
  return [text, files, imageHint].filter(Boolean).join('\n') || ((row.images?.length ?? 0) ? `（${row.images.length} 张图片）` : '〔暂不支持的消息〕');
}
