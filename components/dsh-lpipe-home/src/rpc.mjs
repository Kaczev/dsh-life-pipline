export const HOME_RPC_ENDPOINT = 'dsh-lpipe-home';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } });
export function createHomeRpcHandler({ snapshot, save, validate }) {
  return async (method, payload) => {
    try {
      if (method === 'home.config') return { ok: true, value: snapshot() };
      if (method === 'home.config.save') { save(payload); return { ok: true, value: snapshot() }; }
      if (method === 'home.validate') return { ok: true, value: validate(payload) };
      return failure('home/unknown-method', 'Unknown method.');
    } catch (error) { return failure('home/failed', String(error?.message ?? error)); }
  };
}
export function registerHomeRpc(ctx, handle) {
  return ctx.connection.fetch.register({
    path: `/api/${HOME_RPC_ENDPOINT}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return new Response('content type must be application/json', { status: 415 });
      let message;
      try { message = await request.json(); } catch { return new Response('body is not JSON', { status: 400 }); }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request';
      const call = message?.payload;
      if (!record(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.method !== HOME_RPC_ENDPOINT || !record(call) || typeof call.method !== 'string' || !Object.hasOwn(call, 'payload')) return Response.json({ type: 'server-response', rpcId, result: failure('home/bad-request', 'Invalid request.') });
      return Response.json({ type: 'server-response', rpcId, result: await handle(call.method, call.payload) });
    },
  });
}
