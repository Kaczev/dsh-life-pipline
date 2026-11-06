import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { canExtract, routeOf } from '../src/config.mjs'

import { RULES_VERSION, buildTurn } from '../src/build.mjs'
import { apply } from '../src/index.js'
import { createQueries } from '../src/query.mjs'
import { openRepo, starIdOf } from '../src/store.mjs'
import { dayOf, sourceFile, starsFile, stateFile } from '../src/paths.mjs'

function makeTurn({ turn, at, rows }) {
  return { turn, at, from: rows[0].seq, to: rows[rows.length - 1].seq, rows }
}

const queriesOf = (repo, at) =>
  createQueries({ repo, memoryStatus: () => ({ turns: 9, sessions: [], lastBuiltAt: at, lastTurn: 9 }) })

test('一轮落进星图：星表、星源、水位三样都写', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:00:00+08:00')
  const rows = [
    { seq: 0, turn: 1, at, kind: 'user/message', text: '记忆管线和唤醒管线一起工作。' },
    { seq: 1, turn: 1, at, kind: 'assistant/message', text: '好的。' },
    { seq: 2, turn: 1, at, kind: 'tool/call', name: 'wake_set' },
  ]
  // 模型只回答「哪两个概念一起出现过」：名字必须原样出现在原文里。
  const pairs = [['记忆管线', '唤醒管线'], ['记忆管线', 'wake_set']]
  buildTurn({ repo, turn: makeTurn({ turn: 1, at, rows }), sessionId: 'sess-a', pairs })

  const stars = readFileSync(starsFile(root), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(stars.map((star) => star.name).sort(), ['wake_set', '唤醒管线', '记忆管线'])
  assert.equal(stars.find((star) => star.name === '记忆管线').id, starIdOf('记忆管线'))

  const file = sourceFile(root, 'sess-a', dayOf(at))
  assert.ok(existsSync(file))
  const record = JSON.parse(readFileSync(file, 'utf8').trim())
  assert.equal(record.turn, 1)
  assert.equal(record.from, 0)
  assert.equal(record.to, 2)
  assert.equal(record.lines.find((line) => line.seq === 2).stars.length, 1, '工具调用自成一句')
  assert.equal(record.pairs.length, 2)

  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'))
  assert.deepEqual(state.built['sess-a'], { turn: 1, to: 2 })
})

test('同句 1、相邻句 0.5、隔开就只能算整轮 0.5', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:10:00+08:00')
  const rows = [
    { seq: 0, turn: 2, at, kind: 'user/message', text: '记忆管线和唤醒管线是一对。' },
    { seq: 1, turn: 2, at, kind: 'assistant/message', text: '记忆管线先落盘。然后星图再抽星。' },
  ]
  const pairs = [['记忆管线', '唤醒管线'], ['记忆管线', '星图']]
  buildTurn({ repo, turn: makeTurn({ turn: 2, at, rows }), sessionId: 'sess-b', pairs })

  const links = queriesOf(repo, at).links('记忆管线')
  assert.equal(links.links.find((entry) => entry.star.name === '唤醒管线').weight, 1, '同句相连得重')
  assert.equal(links.links.find((entry) => entry.star.name === '星图').weight, 0.5, '相邻句相连得轻')
})

test('两句之间隔着别的话：模型说它们一起出现过，也只记整轮 0.5', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:15:00+08:00')
  const rows = [{ seq: 0, turn: 3, at, kind: 'user/message', text: '记忆管线先落盘。中间还插了一句闲话。星图再抽星。' }]
  buildTurn({ repo, turn: makeTurn({ turn: 3, at, rows }), sessionId: 'sess-h', pairs: [['记忆管线', '星图']] })
  const links = queriesOf(repo, at).links('记忆管线')
  assert.equal(links.links[0].star.name, '星图')
  assert.equal(links.links[0].weight, 0.5)
})

test('模型给的名字在原文里找不到：丢弃，不成星', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:18:00+08:00')
  const rows = [{ seq: 0, turn: 4, at, kind: 'user/message', text: '记忆管线先落盘。' }]
  const { rejects } = buildTurn({
    repo,
    turn: makeTurn({ turn: 4, at, rows }),
    sessionId: 'sess-i',
    pairs: [['记忆管线', '星图'], ['记忆管线', '记忆管线']],
  })
  assert.equal(repo.byName.has('星图'), false, '没在原文里出现的名字不成星')
  assert.equal(repo.byName.size, 0, '整对都对不上的话，这一对什么都不点亮')
  assert.equal(rejects.length, 2)
  assert.equal(rejects.find((entry) => entry.why === 'one-missing').missing, '星图')
})

