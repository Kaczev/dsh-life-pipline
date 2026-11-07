// 回忆管线的 RPC：设置页只读五项、只写五项。
export const RECALL_RPC_ENDPOINT = 'dsh-lpipe-recall'

const METHODS = new Set(['recall.config', 'recall.config.save'])

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createRecallRpcHandler({ config }) {
  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('recall/unknown-method', `Unknown method: ${method}`)
    try {
      if (method === 'recall.config') {
        return config?.get ? { ok: true, value: config.get() } : failure('recall/unavailable', 'Config is not wired up.')
      }
      if (method === 'recall.config.save') {
        if (!config?.set) return failure('recall/unavailable', 'Config is not wired up.')
        return { ok: true, value: config.set(isRecord(payload) ? payload : {}) }
      }
      return failure('recall/unknown-method', `Unknown method: ${method}`)
    } catch (error) {
      return failure(error?.code ?? 'recall/failed', String(error?.message ?? error))
    }
  }
}

/** 挂在宿主自己的 /api 载体上，鉴权与来源校验由宿主先做掉。 */
export function registerRecallRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-lpipe-recall needs the Host Connection Fetch registry')
  }
  return registry.register({
    path: `/api/${RECALL_RPC_ENDPOINT}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 })
      }
      let message
      try {
        message = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
      const call = message?.payload
      if (
        !isRecord(message) ||
        message.type !== 'client-request' ||
        typeof message.rpcId !== 'string' ||
        message.method !== RECALL_RPC_ENDPOINT ||
        !isRecord(call) ||
        typeof call.method !== 'string' ||
        !Object.hasOwn(call, 'payload')
      ) {
        return Response.json({ type: 'server-response', rpcId, result: failure('recall/bad-request', 'Invalid request.') })
      }
      let result
      try {
        result = await handle(call.method, call.payload, request.signal)
      } catch (error) {
        result = failure('recall/failed', String(error?.message ?? error))
      }
      return Response.json({ type: 'server-response', rpcId, result })
    },
  })
}
