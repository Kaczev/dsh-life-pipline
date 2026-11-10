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
      return { messageIds: ['wx-1'], toUserId: OWNER, contextToken: true };
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

test('chat_send leaves the context token to the channel and archives the outbound row', async () => {
  store.appendMessage({
    channel: 'weixin', direction: 'in', conversationKind: 'dm', conversationId: OWNER,
    senderId: OWNER, senderName: '', text: '在吗', at: new Date().toISOString(), contextToken: 'ctx-1',
  });
  const result = await tools.chat_send.execute({ channel: 'weixin', targetId: OWNER, text: '在的。' });
  assert.equal(result.sent, true);
  // A token stored from an earlier send may belong to a bot that is gone: the
  // channel reuses only what it heard on this connection, so no token is
  // handed down from here.
  assert.equal(calls[0].options.contextToken, undefined);
  assert.ok(!result.summary.includes('先在微信里发一条'));
  const rows = store.queryMessages({ limit: 5 });
  assert.equal(rows.at(-1).direction, 'out');
  assert.equal(rows.at(-1).text, '在的。');
});

test('chat_history filters by channel and keyword', async () => {
  const rows = await tools.chat_history.execute({ channel: 'weixin', keyword: '在' });
  assert.ok(rows.count >= 2);
  assert.match(rows.summary, /\[微信 ·/);
  assert.doesNotMatch(rows.summary, /\[QQ ·/);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(rows)));
  const emptyImage = await tools.chat_history.execute({ channel: 'weixin', keyword: '在', image: '' });
  assert.equal(emptyImage.summary, rows.summary);
  assert.equal(tools.chat_history.parameters.properties.image.type, 'string');
});

test('chat_history image ID takes priority over incidental filters and keeps forwarded images working', async () => {
  const { registerFile } = await import('../src/files.mjs');
  const ref = registerFile('qq', { filename: 'image.gif', type: '图片', url: 'https://multimedia.nt.qq.com.cn/download?test=1' });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(Buffer.from('GIF89a000000000000')); };
  try {
    const history = createChatTools({ getConfig: loadConfig, channels, store: { readMessages() { return []; } },
      getAttachments: () => ({ saveImage: async () => ({ attachmentId: 'viewed' }) }) }).find(tool => tool.name === 'chat_history');
    const result = await history.execute({ channel: 'qq', cursor: '', image: ` ${ref.id} `, keyword: '', limit: 1, messageId: '' });
    assert.equal(result.attachment.attachmentId, 'viewed');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('chat_send on QQ uses the explicitly selected private target', async () => {
  const result = await tools.chat_send.execute({ channel: 'qq', targetId: 'owner-qq', text: '收到' });
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

test('chat_send says so when WeChat has no live conversation token', async () => {
  const quietChannel = {
    status: { connected: true },
    async sendText(text, options) {
      calls.push({ channel: 'weixin', text, options });
      return { messageIds: ['wx-2'], toUserId: OWNER, contextToken: false };
    },
  };
  const bare = Object.fromEntries(
    createChatTools({
      getConfig: loadConfig,
      update: (fn) => fn(loadConfig()),
      channels: { ...channels, weixin: quietChannel },
      store,
    }).map((tool) => [tool.name, tool]),
  );
  const result = await bare.chat_send.execute({ channel: 'weixin', targetId: OWNER, text: '在的。' });
  assert.match(result.summary, /先在微信里发一条/);
});
