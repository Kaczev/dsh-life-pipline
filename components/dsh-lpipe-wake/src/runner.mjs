import { randomUUID } from 'node:crypto';

import { TICK_MS, normalizeState, step } from './engine.mjs';
import { loadState, readMainSessionId, saveState } from './state.mjs';

/**
 * The only stateful piece: a 30s tick that watches the main session and writes
 * the state file. Everything it decides comes from `step()`.
 */
export function createRunner({
  statusOf,
  deliver,
  log = { info() {}, warn() {} },
  readMain = readMainSessionId,
  readState = loadState,
  writeState = saveState,
  now = () => Date.now(),
  tickMs = TICK_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let timer = null;
  let busy = false;
  let disposed = false;
  let warnedNoSession = false;
  let lastError = '';

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
      const activity = await statusOf(sessionId);
      const state = normalizeState(readState(), now());
      const result = step(state, { now: now(), status: activity });
      writeState(result.state);
      if (result.action) {
        await deliver({ sessionId, text: result.action.text });
        log.info(`[life-wake] woke the main session at ${new Date(now()).toISOString()}`);
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
    void tick();
    timer = setIntervalFn(() => { void tick(); }, tickMs);
    if (typeof timer?.unref === 'function') timer.unref();
  }

  function dispose() {
    disposed = true;
    if (timer) clearIntervalFn(timer);
    timer = null;
  }

  /** `wake_set` and the「现在唤醒一次」button land here. */
  function setNextWake(at) {
    const state = snapshot();
    state.nextWakeAt = at;
    return writeState(state);
  }

  function clearNextWake() {
    const state = snapshot();
    state.nextWakeAt = null;
    return writeState(state);
  }

  /** The on/off switch on the settings page. Off means: decide nothing. */
  function setEnabled(enabled) {
    const state = snapshot();
    state.enabled = enabled !== false;
    state.nextWakeAt = null;
    return writeState(state);
  }

  function setIntervalMs(ms) {
    const state = snapshot();
    state.defaultIntervalMs = ms;
    if (state.lastActivityEndedAt !== null) state.nextWakeAt = state.lastActivityEndedAt + ms;
    else state.nextWakeAt = null;
    return writeState(state);
  }

  return { start, dispose, tick, snapshot, setNextWake, clearNextWake, setIntervalMs, setEnabled };
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
    async deliver({ sessionId, text }) {
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
        source: Object.freeze({ kind: 'dsh-lpipe-wake', form: 'notice', summary: '唤醒管线 · 自主醒来' }),
      }));
      return true;
    },
    dispose() { disposed = true; },
  };
}
