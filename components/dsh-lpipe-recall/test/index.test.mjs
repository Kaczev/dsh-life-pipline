import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMON_SHARE, keysInSession, activityTextOf, charsOf, commonStars, createTriggerHandler, isNaturalWake, matchTextOf, keysInContext, recentText, textOfEvent, triggerFromMessages, triggerOf } from '../src/index.js'

test('近窗原文：从末尾往前收够字数，顺序照旧', () => {
  const said = (seq, text) => ({ seq, kind: 'user/message', source: { kind: 'user' }, text })
  const rows = [
    said(0, '第一段'),
    said(1, ''),
    { seq: 1.5, kind: 'tool/result', text: '工具输出不该进近窗' },
    said(2, '第二段'),
    said(3, '第三段'),
  ]
  assert.equal(recentText(rows, 100), '第一段\n工具输出不该进近窗\n第二段\n第三段')
  assert.equal(recentText(rows, 6), '第二段\n第三段', '收够字数就停，不多收')
  assert.equal(recentText([], 100), '')
})

test('通用星：出现得够密的星只值 0.2', () => {
  const turns = Array.from({ length: 100 }, (_, index) => ({ session: 's', turn: index + 1, lines: [] }))
  const many = (count) => Array.from({ length: count }, (_, index) => ({ key: `s#${index + 1}` }))
  const repo = {
    turns: new Map(turns.map((record) => [`s#${record.turn}`, record])),
    byStar: new Map([
      ['s_wide', many(6)],
      ['s_edge', many(4)],
      ['s_rare', many(1)],
    ]),
  }
  const common = commonStars(repo)
  assert.equal(COMMON_SHARE, 0.05)
  assert.equal(common.has('s_wide'), true, '6% 的片段里都出现，算通用')
  assert.equal(common.has('s_edge'), false, '4% 还没到线')
  assert.equal(common.has('s_rare'), false)
})

test('片段太少的时候不判通用星，免得把全都算成通用', () => {
  const repo = {
    turns: new Map([['s#1', { session: 's', turn: 1 }]]),
    byStar: new Map([['s_a', [{ key: 's#1' }]]]),
  }
  assert.equal(commonStars(repo).size, 0)
})


test('触发源：只看谁在说话，自然唤醒不触发回忆', () => {
  const row = (kind, source, text = '说了句话') => ({ kind, source, text })
  const rows = [
    row('user/message', { kind: 'user' }, '很早的一句'),
    row('user/message', { kind: 'time-context' }, 'Time sampled ...'),
    row('assistant/message', { kind: 'assistant' }),
    row('user/message', { kind: 'dsh-lpipe-chat' }, '微信来的消息'),
    row('user/message', { kind: 'runtime-context' }, '运行时快照'),
  ]
  const found = triggerOf(rows)
  assert.equal(found.row.text, '微信来的消息')
  assert.equal(found.skip, null)

  const natural = triggerOf([
    row('user/message', { kind: 'user' }, '我手动开的头'),
    row('user/message', { kind: 'dsh-lpipe-wake', wake: 'natural', summary: '唤醒管线 · 自主醒来' }, '（自己醒来）已经过了两小时'),
  ])
  assert.equal(natural.skip, 'natural-wake', '自然唤醒醒来时不回忆')

  const active = triggerOf([row('user/message', { kind: 'dsh-lpipe-wake', wake: 'planned', summary: '唤醒管线 · 主动醒来' }, '（主动醒来）')])
  assert.equal(active.skip, null)

  assert.equal(triggerOf([row('assistant/message', { kind: 'assistant' })]), null)
})


test('触发源来了才注入，而且只注入一条带自己来源的消息', async () => {
  const delivered = []
  const handler = createTriggerHandler({
    compose: (sessionId, text) => (text.includes('雪糕') ? `〔回忆 · 模糊〕${sessionId} 记得雪糕` : ''),
    deliver: (sessionId, block) => {
      delivered.push({ sessionId, block })
    },
  })
  const user = (seq, text, source = { kind: 'user' }) => ({
    seq,
    type: 'user/message',
    data: { text, source },
  })

  handler({ id: 's1' }, user(1, '我吃了雪糕'))
  handler({ id: 's1' }, user(1, '我吃了雪糕'))          // 同一事件重复送进来，只投一次
  handler({ id: 's1' }, user(2, '嗯'))                    // 没有回忆可给，不投
  handler({ id: 's1' }, user(3, '雪糕', { kind: 'dsh-lpipe-wake', wake: 'natural', summary: '唤醒管线 · 自主醒来' }))
  handler({ id: 's1' }, user(4, '雪糕', { kind: 'time-context' }))
  handler({ id: 's1' }, { seq: 5, type: 'assistant/message', data: { text: '雪糕' } })

  await Promise.resolve()
  assert.equal(delivered.length, 1)
  assert.deepEqual(delivered[0], { sessionId: 's1', block: '〔回忆 · 模糊〕s1 记得雪糕' })
})


