// 星图的 RPC：只读查询，给设置页和以后的读取层用。
export const STARMAP_RPC_ENDPOINT = 'dsh-lpipe-starmap'

const METHODS = new Set([
  'starmap.progress',
  'starmap.star',
  'starmap.turn',
  'starmap.links',
  'starmap.rebuild',
  'starmap.pause',
  'starmap.config',
  'starmap.config.set',
  'starmap.catalog',
  'starmap.efforts',
])

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const clamp = (value, fallback, max) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(1, Math.round(number)))
}

export function createStarmapRpcHandler({ queries, rebuild, config, catalog, efforts, pause }) {
  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('starmap/unknown-method', `Unknown method: ${method}`)
    try {
      if (method === 'starmap.progress') return { ok: true, value: queries.progress() }
      if (method === 'starmap.config') {
        return config?.get ? { ok: true, value: config.get() } : failure('starmap/unavailable', 'Config is not wired up.')
      }
      if (method === 'starmap.config.set') {
        if (!config?.set) return failure('starmap/unavailable', 'Config is not wired up.')
        return { ok: true, value: config.set(isRecord(payload) ? payload : {}) }
      }
      if (method === 'starmap.pause') {
        if (typeof pause !== 'function') return failure('starmap/unavailable', 'Pause is not wired up.')
        return { ok: true, value: pause() }
      }
      if (method === 'starmap.rebuild') {
        if (typeof rebuild !== 'function') return failure('starmap/unavailable', 'Rebuild is not wired up.')
        return { ok: true, value: await rebuild({ full: payload?.full === true }) }
      }
      if (method === 'starmap.catalog') {
        if (typeof catalog !== 'function') return failure('starmap/unavailable', 'Catalog is not wired up.')
        return { ok: true, value: await catalog() }
      }
      if (method === 'starmap.efforts') {
        if (typeof efforts !== 'function') return failure('starmap/unavailable', 'Efforts are not wired up.')
        return { ok: true, value: await efforts(payload?.provider ?? '', payload?.model ?? '') }
      }
      if (method === 'starmap.star') {
        const value = queries.star(payload?.id ?? payload?.name, { limit: clamp(payload?.limit, 80, 500) })
        return value ? { ok: true, value } : failure('starmap/no-such-star', 'No star with that id or name.')
      }
      if (method === 'starmap.turn') {
        const value = queries.turn(payload?.key ?? { session: payload?.session, turn: payload?.turn })
        return value ? { ok: true, value } : failure('starmap/no-such-turn', 'That turn has not been built yet.')
      }
      if (method === 'starmap.links') {
        const value = queries.links(payload?.id ?? payload?.name, {
          min: Number(payload?.min) || 0,
          limit: clamp(payload?.limit, 24, 100),
        })
        return value ? { ok: true, value } : failure('starmap/no-such-star', 'No star with that id or name.')
      }
      return failure('starmap/unknown-method', `Unknown method: ${method}`)
    } catch (error) {
      return failure('starmap/failed', String(error?.message ?? error))
    }
  }
}

/** 挂在宿主自己的 /api 载体上，鉴权与来源校验由宿主先做掉。 */
export function registerStarmapRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-lpipe-starmap needs the Host Connection Fetch registry')
  }
  return registry.register({
    path: `/api/${STARMAP_RPC_ENDPOINT}`,
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
        message.method !== STARMAP_RPC_ENDPOINT ||
        !isRecord(call) ||
        typeof call.method !== 'string' ||
        !Object.hasOwn(call, 'payload')
      ) {
        return Response.json({ type: 'server-response', rpcId, result: failure('starmap/bad-request', 'Invalid request.') })
      }
      let result
      try {
        result = await handle(call.method, call.payload, request.signal)
      } catch (error) {
        result = failure('starmap/failed', String(error?.message ?? error))
      }
      return Response.json({ type: 'server-response', rpcId, result })
    },
  })
}
