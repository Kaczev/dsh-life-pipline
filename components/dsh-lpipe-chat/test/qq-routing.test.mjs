import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@tencent-connect/qqbot-nodejs';
import { QqChannel } from '../src/qq/channel.mjs';

function fixture() {
  let now = Date.now();
  const config = { ownerOnly: true, qq: { appId: 'app', appSecret: 'secret', ownerOpenId: 'owner' } };
  const handlers = new Map();
  const calls = [];
  const bot = {
    on(event, fn) { handlers.set(event, fn); },
    async start() { handlers.get('ready')(); },
    async sendText(target, text) { calls.push({ target, text }); return { id: 'sent' }; },
  };
  const channel = new QqChannel({ config: () => config, now: () => now,
    createBot: () => bot, log: { warn() {} }, onInbound() {} });
  return { channel, bot, calls, config,
    advance(ms) { now += ms; },
    async receive({ kind = 'c2c', senderId = 'owner', groupOpenid = 'group', messageId = 'in', timestamp = now, ...rest } = {}) {
      handlers.get('message')({}, { kind, senderId, groupOpenid, messageId, timestamp, content: 'hello', ...rest });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('QQ automatically uses the newest authorized message for exactly this target', async () => {
  const f = fixture(); await f.channel.connect();
  await f.receive({ messageId: 'first' }); f.advance(1);
  await f.receive({ messageId: 'latest' });
  await f.receive({ kind: 'group', messageId: 'group-in' });
  await f.receive({ senderId: 'stranger', messageId: 'foreign' });
  await f.receive({ senderIsBot: true, messageId: 'bot' });
  await f.channel.sendText('hi');
  assert.deepEqual(f.calls.at(-1).target, { scope: 'c2c', targetId: 'owner', msgId: 'latest' });
  await f.channel.sendText('hi', { scope: 'group', targetId: 'group' });
  assert.equal(f.calls.at(-1).target.msgId, 'group-in');
  await f.channel.sendText('hi', { targetId: 'other' });
  assert.deepEqual(f.calls.at(-1).target, { scope: 'c2c', targetId: 'other' });
  await f.channel.sendText('hi', { msgId: 'first' });
  assert.equal(f.calls.at(-1).target.msgId, 'first');
  await f.channel.sendText('hi', { msgId: 'unknown' });
  assert.equal(f.calls.at(-1).target.msgId, undefined);
  await assert.rejects(f.channel.sendText('hi', { scope: 'group' }), /specify the group/);
  await f.channel.stop();
});

for (const [scope, window, limit] of [['c2c', 60 * 60_000, 4], ['group', 5 * 60_000, 5]]) {
  test(`QQ ${scope} expires at the safety margin and counts concurrent replies`, async () => {
    const f = fixture(); await f.channel.connect();
    await f.receive({ kind: scope });
    const target = scope === 'group' ? { scope, targetId: 'group' } : {};
    await Promise.all(Array.from({ length: limit + 1 }, () => f.channel.sendText('hi', target)));
    assert.equal(f.calls.filter(c => c.target.msgId).length, limit);
    await f.receive(); // duplicate does not reset the c2c budget
    if (scope === 'c2c') {
      await f.channel.sendText('hi'); assert.equal(f.calls.at(-1).target.msgId, undefined);
    }
    await f.receive({ kind: scope, messageId: 'fresh' });
    f.advance(window - 30_001);
    await f.channel.sendText('hi', target); assert.equal(f.calls.at(-1).target.msgId, 'fresh');
    f.advance(1);
    await f.channel.sendText('hi', target); assert.equal(f.calls.at(-1).target.msgId, undefined);
    await f.channel.stop();
  });
}

test('QQ route cache does not cross credentials or trust a future timestamp', async () => {
  const f = fixture(); await f.channel.connect();
  await f.receive({ timestamp: Date.now() + 86400_000 });
  f.advance(60 * 60_000);
  await f.channel.sendText('hi'); assert.equal(f.calls.at(-1).target.msgId, undefined);
  await f.receive({ messageId: 'new' });
  f.config.qq.appSecret = 'changed';
  await f.channel.sendText('hi'); assert.equal(f.calls.at(-1).target.msgId, undefined);
  await f.channel.stop();
});

for (const [name, error, count] of [
  ['definite rejection', new ApiError('refused', 400, '/messages'), 2],
  ['timeout', new Error('timeout'), 1],
  ['server failure', new ApiError('server failure', 503, '/messages'), 1],
  ['dead bot', new ApiError('机器人状态异常', 400, '/messages'), 1],
]) {
  test(`QQ ${name} has no duplicate-prone retry`, async () => {
    const f = fixture(); await f.channel.connect(); await f.receive();
    f.bot.sendText = async (target) => {
      f.calls.push({ target });
      if (f.calls.length === 1) throw error;
      return { id: 'fallback' };
    };
    if (count === 2) await f.channel.sendText('hi');
    else await assert.rejects(f.channel.sendText('hi'));
    assert.equal(f.calls.length, count);
    if (count === 2) assert.equal(f.calls[1].target.msgId, undefined);
    await f.channel.stop();
  });
}