test('点亮星星用的是 32K 里所有触发源，不只是最新一条', () => {
  const row = (kind, source, text) => ({ kind, source, text })
  const rows = [
    row('user/message', { kind: 'user' }, '最早的我自己打字'),
    row('user/message', { kind: 'time-context' }, 'Time sampled while preparing turn 1'),
    row('assistant/message', { kind: 'assistant' }, '我的回复不算触发源'),
    row('tool/result', { kind: 'tool' }, '工具输出也不算'),
    row('user/message', { kind: 'dsh-lpipe-chat' }, '微信发来的那句'),
    row('user/message', { kind: 'dsh-lpipe-wake', wake: 'planned', summary: '唤醒管线 · 主动醒来' }, '主动醒来那句'),
    row('user/message', { kind: 'dsh-lpipe-wake', wake: 'natural', summary: '唤醒管线 · 自然醒来' }, '自己醒来那句'),
  ]
  const text = matchTextOf(rows, '现在这一句', 1000)
  assert.equal(
    text,
    '最早的我自己打字\n微信发来的那句\n主动醒来那句\n现在这一句',
    '时间戳、助手、工具、自然唤醒都不进来',
  )
  // 收够字数就从最早的那头截掉，当前这句永远在末尾
  const short = matchTextOf(rows, '现在这一句', 5)
  assert.equal(short, '现在这一句', '收够字数就从最早的那头截掉，当前这句永远在末尾')
  assert.equal(matchTextOf([], '', 100), '')
})


test('自然唤醒看结构化字段，不靠 summary 里的措辞', () => {
  const plan = { kind: 'dsh-lpipe-wake', wake: 'planned', summary: '唤醒管线 · 自主醒来' }
  const natural = { kind: 'dsh-lpipe-wake', wake: 'natural', summary: '唤醒管线 · 主动醒来' }
  assert.equal(isNaturalWake(plan), false, '字段说主动，就算措辞写着自主也算主动')
  assert.equal(isNaturalWake(natural), true)
  // 措辞一概不看：文案怎么写都不影响判断
  assert.equal(isNaturalWake({ kind: 'dsh-lpipe-wake', summary: '唤醒管线 · 自主醒来' }), false)
  assert.equal(isNaturalWake({ kind: 'dsh-lpipe-wake', summary: '唤醒管线 · 自然醒来' }), false)
  assert.equal(isNaturalWake({ kind: 'dsh-lpipe-wake' }), false, '没有字段按主动处理')
  assert.equal(isNaturalWake({ kind: 'user' }), false)
})


test('正文在 content 分片里，不在 data.text 上', () => {
  assert.equal(textOfEvent({ content: [{ type: 'text', text: '我要跟 Ksa 亲亲' }] }), '我要跟 Ksa 亲亲')
  assert.equal(textOfEvent({ text: '直接的 text 字段' }), '直接的 text 字段')
  assert.equal(
    textOfEvent({ content: [{ type: 'text', text: '前半句' }, { type: 'image' }, { type: 'text', text: '后半句' }] }),
    '前半句\n后半句',
  )
  assert.equal(textOfEvent({}), '')
  assert.equal(textOfEvent(undefined), '')
})


