import { readSessionTitle } from './session-title.mjs';

export const PIPELINE_RPC_ENDPOINT = 'dsh-life-pipline';

const METHODS = new Set([
  'pipeline.status',
  'pipeline.config.save',
  'pipeline.session.title',
]);

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One pure dispatcher: the settings page and `node --test` share it. */
export function createPipelineRpcHandler({ getConfig, update, sessions }) {
  const status = () => {
    const config = getConfig();
    const mainSessionId = String(config.mainSessionId ?? '');
    return {
      mainSessionId,
      session: readSessionTitle(sessions, mainSessionId),
      configPath: '',
    };
  };

  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('pipeline/unknown-method', `Unknown method: ${method}`);
    const input = isRecord(payload) ? payload : {};

    if (method === 'pipeline.status') return { ok: true, value: status() };

    if (method === 'pipeline.session.title') {
      return { ok: true, value: readSessionTitle(sessions, input.sessionId) };
    }

    if (!Object.hasOwn(input, 'mainSessionId')) {
      return failure('pipeline/bad-request', '没有可保存的字段。');
    }
    update((current) => ({ ...current, mainSessionId: String(input.mainSessionId ?? '').trim() }));
    return { ok: true, value: status() };
  };
}

/**
 * Serve the page over the Host's own `/api` carrier. Browser auth and
 * Host/Origin trust are applied by the Host before this handler runs.
 */
export function registerPipelineRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch;
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-life-pipline needs the Host Connection Fetch registry');
  }
  return registry.register({
    path: `/api/${PIPELINE_RPC_ENDPOINT}`,
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
        || message.method !== PIPELINE_RPC_ENDPOINT || !isRecord(call) || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')) {
        return Response.json({ type: 'server-response', rpcId, result: failure('pipeline/bad-request', 'Invalid request.') });
      }
      let result;
      try {
        result = await handle(call.method, call.payload, request.signal);
      } catch (error) {
        result = failure('pipeline/failed', String(error?.message ?? error));
      }
      return Response.json({ type: 'server-response', rpcId, result });
    },
  });
}
