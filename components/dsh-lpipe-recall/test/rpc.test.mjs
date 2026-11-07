import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RECALL_RPC_ENDPOINT,
  createRecallRpcHandler,
  registerRecallRpc,
} from '../src/rpc.mjs'

const VALUES = {
  fragments: 2,
  sentencesPerFragment: 4,
  inputChars: 32000,
  backgroundChars: 16000,
  coolChars: 1000000,
}

test('recall.config 只交出五项，recall.config.save 收到的就是客户端发的那份', async () => {
  const calls = []
  const handle = createRecallRpcHandler({
    config: {
      get: () => VALUES,
      set: (patch) => {
        calls.push(patch)
        return { ...VALUES, ...patch }
      },
    },
  })

  assert.deepEqual(await handle('recall.config', {}), { ok: true, value: VALUES })
  assert.deepEqual(await handle('recall.config.save', { fragments: 5 }), {
    ok: true,
    value: { ...VALUES, fragments: 5 },
  })
  assert.deepEqual(calls, [{ fragments: 5 }])
})

test('未知方法、没接配置都返回结构化失败，不往外抛', async () => {
  const handle = createRecallRpcHandler({ config: { get: () => VALUES, set: () => VALUES } })
  const unknown = await handle('recall.config.delete', {})
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'recall/unknown-method')

  const missing = createRecallRpcHandler({})
  const unavailable = await missing('recall.config', {})
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.error.code, 'recall/unavailable')
})

test('校验错误保留 bad-request 代码，普通异常归到 recall/failed', async () => {
  const handle = createRecallRpcHandler({
    config: {
      get: () => VALUES,
      set: () => {
        const error = new Error('每轮片段需在 1–5 之间。')
        error.code = 'recall/bad-request'
        throw error
      },
    },
  })
  const rejected = await handle('recall.config.save', { fragments: 9 })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.code, 'recall/bad-request')
  assert.equal(rejected.error.message, '每轮片段需在 1–5 之间。')

  const boom = createRecallRpcHandler({
    config: {
      get: () => {
        throw new Error('读盘失败')
      },
    },
  })
  const failed = await boom('recall.config', {})
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'recall/failed')
  assert.equal(failed.error.message, '读盘失败')
})

function mount(handler) {
  let route = null
  const result = registerRecallRpc(
    { connection: { fetch: { register: (value) => { route = value; return 'registered' } } } },
    handler,
  )
  assert.equal(result, 'registered')
  return route
}

function request(body) {
  return new Request(`http://localhost/api/${RECALL_RPC_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('宿主路由把信封校验完再把方法交给 handler', async () => {
  const route = mount(createRecallRpcHandler({ config: { get: () => VALUES, set: () => VALUES } }))
  assert.equal(route.path, `/api/${RECALL_RPC_ENDPOINT}`)
  assert.deepEqual(route.methods, ['POST'])
  assert.equal(route.requestBody, 'buffered')

  const response = await route.fetch(request({
    type: 'client-request',
    rpcId: 'r1',
    method: RECALL_RPC_ENDPOINT,
    payload: { method: 'recall.config', payload: {} },
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    type: 'server-response',
    rpcId: 'r1',
    result: { ok: true, value: VALUES },
  })
})

test('信封不对、方法不是字符串、payload 缺失都变成 bad-request 结果', async () => {
  const route = mount(createRecallRpcHandler({ config: { get: () => VALUES } }))
  for (const body of [
    { type: 'server-response', rpcId: 'r2', method: RECALL_RPC_ENDPOINT, payload: { method: 'recall.config', payload: {} } },
    { type: 'client-request', rpcId: 'r2', method: 'other', payload: { method: 'recall.config', payload: {} } },
    { type: 'client-request', rpcId: 'r2', method: RECALL_RPC_ENDPOINT, payload: { method: 42, payload: {} } },
    { type: 'client-request', rpcId: 'r2', method: RECALL_RPC_ENDPOINT, payload: { method: 'recall.config' } },
  ]) {
    const response = await route.fetch(request(body))
    const reply = await response.json()
    assert.equal(reply.rpcId, 'r2')
    assert.equal(reply.result.ok, false)
    assert.equal(reply.result.error.code, 'recall/bad-request')
  }
})

test('非 POST、非 JSON、坏 JSON 在进 handler 前就被挡住', async () => {
  const route = mount(createRecallRpcHandler({ config: { get: () => VALUES } }))
  const wrongMethod = await route.fetch(new Request(`http://localhost/api/${RECALL_RPC_ENDPOINT}`, { method: 'GET' }))
  assert.equal(wrongMethod.status, 405)

  const wrongType = await route.fetch(new Request(`http://localhost/api/${RECALL_RPC_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  }))
  assert.equal(wrongType.status, 415)

  const badJson = await route.fetch(new Request(`http://localhost/api/${RECALL_RPC_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  }))
  assert.equal(badJson.status, 400)
})

test('handler 抛错也在路由里落成 server-response，不把请求打崩', async () => {
  const route = mount(async () => {
    throw new Error('handler exploded')
  })
  const response = await route.fetch(request({
    type: 'client-request',
    rpcId: 'r3',
    method: RECALL_RPC_ENDPOINT,
    payload: { method: 'recall.config', payload: {} },
  }))
  assert.equal(response.status, 200)
  const reply = await response.json()
  assert.equal(reply.rpcId, 'r3')
  assert.equal(reply.result.ok, false)
  assert.equal(reply.result.error.code, 'recall/failed')
})

test('没有 connection.fetch 时直接拒绝注册，而不是悄悄吞掉', () => {
  assert.throws(
    () => registerRecallRpc({}, async () => ({ ok: true })),
    (error) => error instanceof TypeError,
  )
})