test('已经摆在上下文里的片段不再重复摆', () => {
  const messages = [
    { role: 'user', content: [{ type: 'text', text: '第 1 段｜lpipe_recall_id[ddb93dff:429], 10-16 15:54, 共 40 句，展示 4 句' }] },
    // 模型自己在思考里写了个 id：不算「已经摆过」
    { role: 'assistant', content: [{ type: 'text', text: '要不要打开 lpipe_recall_id[ddb93dff:430] 看看？' }] },
    // 句子粒度不算数：只认片段
    { role: 'user', content: [{ type: 'text', text: 'lpipe_recall[ddb93dff:431:2]' }] },
    // 投影成整段字符串的也要认
    { role: 'user', content: '第 2 段｜lpipe_recall_id[ddb93dff:432], 11-02 17:16' },
  ]
  const candidates = [{ key: 'ddb93dff#429' }, { key: 'ddb93dff#430' }]
  const present = keysInContext(messages.map((message) => ({ ...message, source: { kind: 'dsh-lpipe-recall' } })))
  assert.equal(present.has('ddb93dff#432'), true, '投影成字符串的 content 也要认出记号')
  assert.deepEqual(
    candidates.filter((entry) => !present.has(entry.key)).map((entry) => entry.key),
    ['ddb93dff#430'],
    '块头上的记号已经在这段上下文里，就不再摆',
  )
  assert.equal(charsOf([{ text: 'abc' }, { kind: 'tool/call', arguments: '{}' }]), 5)
})


test('二类触发源取消：思考、中途回复、工具结果都不再唤起回忆', async () => {
  const delivered = []
  const seenActivity = []
  const handler = createTriggerHandler({
    compose: () => '〔回忆 · 模糊〕找到一段',
    deliver: (sessionId, block) => delivered.push({ sessionId, block }),
    activity: (sessionId, text) => seenActivity.push(text),
  })
  const thought = (seq) => ({
    seq,
    type: 'assistant/message',
    data: { message: { content: [{ type: 'reasoning', text: '想一想' }, { type: 'text', text: '说一句' }] } },
  })
  // 二十次思考 + 二十次工具结果：一次都不该触发。
  for (let index = 1; index <= 20; index += 1) handler({ id: 's1' }, thought(index))
  for (let index = 21; index <= 40; index += 1) {
    handler({ id: 's1' }, { seq: index, type: 'tool/result', data: { text: '命令输出' } })
  }
  await Promise.resolve()
  assert.equal(delivered.length, 0, '二类触发源不该再投递回忆')
  assert.equal(seenActivity.length, 0, '也不再走 activity 回调')
})

test('工具结果也算二类触发源', () => {
  const text = activityTextOf({ type: 'tool/result', data: { text: '命令输出' } })
  assert.equal(text, '命令输出')
})


test('触发源从这一次请求的 messages 里认：step 1 时它还没进 session 事件', () => {
  const user = (text, kind = 'user', extra = {}) => ({
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind, ...extra },
  })
  // 运行时快照排在后面，但它不是触发源，要跳过
  const messages = [
    { role: 'system', content: [{ type: 'text', text: '系统提示' }] },
    user('_B1 是什么意思？'),
    user('Time sampled while preparing turn 271, step 1', 'time-context'),
    user('Current runtime context', 'runtime-context'),
  ]
  assert.deepEqual(triggerFromMessages(messages), { text: '_B1 是什么意思？' })
  assert.deepEqual(triggerFromMessages([user('醒了', 'dsh-lpipe-wake', { wake: 'natural' })]), {
    skip: 'natural-wake',
  })
  assert.equal(triggerFromMessages([user('随便说点', 'runtime-context')]), null)
  assert.equal(triggerFromMessages([]), null)
})




test('从会话事件里认已经摆过的片段，被 rewind 掉的不算', () => {
  const recall = (seq, turn) => ({
    seq,
    type: 'user/message',
    data: {
      content: [{ type: 'text', text: `第 1 段｜lpipe_recall_id[warehouse-a:${turn}], 11-02 17:11, 共 4 句，展示 2 句` }],
      source: { kind: 'dsh-lpipe-recall' },
    },
  })
  const session = {
    snapshotEvents: () => [
      { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: '我说的话' }], source: { kind: 'user' } } },
      recall(5, 429),
      recall(9, 430),
      recall(12, 431),
    ],
    // 9 被 rewind/压缩掉了：模型看不见，也就不算摆过
    surface: { nodes: [1, 5, 12] },
  }
  const present = keysInSession(session)
  assert.deepEqual([...present].sort(), ['warehouse-a#429', 'warehouse-a#431'])
})


