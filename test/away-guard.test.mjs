import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createAwayGuard,
  createAwayToolGuard,
  startedAway,
  lastUserSourceKind,
  AWAY_REASON,
} = await import('../src/away-guard.mjs');

const sessionWith = (events) => ({ id: 'session-away', snapshotEvents: () => events });

const userMessage = (kind) => ({ type: 'user/message', data: { source: { kind } } });
const assistantMessage = () => ({ type: 'assistant/message', data: {} });

test('the newest user message decides where the turn came from', () => {
  const session = sessionWith([
    userMessage('prompt'),
    assistantMessage(),
    userMessage('dsh-lpipe-chat'),
    assistantMessage(),
    { type: 'tool/call', data: {} },
  ]);
  assert.equal(lastUserSourceKind(session), 'dsh-lpipe-chat');
  assert.equal(startedAway(session), true);
});

test('a GUI turn is not an away turn', () => {
  assert.equal(startedAway(sessionWith([userMessage('prompt'), assistantMessage()])), false);
  assert.equal(startedAway(sessionWith([])), false);
  assert.equal(startedAway(null), false);
});

test('both notice sources read as away', () => {
  assert.equal(startedAway(sessionWith([userMessage('dsh-lpipe-chat')])), true);
  assert.equal(startedAway(sessionWith([userMessage('dsh-lpipe-wake')])), true);
  assert.equal(startedAway(sessionWith([userMessage('schedule')])), false);
});

test('a question is denied on an away turn and explained in English', async () => {
  const denials = [];
  const guard = createAwayGuard({ onDeny: (info) => denials.push(info) });
  const decision = await guard(
    { name: 'ask_user_question', agent: { session: sessionWith([userMessage('dsh-lpipe-chat')]) } },
    async () => ({ kind: 'allow' }),
  );
  assert.equal(decision.kind, 'deny');
  assert.equal(decision.reason, AWAY_REASON);
  assert.match(decision.reason, /away from the Harness UI/);
  assert.match(decision.reason, /plain text/);
  assert.deepEqual(denials.map((info) => info.kind), ['dsh-lpipe-chat']);
});

test('the monotonic guard denies the same call without a waterfall', () => {
  const guard = createAwayToolGuard();
  const away = { name: 'ask_user_question', agent: { session: sessionWith([userMessage('dsh-lpipe-wake')]) } };
  assert.equal(guard(away), AWAY_REASON);
  const home = { name: 'ask_user_question', agent: { session: sessionWith([userMessage('prompt')]) } };
  assert.equal(guard(home), undefined);
  assert.equal(guard({ name: 'chat_send', agent: { session: sessionWith([userMessage('dsh-lpipe-chat')]) } }), undefined);
});

test('a question still works when the owner is at the keyboard', async () => {
  const guard = createAwayGuard();
  let next = 0;
  const decision = await guard(
    { name: 'ask_user_question', agent: { session: sessionWith([userMessage('prompt')]) } },
    async () => {
      next += 1;
      return { kind: 'allow' };
    },
  );
  assert.equal(decision.kind, 'allow');
  assert.equal(next, 1);
});

test('other tools are never touched', async () => {
  const guard = createAwayGuard();
  let next = 0;
  const decision = await guard(
    { name: 'chat_send', agent: { session: sessionWith([userMessage('dsh-lpipe-chat')]) } },
    async () => {
      next += 1;
      return { kind: 'allow' };
    },
  );
  assert.equal(decision.kind, 'allow');
  assert.equal(next, 1);
});

test('a call without an agent is left alone instead of throwing', async () => {
  const guard = createAwayGuard();
  const decision = await guard({ name: 'ask_user_question' }, async () => ({ kind: 'allow' }));
  assert.equal(decision.kind, 'allow');
});
