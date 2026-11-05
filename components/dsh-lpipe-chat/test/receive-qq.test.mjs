import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { QqChannel } from '../src/qq/channel.mjs';
import { InboundGateway } from '../src/gateway.mjs';
import { saveConfig, loadConfig } from '../src/config.mjs';

const OWNER = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const GROUP = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const quiet = { info() {}, warn() {} };

function fakeBot() {
  const handlers = new Map();
  return {
    handlers,
    on(event, handler) { handlers.set(event, handler); return this; },
    async start() {
      await handlers.get('ready')?.();
    },
    async sendText(target, text) {
      this.lastSend = { target, text };
      return { id: 'qq-out-1' };
    },
    emit(event, ...args) { return handlers.get(event)?.(...args); },
  };
}

async function withHome(config, run) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-life-qq-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    saveConfig({ mainSessionId: 'session-main', windowSeconds: 3, ownerName: 'Kaczev', qq: config });
    await run();
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
}

test('a QQ private message reaches the main session with the sender label', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    const prompts = [];
    const gateway = new InboundGateway({
      getConfig: loadConfig,
      log: quiet,
      deliver: async ({ message }) => prompts.push(message),
    });
    const events = [];
    const channel = new QqChannel({
      config: loadConfig,
      log: quiet,
      createBot: () => bot,
      onInbound: (event) => { events.push(event); gateway.accept(event); },
    });
    await channel.connect();
    assert.equal(channel.status.connected, true);

    await bot.emit('message', {}, {
      kind: 'c2c',
      senderId: OWNER,
      senderName: '',
      content: '在机房',
      messageId: 'msg-1',
      timestamp: 1_793_728_666_199,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(events.length, 1);
    assert.equal(events[0].conversationKind, 'dm');
    assert.equal(events[0].messageId, 'msg-1');
    assert.equal(prompts[0].content[0].text, '[QQ · Kaczev] 在机房');

    const sent = await channel.sendText('收到', {});
    assert.deepEqual(sent, { messageId: 'qq-out-1', scope: 'c2c', targetId: OWNER });
    assert.deepEqual(bot.lastSend.target, { scope: 'c2c', targetId: OWNER });
    gateway.dispose();
    await channel.stop();
  });
});

test('a QQ group message keeps the group identity and replies into the group', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    const events = [];
    const channel = new QqChannel({ config: loadConfig, log: quiet, createBot: () => bot,
      onInbound: (event) => events.push(event) });
    await channel.connect();
    await bot.emit('message', {}, {
      kind: 'group', groupOpenid: GROUP, senderId: OWNER, senderName: 'Kaczev',
      content: '群里说一句', messageId: 'msg-2', timestamp: 1_793_728_666_199,
    });
    assert.equal(events[0].conversationKind, 'group');
    assert.equal(events[0].conversationId, GROUP);
    assert.deepEqual(events[0].replyTarget, { scope: 'group', targetId: GROUP, msgId: 'msg-2' });
    await channel.sendText('回群', { scope: 'group', targetId: GROUP, msgId: 'msg-2' });
    assert.deepEqual(bot.lastSend.target, { scope: 'group', targetId: GROUP, msgId: 'msg-2' });
    await channel.stop();
  });
});

test('QQ drops bots, empty text and strangers', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    const events = [];
    const channel = new QqChannel({ config: loadConfig, log: quiet, createBot: () => bot,
      onInbound: (event) => events.push(event) });
    await channel.connect();
    await bot.emit('message', {}, { kind: 'c2c', senderId: OWNER, content: '   ', messageId: 'm' });
    await bot.emit('message', {}, { kind: 'c2c', senderId: OWNER, content: 'bot', messageId: 'm', senderIsBot: true });
    await bot.emit('message', {}, { kind: 'c2c', senderId: 'STRANGER', content: 'hi', messageId: 'm' });
    assert.deepEqual(events, []);
    await channel.stop();
  });
});

