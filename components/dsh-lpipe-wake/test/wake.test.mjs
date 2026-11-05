import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { DEFAULT_INTERVAL_MS, clockOf, normalizeState, step, wakeText } from '../src/engine.mjs';
import { createWakeRpcHandler } from '../src/rpc.mjs';
import { createRunner } from '../src/runner.mjs';
import { createWakeTools, parseDuration } from '../src/tools.mjs';
import { buildClient } from '../scripts/build-client.mjs';

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 4, 12, 0, 0);

test('waking after an overnight gap says which day it was, not just a time', () => {
  const now = new Date(2026, 10, 5, 9, 12).getTime();
  const yesterday = new Date(2026, 10, 4, 19, 12).getTime();
  assert.match(wakeText({ now, since: yesterday }), /昨天 19:12 之后你就停下来了，现在是 09:12/);
  const older = new Date(2026, 9, 26, 21, 0).getTime();
  assert.match(wakeText({ now, since: older }), /10月26日 21:00 之后你就停下来了/);
  const sameDay = new Date(2026, 10, 5, 6, 30).getTime();
  assert.match(wakeText({ now, since: sameDay }), /已经过了 2 小时 42 分，现在是 09:12/);
});

test('the first idle tick starts the clock from now', () => {
  const { state, action } = step({}, { now: T0, status: 'idle' });
  assert.equal(action, null);
  assert.equal(state.lastActivityEndedAt, T0);
  assert.equal(state.nextWakeAt, T0 + DEFAULT_INTERVAL_MS);
});

test('a custom interval sets the deadline instead of the default one', () => {
  const fortyFive = 45 * 60 * 1000;
  const { state } = step({ defaultIntervalMs: fortyFive }, { now: T0, status: 'idle' });
  assert.equal(state.nextWakeAt, T0 + fortyFive);
  assert.notEqual(state.nextWakeAt, T0 + DEFAULT_INTERVAL_MS);
});

test('a new event in the session moves the deadline forward', () => {
  const before = { defaultIntervalMs: HOUR, lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR, lastWokeAt: null };
  const spoke = T0 + 50 * 60_000;
  const { state, action } = step(before, { now: spoke, activityAt: spoke, status: 'running' });
  assert.equal(action, null);
  assert.equal(state.lastActivityEndedAt, spoke, 'the log says when the conversation last moved');
  assert.equal(state.nextWakeAt, spoke + HOUR, 'and the deadline follows it');
});

test('a planned wake survives my own activity, unlike the natural deadline', () => {
  const armed = {
    defaultIntervalMs: HOUR,
    lastActivityEndedAt: T0,
    nextWakeAt: T0 + HOUR,
    plannedWakes: [{ id: 'p1', at: T0 + 30 * 60_000, reason: 'surprise' }],
  };
  const spoke = T0 + 10 * 60_000;
  const { state } = step(armed, { now: spoke, activityAt: spoke, status: 'idle' });
  assert.equal(state.nextWakeAt, spoke + HOUR, 'the natural deadline follows the conversation');
  assert.equal(state.plannedWakes.length, 1, 'the moment I picked is untouched by talking');
  assert.equal(state.plannedWakes[0].reason, 'surprise');
});

test('a planned wake fires with its reason and leaves the natural deadline alone', () => {
  const armed = {
    defaultIntervalMs: HOUR,
    lastActivityEndedAt: T0,
    nextWakeAt: T0 + 4 * HOUR,
    plannedWakes: [{ id: 'p1', at: T0 + 5 * 60_000, reason: '提醒他吃药' }],
  };
  const at = T0 + 6 * 60_000;
  const { state, action } = step(armed, { now: at, activityAt: at, status: 'idle' });
  assert.equal(action?.kind, 'manual');
  assert.match(action.text, /（主动醒来）/);
  assert.match(action.text, /提醒他吃药/);
  assert.equal(state.plannedWakes.length, 0, 'a fired plan is consumed');
  assert.equal(state.lastWokeKind, 'manual');
  assert.equal(state.lastWokeReason, '提醒他吃药');
});

