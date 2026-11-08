import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { parseBytes, utf8Head, readableQq, messageBody } from '../src/content.mjs';
import { historyPage } from '../src/history.mjs';
import { registerFile, downloadFile } from '../src/files.mjs';
import { forwardAttachments, withForwardFiles, openForwardImageById } from '../src/forward.mjs';
import { sendMediaParts } from '../src/media.mjs';
import { createChatRpcHandler } from '../src/rpc.mjs';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'chat 新功能 '));
const directory = join(process.env.DSH_HOME, '中文 下载');
test('forward pictures and files share explicit download references without fetching', async () => {
  const row = { id: 'forward-files', channel: 'qq', text: '[Ka的聊天记录]\n=== 消息 1 ===\n[附件1] 类型:图片 文件名:a.jpg 尺寸:1x1 大小:1KB URL:https://multimedia.nt.qq.com.cn/download?image=1\n[附件2] 类型:文件 文件名:测试 文档.txt 大小:3B URL:https://multimedia.nt.qq.com.cn/download?file=1\n[附件3] 类型:文件 文件名:bad.txt URL:https://localhost/download' };
  assert.equal(forwardAttachments(row).length, 3);
  assert.equal(forwardAttachments(row)[1].filename, '测试 文档.txt');
  const projected = withForwardFiles(row);
  const ids = [...projected.text.matchAll(/附件 ID：([0-9a-f-]+)/g)].map(match => match[1]);
  assert.equal(ids.length, 2);
  assert.doesNotMatch(projected.text, /https:\/\/|URL:/);
  assert.match(projected.text, /〔图片：a.jpg/);
  assert.match(projected.text, /〔文件：测试 文档.txt/);
  assert.deepEqual(withForwardFiles(row), projected);
  assert.equal(row.files, undefined);
  for (const id of ids) {
    const info = await downloadFile({ id }, {});
    assert.equal(info.size, null);
    const saved = await downloadFile({ id, action: 'download', directory: join(process.env.DSH_HOME, 'forward-downloads') }, { downloadBytes: 1024 }, { fetchImpl: async () => new Response('abc') });
    assert.equal(saved.size, 3);
    assert.equal(readFileSync(saved.path, 'utf8'), 'abc');
  }
  const opened = await openForwardImageById(ids[0], { saveImage: async () => ({ attachmentId: 'image-ok' }) }, { fetchImpl: async () => new Response(Buffer.from('GIF89a000000000000')) });
  assert.equal(opened.attachment.attachmentId, 'image-ok');
  await assert.rejects(openForwardImageById(ids[1], {}, {}), /不是转发图片/);
  assert.match(messageBody(projected, true), /附件 ID/);
});
test('byte units, UTF-8 boundaries and QQ display metadata', () => {
  assert.equal(parseBytes('16kb'), 16384); assert.equal(parseBytes('1G'), 1073741824);
  assert.equal(parseBytes('1.5 MB'), 1572864);
  assert.throws(() => parseBytes('-1G')); assert.throws(() => parseBytes('0'));
  assert.equal(utf8Head('你好🙂', 8), '你好');
  const ext = Buffer.from(JSON.stringify({ text: '笑', num: 12 })).toString('base64');
  assert.match(readableQq(`<faceType=1,faceId="317",ext="${ext}">`), /"num":12/);
  assert.match(messageBody({ channel: 'qq', id: 'f', text: '[Ka的聊天记录]\n=== 消息 1 ===\n发言\n=== 消息 2 ===\n引用' }), /转发内容.*2 条/);
});
test('history paginates a frozen snapshot, long messages and JSON escapes within budget', () => {
  const rows = Array.from({ length: 8 }, (_, n) => ({ id: String(n), at: 'now', channel: 'qq', text: `record-${n}`, direction: 'in' }));
  let page = historyPage({ limit: 3 }, { outputBytes: 1024 }, rows);
  assert.match(page.summary, /record-5[\s\S]*record-7/);
  const second = historyPage({ cursor: page.cursor }, { outputBytes: 1024 }, [...rows, { id: '9', text: 'new' }]);
  assert.match(second.summary, /record-2[\s\S]*record-4/); assert.doesNotMatch(second.summary, /record-7|new/);
  assert.deepEqual(historyPage({ cursor: page.cursor }, { outputBytes: 1024 }, []), second);
  const long = [{ id: 'long', at: 'now', channel: 'weixin', text: '汉字"\\\n🙂'.repeat(900) }];
  page = historyPage({ messageId: 'long' }, { outputBytes: 1024 }, long);
  let pages = 0;
  while (true) {
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 1024);
    assert.doesNotMatch(page.summary, /�/); pages++;
    if (!page.hasMore) break;
    assert.ok(pages < 100); page = historyPage({ cursor: page.cursor }, { outputBytes: 1024 }, []);
  }
  assert.ok(pages > 1);
  assert.throws(() => historyPage({ cursor: 'invalid' }), /失效/);
});
test('file inspection never downloads; bounded streaming and collision-safe Unicode names', async () => {
  const ref = registerFile('qq', { filename: '../../报告.pdf', url: 'https://nt.qq.com.cn/file' });
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(Buffer.from('hello')); };
  const meta = await downloadFile({ id: ref.id }, {}, { fetchImpl });
  assert.equal(meta.size, null); assert.equal(calls, 0);
  assert.equal(existsSync(directory), false);
  const first = await downloadFile({ id: ref.id, action: 'download', directory }, { downloadBytes: 10 }, { fetchImpl });
  const second = await downloadFile({ id: ref.id, action: 'download', directory }, { downloadBytes: 10 }, { fetchImpl });
  assert.equal(basename(first.path), '报告.pdf'); assert.equal(basename(second.path), '报告（1）.pdf');
  assert.equal(readFileSync(first.path, 'utf8'), 'hello');
  await assert.rejects(downloadFile({ id: ref.id, action: 'download', directory }, { downloadBytes: 4 }, { fetchImpl }), /超过/);
  const known = registerFile('qq', { filename: 'big', size: 100, url: 'https://qq.com/file' });
  const before = calls;
  await assert.rejects(downloadFile({ id: known.id, action: 'download', directory }, { downloadBytes: 4 }, { fetchImpl }), /超过/);
  assert.equal(calls, before);
  const bad = registerFile('qq', { filename: 'bad', url: 'https://127.0.0.1/secret' });
  await assert.rejects(downloadFile({ id: bad.id, action: 'download', directory }, {}, { fetchImpl }), /域名/);
});
test('four settings validate atomically and preserve unrelated fields', async () => {
  let config = { quietSeconds: 1, windowSeconds: 5, untouched: 42 };
  const rpc = createChatRpcHandler({ getConfig: () => config, update: (fn) => { config = fn(config); }, channels: {} });
  const bad = await rpc('chat.config.save', { quietSeconds: 2, windowSeconds: 8, outputBytes: 'oops', downloadBytes: '1G' });
  assert.equal(bad.ok, false); assert.equal(config.quietSeconds, 1);
  const ok = await rpc('chat.config.save', { quietSeconds: 2, windowSeconds: 8, outputBytes: '16kb', downloadBytes: '1.5G' });
  assert.equal(ok.ok, true); assert.equal(config.outputBytes, 16384); assert.equal(config.downloadBytes, 1610612736); assert.equal(config.untouched, 42);
});
test('media rejects unsupported stickers before send and reports partial delivery without retry', async () => {
  const path = join(directory, '报告.pdf'); let calls = 0; let ended = false;
  const env = { getConfig: () => ({ downloadBytes: 100 }), store: { appendMessage() {} }, channels: { qq: { async sendMedia() { calls++; if (calls === 2) throw new Error('timeout'); return { messageId: 'sent-1' }; } } }, sendText: async () => ({ messageIds: ['text-1'] }) };
  await assert.rejects(sendMediaParts({ channel: 'qq', media: [{ kind: 'sticker', path }] }, env), /原生表情/);
  assert.equal(calls, 0);
  const result = await sendMediaParts({ channel: 'qq', text: 'hi', completed: true, media: [{ kind: 'file', path }, { kind: 'file', path }, { kind: 'file', path }] }, env, { concludeTurn() { ended = true; } });
  assert.equal(result.sent, false); assert.equal(calls, 2); assert.equal(ended, false);
  assert.deepEqual(result.messageIds, ['text-1', 'sent-1']); assert.match(result.summary, /后续未发送/);
});
