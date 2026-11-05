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

test('a hand-set point is cancelled by real activity after it', () => {
  const setAt = T0;
  const armed = { defaultIntervalMs: HOUR, lastActivityEndedAt: T0, nextWakeAt: T0 + 5 * HOUR, wakeSetAt: setAt, lastWokeAt: null };
  const spoke = T0 + 10 * 60_000;
  const { state } = step(armed, { now: spoke, activityAt: spoke, status: 'idle' });
  assert.equal(state.nextWakeAt, spoke + HOUR, 'back to the formula');
  assert.equal(state.wakeSetAt, null);
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
  assert.equal(action?.kind, 'wake');
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
  assert.equal(first.action?.kind, 'wake');
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

test('switched off never wakes, but the deadline stays on the page', () => {
  const off = { enabled: false, defaultIntervalMs: HOUR, lastActivityEndedAt: T0, nextWakeAt: T0 + HOUR, lastWokeAt: null };
  const { state, action } = step(off, { now: T0 + 9 * HOUR, status: 'idle' });
  assert.equal(action, null, 'a switched off pipeline never wakes');
  assert.equal(state.nextWakeAt, T0 + HOUR, 'the deadline reads as when it would have woken');
  assert.equal(state.enabled, false);

  const blank = { enabled: false, defaultIntervalMs: HOUR, lastActivityEndedAt: T0 };
  const derived = step(blank, { now: T0 + HOUR, status: 'idle' });
  assert.equal(derived.state.nextWakeAt, T0 + HOUR, 'a missing deadline is derived, never left blank');
  assert.equal(derived.action, null);
});

test('a corrupt state file degrades to the default interval', () => {
  const state = normalizeState({ defaultIntervalMs: 'soon', nextWakeAt: 'later' }, T0);
  assert.equal(state.defaultIntervalMs, DEFAULT_INTERVAL_MS);
  assert.equal(state.nextWakeAt, null);
});

function fakeRunner(initial = {}) {
  let state = { defaultIntervalMs: HOUR, ...initial };
  return {
    snapshot: () => state,
    setNextWake: (at) => { state = { ...state, nextWakeAt: at }; },
    clearNextWake: () => { state = { ...state, nextWakeAt: null }; },
    setIntervalMs: (ms) => { state = { ...state, defaultIntervalMs: ms }; },
    setEnabled: (on) => { state = { ...state, enabled: on !== false, nextWakeAt: null }; },
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

  const cleared = await handle('wake.reset', {});
  assert.equal(cleared.value.nextWakeAt, null);

  const off = await handle('wake.config.save', { enabled: false });
  assert.equal(off.value.enabled, false);
  const empty = await handle('wake.config.save', {});
  assert.equal(empty.ok, false, 'saving nothing is refused');
});

test('wake_set parses durations and can place or clear a deadline', async () => {
  assert.equal(parseDuration('45m'), 45 * 60_000);
  assert.equal(parseDuration('2h'), 2 * HOUR);
  assert.equal(parseDuration('90s'), 90_000);
  assert.equal(parseDuration('15'), 15 * 60_000);
  assert.equal(parseDuration('soon'), null);

  const runner = fakeRunner();
  const [tool] = createWakeTools({ runner, now: () => T0 });
  assert.equal(tool.name, 'wake_set');

  const placed = await tool.execute({ in: '45m' });
  assert.equal(placed.nextWakeAt, new Date(T0 + 45 * 60_000).toISOString());

  const read = await tool.execute({});
  assert.equal(read.nextWakeAt, placed.nextWakeAt);
  assert.match(read.summary, /下次唤醒/);

  const cleared = await tool.execute({ clear: true });
  assert.equal(cleared.nextWakeAt, null);

  const at = await tool.execute({ at: '2026-11-05T08:00:00+08:00' });
  assert.equal(at.nextWakeAt, new Date('2026-11-05T08:00:00+08:00').toISOString());
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

  runner.setEnabled(false);
  clock = 40 * HOUR;
  await runner.tick();
  assert.equal(delivered.length, 1, 'switched off means silent');
  assert.equal(state.enabled, false);

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
