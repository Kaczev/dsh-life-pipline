import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { WeixinChannel } from '../src/weixin/channel.mjs';
import { InboundGateway } from '../src/gateway.mjs';
import { saveConfig, loadConfig } from '../src/config.mjs';

const OWNER = 'owner@im.wechat';
const quiet = { info() {}, warn() {} };

/**
 * The receive path end to end: iLink poll → owner filter → event shape →
 * debounce window → notice delivery. Only the HTTPS layer is stubbed.
 */
function fakeApi(messages) {
  let round = 0;
  return {
    notified: [],
    async notifyStart() { this.notified.push('start'); },
    async notifyStop() { this.notified.push('stop'); },
    async getUpdates({ signal }) {
      round += 1;
      if (round === 1) return { get_updates_buf: 'cursor-1', msgs: messages };
      // Park the poller until the test aborts it.
      await new Promise((resolve) => {
        signal?.addEventListener('abort', resolve, { once: true });
        setTimeout(resolve, 200);
      });
      return { get_updates_buf: 'cursor-1', msgs: [] };
    },
    async sendText(request) {
      this.sent = request;
      return { providerMessageIds: ['wx-out-1'] };
    },
  };
}

test('a WeChat message reaches the main session as a labelled prompt', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-life-rx-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    saveConfig({
      mainSessionId: 'session-main',
      quietSeconds: 0.2,
      ownerName: 'Kaczev',
      weixin: { botToken: 'tok', ownerUserId: OWNER, accountId: 'acc' },
    });

    const api = fakeApi([{
      message_type: 1,
      from_user_id: OWNER,
      create_time_ms: 1_793_728_666_199,
      context_token: 'ctx-1',
      item_list: [{ type: 1, text_item: { text: '在吗' } }],
    }]);

    const prompts = [];
    const gateway = new InboundGateway({
      getConfig: loadConfig,
      log: quiet,
      deliver: async ({ sessionId, message }) => prompts.push({ sessionId, message }),
    });
    const events = [];
    const channel = new WeixinChannel({
      config: loadConfig,
      log: quiet,
      api,
      onInbound: (event) => {
        events.push(event);
        gateway.accept(event);
      },
    });

    await channel.connect();
    await waitFor(() => prompts.length > 0);
    gateway.dispose();
    await channel.stop();

    assert.equal(events.length, 1);
    assert.deepEqual(
      { channel: events[0].channel, kind: events[0].conversationKind, token: events[0].contextToken },
      { channel: 'weixin', kind: 'dm', token: 'ctx-1' },
    );
    assert.equal(prompts[0].sessionId, 'session-main');
    assert.equal(prompts[0].message.source.form, 'notice');
    // The notice may open with a timestamp line; the message itself is last.
    assert.equal(prompts[0].message.content[0].text.split(String.fromCharCode(10)).pop(), '[微信 · Kaczev] 在吗');
    assert.equal(prompts[0].message.source.kind, 'dsh-lpipe-chat');

    // And the answer goes back out over the same stubbed transport.
    const sent = await channel.sendText('嗯，在', { contextToken: 'ctx-1' });
    assert.deepEqual(sent.messageIds, ['wx-out-1']);
    assert.equal(api.sent.toUserId, OWNER);
    assert.equal(api.sent.contextToken, 'ctx-1');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test('messages from anyone but the owner never leave the channel', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-life-rx2-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    saveConfig({ mainSessionId: 'session-main', quietSeconds: 0.2, ownerOnly: true,
      weixin: { botToken: 'tok', ownerUserId: OWNER } });
    const api = fakeApi([{
      message_type: 1,
      from_user_id: 'stranger@im.wechat',
      create_time_ms: 1_793_728_666_199,
      item_list: [{ type: 1, text_item: { text: '你好' } }],
    }]);
    const events = [];
    const channel = new WeixinChannel({ config: loadConfig, log: quiet, api, onInbound: (e) => events.push(e) });
    await channel.connect();
    await new Promise((resolve) => setTimeout(resolve, 120));
    await channel.stop();
    assert.deepEqual(events, []);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

async function waitFor(predicate, timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for the receive path');
}

test('a refused token never reads as connected', async () => {
  const channel = new WeixinChannel({
    config: () => ({ weixin: { botToken: 'dead', ownerUserId: OWNER, baseUrl: 'https://x/' } }),
    log: quiet,
    onInbound: () => {},
    api: {
      async notifyStart() { throw new Error('invalid token'); },
      async notifyStop() {},
      async getUpdates() { return { msgs: [] }; },
      async sendText() { return { providerMessageIds: [] }; },
    },
  });
  assert.equal(channel.configured, true, 'the credentials are still on disk');
  await channel.connect();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(channel.status.connected, false, 'a refused announce is not a connection');
  assert.match(channel.status.lastError, /invalid token/);
  await channel.stop();
});

test('a refused send drops the channel out of connected', async () => {
  const channel = new WeixinChannel({
    config: () => ({ weixin: { botToken: 'tok', ownerUserId: OWNER, baseUrl: 'https://x/' } }),
    log: quiet,
    onInbound: () => {},
    api: {
      async notifyStart() {},
      async notifyStop() {},
      async getUpdates({ signal }) {
        await new Promise((resolve) => {
          signal?.addEventListener('abort', resolve, { once: true });
          setTimeout(resolve, 200);
        });
        return { msgs: [] };
      },
      async sendText() { throw new Error('微信服务拒绝了回复消息。'); },
    },
  });
  await channel.connect();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(channel.status.connected, true);
  await assert.rejects(() => channel.sendText('hi'), /拒绝/);
  assert.equal(channel.status.connected, false, 'a rejected send proves the token is dead');
  assert.match(channel.status.lastError, /拒绝/);
  await channel.stop();
});

test('the newest inbound token wins over a caller-supplied one', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-life-ctx-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    saveConfig({
      mainSessionId: 'session-main',
      quietSeconds: 0.2,
      ownerName: 'Kaczev',
      weixin: { botToken: 'tok', ownerUserId: OWNER, accountId: 'acc' },
    });
    const api = fakeApi([{
      message_type: 1,
      from_user_id: OWNER,
      create_time_ms: 1_793_728_666_199,
      context_token: 'ctx-new',
      item_list: [{ type: 1, text_item: { text: '在吗' } }],
    }]);
    const events = [];
    const channel = new WeixinChannel({
      config: loadConfig,
      log: quiet,
      api,
      onInbound: (event) => events.push(event),
    });
    await channel.connect();
    await waitFor(() => events.length > 0);

    // A stored token from an older bot must not override the live one: the
    // provider accepts the stale token and then drops the message.
    const sent = await channel.sendText('嗯', { contextToken: 'ctx-stale' });
    assert.equal(api.sent.contextToken, 'ctx-new');
    assert.equal(sent.contextToken, true);
    await channel.stop();
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test('new credentials forget the conversation tokens of the old bot', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-life-ctx2-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const credentials = { botToken: 'tok-1', ownerUserId: OWNER, accountId: 'acc' };
    saveConfig({ mainSessionId: 'session-main', quietSeconds: 0.2, ownerName: 'Kaczev', weixin: credentials });
    const api = fakeApi([{
      message_type: 1,
      from_user_id: OWNER,
      create_time_ms: 1_793_728_666_199,
      context_token: 'ctx-old-bot',
      item_list: [{ type: 1, text_item: { text: '在吗' } }],
    }]);
    const events = [];
    const channel = new WeixinChannel({
      config: loadConfig,
      log: quiet,
      api,
      onInbound: (event) => events.push(event),
    });
    await channel.connect();
    await waitFor(() => events.length > 0);
    await channel.stop();

    saveConfig({
      mainSessionId: 'session-main',
      quietSeconds: 0.2,
      ownerName: 'Kaczev',
      weixin: { ...credentials, botToken: 'tok-2' },
    });
    await channel.connect();
    const sent = await channel.sendText('嗯');
    assert.ok(!api.sent.contextToken, 'a token from the previous bot is not reused');
    assert.equal(sent.contextToken, false, 'and the caller is told the send had no context');
    await channel.stop();
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});
