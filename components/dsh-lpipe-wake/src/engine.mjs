/**
 * The wake state machine. Pure on purpose: `node --test` drives it with a fake
 * clock and fake activity, and the Host runner is a thin 30s tick around it.
 *
 * Rules (decided with the owner):
 * 1. The base is the time of the newest event in the main session, so the
 *    elapsed time is "now − when the conversation last ended", no matter how
 *    many times the Host restarted in between.
 * 2. The trigger is strict: `now >= nextWakeAt` fires, including when the Host
 *    was closed and the deadline has passed.
 * 3. After activity ends, the next wake is `lastActivityEndedAt + interval`.
 * 4. `wake_set` only places a `nextWakeAt`; real activity may clear it again.
 */
import { formatStamp } from 'dsh-life-pipline/clock';

export const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const TICK_MS = 30 * 1000;
/** The heartbeat is only as fine as the deadline needs it to be; let the owner tune it. */
export const MIN_HEARTBEAT_MS = 1000;
export const MAX_HEARTBEAT_MS = 60 * 60 * 1000;

export function defaultState(now = Date.now()) {
  return {
    enabled: true,
    defaultIntervalMs: DEFAULT_INTERVAL_MS,
    heartbeatMs: TICK_MS,
    lastActivityEndedAt: null,
    nextWakeAt: null,
    nextWakeSource: 'natural',
    lastWokeAt: null,
    wakeSetAt: null,
    lastSeenAt: now,
  };
}

const asTime = (value) => (Number.isFinite(value) ? Number(value) : null);

/** Coerce anything read from disk into a state we can reason about. */
export function normalizeState(raw, now = Date.now()) {
  const base = defaultState(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const interval = Number(raw.defaultIntervalMs);
  const heartbeat = Number(raw.heartbeatMs);
  const manual = asTime(raw.wakeSetAt);
  return {
    enabled: raw.enabled !== false,
    defaultIntervalMs: Number.isFinite(interval) && interval > 0 ? interval : base.defaultIntervalMs,
    heartbeatMs: Number.isFinite(heartbeat) && heartbeat > 0
      ? Math.min(MAX_HEARTBEAT_MS, Math.max(MIN_HEARTBEAT_MS, heartbeat))
      : base.heartbeatMs,
    lastActivityEndedAt: asTime(raw.lastActivityEndedAt),
    nextWakeAt: asTime(raw.nextWakeAt),
    // Whether the deadline was placed by hand (`wake_set`) or computed from the
    // interval: the page names it, so it has to survive on disk.
    nextWakeSource: manual !== null ? 'manual' : 'natural',
    lastWokeAt: asTime(raw.lastWokeAt),
    wakeSetAt: manual,
    lastSeenAt: asTime(raw.lastSeenAt) ?? now,
  };
}

const pad = (value) => String(value).padStart(2, '0');

export function clockOf(timestamp) {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function elapsedText(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} 分钟`;
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${pad(minutes)} 分`;
}

/**
 * The sentence that wakes you: a statement, not a command.
 *
 * The clock uses the same rule as the chat pipeline, so waking after an
 * overnight gap reads `昨天 23:47` instead of a bare time that would look like
 * it happened today.
 */
export function wakeText({ now, since }) {
  const tail = '想做什么就做什么，没事也可以什么都不做。';
  const nowStamp = formatStamp(now, now);
  if (since === null) return `（自己醒来）现在是 ${nowStamp}。${tail}`;
  // Once the silence crossed midnight, "2 小时 06 分" hides which day it was.
  // Name the moment instead, written the way WeChat writes an old timestamp.
  const sameDay = new Date(since).toDateString() === new Date(now).toDateString();
  if (!sameDay) {
    return `（自己醒来）${formatStamp(since, now)} 之后你就停下来了，现在是 ${nowStamp}。${tail}`;
  }
  return `（自己醒来）已经过了 ${elapsedText(now - since)}，现在是 ${nowStamp}。${tail}`;
}

/**
 * One tick. Returns the next state plus, when the deadline has passed, the
 * text to inject. Never mutates the input.
 *
 * `activityAt` is the time of the newest event in the main session — the
 * answer to "when did the conversation last end", read from the session's own
 * log instead of guessed from our own uptime. `status` only decides whether a
 * due wake may be delivered right now.
 */
export function step(rawState, { now = Date.now(), activityAt = null, status = 'idle' } = {}) {
  const state = normalizeState(rawState, now);
  state.lastSeenAt = now;

  // The log always wins over our own memory: it survived every restart.
  const activity = activityAt === null || activityAt === undefined
    ? null
    : (Number.isFinite(Number(activityAt)) ? Number(activityAt) : null);
  if (activity !== null && (state.lastActivityEndedAt === null || activity > state.lastActivityEndedAt)) {
    state.lastActivityEndedAt = activity;
    // A hand-set point is one-shot: real activity after it cancels it.
    if (state.wakeSetAt !== null && activity > state.wakeSetAt) {
      state.wakeSetAt = null;
      state.nextWakeAt = null;
      state.nextWakeSource = 'natural';
    }
    // With no live manual point the deadline is always base + interval, so it
    // moves with the conversation instead of pointing at a stale moment.
    if (state.wakeSetAt === null) {
      state.nextWakeAt = state.lastActivityEndedAt + state.defaultIntervalMs;
    }
  }

  // Switched off: never fire, but keep the numbers on the page honest — the
  // deadline still reads as "when it would have woken", so the switch explains
  // itself instead of blanking the row.
  if (state.enabled === false) {
    if (state.nextWakeAt === null && state.lastActivityEndedAt !== null) {
      state.nextWakeAt = state.lastActivityEndedAt + state.defaultIntervalMs;
    }
    return { state, action: null };
  }

  if (state.lastActivityEndedAt === null) {
    // Nothing in the log yet (brand new session): the clock starts now.
    state.lastActivityEndedAt = now;
    state.nextWakeAt = now + state.defaultIntervalMs;
    return { state, action: null };
  }

  if (state.nextWakeAt === null) {
    state.nextWakeAt = state.lastActivityEndedAt + state.defaultIntervalMs;
    return { state, action: null };
  }

  if (now < state.nextWakeAt) return { state, action: null };

  // Due. Never cut a running turn in half; the next ticks keep checking.
  if (status !== 'idle') return { state, action: null };

  const since = state.lastActivityEndedAt;
  state.lastWokeAt = now;
  // Re-arm from the wake itself, otherwise the stale base would make the next
  // tick fire again and the pipeline would loop forever.
  state.lastActivityEndedAt = now;
  state.nextWakeAt = now + state.defaultIntervalMs;
  state.wakeSetAt = null;
  state.nextWakeSource = 'natural';
  return {
    state,
    action: { kind: 'wake', at: now, text: wakeText({ now, since }) },
  };
}