test('neither kind fires while I am mid-turn', () => {
  const armed = {
    naturalEnabled: true,
    defaultIntervalMs: HOUR,
    lastActivityEndedAt: T0,
    nextWakeAt: T0,
    plannedWakes: [{ id: 'p1', at: T0, reason: 'now' }],
  };
  const { action } = step(armed, { now: T0 + 60_000, status: 'running' });
  assert.equal(action, null, 'a busy agent is never cut in half');
});

test('stopping re-arms from the moment it stopped', () => {
  const busy = { defaultIntervalMs: HOUR, lastActivityEndedAt: null, nextWakeAt: null, lastWokeAt: null };
  const stoppedAt = T0 + 30_000;
  const { state } = step(busy, { now: stoppedAt, status: 'idle' });
  assert.equal(state.lastActivityEndedAt, stoppedAt);
  assert.equal(state.nextWakeAt, stoppedAt + HOUR);
});

test('a deadline that passed while the host was down fires on the next tick', () => {
  const stale = { defaultIntervalMs: HOUR, lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR, lastWokeAt: null };
  const late = T0 + 5 * HOUR;
  const { state, action } = step(stale, { now: late, status: 'idle' });
  assert.equal(action?.kind, 'natural');
  assert.equal(state.lastWokeAt, late);
  assert.equal(state.nextWakeAt, late + HOUR, 'the wake re-arms one interval after itself');
});

test('a restarted host trusts the session log over its own stale state', () => {
  // The reported bug: the state file still said 08:42 while the owner had been
  // talking until 12:31, so a fresh Host woke at 12:39 claiming 3 小时 57 分.
  const stale = { defaultIntervalMs: HOUR, lastActivityEndedAt: T0 - 4 * HOUR, nextWakeAt: T0 - 2 * HOUR };
  const justSpoke = T0 - 8 * 60_000;
  const { state, action } = step(stale, { now: T0, activityAt: justSpoke, status: 'idle' });
  assert.equal(action, null, 'eight minutes of silence is not a wake');
  assert.equal(state.lastActivityEndedAt, justSpoke);
  assert.equal(state.nextWakeAt, justSpoke + HOUR);
});

test('a wake re-arms itself instead of firing on every tick', () => {
  const stale = { defaultIntervalMs: HOUR, lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR, lastWokeAt: null };
  const late = T0 + 5 * HOUR;
  const first = step(stale, { now: late, status: 'idle' });
  assert.equal(first.action?.kind, 'natural');
  assert.equal(first.state.nextWakeAt, late + HOUR);

  const second = step(first.state, { now: late + 30_000, status: 'idle' });
  assert.equal(second.action, null, 'the next tick must not wake again');
});

test('an armed deadline that has not arrived stays quiet', () => {
  const armed = { defaultIntervalMs: HOUR, lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR, lastWokeAt: null };
  const { action } = step(armed, { now: T0 + HOUR - 1, status: 'idle' });
  assert.equal(action, null);
});

test('the wake sentence states elapsed time and the clock, never a command', () => {
  const text = wakeText({ now: T0 + 2 * HOUR + 6 * 60_000, since: T0 });
  assert.equal(text, `（自己醒来）已经过了 2 小时 06 分，现在是 ${clockOf(T0 + 2 * HOUR + 6 * 60_000)}。想做什么就做什么，没事也可以什么都不做。`);
  assert.doesNotMatch(text, /请|做点|应该/);
});

