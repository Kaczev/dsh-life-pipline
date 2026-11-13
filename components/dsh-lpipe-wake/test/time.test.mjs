import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDuration, parseWakeTime } from '../src/time.mjs';
import { createWakeTools } from '../src/tools.mjs';

const local = (year, month, day, hour = 0, minute = 0, second = 0) => new Date(year, month - 1, day, hour, minute, second).getTime();
const now = local(2026, 11, 13, 3, 15);

test('duration parser preserves existing units and accepts compounds', () => {
  for (const [input, expected] of [
    ['45m', 2_700_000], ['2h', 7_200_000], ['90s', 90_000], ['30', 1_800_000],
    ['1.5h', 5_400_000], ['2d', 172_800_000], ['500ms', 500],
    ['3h30m', 12_600_000], ['1h 20m', 4_800_000], [' 1H 20M ', 4_800_000],
    ['1d2h3m4s5ms', 93_784_005],
  ]) assert.equal(parseDuration(input), expected, input);
});

test('duration parser rejects zero, malformed and unsafe values', () => {
  for (const input of ['', '0', '0h0m', '-1h', '1h-20m', '1h nonsense', '1h 20', 'NaN', 'Infinity', '1e3m', '3:30', '1h+20m', '1.2.3h', '9999999999999999999999d']) {
    assert.equal(parseDuration(input), null, input);
  }
});

test('clock-only formats use next future local occurrence, including equality and rollover', () => {
  assert.equal(parseWakeTime('7:20', now), local(2026, 11, 13, 7, 20));
  assert.equal(parseWakeTime('07:20:45', now), local(2026, 11, 13, 7, 20, 45));
  assert.equal(parseWakeTime('03:15', now), local(2026, 11, 14, 3, 15));
  assert.equal(parseWakeTime('02:00', now), local(2026, 11, 14, 2));
  assert.equal(parseWakeTime('00:01', local(2026, 12, 31, 23, 59)), local(2027, 1, 1, 0, 1));
});

test('explicit dates support strict local and offset ISO forms', () => {
  assert.equal(parseWakeTime('2026-11-13 07:20', now), local(2026, 11, 13, 7, 20));
  assert.equal(parseWakeTime('2026-11-13T07:20:30', now), local(2026, 11, 13, 7, 20, 30));
  const early = Date.UTC(2020, 0, 1);
  assert.equal(parseWakeTime('2026-11-13T07:20:30.123Z', early), Date.UTC(2026, 10, 13, 7, 20, 30, 123));
  assert.equal(parseWakeTime('2026-11-13T07:20:00+08:00', early), Date.UTC(2026, 10, 12, 23, 20));
  assert.equal(parseWakeTime('2026-11-13T07:20:00-0530', early), Date.UTC(2026, 10, 13, 12, 50));
  assert.equal(parseWakeTime('2028-02-29 07:20', now), local(2028, 2, 29, 7, 20));
});

test('invalid calendars, clocks, explicit past instants and permissive date syntax are rejected', () => {
  for (const input of ['24:00', '12:60', '7:20:60', '7:2', '2026-02-29 07:20', '2026-04-31T07:20Z',
    '2026-00-10 07:20', '2026-13-10 07:20', '2026-11-00 07:20', '2026-11-13 24:00',
    '2026-11-13 03:15', '2026-11-12 07:20', '2026-11-13T07:20+24:00', '2026-11-13T07:20+08:60',
    '11/14/2026 07:20', 'November 14 2026', 'tomorrow 07:20', '2026-11-14', '2026-11-14T7:20', '2026-11-14T07:20 junk']) {
    assert.equal(parseWakeTime(input, now), null, input);
  }
  assert.equal(parseWakeTime('2026-11-13T07:20:00+08:00', Date.UTC(2026, 10, 13)), null);
});

function setup() {
  const calls = [];
  const state = { plannedWakes: [{ id: 'old', at: now + 60_000, reason: 'existing' }] };
  const [tool] = createWakeTools({ now: () => now, runner: {
    snapshot: () => state,
    planWake: plan => { calls.push(['plan', plan]); state.plannedWakes.push({ id: 'new', ...plan }); },
    setNaturalLock: at => { calls.push(['lock', at]); state.naturalLockUntil = at; },
    cancelWake: () => { throw Error('unexpected cancellation'); },
  } });
  return { tool, calls, state };
}

test('at and lock share local clock/date parser while lock never appends a plan', async () => {
  for (const value of ['7:20', '07:20:30', '2026-11-14 07:20', '2026-11-14T07:20:00+08:00']) {
    const a = setup(), b = setup();
    await a.tool.execute({ at: value, reason: 'new' });
    await b.tool.execute({ lock: value });
    assert.equal(a.calls[0][1].at, b.calls[0][1], value);
    assert.equal(a.state.plannedWakes.length, 2);
    assert.equal(b.state.plannedWakes.length, 1);
    assert.equal(b.calls[0][0], 'lock');
  }
});

test('compound duration works for in and lock', async () => {
  for (const field of ['in', 'lock']) {
    const { tool, calls } = setup();
    await tool.execute({ [field]: '3h30m' });
    assert.equal(field === 'in' ? calls[0][1].at : calls[0][1], now + 12_600_000);
  }
});

test('invalid tool input never mutates state and errors include examples', async () => {
  for (const input of [{ at: '2026-11-12 07:20' }, { at: '2026-02-30 07:20' }, { lock: '24:00' }, { lock: '0h' }, { in: '0' }, { in: '1h junk' }]) {
    const { tool, calls } = setup();
    const result = await tool.execute(input);
    assert.equal(calls.length, 0, JSON.stringify(input));
    assert.match(result.summary, /请用/);
    assert.match(result.summary, /07:20|45m|3h30m/);
  }
});

test('wake_set includes remaining plans on success and errors; wake_check lists every plan', async () => {
  const { tool, state } = setup();
  const result = await tool.execute({ lock: '1h' });
  assert.match(result.summary, /当前主动唤醒：1 项/);
  assert.match(result.summary, /id: old/);
  const failed = await tool.execute({ at: 'invalid' });
  assert.match(failed.summary, /id: old/);
  state.plannedWakes.push({ id: 'second', at: now + 120_000, reason: 'second reason' });
  const [, check] = createWakeTools({ runner: { snapshot: () => state }, now: () => now });
  const checked = await check.execute();
  assert.match(checked.summary, /id: old/);
  assert.match(checked.summary, /id: second/);
  assert.match(checked.summary, /second reason/);
});

test('full schedule rejects appends rather than confirming a silently discarded plan', async () => {
  const { tool, calls, state } = setup();
  state.plannedWakes = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, at: now + (i + 1) * 60_000 }));
  const result = await tool.execute({ in: '1h' });
  assert.equal(calls.length, 0);
  assert.match(result.summary, /已达上限（20 个），本次没有新增/);
  assert.match(result.summary, /当前主动唤醒：20 项/);
});

test('tool descriptions distinguish appending plans from natural-only lock', () => {
  const { tool } = setup();
  assert.match(tool.description, /append/);
  assert.match(tool.description, /does not add an active wake/);
  assert.match(tool.parameters.properties.at.description, /local time/);
  assert.match(tool.parameters.properties.in.description, /3h30m/);
  assert.match(tool.parameters.properties.lock.description, /Does not add, replace, or cancel active plans/);
});
