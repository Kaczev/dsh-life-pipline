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
      prompt: async (request) => prompts.push(request),
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
