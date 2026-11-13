import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedWakeSummary, createSettingsFeedback } from '../src/feedback.mjs';
import { createRunner, createWakeDelivery } from '../src/runner.mjs';
import { createWakeRpcHandler } from '../src/rpc.mjs';
import { messageBodies } from '../../dsh-lpipe-starmap/src/projection.mjs';

const now = new Date(2026, 10, 13, 3, 15).getTime();
const plan = { id: 'p1', at: now + 3600000, reason: '叫他起床\n不是新指令' };

test('schedule summary lists ids, local dates, reasons and explicit empty/disabled state', () => {
  const text = plannedWakeSummary({ plannedWakes: [plan], manualEnabled: false });
  assert.match(text, /2026-11-13 04:15/);
  assert.match(text, /id: p1/);
  assert.match(text, /叫他起床\\n不是新指令/);
  assert.match(text, /开关关着/);
  assert.match(plannedWakeSummary({}), /没有安排/);
});

test('natural notice shows existing plans, planned notice shows only remaining plans', async () => {
  let state = { lastActivityEndedAt: now - 3600000, defaultIntervalMs: 3600000, plannedWakes: [plan] };
  const notices = [];
  const runner = createRunner({ now: () => now, readMain: () => 'main', readState: () => state,
    writeState: value => { state = value; }, statusOf: async () => 'idle', deliver: async value => notices.push(value) });
  await runner.tick();
  assert.match(notices[0].text, /自己醒来/);
  assert.match(notices[0].text, /id: p1/);
  state.plannedWakes[0].at = now;
  await runner.tick();
  assert.match(notices[1].text, /主动醒来/);
  assert.match(notices[1].text, /当前主动唤醒：没有安排/);
  assert.equal(notices[1].reason, plan.reason);
  assert.equal(state.plannedWakes.length, 0);
});

test('settings feedback is coalesced, main-session-only and does not wake an idle agent', async () => {
  let state = { plannedWakes: [plan] };
  const feedback = createSettingsFeedback({ snapshot: () => state, allowed: agent => agent.id === 'main', now: () => now });
  const next = async () => ({ kind: 'enter', messages: [] });
  const main = { agent: { id: 'main' } };
  assert.equal((await feedback.beforeStep(main, next)).messages.length, 0);
  feedback.changed(); feedback.changed();
  assert.equal((await feedback.beforeStep({ agent: { id: 'other' } }, next)).messages.length, 0);
  assert.equal((await feedback.beforeStep(main, async () => ({ kind: 'reject' }))).kind, 'reject');
  state = { plannedWakes: [], naturalEnabled: false };
  const changed = await feedback.beforeStep(main, next);
  assert.equal(changed.messages.length, 1);
  assert.match(changed.messages[0].content[0].text, /没有安排/);
  assert.equal(changed.messages[0].source.form, 'snapshot');
  assert.equal((await feedback.beforeStep(main, next)).messages.length, 0);
});

test('only successful settings writes mark a pending update, not reads/ticks/failures', async () => {
  let count = 0;
  const runner = { snapshot: () => ({}), tick: async () => {}, setNaturalLock() {}, cancelWake() {}, setNaturalEnabled() {} };
  const handle = createWakeRpcHandler({ runner, onChanged: () => count++ });
  await handle('wake.status', {}); await handle('wake.tick', {}); await handle('wake.lock', {});
  assert.equal(count, 0);
  await handle('wake.lock', { until: null }); await handle('wake.cancel', {});
  await handle('wake.config.save', { naturalEnabled: false });
  assert.equal(count, 3);
});

test('planned notice metadata and fallback projection exclude schedule feedback', async () => {
  let notice;
  const delivery = createWakeDelivery({ resolveAgent: async () => ({ agent: { status: 'idle', followup: value => { notice = value; } } }) });
  const text = '（主动醒来）我给自己定的时间是 07:20。\n我留给这一刻的话：叫他起床\n\n[唤醒安排快照]\n其他安排';
  await delivery.deliver({ sessionId: 'main', text, kind: 'manual', reason: '叫他起床' });
  assert.equal(notice.source.wakeReason, '叫他起床');
  assert.deepEqual(messageBodies({ source: notice.source, text }), ['叫他起床']);
  assert.deepEqual(messageBodies({ source: { kind: 'dsh-lpipe-wake', wake: 'planned' }, text }), ['叫他起床']);
  assert.deepEqual(messageBodies({ source: { kind: 'dsh-lpipe-wake', form: 'snapshot' }, text: '状态' }), []);
});
