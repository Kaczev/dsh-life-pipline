import test from 'node:test';
import assert from 'node:assert/strict';
import { InboundGateway } from '../src/gateway.mjs';

const quiet = { warn() {} };
const message = (text, at) => ({ channel: 'weixin', channelLabel: '微信', conversationKind: 'dm', senderName: 'Kaczev', text, ...(at ? { at } : {}) });
const tick = () => new Promise(setImmediate);
function setup(t, deliver, config = { mainSessionId: 'session-main', windowSeconds: 3 }) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gateway = new InboundGateway({ getConfig: () => config, log: quiet, deliver });
  t.after(() => gateway.dispose());
  return gateway;
}

test('immediate notice and coalesced burst have distinct provenance and real newlines', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  gateway.accept(message('在吗'));
  await tick();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].sessionId, 'session-main');
  assert.equal(notices[0].message.source.kind, 'dsh-lpipe-chat');
  assert.equal(notices[0].message.source.form, 'notice');
  assert.equal(notices[0].message.role, 'user');
  assert.ok(notices[0].message.id);
  assert.ok(Object.isFrozen(notices[0].message.content[0]));
  gateway.accept(message('我下班了'));
  gateway.accept(message('买了菜'));
  t.mock.timers.tick(3000);
  await tick();
  assert.equal(notices.length, 2);
  assert.equal(notices[1].message.content[0].text, ['[微信 · Kaczev] 我下班了', '[微信 · Kaczev] 买了菜'].join(String.fromCharCode(10)));
  assert.equal(gateway.pending, 0);
});

test('unset main session retains all messages and recovers after configuration', async (t) => {
  const config = { mainSessionId: '', windowSeconds: 3 };
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r), config);
  gateway.accept(message('one'));
  gateway.accept(message('two'));
  assert.equal(gateway.pending, 2);
  config.mainSessionId = 'session-main';
  t.mock.timers.tick(3000);
  await tick();
  assert.equal(notices.length, 1);
  assert.match(notices[0].message.content[0].text, /one\n.*two/);
});

test('a slow delivery across window expiry never discards buffered messages', async (t) => {
  const notices = [];
  let release;
  const gateway = setup(t, (r) => {
    notices.push(r);
    return notices.length === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve();
  });
  gateway.accept(message('one'));
  gateway.accept(message('two'));
  gateway.accept(message('three'));
  t.mock.timers.tick(3000);
  await tick();
  assert.equal(gateway.pending, 2);
  release();
  await tick();
  t.mock.timers.tick(3000);
  await tick();
  assert.equal(notices.length, 2);
  assert.match(notices[1].message.content[0].text, /two\n.*three/);
});

test('delivery failure retries the entire batch in order', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => {
    notices.push(r);
    if (notices.length === 1) throw new Error('session unavailable');
  });
  gateway.accept(message('one'));
  gateway.accept(message('two'));
  await tick();
  assert.equal(gateway.pending, 2);
  t.mock.timers.tick(3000);
  await tick();
  assert.match(notices[1].message.content[0].text, /one\n.*two/);
  assert.equal(gateway.pending, 0);
});

test('dispose during delivery prevents requeue, timers and late accepts', async (t) => {
  let reject;
  const gateway = setup(t, () => new Promise((_, fail) => { reject = fail; }));
  gateway.accept(message('one'));
  gateway.dispose();
  reject(new Error('late failure'));
  await tick();
  gateway.accept(message('late'));
  t.mock.timers.tick(9000);
  assert.equal(gateway.pending, 0);
});

test('a burst gets one timestamp at its head, not one per message', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  const base = new Date(2026, 10, 5, 9, 0).getTime();
  gateway.accept(message('早', new Date(base).toISOString()));
  gateway.accept(message('刚醒', new Date(base + 60_000).toISOString()));
  gateway.accept(message('错过了什么', new Date(base + 30 * 60_000).toISOString()));
  t.mock.timers.tick(3000);
  await tick();
  // The batch behind the immediate notice is scheduled only once that delivery
  // settles, so the fake clock has to move again.
  t.mock.timers.tick(3000);
  await tick();
  const lines = notices
    .map((notice) => notice.message.content[0].text)
    .join(String.fromCharCode(10))
    .split(String.fromCharCode(10));
  assert.deepEqual(lines, [
    '09:00',
    '[微信 · Kaczev] 早',
    '[微信 · Kaczev] 刚醒',
    '09:30',
    '[微信 · Kaczev] 错过了什么',
  ]);
});