test('查询：星星出现在哪些轮、某一轮有哪几颗星', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:20:00+08:00')
  for (const turn of [5, 6]) {
    const rows = [{ seq: turn, turn, at: at + turn, kind: 'user/message', text: '记忆管线又出现了，星图也在。' }]
    buildTurn({ repo, turn: makeTurn({ turn, at: at + turn, rows }), sessionId: 'sess-c', pairs: [['记忆管线', '星图']] })
  }
  const queries = queriesOf(repo, at)
  const star = queries.star('记忆管线')
  assert.equal(star.total, 2)
  assert.deepEqual(star.turns.map((entry) => entry.turn), [6, 5])

  const turn = queries.turn({ session: 'sess-c', turn: 5 })
  assert.equal(turn.turn, 5)
  assert.equal(turn.stars.length, 2)
  assert.equal(turn.pairs, 1)
})

test('重启后从磁盘恢复：水位、星表、星源都还在', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const at = Date.parse('2026-11-06T12:30:00+08:00')
  const rows = [{ seq: 0, turn: 7, at, kind: 'user/message', text: '星图从磁盘回来。' }]
  const writer = openRepo({ root })
  buildTurn({ repo: writer, turn: makeTurn({ turn: 7, at, rows }), sessionId: 'sess-d', pairs: [['星图', '磁盘']] })

  const repo = openRepo({ root })
  assert.deepEqual(repo.state.built['sess-d'], { turn: 7, to: 0 })
  assert.ok(repo.stars.size > 0)
  assert.ok(repo.turns.has('sess-d#7'))
  assert.deepEqual(repo.turns.get('sess-d#7').pairs, [[starIdOf('星图'), starIdOf('磁盘')]])
})

test('starmap.rebuild 与配置读写走得通，没接上如实说', async () => {
  const { createStarmapRpcHandler } = await import('../src/rpc.mjs')
  const queries = { progress: () => ({ built: 3, turns: 5, grey: 2 }) }
  const config = { get: () => ({ provider: 'p', model: 'm' }), set: (patch) => ({ provider: 'p', model: 'm', ...patch }) }
  const handler = createStarmapRpcHandler({ queries, rebuild: () => ({ built: 5 }), config })

  assert.equal((await handler('starmap.rebuild', {})).value.built, 5)
  assert.equal((await handler('starmap.config', {})).value.model, 'm')
  assert.equal((await handler('starmap.config.set', { model: 'x' })).value.model, 'x')

  const without = createStarmapRpcHandler({ queries })
  assert.equal((await without('starmap.rebuild', {})).error.code, 'starmap/unavailable')
  assert.equal((await without('starmap.config', {})).error.code, 'starmap/unavailable')
})

test('starmap.debug 把内部标志和运行日志尾巴一起交出来', async () => {
  const { createStarmapRpcHandler } = await import('../src/rpc.mjs')
  const queries = { progress: () => ({ built: 1, turns: 2, grey: 1 }) }
  const handler = createStarmapRpcHandler({
    queries,
    debug: () => ({ running: false, stopping: false, jobActive: false, pausedByUser: true, lanes: { active: 0, total: 5 }, tail: [{ event: 'pause' }] }),
  })
  const reply = await handler('starmap.debug', {})
  assert.equal(reply.ok, true)
  assert.equal(reply.value.pausedByUser, true)
  assert.equal(reply.value.lanes.total, 5)
  assert.equal(reply.value.tail.at(-1).event, 'pause')
  assert.equal(reply.value.progress.grey, 1)
})

test('界面上点「现在抽星」走的是手动开始，能解除暂停', async () => {
  const { createStarmapRpcHandler } = await import('../src/rpc.mjs')
  const queries = { progress: () => ({ built: 0, turns: 0, grey: 0 }) }
  let seen = null
  const handler = createStarmapRpcHandler({
    queries,
    rebuild: (options) => {
      seen = options
      return { started: true }
    },
  })
  const reply = await handler('starmap.rebuild', {})
  assert.equal(reply.ok, true)
  assert.equal(seen.manual, true, '手动开始才算解除暂停')
  assert.equal(seen.background, true, '不等整库跑完就回话')
})

