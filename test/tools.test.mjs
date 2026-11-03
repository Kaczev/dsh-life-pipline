import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'life-chat-tools-'));

const { saveConfig, loadConfig } = await import('../src/config.mjs');
const { createChatTools } = await import('../src/tools.mjs');
const store = await import('../src/store.mjs');

const OWNER = 'o9cq80-haFOaIzGnbpifvhAoGuWA@im.wechat';
saveConfig({
  mainSessionId: 'session-main',
  ownerName: 'Kaczev',
  weixin: { ownerUserId: OWNER, botToken: 'tok' },
  qq: { appId: 'a', appSecret: 'b', ownerOpenId: 'owner-qq' },
});

const calls = [];
const channels = {
  weixin: {
    status: { connected: true },
    async sendText(text, options) {
      calls.push({ channel: 'weixin', text, options });
      return { messageIds: ['wx-1'], toUserId: OWNER };
    },
  },
  qq: {
    status: { connected: true },
    async sendText(text, options) {
      calls.push({ channel: 'qq', text, options });
      return { messageId: 'qq-1', scope: options.scope, targetId: options.targetId ?? 'owner-qq' };
    },
  },
};

const tools = Object.fromEntries(
  createChatTools({ getConfig: loadConfig, update: (fn) => fn(loadConfig()), channels, store })
    .map((tool) => [tool.name, tool]),
);

test('chat_send carries the WeChat context token and archives the outbound row', async () => {
  store.appendMessage({
    channel: 'weixin', direction: 'in', conversationKind: 'dm', conversationId: OWNER,
    senderId: OWNER, senderName: '', text: '在吗', at: new Date().toISOString(), contextToken: 'ctx-1',
  });
  const result = await tools.chat_send.execute({ channel: 'weixin', text: '在的。' });
  assert.equal(result.sent, true);
  assert.equal(calls[0].options.contextToken, 'ctx-1');
  const rows = store.queryMessages({ limit: 5 });
  assert.equal(rows.at(-1).direction, 'out');
  assert.equal(rows.at(-1).text, '在的。');
});

test('chat_history filters by channel and keyword', async () => {
  const rows = await tools.chat_history.execute({ channel: 'weixin', keyword: '在' });
  assert.ok(rows.count >= 2);
  assert.ok(rows.messages.every((row) => row.channel === 'weixin'));
});

test('chat_send on QQ defaults to the owner private chat', async () => {
  const result = await tools.chat_send.execute({ channel: 'qq', text: '收到' });
  assert.equal(result.channel, 'qq');
  assert.equal(calls.at(-1).options.scope, 'c2c');
});

test('every tool publishes an object parameter schema', () => {
  for (const tool of Object.values(tools)) {
    assert.equal(tool.parameters.type, 'object', tool.name);
    assert.ok(tool.description.length > 20, tool.name);
    assert.equal(typeof tool.execute, 'function', tool.name);
  }
});
