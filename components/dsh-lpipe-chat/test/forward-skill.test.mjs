import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardImages, openForwardImage } from '../src/forward.mjs';
import { registerChatSkill } from '../src/skill.mjs';

const record = url => ({ channel: 'qq', text: `[Ka的聊天记录]\n=== 消息 1 ===\n[附件1] 类型:图片 文件名:a.jpg URL:${url}` });
test('forward images are explicit, CDN restricted and byte sniffed', async () => {
  let calls = 0;
  const row = record('https://multimedia.nt.qq.com.cn/download?x=1');
  assert.equal(forwardImages(row).length, 1);
  assert.equal(forwardImages({ ...row, channel: 'weixin' }).length, 0);
  const attachments = { saveImage: async image => { assert.equal(image.mediaType, 'image/gif'); return { attachmentId: 'ok' }; } };
  const fetchImpl = async () => { calls++; return new Response(Buffer.from('GIF89a000000000000')); };
  await assert.rejects(openForwardImage(record('https://localhost/download'), 1, attachments, { fetchImpl }), /allowed QQ/);
  assert.equal(calls, 0);
  const opened = await openForwardImage(row, 1, attachments, { fetchImpl });
  assert.equal(opened.attachment.attachmentId, 'ok');
  await assert.rejects(openForwardImage(row, 2, attachments, { fetchImpl }), /No such image/);
  await assert.rejects(openForwardImage(row, 1, attachments, { fetchImpl: async () => new Response('x', { headers: { 'content-length': 9 * 1024 ** 2 } }) }), /8MB/);
  await assert.rejects(openForwardImage(row, 1, attachments, { fetchImpl: async () => new Response('not an image') }), /supported image/);
});
test('chat skill registers English content with the calling context disposer', () => {
  const dispose = () => {};
  let definition;
  const actual = registerChatSkill({ skills: { register: value => { definition = value; return dispose; } } });
  assert.equal(actual, dispose);
  assert.equal(definition.name, 'lpipe-chat-media');
  assert.equal(definition.provider, 'dsh-lpipe-chat');
  assert.match(definition.content, /^\n?# Kaomoji and Unicode emoji/);
  assert.match(definition.content, /chat_send.text/);
  assert.match(definition.content, /🫂/);
  assert.ok(!definition.content.startsWith('---'));
});
