import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewRunner } from '../src/review.mjs';

const day = 86_400_000;
function fixture() {
  const due = 10 * day, clock = { value: due };
  const state = { storeId: 'test', allSessions: true, sharedLists: { settings: true }, review: { enabled: true, nextReviewAt: due } };
  const messages = [], advances = [], warnings = [], resolutions = [];
  const agent = { status: 'idle', async followup(message) { messages.push(message); return true; } };
  const hooks = {
    async resolveAgent(id) { resolutions.push(id); return { agent }; },
    async advance(deadline, now) { advances.push([deadline, now]); state.review.nextReviewAt = now + day; },
  };
  const runner = createReviewRunner({ current: async () => structuredClone(state), mainId: () => 'main', now: () => clock.value,
    controller: hooks, advance: (...args) => hooks.advance(...args), warn: error => warnings.push(error) });
  return { runner, hooks, state, agent, messages, advances, warnings, resolutions, clock, due };
}

function gate() {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  return { entered: entered.promise, release: release.resolve, async wait() { entered.resolve(); await release.promise; } };
}

test('before the deadline no agent is resolved; equality is due', async () => {
  const f = fixture(); f.clock.value--;
  await f.runner.tick(); assert.deepEqual(f.resolutions, []);
  f.clock.value++; await f.runner.tick();
  assert.deepEqual(f.resolutions, ['main']); assert.deepEqual(f.advances, [[f.due, f.due]]);
  assert.equal(f.messages[0].source.due, f.due);
  assert.match(f.messages[0].content[0].text, /Shared lists: settings\./);
});

test('busy main leaves the deadline pending until idle', async () => {
  const f = fixture(); f.agent.status = 'running'; await f.runner.tick();
  assert.equal(f.messages.length, 0); assert.equal(f.advances.length, 0);
  f.agent.status = 'idle'; await f.runner.tick(); assert.equal(f.messages.length, 1);
});

test('rejected and failed delivery retry the same deadline and message ID', async () => {
  const f = fixture(), ids = [];
  f.agent.followup = async m => { ids.push(m.id); if (ids.length === 1) return false; if (ids.length === 2) throw Error('offline'); return true; };
  await f.runner.tick(); await f.runner.tick(); assert.equal(f.advances.length, 0);
  await f.runner.tick(); assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 1);
  assert.equal(f.warnings.length, 1); assert.equal(f.advances.length, 1);
});

test('advance failure retries persistence without sending the accepted notice twice', async () => {
  const f = fixture(), advance = f.hooks.advance;
  f.hooks.advance = async () => { throw Error('disk unavailable'); }; await f.runner.tick();
  f.hooks.advance = advance; await f.runner.tick(); assert.equal(f.warnings.length, 1);
  assert.equal(f.messages.length, 1); assert.equal(f.advances.length, 1);
});

test('multiple missed days produce one notice and advance from detection time', async () => {
  const f = fixture(); f.clock.value += 6 * day;
  await f.runner.tick(); await f.runner.tick(); assert.equal(f.messages.length, 1);
  assert.deepEqual(f.advances, [[f.due, f.clock.value]]);
});

test('overlapping ticks cannot submit the same due notice twice', async () => {
  const f = fixture(), g = gate(), followup = f.agent.followup;
  f.agent.followup = async m => { await g.wait(); return followup(m); };
  const first = f.runner.tick(); await g.entered; await f.runner.tick();
  g.release(); await first; assert.equal(f.messages.length, 1); assert.equal(f.advances.length, 1);
});

test('disabling review during agent resolution cancels the pending delivery', async () => {
  const f = fixture(), g = gate(); f.hooks.resolveAgent = async () => { await g.wait(); return { agent: f.agent }; };
  const first = f.runner.tick(); await g.entered; f.state.review.enabled = false; g.release(); await first;
  assert.equal(f.messages.length, 0); assert.equal(f.advances.length, 0);
});
