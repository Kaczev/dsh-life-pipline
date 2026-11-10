import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { WeixinChannel } from '../src/weixin/channel.mjs';

test('rescanning switches a healthy poller and stops only its original credentials', async () => {
  let weixin = { botToken: 'old', accountId: 'bot-old', ownerUserId: 'owner', baseUrl: 'https://ilinkai.weixin.qq.com/' };
  const calls = [];
  const events = [];
  const api = {
    async notifyStart({ token }) { calls.push(['start', token]); },
    async notifyStop({ token }) { calls.push(['stop', token]); },
    async getUpdates({ token, signal }) {
      calls.push(['poll', token]);
      if (token === 'new' && !events.length) {
        return { msgs: [{ message_type: 1, from_user_id: 'owner', context_token: 'new-context', item_list: [{ type: 1, text_item: { text: 'hello' } }] }] };
      }
      await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }));
      return { msgs: [] };
    },
    async sendText(args) { calls.push(['send', args.contextToken]); return { providerMessageIds: [] }; },
  };
  const channel = new WeixinChannel({ config: () => ({ weixin }), api, log: {}, onInbound: event => events.push(event) });
  try {
    await channel.connect(); await tick();
    assert.equal(channel.status.connected, true);
    await channel.connect();
    assert.equal(calls.filter(([kind]) => kind === 'start').length, 1);
    weixin = { ...weixin, botToken: 'new', accountId: 'bot-new' };
    await channel.connect(); await tick();
    assert.deepEqual(calls.filter(([kind]) => kind === 'stop'), [['stop', 'old']]);
    assert.ok(calls.some(([kind, token]) => kind === 'poll' && token === 'new'));
    assert.equal(events.length, 1);
    await channel.sendText('reply', { toUserId: 'owner' });
    assert.deepEqual(calls.at(-1), ['send', 'new-context']);
    assert.equal(channel.status.connected, true);
  } finally { await channel.stop(); }
  assert.deepEqual(calls.at(-1), ['stop', 'new']);
  assert.equal(channel.status.connected, false);
});
