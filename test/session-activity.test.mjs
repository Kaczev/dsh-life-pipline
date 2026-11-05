import test from 'node:test';
import assert from 'node:assert/strict';
import { describeActivity, lastActivityAt, lastAnyEventAt, lastEventAt } from '../src/session-activity.mjs';

test('the newest event time is the last moment the conversation moved', () => {
  const session = {
    snapshotEvents: () => [
      { type: 'user/message', time: 5 },
      { type: 'turn/end', time: 9 },
      { type: 'tool/result', time: 3 },
      { type: 'turn/end', time: 'nope' },
    ],
  };
  assert.equal(lastEventAt(session), 9);
  assert.equal(lastEventAt({ snapshotEvents: () => [] }), null);
  assert.equal(lastEventAt({ events: [{ type: 'step/end', time: 7 }] }), 7);
});

test('a restart does not count as activity: bookkeeping is ignored', () => {
  // The real shape: my last reply ends the turn at 14:37, then the Host
  // restarts and seeds the session at 14:40. Only the first one is me.
  const session = {
    snapshotEvents: () => [
      { type: 'turn/end', time: 1000 },
      { type: 'workspace/changes', time: 1000 },
      { type: 'session/end-seed', time: 2000 },
      { type: 'request/header', time: 2000 },
    ],
  };
  assert.equal(lastEventAt(session), 1000, 'the restart marker is not a conversation');
  assert.equal(lastAnyEventAt(session), 2000, 'the raw newest event is still available for diagnosis');

  const report = describeActivity({ get: () => session }, 's1');
  assert.equal(report.lastAt, 1000);
  assert.equal(report.lastAnyAt, 2000);
});

test('an unknown or broken session reports no activity instead of throwing', () => {
  const sessions = {
    get: (id) => {
      if (id === 'boom') throw new Error('no');
      if (id === 'empty') return {};
      return { snapshotEvents: () => [{ type: 'user/message', time: 42 }] };
    },
  };
  assert.equal(lastActivityAt(sessions, 's1'), 42);
  assert.equal(lastActivityAt(sessions, 'empty'), null);
  assert.equal(lastActivityAt(sessions, 'boom'), null);
  assert.equal(lastActivityAt(sessions, ''), null);
  assert.equal(lastActivityAt(null, 's1'), null);
});
