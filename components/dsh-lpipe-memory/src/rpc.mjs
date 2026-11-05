// 记忆管线的 RPC：只读，给设置页看大小曲线用。
export const MEMORY_RPC_ENDPOINT = 'dsh-lpipe-memory'

const METHODS = new Set(['memory.stats'])

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clampTurns(value) {
  const turns = Number(value)
  if (!Number.isFinite(turns)) return 30
  return Math.min(120, Math.max(1, Math.round(turns)))
}

export function createMemoryRpcHandler({ stats }) {
  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('memory/unknown-method', `Unknown method: ${method}`)
    try {
      if (method === 'memory.stats') {
        return { ok: true, value: stats({ turns: clampTurns(payload?.turns) }) }
      }
      return failure('memory/unknown-method', `Unknown method: ${method}`)
    } catch (error) {
      return failure('memory/failed', String(error?.message ?? error))
    }
  }
}

/** 挂在宿主自己的 /api 载体上，鉴权与来源校验由宿主先做掉。 */
export function registerMemoryRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-lpipe-memory needs the Host Connection Fetch registry')
  }
  return registry.register({
    path: `/api/${MEMORY_RPC_ENDPOINT}`,
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
        message.method !== MEMORY_RPC_ENDPOINT ||
        !isRecord(call) ||
        typeof call.method !== 'string' ||
        !Object.hasOwn(call, 'payload')
      ) {
        return Response.json({ type: 'server-response', rpcId, result: failure('memory/bad-request', 'Invalid request.') })
      }
      let result
      try {
        result = await handle(call.method, call.payload, request.signal)
      } catch (error) {
        result = failure('memory/failed', String(error?.message ?? error))
      }
      return Response.json({ type: 'server-response', rpcId, result })
    },
  })
}