test('设置页从宿主读提供者、模型和思考强度', async () => {
  const { createStarmapRpcHandler } = await import('../src/rpc.mjs')
  const queries = { progress: () => ({ built: 0, turns: 0, grey: 0 }) }
  const handler = createStarmapRpcHandler({
    queries,
    catalog: async () => ({ providers: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] }] }),
    efforts: async (provider, model) => ({ efforts: provider === 'deepseek' && model === 'deepseek-chat' ? [{ id: 'low', name: '低' }] : [], defaultEffort: null }),
  })

  const catalog = await handler('starmap.catalog', {})
  assert.equal(catalog.value.providers[0].models[0].id, 'deepseek-chat')
  assert.equal((await handler('starmap.efforts', { provider: 'deepseek', model: 'deepseek-chat' })).value.efforts[0].id, 'low')
  assert.deepEqual((await handler('starmap.efforts', { provider: 'deepseek', model: 'nope' })).value.efforts, [])
  assert.equal((await handler('starmap.catalog', {})).ok, true)

  const without = createStarmapRpcHandler({ queries })
  assert.equal((await without('starmap.catalog', {})).error.code, 'starmap/unavailable')
  assert.equal((await without('starmap.efforts', {})).error.code, 'starmap/unavailable')
})

test('水位丢了：星源还在就能自己长回来', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const at = Date.parse('2026-11-06T12:40:00+08:00')
  const rows = [{ seq: 0, turn: 8, at, kind: 'user/message', text: '星图要自己长回水位。' }]
  buildTurn({ repo: openRepo({ root }), turn: makeTurn({ turn: 8, at, rows }), sessionId: 'sess-e', pairs: [['星图', '水位']] })

  writeFileSync(stateFile(root), `${JSON.stringify({ version: 1, built: {} })}\n`, 'utf8')
  const repo = openRepo({ root })
  assert.deepEqual(repo.state.built['sess-e'], { turn: 8, to: 0 }, '加载时应从星源补回水位')
})

test('抬水位不冲掉别的会话', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  repo.raiseWatermark('sess-new', 3, 9, 0)

  // 另一个进程写进来的会话：本进程内存里没有它，抬水位时必须先合进来。
  writeFileSync(stateFile(root), `${JSON.stringify({ version: 1, built: { 'sess-old': { turn: 40, to: 100 } } })}\n`, 'utf8')
  repo.raiseWatermark('sess-new', 4, 12, 0)

  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'))
  assert.deepEqual(state.built['sess-old'], { turn: 40, to: 100 })
  assert.deepEqual(state.built['sess-new'], { turn: 4, to: 12 })
})

test('重复的星星行，加载时收成一份', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const at = Date.parse('2026-11-06T12:50:00+08:00')
  const rows = [{ seq: 0, turn: 9, at, kind: 'user/message', text: '记忆管线里重复的星星要收掉。' }]
  const writer = openRepo({ root })
  buildTurn({ repo: writer, turn: makeTurn({ turn: 9, at, rows }), sessionId: 'sess-f', pairs: [['记忆管线', '星星']] })

  const first = readFileSync(starsFile(root), 'utf8').trim().split('\n')[0]
  appendFileSync(starsFile(root), `${first}\n`, 'utf8')
  assert.equal(readFileSync(starsFile(root), 'utf8').trim().split('\n').length, 3)

  const repo = openRepo({ root })
  assert.equal(readFileSync(starsFile(root), 'utf8').trim().split('\n').length, 2, '重复的那行应当在加载时被收掉')
  assert.equal(repo.stars.size, 2)
})

test('星图记得自己是按哪一版抽星规则建的', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-rules-'))
  const repo = openRepo({ root })
  assert.equal(repo.state.rules, undefined, 'a brand new map has no rules version yet')
  assert.equal(repo.setRules(RULES_VERSION), true, 'the first run records it')
  assert.equal(repo.setRules(RULES_VERSION), false, 'recording the same version is a no-op')

  const again = openRepo({ root })
  assert.equal(again.state.rules, RULES_VERSION, 'the version survives a restart')
})