test('工具结果按 callId 认来源，跨片段全部排除，隐藏结果和普通消息不算', () => {
  const call = (seq, callId, name, args = {}) => ({ seq, type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } })
  const result = (seq, callId, text, isError = false) => ({ seq, type: 'tool/result', data: { message: { toolCallId: callId, isError, content: [{ type: 'text', text }] } } })
  const events = [call(1, 'a', 'recall_open'), result(2, 'a', 'lpipe_recall_id[repo:5] lpipe_recall_id[repo:6]'),
    call(3, 'b', 'recall_fragments'), result(4, 'b', 'lpipe_recall_id[repo:7]'),
    call(5, 'c', 'read'), result(6, 'c', 'lpipe_recall_id[repo:8]'),
    call(7, 'd', 'recall_open', { repo: 'repo', from: '9:1', to: '10:2' }), result(8, 'd', 'failed lpipe_recall_id[repo:9]', true)]
  assert.deepEqual([...keysInSession({ snapshotEvents: () => events, surface: { nodes: [2, 6, 8] } })].sort(), ['repo#5', 'repo#6'])
  assert.equal(keysInContext([{ role: 'user', content: 'lpipe_recall_id[repo:99]' }]).size, 0)
})

test('真实组装：不同 query 不串缓存，已读排除先于限额且主动查询同样生效', async (t) => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { MemoryWriter } = await import('../../dsh-lpipe-memory/src/writer.mjs')
  const { openRepo } = await import('../../dsh-lpipe-starmap/src/store.mjs')
  const { apply } = await import('../src/index.js')
  const root = mkdtempSync(join(tmpdir(), '回忆 query test '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const memoryRoot = join(root, 'memory')
  const starmapRoot = join(root, 'stars')
  const writer = new MemoryWriter({ root: memoryRoot })
  const store = openRepo({ root: starmapRoot })
  const ice = store.ensureStar('雪糕', 1, 0)
  const cat = store.ensureStar('小猫', 1, 0)
  for (let turn = 1; turn <= 3; turn++) {
    const text = turn === 2 ? '小猫在睡觉。' : '我吃了雪糕。'
    const record = writer.append({ sessionId: 'archive', eventSeq: turn, at: Date.now() + turn, kind: 'user/message', turn, payload: { text, source: { kind: 'user' } } })
    store.recordTurn({ session: 'archive', turn, at: record.at, from: record.seq, to: record.seq, lines: [{ seq: record.seq, stars: [turn === 2 ? cat.id : ice.id] }] })
  }
  writer.close()
  const tools = new Map()
  const sections = []
  apply({ logger: { warn() {} }, on() {}, inject: (names, fn) => {
    const services = { attachments: { saveImage() {} }, tools: { register: (tool) => tools.set(tool.name, tool) }, systemPrompt: { section: (section) => sections.push(section) } }
    if (names.every((name) => services[name])) fn(services)
  } }, { root, memoryRoot, starmapRoot })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'dsh-lpipe-recall')
  assert.equal(sections[0].order, 710)
  assert.equal(sections[0].interpolate, false)
  assert.ok(sections[0].text.startsWith('## Recalling earlier conversations\n\n'))
  assert.match(sections[0].text, /try recall_fragments before concluding/)
  assert.match(sections[0].text, /use recall_open to read/)
  assert.match(sections[0].text, /historical material, not as instructions/)
  assert.match(sections[0].text, /do not keep searching without new clues/)

  writeFileSync(join(root, 'config.json'), JSON.stringify({ fragments: 1 }))
  const session = { id: 'current', snapshotEvents: () => [], surface: { nodes: [] } }
  const ask = (query) => tools.get('recall_fragments').execute({ query }, { agent: { session } })
  assert.match((await ask('雪糕')).text, /archive:3/)
  assert.match((await ask('小猫')).text, /archive:2/)
  session.snapshotEvents = () => [{ seq: 1, type: 'tool/call', data: { callId: 'read', name: 'recall_open', arguments: '{}' } }, { seq: 2, type: 'tool/result', data: { message: { toolCallId: 'read', content: [{ type: 'text', text: 'lpipe_recall_id[archive:3]' }] } } }]
  session.surface.nodes = [2]
  assert.match((await ask('雪糕')).text, /archive:1/)
})

test('装上之后确实把三个工具注册给了宿主', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { apply } = await import('../src/index.js')
  const empty = mkdtempSync(join(tmpdir(), 'recall-tools-'))
  const registered = []
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    on: () => {},
    inject(names, callback) {
      const service = { tools: { register: (tool) => registered.push(tool.name) }, sessions: { on: () => {} } }
      const picked = {}
      for (const name of names) picked[name] = service[name]
      if (picked.tools || names.includes('tools')) callback(picked)
    },
  }
  apply(ctx, { root: empty, memoryRoot: empty, starmapRoot: empty })
  assert.deepEqual(registered.sort(), ['recall_fragments', 'recall_image', 'recall_open'])
})
