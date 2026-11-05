/**
 * The wake state machine. Pure on purpose: `node --test` drives it with a fake
 * clock and fake activity, and the Host runner is a thin heartbeat around it.
 *
 * Two independent kinds of wake live here:
 *
 * 1. Natural — "you stopped for a while, come back". Its deadline is
 *    `lastActivityEndedAt + defaultIntervalMs`, where the base comes from the
 *    newest event in the main session's own log, so restarts cannot erase it.
 *    Real activity always moves this deadline forward.
 * 2. Manual — a moment I picked, with a reason I wrote for myself ("leave him
 *    a surprise at eight"). It is a list, not a single deadline, and no
 *    activity cancels it: that is the whole point of it.
 *
 * Each kind has its own switch. When a kind is switched off its numbers stay
 * readable on the page; only the firing stops.
 */
import { formatStamp } from 'dsh-life-pipline/clock';

export const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const TICK_MS = 30 * 1000;
/** The heartbeat is only as fine as the deadline needs it to be; let the owner tune it. */
export const MIN_HEARTBEAT_MS = 1000;
export const MAX_HEARTBEAT_MS = 60 * 60 * 1000;
/** A forgetful planner should not grow this list forever. */
export const MAX_PLANNED = 20;

export function defaultState(now = Date.now()) {
  return {
    naturalEnabled: true,
    manualEnabled: true,
    defaultIntervalMs: DEFAULT_INTERVAL_MS,
    heartbeatMs: TICK_MS,
    lastActivityEndedAt: null,
    nextWakeAt: null,
    plannedWakes: [],
    lastWokeAt: null,
    lastWokeKind: null,
    lastWokeReason: null,
    lastSeenAt: now,
  };
}

const asTime = (value) => (Number.isFinite(value) ? Number(value) : null);

function normalizePlan(raw) {
  if (!Array.isArray(raw)) return [];
  const plans = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const at = Number(item.at);
    if (!Number.isFinite(at) || at <= 0) continue;
    plans.push({
      id: typeof item.id === 'string' && item.id ? item.id : `${at}`,
      at,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : '',
      createdAt: asTime(item.createdAt),
    });
  }
  return plans.sort((a, b) => a.at - b.at).slice(0, MAX_PLANNED);
}

/** Coerce anything read from disk into a state we can reason about. */
export function normalizeState(raw, now = Date.now()) {
  const base = defaultState(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const interval = Number(raw.defaultIntervalMs);
  const heartbeat = Number(raw.heartbeatMs);
  return {
    naturalEnabled: raw.naturalEnabled !== false,
    manualEnabled: raw.manualEnabled !== false,
    defaultIntervalMs: Number.isFinite(interval) && interval > 0 ? interval : base.defaultIntervalMs,
    heartbeatMs: Number.isFinite(heartbeat) && heartbeat > 0
      ? Math.min(MAX_HEARTBEAT_MS, Math.max(MIN_HEARTBEAT_MS, heartbeat))
      : base.heartbeatMs,
    lastActivityEndedAt: asTime(raw.lastActivityEndedAt),
    nextWakeAt: asTime(raw.nextWakeAt),
    plannedWakes: normalizePlan(raw.plannedWakes),
    lastWokeAt: asTime(raw.lastWokeAt),
    lastWokeKind: raw.lastWokeKind === 'manual' || raw.lastWokeKind === 'natural' ? raw.lastWokeKind : null,
    lastWokeReason: typeof raw.lastWokeReason === 'string' ? raw.lastWokeReason : null,
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

/** A wake I asked for myself: it carries the note I left for that moment. */
export function manualWakeText({ now, at, reason }) {
  const head = `（主动醒来）我给自己定的时间是 ${formatStamp(at, now)}。`;
  const note = String(reason ?? '').trim();
  return note ? `${head}\n我留给这一刻的话：${note}` : head;
}

/** The earliest plan that has come due, if any. */
function duePlan(plans, now) {
  return plans.find((plan) => plan.at <= now) ?? null;
}

/**
 * One heartbeat. Returns the next state plus, when something is due, the text
 * to inject. Never mutates the input.
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
  }

  // The natural deadline is always kept readable, switched on or off.
  if (state.lastActivityEndedAt !== null) {
    state.nextWakeAt = state.lastActivityEndedAt + state.defaultIntervalMs;
  } else if (state.nextWakeAt === null) {
    state.lastActivityEndedAt = now;
    state.nextWakeAt = now + state.defaultIntervalMs;
  }

  // Never cut a running turn in half; the next heartbeats keep checking.
  if (status !== 'idle') return { state, action: null };

  const plan = duePlan(state.plannedWakes, now);
  if (plan && state.manualEnabled !== false) {
    state.plannedWakes = state.plannedWakes.filter((item) => item.id !== plan.id);
    state.lastWokeAt = now;
    state.lastWokeKind = 'manual';
    state.lastWokeReason = plan.reason || null;
    return {
      state,
      action: {
        kind: 'manual',
        at: plan.at,
        reason: plan.reason,
        text: manualWakeText({ now, at: plan.at, reason: plan.reason }),
      },
    };
  }

  if (state.naturalEnabled === false) return { state, action: null };
  if (state.nextWakeAt === null || now < state.nextWakeAt) return { state, action: null };

  const since = state.lastActivityEndedAt;
  state.lastWokeAt = now;
  state.lastWokeKind = 'natural';
  state.lastWokeReason = null;
  // Re-arm from the wake itself, otherwise the stale base would make the next
  // heartbeat fire again and the pipeline would loop forever.
  state.lastActivityEndedAt = now;
  state.nextWakeAt = now + state.defaultIntervalMs;
  return {
    state,
    action: { kind: 'natural', at: now, reason: null, text: wakeText({ now, since }) },
  };
}