test('QQ without a known owner drops everything instead of guessing', async () => {
  await withHome({ appId: '123', appSecret: 'sec' }, async () => {
    const bot = fakeBot();
    const events = [];
    const channel = new QqChannel({ config: loadConfig, log: quiet, createBot: () => bot,
      onInbound: (event) => events.push(event) });
    await channel.connect();
    await bot.emit('message', {}, {
      kind: 'c2c', senderId: OWNER, senderName: 'Kaczev',
      content: '我是主人', messageId: 'm-1', timestamp: 1_793_728_666_199,
    });
    assert.deepEqual(events, []);
    await channel.stop();
  });
});

test('an SDK that rejects unknown events does not break connect', async () => {
  const bot = {
    on(event) {
      // The real SDK throws for any event it does not declare.
      if (!['ready', 'resumed', 'error', 'message', 'interaction', 'rawEvent'].includes(event)) {
        throw new TypeError("Cannot read properties of undefined (reading 'add')");
      }
      return this;
    },
    async start() {},
  };
  const channel = new QqChannel({
    config: () => ({ qq: { appId: 'app', appSecret: 'secret', ownerOpenId: OWNER } }),
    log: quiet,
    onInbound: () => {},
    createBot: () => bot,
    readyTimeoutMs: 30,
  });
  await assert.rejects(() => channel.connect(), /连接超时/);
  assert.equal(channel.status.connected, false, 'no ready event, so never connected');
  await channel.stop();
});

test('a deleted QQ app says so instead of leaking an SDK code', async () => {
  const bot = {
    on() { return this; },
    async start() {
      throw new Error('Failed to get access_token: {"code":100007,"message":"appid invalid"}');
    },
  };
  const channel = new QqChannel({
    config: () => ({ qq: { appId: 'gone', appSecret: 'secret', ownerOpenId: OWNER } }),
    log: quiet,
    onInbound: () => {},
    createBot: () => bot,
  });
  await assert.rejects(() => channel.connect(), /重新扫码接入/);
  assert.equal(channel.status.connected, false);
  assert.match(channel.status.lastError, /重新扫码接入/);
});

test('a bot removed from the friends list says so without losing the connection', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    bot.sendText = async () => {
      throw new Error('API Error [/v2/users/AAAA/messages]: 消息发送失败, 无好友关系');
    };
    const channel = new QqChannel({
      config: loadConfig,
      log: quiet,
      createBot: () => bot,
      onInbound: () => {},
    });
    await channel.connect();
    await assert.rejects(() => channel.sendText('你好'), /好友/);
    // The socket is fine; only the relationship is missing. Keeping the light
    // green means "reconnect" would be the wrong advice.
    assert.equal(channel.status.connected, true);
    await channel.stop();
  });
});

test('a deregistered bot stops reading as connected the moment it refuses a send', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    bot.sendText = async () => {
      throw new Error('API Error [/v2/users/AAAA/messages]: 机器人状态异常');
    };
    const channel = new QqChannel({
      config: loadConfig,
      log: quiet,
      createBot: () => bot,
      onInbound: () => {},
    });
    await channel.connect();
    assert.equal(channel.status.connected, true);

    await assert.rejects(() => channel.sendText('你好'), /重新扫码/);
    assert.equal(channel.status.connected, false);
    assert.match(channel.status.lastError, /已失效/);
    await channel.stop();
  });
});

test('a deregistered app is caught by the credential probe, not by a send', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    const channel = new QqChannel({
      config: loadConfig,
      log: quiet,
      createBot: () => bot,
      onInbound: () => {},
      fetchToken: async () => ({ code: 100007, message: 'appid invalid' }),
    });
    await channel.connect();
    assert.equal(channel.status.connected, true);

    const status = await channel.verify();
    assert.equal(status.connected, false);
    assert.match(status.lastError, /已失效/);
  });
});

test('a flaky probe never claims the bot died', async () => {
  await withHome({ appId: '123', appSecret: 'sec', ownerOpenId: OWNER }, async () => {
    const bot = fakeBot();
    const channel = new QqChannel({
      config: loadConfig,
      log: quiet,
      createBot: () => bot,
      onInbound: () => {},
      fetchToken: async () => {
        throw new Error('getaddrinfo ENOTFOUND bots.qq.com');
      },
    });
    await channel.connect();
    const status = await channel.verify();
    assert.equal(status.connected, true);
    await channel.stop();
  });
});
