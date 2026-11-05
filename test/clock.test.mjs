import test from 'node:test';
import assert from 'node:assert/strict';
import { stampFor, formatStamp, STAMP_GAP_MS } from '../src/clock.mjs';

/** Local-time construction keeps these assertions independent of the timezone. */
const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm).getTime();
const NOON = at(2026, 11, 5, 12, 0);

test('a quick follow-up message adds no timestamp, a pause does', () => {
  assert.equal(stampFor(at(2026, 11, 5, 11, 59), at(2026, 11, 5, 11, 56), NOON), '');
  assert.equal(stampFor(at(2026, 11, 5, 11, 59), null, NOON), '11:59');
  const earlier = at(2026, 11, 5, 11, 0);
  assert.equal(stampFor(earlier + STAMP_GAP_MS, earlier, NOON), '11:05');
});

test('a timestamp is written the way WeChat writes it', () => {
  assert.equal(formatStamp(at(2026, 11, 5, 9, 5), NOON), '09:05');
  assert.equal(formatStamp(at(2026, 11, 4, 23, 10), NOON), '昨天 23:10');
  assert.equal(formatStamp(at(2026, 11, 3, 8, 0), NOON), '周二 08:00');
  assert.equal(formatStamp(at(2026, 10, 26, 8, 0), NOON), '10月26日 08:00');
  assert.equal(formatStamp(at(2025, 12, 31, 23, 10), NOON), '2025年12月31日 23:10');
});

test('unusable input never yields Invalid Date text', () => {
  assert.equal(formatStamp('not a date', NOON), '');
  assert.equal(stampFor(undefined, null, NOON), '');
});
