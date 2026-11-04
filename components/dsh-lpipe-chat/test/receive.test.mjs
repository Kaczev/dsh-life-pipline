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
      windowSeconds: 3,
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
    assert.equal(prompts[0].message.content[0].text, '[微信 · Kaczev] 在吗');
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
    saveConfig({ mainSessionId: 'session-main', windowSeconds: 3, ownerOnly: true,
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