test('启动补做写日志时保留 logger 的 this', async () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-log-'))
  const calls = []
  function logger() {
    return {
      info: (message) => calls.push(message),
      warn: (message) => calls.push(message),
    }
  }
  for (const level of ['info', 'warn']) {
    logger[level] = function (...args) {
      if (typeof this !== 'function') throw new TypeError('this is not a function')
      return this()[level](...args)
    }
  }
  const ctx = {
    logger,
    inject() {},
    effect() {},
  }
  apply(ctx, {
    root,
    llm: {},
    warmDelay: 0,
    reader: { sessions: () => [] },
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(calls.length, 1)
  assert.match(calls[0], /抽星模型没配全/)
})

test('抽星规则升级后，旧星表整库作废、记忆全部退回灰色', async () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-rules-'))
  const at = Date.parse('2026-11-06T12:40:00+08:00')
  const repo = openRepo({ root })
  const rows = [{ seq: 0, turn: 3, at, kind: 'user/message', text: '记忆管线的星表要作废旧星星。' }]
  buildTurn({ repo, turn: makeTurn({ turn: 3, at, rows }), sessionId: 'sess-r', pairs: [['记忆管线', '星表']] })
  repo.setMemoryFormat(2)
  repo.setRules(RULES_VERSION - 1)
  assert.ok(repo.stars.size > 0, '先造一批按旧规则切出来的星')

  const ctx = { logger: { info() {}, warn() {} }, inject() {}, effect() {} }
  apply(ctx, { root, llm: {}, warmDelay: 0, reader: { sessions: () => [], reload() {} } })
  await new Promise((resolve) => setTimeout(resolve, 40))

  const after = openRepo({ root })
  assert.equal(after.stars.size, 0, '规则变了，旧星星一颗都不留')
  assert.equal(after.turns.size, 0, '星源也清空，所有轮次重新变灰')
  assert.equal(after.state.rules, RULES_VERSION)
  assert.deepEqual(after.state.built ?? {}, {})
})

test('没有思考强度可选的模型：强度留空也能抽星，有强度时不选就不抽', () => {
  assert.equal(canExtract({ provider: 'p', model: 'm', reasoningEffort: '', effortFree: true }), true)
  assert.equal(canExtract({ provider: 'p', model: 'm', reasoningEffort: '', effortFree: false }), false)
  assert.equal(canExtract({ provider: 'p', model: 'm', reasoningEffort: 'low' }), true)
  assert.equal(canExtract({ provider: 'p', model: '', reasoningEffort: 'low' }), false)

  assert.deepEqual(routeOf({ provider: 'p', model: 'm' }), { provider: 'p', model: 'm' })
  assert.deepEqual(routeOf({ provider: 'p', model: 'm', reasoningEffort: 'low' }), { provider: 'p', model: 'm', reasoningEffort: 'low' })
})

test('思考强度从宿主的 resolveModelInfo 读：只有适配器同名方法时不该退回兜底', async () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-efforts-'))
  const seen = []
  const llm = {
    // 宿主服务上只有 resolveModelInfo；故意不提供 resolveModel，模拟真实接口。
    async resolveModelInfo(provider, model) {
      seen.push(`${provider}/${model}`)
      return {
        provider,
        id: model,
        name: model,
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Xhigh' },
            { id: 'max', name: 'Max' },
          ],
          defaultEffort: 'medium',
        },
      }
    },
    listProviders: () => [{ id: 'four-router', name: 'Four Router' }],
    async listModels() {
      return [{ id: 'gpt-6-luna', name: '4R-GPT-6-Luna' }]
    },
  }
  const bridge = {}
  const ctx = {
    logger: { info() {}, warn() {} },
    inject(names, run) {
      const inner = {
        connection: { fetch: { register: (entry) => { bridge.entry = entry; return () => {} } } },
        llm,
        on() {},
        sessions: { on() {} },
      }
      run(inner)
      return undefined
    },
    effect() {},
  }
  apply(ctx, { root, llm, warmDelay: 0, noWarm: true, reader: { sessions: () => [], reload() {}, state: { version: 2 } } })
  await new Promise((resolve) => setTimeout(resolve, 30))

  const response = await bridge.entry.fetch(new Request('http://local/api/dsh-lpipe-starmap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'probe-1',
      method: 'dsh-lpipe-starmap',
      payload: { method: 'starmap.efforts', payload: { provider: 'four-router', model: 'gpt-6-luna' } },
    }),
  }))
  const { result: reply } = await response.json()
  assert.equal(reply.ok, true)
  assert.deepEqual(reply.value.efforts.map((entry) => entry.id), ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(reply.value.defaultEffort, 'medium')
  assert.deepEqual(seen, ['four-router/gpt-6-luna'])
})

test('进度里带着「还有几路在跑」，暂停之后能看着它一路减少', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const lanes = { active: 2, total: 3 }
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 9, sessions: [], lastBuiltAt: null, lastTurn: 9 }),
    progressState: { running: true, stopping: true, done: 4, total: 9, failed: 0, error: '', lanes },
  })
  const before = queries.progress().extract
  assert.equal(before.running, true)
  assert.equal(before.stopping, true)
  assert.deepEqual(before.lanes, { active: 2, total: 3 })
  lanes.active = 1
  assert.equal(queries.progress().extract.lanes.active, 1)
})

