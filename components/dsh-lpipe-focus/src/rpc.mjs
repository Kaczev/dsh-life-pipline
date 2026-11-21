import { DEFAULT_CONFIG, FocusConfigError } from './config.mjs';

export const FOCUS_RPC_ENDPOINT = 'dsh-lpipe-focus';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = (code, message, details = {}) => ({ ok: false, error: { code, message, details } });

export function createFocusRpcHandler({ load, save }) {
  return async (method, payload) => {
    try {
      if (method === 'focus.config') {
        if (payload !== undefined && (!isRecord(payload) || Object.keys(payload).length > 0)) {
          return failure('focus/bad-request', 'focus.config accepts only an empty payload.');
        }
        return { ok: true, value: { config: load(), defaults: { ...DEFAULT_CONFIG } } };
      }
      if (method === 'focus.config.save') {
        return { ok: true, value: { config: save(payload) } };
      }
      return failure('focus/unknown-method', 'Unknown method.');
    } catch (error) {
      if (error instanceof FocusConfigError) {
        return failure(error.code || 'focus/failed', error.message, error.details ?? {});
      }
      return failure('focus/failed', String(error?.message ?? error));
    }
  };
}

export function registerFocusRpc(ctx, handle) {
  return ctx.connection.fetch.register({
    path: `/api/${FOCUS_RPC_ENDPOINT}`,
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
      if (
        !isRecord(message)
        || message.type !== 'client-request'
        || typeof message.rpcId !== 'string'
        || message.method !== FOCUS_RPC_ENDPOINT
        || !isRecord(call)
        || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')
      ) {
        return Response.json({ type: 'server-response', rpcId, result: failure('focus/bad-request', 'Invalid request.') });
      }
      return Response.json({ type: 'server-response', rpcId, result: await handle(call.method, call.payload) });
    },
  });
}
