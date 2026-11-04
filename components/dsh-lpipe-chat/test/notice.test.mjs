import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoticeDelivery } from '../src/notice.mjs';

const request = { sessionId: 'session-main', message: { id: 'notice-1' } };
for (const status of ['idle', 'running']) {
  test(`${status} owner uses background delivery, never prompt or steer`, async () => {
    const calls = [];
    const agent = { status, followup: (m) => calls.push(['followup', m]), inject: (m) => calls.push(['inject', m]) };
    const delivery = createNoticeDelivery({
      async resolveAgent(id) { assert.equal(id, request.sessionId); return { agent }; },
      prompt() { assert.fail('human prompt must not be used'); },
    });
    await delivery.deliver(request);
    assert.deepEqual(calls, [[status === 'idle' ? 'followup' : 'inject', request.message]]);
  });
}

test('unavailable or unresolvable sessions reject for gateway retry', async () => {
  await assert.rejects(createNoticeDelivery({}).deliver(request), /resolveAgent is unavailable/);
  await assert.rejects(createNoticeDelivery({ resolveAgent: async () => ({ error: { code: 'not_found' } }) }).deliver(request), /not_found/);
});

test('disposal fences a pending cold-session resolve and subsequent calls', async () => {
  let resolve;
  const calls = [];
  const delivery = createNoticeDelivery({ resolveAgent: () => new Promise((done) => { resolve = done; }) });
  const pending = delivery.deliver(request);
  delivery.dispose();
  resolve({ agent: { status: 'idle', followup: () => calls.push('woke') } });
  await assert.rejects(pending, /disposed/);
  await assert.rejects(delivery.deliver(request), /disposed/);
  assert.deepEqual(calls, []);
});
