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
 *
 * Two registrations exist on purpose. The `tools/pre-execute` waterfall is
 * scope-filtered, so a listener registered from a plugin context may never be
 * reached; `tools.guard()` lands on the ToolsService's own layer, which every
 * call walks. Both are cheap, and both are idempotent — the first deny wins.
 */

import { mkdirSync } from 'node:fs';
import { appendDiagnostic } from './diagnostics.mjs';
import { join } from 'node:path';

import { eventsOf } from './session-activity.mjs';
import { homeDir } from './paths.mjs';

/** Notice sources that may be delivered while the owner is not at the keyboard. */
const AWAY_KINDS = new Set(['dsh-lpipe-chat', 'dsh-lpipe-wake']);

/**
 * Kinds that can start a turn. Everything else in the `user/message` stream is
 * context a plugin injected mid-turn — `time-context` is appended to almost
 * every step, and looking at the *newest* message therefore read every turn as
 * "time-context", including the ones that arrived over WeChat. So the scan
 * walks past context and stops at the first message that can be an origin.
 */
const ORIGIN_KINDS = new Set(['user', 'dsh-lpipe-chat', 'dsh-lpipe-wake', 'schedule']);

/**
 * The kind of the message that started this turn, or '' when there is none.
 * @param {any} session - the session whose log to read.
 * @returns The decisive source kind, e.g. `user` or `dsh-lpipe-chat`.
 */
export function lastUserSourceKind(session) {
  const events = eventsOf(session);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'user/message') continue;
    const kind = event?.data?.source?.kind;
    if (typeof kind === 'string' && ORIGIN_KINDS.has(kind)) return kind;
  }
  return '';
}

/** The very newest user-message kind, context included; diagnostics only. */
export function newestUserSourceKind(session) {
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

export const AWAY_REASON = 'Denied: this turn started from a WeChat/QQ or wake notice, so the user may be away from the Harness UI and cannot click question options. Ask in plain text instead (over the same channel when the turn came from chat), or continue with what you can decide yourself.';

/**
 * Append one evaluation to `$DSH_HOME/life-pipline/guard.jsonl`.
 *
 * The interception is otherwise invisible — a deny shows up as a tool error and
 * a pass looks like ordinary behaviour — so the file is how we tell "the guard
 * ran and allowed it" from "the guard never ran". Best effort: logging must
 * never change the decision.
 * @param {Record<string, unknown>} record - one JSON line.
 */
export function noteEvaluation(record) {
  try {
    const file = join(homeDir(), 'guard.jsonl');
    mkdirSync(join(homeDir()), { recursive: true });
    appendDiagnostic(file, { at: new Date().toISOString(), ...record });
  } catch {
    // Diagnostics are never allowed to break a tool call.
  }
}

/**
 * Decide whether this call is a question asked where nobody can click.
 * @param {any} exec - the pending tool call.
 * @param {{ onDecision?: (info: Record<string, unknown>) => void }} [options]
 * @returns The reason to deny with, or undefined to allow.
 */
export function awayReasonFor(exec, { onDecision } = {}) {
  if (exec?.name !== 'ask_user_question') return undefined;
  let session = null;
  try {
    session = exec?.agent?.session ?? null;
  } catch {
    session = null;
  }
  let kind = '';
  let away = false;
  let error = '';
  try {
    kind = session ? lastUserSourceKind(session) : '';
    away = AWAY_KINDS.has(kind);
  } catch (thrown) {
    error = String(thrown?.message ?? thrown);
  }
  let newest = '';
  try {
    newest = session ? newestUserSourceKind(session) : '';
  } catch {
    newest = '';
  }
  const info = { sessionId: String(session?.id ?? ''), kind, newest, away, hasSession: Boolean(session), error };
  try {
    onDecision?.(info);
  } catch {
    // Reporting a decision must never change it.
  }
  return away ? AWAY_REASON : undefined;
}

/**
 * Build the `tools/pre-execute` waterfall listener.
 * @param {{ onDeny?: (info: Record<string, unknown>) => void }} [options]
 * @returns A listener that denies `ask_user_question` on away-started turns.
 */
export function createAwayGuard({ onDeny } = {}) {
  return async function awayGuard(exec, next) {
    const reason = awayReasonFor(exec, { onDecision: onDeny });
    if (reason === undefined) return next();
    return { kind: 'deny', reason };
  };
}

/**
 * Build the monotonic `tools.guard()` predicate.
 * @param {{ onDeny?: (info: Record<string, unknown>) => void }} [options]
 * @returns A guard returning the denial reason, or undefined to allow.
 */
export function createAwayToolGuard({ onDeny } = {}) {
  return (exec) => awayReasonFor(exec, { onDecision: onDeny });
}
