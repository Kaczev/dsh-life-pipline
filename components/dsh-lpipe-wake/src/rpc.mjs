import { MAX_HEARTBEAT_MS, MIN_HEARTBEAT_MS, normalizeState } from './engine.mjs';
import { readMainSessionId, statePath } from './state.mjs';

export const WAKE_RPC_ENDPOINT = 'dsh-lpipe-wake';

const METHODS = new Set(['wake.status', 'wake.config.save', 'wake.now', 'wake.reset']);

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const asIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** One pure dispatcher shared by the settings page and `node --test`. */
export function createWakeRpcHandler({ runner, now = () => Date.now() }) {
  const status = () => {
    const state = normalizeState(runner.snapshot(), now());
    return {
      enabled: state.enabled !== false,
      defaultIntervalMs: state.defaultIntervalMs,
      heartbeatMs: state.heartbeatMs,
      lastActivityEndedAt: asIso(state.lastActivityEndedAt),
      nextWakeAt: asIso(state.nextWakeAt),
      nextWakeSource: state.nextWakeSource,
      lastSeenAt: asIso(state.lastSeenAt),
      lastWokeAt: asIso(state.lastWokeAt),
      mainSessionId: readMainSessionId(),
      statePath: statePath(),
      now: asIso(now()),
    };
  };

  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('wake/unknown-method', `Unknown method: ${method}`);
    const input = isRecord(payload) ? payload : {};

    if (method === 'wake.status') return { ok: true, value: status() };

    if (method === 'wake.config.save') {
      let touched = false;
      if (Object.hasOwn(input, 'enabled')) {
        runner.setEnabled(input.enabled !== false);
        touched = true;
      }
      if (Object.hasOwn(input, 'defaultIntervalMs')) {
        const ms = Number(input.defaultIntervalMs);
        if (!Number.isFinite(ms) || ms < 60_000 || ms > 24 * 60 * 60 * 1000) {
          return failure('wake/bad-request', '默认间隔必须在 1 分钟到 24 小时之间。');
        }
        runner.setIntervalMs(Math.round(ms));
        touched = true;
      }
      if (Object.hasOwn(input, 'heartbeatMs')) {
        const ms = Number(input.heartbeatMs);
        if (!Number.isFinite(ms) || ms < MIN_HEARTBEAT_MS || ms > MAX_HEARTBEAT_MS) {
          return failure('wake/bad-request', '心跳间隔必须在 1 秒到 60 分钟之间。');
        }
        runner.setHeartbeatMs(Math.round(ms));
        touched = true;
      }
      if (!touched) return failure('wake/bad-request', '没有可保存的字段。');
      return { ok: true, value: status() };
    }

    if (method === 'wake.now') {
      runner.setNextWake(now());
      await runner.tick();
      return { ok: true, value: status() };
    }

    // wake.reset: forget the manual deadline and let the formula decide again.
    runner.clearNextWake();
    await runner.tick();
    return { ok: true, value: status() };
  };
}

/** Serve the page over the Host's `/api` carrier, like every lpipe component. */
export function registerWakeRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch;
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-lpipe-wake needs the Host Connection Fetch registry');
  }
  return registry.register({
    path: `/api/${WAKE_RPC_ENDPOINT}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let message;
      try {
        message = await request.json();
      } catch {
        return new Response('body is not JSON', { status: 400 });
      }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request';
      const call = message?.payload;
      if (!isRecord(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string'
        || message.method !== WAKE_RPC_ENDPOINT || !isRecord(call) || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')) {
        return Response.json({ type: 'server-response', rpcId, result: failure('wake/bad-request', 'Invalid request.') });
      }
      let result;
      try {
        result = await handle(call.method, call.payload, request.signal);
      } catch (error) {
        result = failure('wake/failed', String(error?.message ?? error));
      }
      return Response.json({ type: 'server-response', rpcId, result });
    },
  });
}