test('each kind has its own switch, and a switched off one only stops firing', () => {
  const naturalOff = {
    naturalEnabled: false,
    defaultIntervalMs: HOUR,
    lastActivityEndedAt: T0,
    nextWakeAt: T0 + HOUR,
    plannedWakes: [{ id: 'p1', at: T0 + 2 * HOUR, reason: 'later' }],
  };
  const quiet = step(naturalOff, { now: T0 + 9 * HOUR, status: 'idle' });
  assert.equal(quiet.action?.kind, 'manual', 'the other kind still works');
  assert.equal(quiet.state.nextWakeAt, T0 + HOUR, 'the natural deadline stays derived even while off');
  assert.equal(quiet.state.naturalEnabled, false);

  const bothOff = step(
    { naturalEnabled: false, manualEnabled: false, defaultIntervalMs: HOUR, lastActivityEndedAt: T0 },
    { now: T0 + 9 * HOUR, status: 'idle' },
  );
  assert.equal(bothOff.action, null, 'nothing fires when both are off');
  assert.equal(bothOff.state.nextWakeAt, T0 + HOUR, 'a missing deadline is still derived, never left blank');

  const manualOff = {
    manualEnabled: false,
    defaultIntervalMs: HOUR,
    lastActivityEndedAt: T0,
    nextWakeAt: T0 + HOUR,
    plannedWakes: [{ id: 'p1', at: T0 + 60_000, reason: 'muted' }],
  };
  const held = step(manualOff, { now: T0 + 9 * HOUR, activityAt: null, status: 'idle' });
  assert.equal(held.action?.kind, 'natural', 'a muted plan does not block the natural one');
  assert.equal(held.state.plannedWakes.length, 1, 'the plan is kept, not thrown away');
});

test('a lock silences the natural kind without touching its switch', () => {
  const armed = {
    lastActivityEndedAt: T0,
    nextWakeAt: T0 + HOUR,
    naturalEnabled: true,
    defaultIntervalMs: HOUR,
  };

  // The deadline has passed, but the lock has not: nothing happens.
  const locked = step({ ...armed, naturalLockUntil: T0 + 2 * HOUR }, { now: T0 + HOUR + 1000, status: 'idle' });
  assert.equal(locked.action, null);
  assert.equal(locked.state.naturalLockUntil, T0 + 2 * HOUR);
  assert.equal(locked.state.nextWakeAt, T0 + HOUR, 'the deadline stays readable while locked');
  assert.equal(locked.state.naturalEnabled, true, 'the switch belongs to the owner');

  // The lock is a moment, not a countdown: once it is behind us it lifts by
  // itself and the natural wake fires on the very same tick.
  const after = step(locked.state, { now: T0 + 2 * HOUR + 1000, status: 'idle' });
  assert.equal(after.state.naturalLockUntil, null);
  assert.equal(after.action?.kind, 'natural');
});

test('a lock that already passed never delays a wake', () => {
  const result = step(
    { lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR, defaultIntervalMs: HOUR, naturalLockUntil: T0 + 60_000 },
    { now: T0 + 2 * HOUR, status: 'idle' },
  );
  assert.equal(result.state.naturalLockUntil, null);
  assert.equal(result.action?.kind, 'natural', 'a lock from the past is simply over');
});

test('a corrupt state file degrades to the default interval', () => {
  const state = normalizeState({ defaultIntervalMs: 'soon', nextWakeAt: 'later' }, T0);
  assert.equal(state.defaultIntervalMs, DEFAULT_INTERVAL_MS);
  assert.equal(state.nextWakeAt, null);
});

function fakeRunner(initial = {}) {
  let state = { defaultIntervalMs: HOUR, ...initial };
  let seq = 0;
  return {
    snapshot: () => state,
    planWake: ({ at, reason = '' }) => {
      seq += 1;
      state = {
        ...state,
        plannedWakes: [...(state.plannedWakes ?? []), { id: `p${seq}`, at, reason, createdAt: T0 }]
          .sort((a, b) => a.at - b.at),
      };
    },
    cancelWake: (id, source = 'page') => {
      const planned = state.plannedWakes ?? [];
      const dropped = id ? planned.filter((p) => p.id === id) : [...planned];
      state = { ...state, plannedWakes: id ? planned.filter((p) => p.id !== id) : [] };
      if (dropped[0]) {
        state = {
          ...state,
          lastCancelled: {
            at: dropped[0].at,
            reason: dropped[0].reason ?? '',
            cancelledAt: T0,
            source: source === 'tool' ? 'tool' : 'page',
          },
        };
      }
    },
    setIntervalMs: (ms) => { state = { ...state, defaultIntervalMs: ms }; },
    setHeartbeatMs: (ms) => { state = { ...state, heartbeatMs: ms }; },
    setNaturalEnabled: (on) => { state = { ...state, naturalEnabled: on !== false }; },
    setManualEnabled: (on) => { state = { ...state, manualEnabled: on !== false }; },
    setNaturalLock: (until) => { state = { ...state, naturalLockUntil: Number.isFinite(until) && until > 0 ? until : null }; },
    tick: async () => {},
  };
}

