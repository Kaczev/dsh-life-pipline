/**
 * Turns that start away from the keyboard cannot host a clickable question.
 *
 * A WeChat/QQ batch or a wake notice is delivered into the main session while
 * the owner may be on a phone, far from the Harness UI. `ask_user_question`
 * blocks until a UI provider returns a human answer, so such a turn would hang
 * — inbound messages and wakes included — until the owner comes back. The
 * common bundle therefore denies the tool on those turns and tells the model
 * to ask in plain text instead.
 *
 * The trigger is read from the session log rather than remembered in memory:
 * every injected notice is a `user/message` whose `source.kind` says who
 * delivered it, so a Host restart cannot leave a stale "away" flag behind.
 */

import { eventsOf } from './session-activity.mjs';

/** Notice sources that may be delivered while the owner is not at the keyboard. */
const AWAY_KINDS = new Set(['dsh-lpipe-chat', 'dsh-lpipe-wake']);

/** The newest HumanMessage-like event's source kind, or '' when there is none. */
export function lastUserSourceKind(session) {
  const events = eventsOf(session);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'user/message') continue;
    const kind = event?.data?.source?.kind;
    return typeof kind === 'string' ? kind : '';
  }
  return '';
}

/** Whether the newest user message was injected by a notice we may run away from. */
export function startedAway(session) {
  return AWAY_KINDS.has(lastUserSourceKind(session));
}

export const AWAY_REASON = 'Denied: this turn started from a WeChat/QQ or wake notice, so the owner may be away from the Harness UI and cannot click question options. Ask in plain text instead (over the same channel when the turn came from chat), or continue with what you can decide yourself.';

/**
 * Build the `tools/pre-execute` listener.
 * @param {{ onDeny?: (info: { sessionId: string, kind: string }) => void }} [options]
 * @returns A listener that denies `ask_user_question` on away-started turns.
 */
export function createAwayGuard({ onDeny } = {}) {
  return async function awayGuard(exec, next) {
    if (exec?.name !== 'ask_user_question') return next();
    let session = null;
    try {
      session = exec?.agent?.session ?? null;
    } catch {
      session = null;
    }
    if (!session) return next();
    let away = false;
    try {
      away = startedAway(session);
    } catch {
      away = false;
    }
    if (!away) return next();
    try {
      onDeny?.({ sessionId: String(session.id ?? ''), kind: lastUserSourceKind(session) });
    } catch {
      // Diagnosing a denial must never change its outcome.
    }
    return { kind: 'deny', reason: AWAY_REASON };
  };
}
