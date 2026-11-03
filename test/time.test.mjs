import assert from 'node:assert/strict';
import test from 'node:test';

import { toIso } from '../src/time.mjs';

test('timestamps survive every shape the platforms send', () => {
  assert.equal(toIso(1_793_728_666_199), '2026-11-03T17:57:46.199Z');
  assert.equal(toIso('1793728666199'), '2026-11-03T17:57:46.199Z');
  assert.equal(toIso('2026-11-03T17:57:46.199Z'), '2026-11-03T17:57:46.199Z');
  const fallback = toIso('not a time');
  assert.match(fallback, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(!Number.isNaN(Date.parse(fallback)));
});