test('the settings page reads and moves the schedule over RPC', async () => {
  const runner = fakeRunner({ lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR });
  const handle = createWakeRpcHandler({ runner, now: () => T0 });

  const status = await handle('wake.status', {});
  assert.equal(status.ok, true);
  assert.equal(status.value.defaultIntervalMs, HOUR);
  assert.equal(status.value.nextWakeAt, new Date(T0 + HOUR).toISOString());

  const saved = await handle('wake.config.save', { defaultIntervalMs: 4 * HOUR });
  assert.equal(saved.value.defaultIntervalMs, 4 * HOUR);

  const bad = await handle('wake.config.save', { defaultIntervalMs: 1000 });
  assert.equal(bad.ok, false, 'a one second interval is refused');

  const planned = await handle('wake.plan', { at: T0 + HOUR, reason: '提醒他喝水' });
  assert.equal(planned.value.plannedWakes.length, 1);
  assert.equal(planned.value.plannedWakes[0].reason, '提醒他喝水');

  const cancelled = await handle('wake.cancel', {});
  assert.equal(cancelled.value.plannedWakes.length, 0);

  const badPlan = await handle('wake.plan', { at: 'later' });
  assert.equal(badPlan.ok, false, 'a plan needs a real time');

  const off = await handle('wake.config.save', { naturalEnabled: false, manualEnabled: false });
  assert.equal(off.value.naturalEnabled, false);
  assert.equal(off.value.manualEnabled, false);
  const empty = await handle('wake.config.save', {});
  assert.equal(empty.ok, false, 'saving nothing is refused');
});

test('wake_set plans a moment with its reason, wake_check reads both kinds', async () => {
  assert.equal(parseDuration('45m'), 45 * 60_000);
  assert.equal(parseDuration('2h'), 2 * HOUR);
  assert.equal(parseDuration('90s'), 90_000);
  assert.equal(parseDuration('15'), 15 * 60_000);
  assert.equal(parseDuration('soon'), null);

  const runner = fakeRunner({ lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR });
  const [set, check] = createWakeTools({ runner, now: () => T0 });
  assert.equal(set.name, 'wake_set');
  assert.equal(check.name, 'wake_check');

  const placed = await set.execute({ in: '45m', reason: '提醒他吃药' });
  assert.equal(placed.manual.next.at, new Date(T0 + 45 * 60_000).toISOString());
  assert.equal(placed.manual.next.reason, '提醒他吃药');
  assert.match(placed.summary, /主动唤醒定在/);

  const read = await check.execute({});
  assert.match(read.summary, /主动唤醒：.*提醒他吃药/);
  assert.match(read.summary, /自然唤醒：/);
  assert.equal(read.natural.nextWakeAt, new Date(T0 + HOUR).toISOString());

  const second = await set.execute({ at: '2026-11-05T08:00:00+08:00' });
  assert.equal(second.manual.count, 2, 'plans stack instead of replacing');

  const cancelled = await set.execute({ cancel: true });
  assert.equal(cancelled.manual.count, 0);

  const lonely = await check.execute({});
  assert.match(lonely.summary, /主动唤醒：没有安排/);
});

test('a quiet switch and a cancelled plan both explain themselves', async () => {
  const runner = fakeRunner({
    lastActivityEndedAt: T0,
    nextWakeAt: T0 + HOUR,
    naturalEnabled: false,
    manualEnabled: false,
  });
  const [set, check] = createWakeTools({ runner, now: () => T0 });

  const placed = await set.execute({ in: '20m', reason: '提醒他吃药' });
  assert.match(placed.summary, /开关关着/, 'a plan made under a closed switch says so up front');

  const read = await check.execute({});
  assert.match(read.summary, /主动唤醒：.*开关关着/);
  assert.match(read.summary, /自然唤醒：.*开关关着/);

  // Somebody cancels the plan from the settings page.
  runner.cancelWake('p1', 'page');
  const after = await check.execute({});
  assert.match(after.summary, /主动唤醒：没有安排/, 'the plan is gone');
  assert.match(after.summary, /被.*取消/, 'and the reason for the silence is named');
  assert.match(after.summary, /取消了/);
  assert.equal(after.lastCancelled.source, 'page');

  // One I cancelled myself is attributed to me, not to the owner.
  const mine = fakeRunner({ lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR });
  const [set2, check2] = createWakeTools({ runner: mine, now: () => T0 });
  await set2.execute({ in: '10m', reason: '去看看' });
  await set2.execute({ cancel: true });
  const told = await check2.execute({});
  assert.match(told.summary, /被我取消/);
  assert.equal(told.lastCancelled.source, 'tool');
});

