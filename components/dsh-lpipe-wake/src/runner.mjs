import { randomUUID } from 'node:crypto';

import { MAX_PLANNED, TICK_MS, normalizeState, step } from './engine.mjs';
import { loadState, readMainSessionId, saveState } from './state.mjs';

/**
 * The only stateful piece: a heartbeat that watches the main session and
 * writes the state file. Everything it decides comes from `step()`.
 */
export function createRunner({
  statusOf,
  activityOf = () => null,
  deliver,
  log = { info() {}, warn() {} },
  readMain = readMainSessionId,
  readState = loadState,
  writeState = saveState,
  now = () => Date.now(),
  tickMs = TICK_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  probe = null,
} = {}) {
  let timer = null;
  let timerMs = 0;
  let busy = false;
  let disposed = false;
  let warnedNoSession = false;
  let lastError = '';
  let lastProbe = '';

  const snapshot = () => normalizeState(readState(), now());

  async function tick() {
    if (disposed || busy) return;
    const sessionId = readMain();
    if (!sessionId) {
      if (!warnedNoSession) {
        warnedNoSession = true;
        log.warn('[life-wake] main session is not configured yet; the wake engine idles');
      }
      return;
    }
    warnedNoSession = false;
    busy = true;
    try {
      const [status, lastActivityAt] = await Promise.all([
        statusOf(sessionId),
        // "When did the conversation last end" comes from the session log, so a
        // Host restart cannot erase it.
        Promise.resolve(activityOf(sessionId)).catch(() => null),
      ]);
      if (probe) {
        const record = { at: now(), sessionId, status, activityAt: lastActivityAt };
        // Deduplicate on the inputs that can change the verdict, never on the
        // clock: otherwise every tick would write a line.
        const key = JSON.stringify({ sessionId, status, activityAt: lastActivityAt });
        if (key !== lastProbe) {
          lastProbe = key;
          try { probe(record); } catch { /* diagnostics never break a tick */ }
        }
      }
      const state = normalizeState(readState(), now());
      const result = step(state, { now: now(), activityAt: lastActivityAt, status });
      writeState(result.state);
      if (result.action) {
        await deliver({ sessionId, text: result.action.text, kind: result.action.kind });
        log.info(`[life-wake] woke the main session (${result.action.kind}) at ${new Date(now()).toISOString()}`);
      }
      lastError = '';
    } catch (error) {
      const message = String(error?.message ?? error);
      if (message !== lastError) log.warn(`[life-wake] tick failed: ${message}`);
      lastError = message;
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer || disposed) return;
    // The owner may have tuned the heartbeat; honour the saved value.
    const interval = Number(snapshot().heartbeatMs) || tickMs;
    void tick();
    timerMs = interval;
    timer = setIntervalFn(() => { void tick(); }, interval);
    if (typeof timer?.unref === 'function') timer.unref();
  }

  function dispose() {
    disposed = true;
    if (timer) clearIntervalFn(timer);
    timer = null;
  }

  /**
   * Plan a wake I chose myself. It sits in its own list, so nothing about my
   * activity touches it — that is what makes a surprise possible.
   */
  function planWake({ at, reason = '' } = {}) {
    const state = snapshot();
    const when = Number(at);
    if (!Number.isFinite(when)) throw new TypeError('planWake needs a numeric `at`');
    state.plannedWakes = [...state.plannedWakes, {
      id: randomUUID(),
      at: Math.round(when),
      reason: String(reason ?? '').slice(0, 200),
      createdAt: now(),
    }]
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_PLANNED);
    writeState(state);
    return state;
  }

  /** `id` cancels one plan, no argument cancels all of them. */
  function cancelWake(id = null) {
    const state = snapshot();
    state.plannedWakes = id ? state.plannedWakes.filter((plan) => plan.id !== id) : [];
    writeState(state);
    return state;
  }

  const setNaturalEnabled = (on) => {
    const state = snapshot();
    state.naturalEnabled = on !== false;
    // Keeping the deadline: switching off means "do not wake me", not "forget
    // when you would have".
    if (state.nextWakeAt === null && state.lastActivityEndedAt !== null) {
      state.nextWakeAt = state.lastActivityEndedAt + state.defaultIntervalMs;
    }
    writeState(state);
    return state;
  };

  const setManualEnabled = (on) => {
    const state = snapshot();
    state.manualEnabled = on !== false;
    writeState(state);
    return state;
  };

  /** How often the engine looks at the world. Takes effect without a restart. */
  function setHeartbeatMs(ms) {
    const next = Math.round(Number(ms));
    const state = snapshot();
    state.heartbeatMs = next;
    writeState(state);
    if (timer && next !== timerMs) {
      clearIntervalFn(timer);
      timerMs = next;
      timer = setIntervalFn(() => { void tick(); }, next);
      if (typeof timer?.unref === 'function') timer.unref();
    }
    return state;
  }

  function setIntervalMs(ms) {
    const state = snapshot();
    state.defaultIntervalMs = ms;
    if (state.lastActivityEndedAt !== null) state.nextWakeAt = state.lastActivityEndedAt + ms;
    else state.nextWakeAt = null;
    writeState(state);
    return state;
  }

  return {
    start, dispose, tick, snapshot,
    planWake, cancelWake, setNaturalEnabled, setManualEnabled, setIntervalMs, setHeartbeatMs,
  };
}

/** Best-effort activity read: an unreachable session counts as active. */
export function statusReader(controller) {
  return async (sessionId) => {
    if (typeof controller?.resolveAgent !== 'function') return 'unknown';
    try {
      const result = await controller.resolveAgent(sessionId);
      return result?.agent?.status ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };
}

/** Inject through the same notice path the social pipeline uses. */
export function createWakeDelivery(controller) {
  let disposed = false;
  return {
    async deliver({ sessionId, text, kind = 'natural' }) {
      if (disposed) throw new Error('wake delivery was disposed');
      if (typeof controller?.resolveAgent !== 'function') {
        throw new Error('sessionController.resolveAgent is unavailable');
      }
      const result = await controller.resolveAgent(sessionId);
      if (disposed) throw new Error('wake delivery was disposed');
      const agent = result?.agent;
      if (!agent) throw new Error(`cannot resolve main session: ${JSON.stringify(result?.error ?? 'unavailable')}`);
      // Only ever a fresh turn: a busy agent would get a queued prompt, which
      // is exactly the "called the second I stop" behaviour we avoid.
      if (agent.status !== 'idle') return false;
      agent.followup(Object.freeze({
        id: randomUUID(),
        role: 'user',
        content: Object.freeze([Object.freeze({ type: 'text', text })]),
        source: Object.freeze({
          kind: 'dsh-lpipe-wake',
          form: 'notice',
          summary: kind === 'manual' ? '唤醒管线 · 主动醒来' : '唤醒管线 · 自主醒来',
        }),
      }));
      return true;
    },
    dispose() { disposed = true; },
  };
}
