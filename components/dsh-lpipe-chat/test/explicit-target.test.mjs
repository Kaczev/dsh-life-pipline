import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatTools } from '../src/tools.mjs';
import { WeixinChannel } from '../src/weixin/channel.mjs';
import { inboundHead } from '../src/identity.mjs';

test('missing recipients reject before text/media preparation or transport on both channels', async () => {
  let calls = 0;
  const tools = createChatTools({ getConfig: () => ({}), channels: {}, store: {} });
  for (const tool of tools) for (const key of tool.parameters.required || []) assert.ok(tool.parameters.properties[key], `${tool.name}.${key}`);
  const send = tools.find(t => t.name === 'chat_send');
  assert.deepEqual(send.parameters.required, ['channel', 'targetId']);
  for (const channel of ['weixin', 'qq']) for (const targetId of [undefined, '', '  ', ' target ']) {
    await assert.rejects(send.execute({ channel, targetId, text: 'hello', media: [{ kind: 'file', path: 'does-not-exist' }] }, { concludeTurn() { calls++; } }), /targetId/);
  }
  assert.equal(calls, 0);
});

test('text and media use the selected non-owner recipient and archive full destination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'explicit-target-'));
  const path = join(dir, 'image.gif'); writeFileSync(path, 'GIF89a');
  for (const channel of ['weixin', 'qq']) {
    const calls = [], archive = [];
    const transport = {
      async sendText(text, options) { calls.push(options); return { messageIds: ['text'], messageId: 'text', toUserId: channel === 'weixin' ? options.toUserId : undefined, targetId: options.targetId, scope: options.scope, contextToken: true }; },
      async sendMedia(file, kind, options) { calls.push(options); return { messageIds: ['media'], targetId: options.targetId, scope: options.scope }; },
    };
    const send = createChatTools({ getConfig: () => ({ downloadBytes: 100 }), channels: { [channel]: transport }, store: { appendMessage(row) { archive.push(row); } } }).find(t => t.name === 'chat_send');
    const result = await send.execute({ channel, targetId: 'full-other-user-id', text: 'hello', media: [{ kind: 'image', path }] });
    assert.equal(result.sent, true);
    assert.equal(calls[0].toUserId || calls[0].targetId, 'full-other-user-id');
    assert.equal(calls[1].targetId, 'full-other-user-id');
    assert.ok(archive.every(row => row.conversationId === 'full-other-user-id'));
    assert.equal(result.recallDelivery.targetId, 'full-other-user-id');
  }
});

test('WeChat transport rejects implicit recipients and sends media to explicit target', async () => {
  const seen = [];
  const channel = new WeixinChannel({ config: () => ({ weixin: { botToken: 'token', ownerUserId: 'owner', baseUrl: 'https://example.com' } }), api: { async sendFile(args) { seen.push(args); return { providerMessageIds: ['file'] }; } }, log: {} });
  await assert.rejects(channel.sendText('hello'), /toUserId is required/);
  await assert.rejects(channel.sendMedia({ bytes: Buffer.from('x') }, 'file'), /targetId is required/);
  const result = await channel.sendMedia({ bytes: Buffer.from('x') }, 'file', { targetId: 'not-owner' });
  assert.equal(seen[0].toUserId, 'not-owner');
  assert.equal(result.toUserId, 'not-owner');
});

test('unknown nicknames never become suffix IDs; group and sender IDs stay complete', () => {
  const row = { channel: 'qq', senderId: 'complete-user-123456', conversationKind: 'group', conversationId: 'complete-group-987654' };
  assert.equal(inboundHead(row).head, 'QQ · 群 complete-group-987654 · 未知昵称 · complete-user-123456');
});