test('a lock is set by a duration or a moment, and explained when it is on', async () => {
  const runner = fakeRunner({ lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR });
  const [set, check] = createWakeTools({ runner, now: () => T0 });

  const locked = await set.execute({ lock: '3h' });
  assert.equal(runner.snapshot().naturalLockUntil, T0 + 3 * HOUR);
  assert.match(locked.summary, /自然唤醒锁到/);
  assert.match(locked.summary, /这段时间不会自己醒来/);

  const read = await check.execute({});
  assert.match(read.summary, /锁着，到点自动恢复/);
  assert.equal(read.natural.lockUntil, new Date(T0 + 3 * HOUR).toISOString());

  const byMoment = await set.execute({ lock: '2026-11-05T09:00:00+08:00' });
  assert.equal(runner.snapshot().naturalLockUntil, Date.parse('2026-11-05T09:00:00+08:00'));
  assert.match(byMoment.summary, /自然唤醒锁到/);

  const nonsense = await set.execute({ lock: 'before lunch' });
  assert.match(nonsense.summary, /看不懂这个锁的时间/);
  assert.equal(runner.snapshot().naturalLockUntil, Date.parse('2026-11-05T09:00:00+08:00'), 'a rejected lock changes nothing');

  const unlocked = await set.execute({ unlock: true });
  assert.equal(runner.snapshot().naturalLockUntil, null);
  assert.match(unlocked.summary, /锁解开了/);
  assert.doesNotMatch((await check.execute({})).summary, /锁着/);
});

test('the page can lock and unlock the natural kind over RPC', async () => {
  const runner = fakeRunner({ lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR });
  const handle = createWakeRpcHandler({ runner, now: () => T0 });

  const locked = await handle('wake.lock', { until: T0 + 2 * HOUR });
  assert.equal(locked.ok, true);
  assert.equal(locked.value.naturalLockUntil, new Date(T0 + 2 * HOUR).toISOString());

  const refused = await handle('wake.lock', { until: 'tonight' });
  assert.equal(refused.ok, false);

  const missing = await handle('wake.lock', {});
  assert.equal(missing.ok, false, 'a lock needs until, even to clear it');

  const cleared = await handle('wake.lock', { until: null });
  assert.equal(cleared.value.naturalLockUntil, null);
});

test('the runner wakes once, then waits for the next interval', async () => {
  let clock = 0;
  let status = 'idle';
  let activityAt = null;
  let state = { defaultIntervalMs: HOUR };
  const delivered = [];
  let timerFn = null;

  const runner = createRunner({
    statusOf: async () => status,
    activityOf: () => activityAt,
    deliver: async ({ text }) => { delivered.push(text); return true; },
    readMain: () => 'session-main',
    readState: () => state,
    writeState: (next) => { state = next; },
    now: () => clock,
    tickMs: 30_000,
    setIntervalFn: (fn) => { timerFn = fn; return { unref() {} }; },
    clearIntervalFn: () => { timerFn = null; },
  });

  runner.start();
  // start() already kicks a tick; wait for it instead of racing it.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await runner.tick();
  assert.equal(state.nextWakeAt, HOUR, 'armed one interval out');

  clock = HOUR;
  await runner.tick();
  assert.equal(delivered.length, 1);
  assert.equal(state.nextWakeAt, 2 * HOUR);

  clock = HOUR + 30_000;
  await runner.tick();
  assert.equal(delivered.length, 1, 'no second wake right after the first');

  // A new event lands in the session while the agent works.
  status = 'running';
  activityAt = 3 * HOUR;
  clock = 3 * HOUR;
  await runner.tick();
  assert.equal(state.nextWakeAt, 4 * HOUR, 'the deadline follows the newest event');
  assert.equal(delivered.length, 1, 'and nothing fires mid-turn');

  status = 'idle';
  clock = 3 * HOUR + 60_000;
  await runner.tick();
  assert.equal(state.nextWakeAt, 4 * HOUR, 'stopping does not re-arm twice');

  runner.setNaturalEnabled(false);
  clock = 40 * HOUR;
  await runner.tick();
  assert.equal(delivered.length, 1, 'switched off means silent');
  assert.equal(state.naturalEnabled, false);

  runner.dispose();
  assert.equal(timerFn, null);
});