test('模糊星：时间是时间、数字是数字，写进星表时带形态与数值', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-fuzzy-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:00:00+08:00')
  const rows = [
    { seq: 0, turn: 1, at, kind: 'user/message', text: '现在是 20:44，雪糕真好吃。' },
    { seq: 1, turn: 1, at, kind: 'user/message', text: '温度 648.5 度。' },
    { seq: 2, turn: 1, at, kind: 'user/message', text: '图11-47 和 q_1 不算数值。' },
  ]
  buildTurn({ repo, turn: makeTurn({ turn: 1, at, rows }), sessionId: 'sess-f', pairs: [] })

  const stars = readFileSync(starsFile(root), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const clock = stars.find((star) => star.name === '20:44')
  assert.equal(clock.kind, 'fuzzy')
  assert.equal(clock.form, 'time')
  assert.equal(clock.value, 1244)

  const number = stars.find((star) => star.name === '648.5')
  assert.equal(number.kind, 'fuzzy')
  assert.equal(number.form, 'number')
  assert.equal(number.value, 648.5)

  assert.ok(!stars.some((star) => star.name === '11'), '图11-47 里的 11 不是数值')
  assert.ok(!stars.some((star) => star.name === '47'), '图11-47 里的 47 不是数值')

  // 模糊星挂在出现它的那一句上，不需要模型配对。
  const record = JSON.parse(readFileSync(sourceFile(root, 'sess-f', dayOf(at)), 'utf8').trim())
  const first = record.lines.find((line) => line.seq === 0)
  assert.ok(first.stars.includes(starIdOf('20:44')))
})

test('starmap.near：差两分钟、差一点点都能认出来，差一个量级就认不出', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-near-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:00:00+08:00')
  const rows = [
    { seq: 0, turn: 1, at, kind: 'user/message', text: '我在 20:44 吃雪糕，温度 648.5 度。' },
    { seq: 1, turn: 1, at, kind: 'user/message', text: '另一天是 09:15，温度 1000 度。' },
  ]
  buildTurn({ repo, turn: makeTurn({ turn: 1, at, rows }), sessionId: 'sess-n', pairs: [] })

  const queries = createQueries({ repo, memoryStatus: () => ({ turns: 1, sessions: [], lastBuiltAt: at, lastTurn: 1 }) })

  const clock = queries.near({ form: 'time', value: '20:46' })
  assert.equal(clock.stars[0].star.name, '20:44')
  assert.ok(clock.stars[0].score > 0.9)
  assert.equal(clock.stars.length, 1, '九点一刻离二十点四十四太远')

  const number = queries.near({ form: 'number', value: 648 })
  assert.equal(number.stars[0].star.name, '648.5')
  assert.ok(number.stars[0].score > 0.99)
  // 1000 与 648 只差 1.5 倍，还能沾一点边，但明显排在 648.5 后面。
  const thousand = number.stars.find((entry) => entry.star.name === '1000')
  assert.ok(thousand && thousand.score < 0.75 && thousand.score < number.stars[0].score)

  const progress = queries.progress()
  assert.equal(progress.fuzzy, 4, '20:44、09:15、648.5、1000')
  assert.equal(progress.exact, 0)
})


test('模糊星只从交流记忆里抽：工具输出里的数字不算时间感', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-fuzzy-chat-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T12:00:00+08:00')
  const rows = [
    { seq: 0, turn: 1, at, kind: 'user/message', text: '我 20:44 到的，温度 648.5 度。' },
    {
      seq: 1,
      turn: 1,
      at,
      kind: 'tool/call',
      name: 'chat_send',
      arguments: JSON.stringify({ channel: 'weixin', text: '今晚 23:30 睡，别熬到 2 点。' }),
    },
    { seq: 2, turn: 1, at, kind: 'tool/result', text: '已通过微信发出 21 字节，耗时 312 毫秒，版本 0.7.0。' },
    { seq: 3, turn: 1, at, kind: 'tool/call', name: 'ops_read_files' },
    { seq: 4, turn: 1, at, kind: 'tool/result', text: '文件里写着 2026-11-06 20:44 有 541 行。' },
  ]
  buildTurn({ repo, turn: makeTurn({ turn: 1, at, rows }), sessionId: 'sess-c', pairs: [] })

  const stars = readFileSync(starsFile(root), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const names = stars.filter((star) => star.kind === 'fuzzy').map((star) => star.name).sort()
  assert.deepEqual(names, ['02:00', '20:44', '23:30', '648.5'], '只有用户消息和发出去的话里的时间与数字成星（「熬到 2 点」也认）')

  for (const junk of ['312', '21', '541', '0.7', '2026']) {
    assert.ok(!stars.some((star) => star.name === junk), `工具输出里的 ${junk} 不该成星`)
  }
})

