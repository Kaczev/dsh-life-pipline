/**
 * The wake state machine. Pure on purpose: `node --test` drives it with a fake
 * clock and fake activity, and the Host runner is a thin 30s tick around it.
 *
 * Rules (decided with the owner):
 * 1. The moment activity starts, `nextWakeAt` is cleared.
 * 2. The trigger is strict: `now >= nextWakeAt` fires, including when the Host
 *    was closed and the deadline has passed.
 * 3. After activity ends, the next wake is `lastActivityEndedAt + interval`.
 * 4. `wake_set` only places a `nextWakeAt`; rule 1 may clear it again.
 */
export const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const TICK_MS = 30 * 1000;

export function defaultState(now = Date.now()) {
  return {
    enabled: true,
    defaultIntervalMs: DEFAULT_INTERVAL_MS,
    lastActivityEndedAt: null,
    nextWakeAt: null,
    lastWokeAt: null,
    lastSeenAt: now,
  };
}

const asTime = (value) => (Number.isFinite(value) ? Number(value) : null);

/** Coerce anything read from disk into a state we can reason about. */
export function normalizeState(raw, now = Date.now()) {
  const base = defaultState(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const interval = Number(raw.defaultIntervalMs);
  return {
    enabled: raw.enabled !== false,
    defaultIntervalMs: Number.isFinite(interval) && interval > 0 ? interval : base.defaultIntervalMs,
    lastActivityEndedAt: asTime(raw.lastActivityEndedAt),
    nextWakeAt: asTime(raw.nextWakeAt),
    lastWokeAt: asTime(raw.lastWokeAt),
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

/** The sentence that wakes you: a statement, not a command. */
export function wakeText({ now, since }) {
  const tail = '想做什么就做什么，没事也可以什么都不做。';
  if (since === null) return `（自己醒来）现在是 ${clockOf(now)}。${tail}`;
  return `（自己醒来）已经过了 ${elapsedText(now - since)}，现在是 ${clockOf(now)}。${tail}`;
}

/**
 * One tick. Returns the next state plus, when the deadline has passed, the
 * text to inject. Never mutates the input.
 */
export function step(rawState, { now = Date.now(), status = 'idle' } = {}) {
  const state = normalizeState(rawState, now);
  state.lastSeenAt = now;

  // Switched off: keep the numbers as they were, decide nothing.
  if (state.enabled === false) {
    state.nextWakeAt = null;
    return { state, action: null };
  }

  if (status !== 'idle') {
    // Rule 1: activity clears whatever was pending.
    state.nextWakeAt = null;
    state.lastActivityEndedAt = null;
    return { state, action: null };
  }

  if (state.lastActivityEndedAt === null) {
    // Rule 3, first half: we were active and just stopped (or first run).
    state.lastActivityEndedAt = now;
    state.nextWakeAt = now + state.defaultIntervalMs;
    return { state, action: null };
  }

  if (state.nextWakeAt === null) {
    state.nextWakeAt = state.lastActivityEndedAt + state.defaultIntervalMs;
    return { state, action: null };
  }

  if (now >= state.nextWakeAt) {
    // Rule 2: strict comparison, so a deadline missed while the Host was down
    // fires immediately on the first tick after it comes back.
    const since = state.lastActivityEndedAt;
    state.lastWokeAt = now;
    // Re-arm from the wake itself, otherwise the stale base would make the
    // next tick fire again and the pipeline would loop forever.
    state.lastActivityEndedAt = now;
    state.nextWakeAt = now + state.defaultIntervalMs;
    return {
      state,
      action: { kind: 'wake', at: now, text: wakeText({ now, since }) },
    };
  }

  return { state, action: null };
}