async function loadClient() {
  const file = await buildClient();
  const code = await readFile(file, 'utf8');
  let definition = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (v) => { definition = v; } } },
    console: { warn() {}, error() {}, log() {} },
  };
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  return {
    definition,
    exports: definition.factory((id) => {
      if (id === 'react') return react;
      throw new Error(`unexpected require: ${id}`);
    }),
  };
}

test('the client half adds one block to the shared page', async () => {
  const { definition, exports } = await loadClient();
  assert.equal(definition.id, 'dsh-lpipe-wake');
  assert.equal(exports.name, 'dsh-lpipe-wake-settings');
  assert.deepEqual([...exports.inject], ['slots', 'connection']);

  const registered = [];
  const ctx = {
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    slots: { inject: (_slot, factory) => factory(), register: (options, Component) => { registered.push({ options, Component }); } },
  };
  exports.apply(ctx);

  assert.equal(registered.length, 1);
  const { options } = registered[0];
  assert.equal(options.name, 'lpipe.settings.panel');
  assert.equal(options.id, 'wake');
  assert.equal(options.order, 20);
  assert.equal(options.label(), '唤醒管线');
  assert.equal(typeof options.inject().rpcCall, 'function');
});

test('countdown and clock formatting stay readable', async () => {
  const { exports } = await loadClient();
  const { countdown, formatClock } = exports.__test__;
  const at = new Date(T0 + 2 * HOUR + 30 * 60_000).toISOString();
  assert.equal(countdown(at, T0), '2 小时 30 分后');
  assert.equal(countdown(new Date(T0 - 1000).toISOString(), T0), '已到点，等下一次心跳');
  assert.match(formatClock(at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('the interval field accepts anything from a minute to a day', async () => {
  const { exports } = await loadClient();
  const { splitInterval, composeInterval, MIN_INTERVAL_MS, MAX_INTERVAL_MS } = exports.__test__;

  // The helpers come from the client bundle's own realm, so compare fields.
  const pair = (ms) => {
    const { amount, unit } = splitInterval(ms);
    return `${amount} ${unit}`;
  };
  assert.equal(pair(2 * HOUR), '2 hours');
  assert.equal(pair(90 * 60_000), '90 minutes');
  assert.equal(pair(45 * 60_000), '45 minutes');

  assert.equal(composeInterval('45', 'minutes'), 45 * 60_000, 'a custom minute value survives');
  assert.equal(composeInterval('3', 'hours'), 3 * HOUR);
  assert.equal(composeInterval(' 90 ', 'minutes'), 90 * 60_000, 'stray spaces are tolerated');
  assert.equal(composeInterval('1440', 'minutes'), MAX_INTERVAL_MS);
  assert.equal(composeInterval('24', 'hours'), MAX_INTERVAL_MS);
  assert.equal(MIN_INTERVAL_MS, 60_000);

  assert.equal(composeInterval('0', 'minutes'), null);
  assert.equal(composeInterval('1441', 'minutes'), null);
  assert.equal(composeInterval('25', 'hours'), null);
  assert.equal(composeInterval('', 'hours'), null);
  assert.equal(composeInterval('1.5', 'hours'), null);
  assert.equal(composeInterval('abc', 'minutes'), null);
});

test('the heartbeat is a setting, and every save survives the trip over RPC', async () => {
  const runner = fakeRunner({ lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR });
  const handle = createWakeRpcHandler({ runner, now: () => T0 });

  const first = await handle('wake.status', {});
  assert.equal(first.value.heartbeatMs, 30_000, 'thirty seconds unless the owner says otherwise');
  assert.equal(first.value.plannedWakes.length, 0, 'nothing planned yet');
  assert.equal(first.value.naturalEnabled, true);

  const slower = await handle('wake.config.save', { heartbeatMs: 5_000 });
  assert.equal(slower.value.heartbeatMs, 5_000);

  const tooFast = await handle('wake.config.save', { heartbeatMs: 10 });
  assert.equal(tooFast.ok, false, 'a ten millisecond heartbeat is refused');
  const tooSlow = await handle('wake.config.save', { heartbeatMs: 3_700_000 });
  assert.equal(tooSlow.ok, false, 'an hour and a minute is refused');
});

test('the page sees both deadlines and can cancel one plan at a time', async () => {
  const runner = fakeRunner({ lastActivityEndedAt: T0, defaultIntervalMs: HOUR, nextWakeAt: T0 + HOUR });
  const handle = createWakeRpcHandler({ runner, now: () => T0 });

  await handle('wake.plan', { at: T0 + 60_000, reason: 'first' });
  await handle('wake.plan', { at: T0 + 2 * HOUR, reason: 'second' });

  const both = await handle('wake.status', {});
  assert.equal(both.value.plannedWakes.length, 2);
  assert.equal(both.value.plannedWakes[0].reason, 'first', 'the earliest plan comes first');
  assert.equal(both.value.nextWakeAt, new Date(T0 + HOUR).toISOString(), 'the natural deadline is separate');

  const first = both.value.plannedWakes[0].id;
  const one = await handle('wake.cancel', { id: first });
  assert.equal(one.value.plannedWakes.length, 1);
  assert.equal(one.value.plannedWakes[0].reason, 'second');
});

test('the runner adopts the saved heartbeat instead of the built-in one', async () => {
  let state = { defaultIntervalMs: HOUR, heartbeatMs: 5_000 };
  const delays = [];
  let cleared = 0;
  const runner = createRunner({
    statusOf: async () => 'idle',
    activityOf: () => null,
    deliver: async () => true,
    readMain: () => 'session-live',
    readState: () => state,
    writeState: (next) => { state = next; },
    now: () => T0,
    tickMs: 30_000,
    setIntervalFn: (_fn, ms) => { delays.push(ms); return { unref() {} }; },
    clearIntervalFn: () => { cleared += 1; },
  });

  runner.start();
  assert.equal(delays[0], 5_000, 'the saved heartbeat wins over the constant');

  runner.setHeartbeatMs(10_000);
  assert.equal(delays[1], 10_000, 'a new heartbeat takes effect without a restart');
  assert.equal(cleared, 1, 'the old timer is cleared first');
  runner.dispose();
});

test('the heartbeat field and its progress bar stay readable', async () => {
  const { exports } = await loadClient();
  const { splitHeartbeat, composeHeartbeat, beatProgress, beatText } = exports.__test__;

  assert.equal(`${splitHeartbeat(30_000).amount} ${splitHeartbeat(30_000).unit}`, '30 seconds');
  assert.equal(`${splitHeartbeat(5 * 60_000).amount} ${splitHeartbeat(5 * 60_000).unit}`, '5 minutes');

  assert.equal(composeHeartbeat('30', 'seconds'), 30_000);
  assert.equal(composeHeartbeat('5', 'minutes'), 5 * 60_000);
  assert.equal(composeHeartbeat('0', 'seconds'), null);
  assert.equal(composeHeartbeat('61', 'minutes'), null);

  const half = beatProgress(new Date(T0 - 15_000).toISOString(), 30_000, T0);
  assert.ok(half > 0.49 && half < 0.51, 'half of the heartbeat reads as half done');
  assert.equal(beatProgress(new Date(T0 + 60_000).toISOString(), 30_000, T0), 0, 'never negative');

  assert.equal(beatText(new Date(T0 - 12_000).toISOString(), 30_000, T0), '上次心跳 12 秒前 · 每 30 秒看一次');
});
