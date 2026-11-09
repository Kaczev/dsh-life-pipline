import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'life-chat-completed-'));

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

const channels = {
  weixin: {
    status: { connected: true },
    async sendText() {
      return { messageIds: ['wx-1'], toUserId: OWNER, contextToken: true };
    },
  },
  qq: {
    status: { connected: true },
    async sendText(text, options) {
      return { messageId: 'qq-1', scope: options.scope, targetId: options.targetId ?? 'owner-qq' };
    },
  },
};

const tools = Object.fromEntries(
  createChatTools({ getConfig: loadConfig, update: (fn) => fn(loadConfig()), channels, store })
    .map((tool) => [tool.name, tool]),
);

const counter = () => {
  const state = { turns: 0 };
  state.concludeTurn = () => {
    state.turns += 1;
  };
  return state;
};

test('chat_send offers completed as an optional switch', () => {
  const schema = tools.chat_send.parameters;
  assert.deepEqual(schema.required, ['channel', 'targetId']);
  assert.equal(schema.properties.completed.type, 'boolean');
});

test('chat_send ends the turn only when completed is true', async () => {
  const first = counter();
  await tools.chat_send.execute({ channel: 'qq', targetId: 'owner-qq', text: '第一句' }, first);
  assert.equal(first.turns, 0, 'a message on its own keeps the turn open');

  const second = counter();
  await tools.chat_send.execute({ channel: 'qq', targetId: 'owner-qq', text: '第二句', completed: true }, second);
  assert.equal(second.turns, 1);
});

test('chat_send does not end the turn when the message never left', async () => {
  const broken = Object.fromEntries(
    createChatTools({
      getConfig: loadConfig,
      update: (fn) => fn(loadConfig()),
      channels: {
        ...channels,
        weixin: {
          status: { connected: false },
          async sendText() {
            throw new Error('微信服务拒绝了回复消息。');
          },
        },
      },
      store,
    }).map((tool) => [tool.name, tool]),
  );
  const state = counter();
  await assert.rejects(
    broken.chat_send.execute({ channel: 'weixin', targetId: OWNER, text: '在吗', completed: true }, state),
    /拒绝了回复消息/,
  );
  assert.equal(state.turns, 0, 'a failed send must not close the turn');
});
