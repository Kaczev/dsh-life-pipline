import test from 'node:test';
import assert from 'node:assert/strict';
import { lastActivityAt, lastEventAt } from '../src/session-activity.mjs';

test('the newest event time is the last moment the conversation moved', () => {
  const session = { snapshotEvents: () => [{ time: 5 }, { time: 9 }, { time: 3 }, { time: 'nope' }] };
  assert.equal(lastEventAt(session), 9);
  assert.equal(lastEventAt({ snapshotEvents: () => [] }), null);
  assert.equal(lastEventAt({ events: [{ time: 7 }] }), 7);
});

test('an unknown or broken session reports no activity instead of throwing', () => {
  const sessions = {
    get: (id) => {
      if (id === 'boom') throw new Error('no');
      if (id === 'empty') return {};
      return { snapshotEvents: () => [{ time: 42 }] };
    },
  };
  assert.equal(lastActivityAt(sessions, 's1'), 42);
  assert.equal(lastActivityAt(sessions, 'empty'), null);
  assert.equal(lastActivityAt(sessions, 'boom'), null);
  assert.equal(lastActivityAt(sessions, ''), null);
  assert.equal(lastActivityAt(null, 's1'), null);
});
