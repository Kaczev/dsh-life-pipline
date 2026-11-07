import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMON_SHARE, activityTextOf, charsOf, commonStars, createTriggerHandler, isNaturalWake, matchTextOf, pickFresh, recentText, textOfEvent, triggerOf } from '../src/index.js'

test('近窗原文：从末尾往前收够字数，顺序照旧', () => {
  const said = (seq, text) => ({ seq, kind: 'user/message', source: { kind: 'user' }, text })
  const rows = [
    said(0, '第一段'),
    said(1, ''),
    { seq: 1.5, kind: 'tool/result', text: '工具输出不该进近窗' },
    said(2, '第二段'),
    said(3, '第三段'),
  ]
  assert.equal(recentText(rows, 100), '第一段\n第二段\n第三段')
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


test('摆过一次的片段还在冷却期里就不再重复摆', () => {
  const ledger = new Map([['s#1', 1000]])
  const candidates = [{ key: 's#1' }, { key: 's#2' }]
  assert.deepEqual(pickFresh(candidates, ledger, 1500, 1000).map((entry) => entry.key), ['s#2'], '1000 字前摆过，还在冷却')
  assert.deepEqual(pickFresh(candidates, ledger, 2500, 1000).map((entry) => entry.key), ['s#1', 's#2'], '冷却期过了可以再摆')
  assert.equal(charsOf([{ text: 'abc' }, { kind: 'tool/call', arguments: '{}' }]), 5)
})


test('二类触发源：每 16 次思考/回复/工具结果才评估一次回忆', async () => {
  const delivered = []
  const seenActivity = []
  const handler = createTriggerHandler({
    compose: () => '〔回忆 · 模糊〕找到一段',
    deliver: (sessionId, block) => delivered.push({ sessionId, block }),
    activity: (sessionId, text) => seenActivity.push(text),
    secondEvery: 16,
  })
  const thought = (seq) => ({
    seq,
    type: 'assistant/message',
    data: { message: { content: [{ type: 'reasoning', text: '想一想' }, { type: 'text', text: '说一句' }] } },
  })
  for (let index = 1; index <= 15; index += 1) handler({ id: 's1' }, thought(index))
  await Promise.resolve()
  assert.equal(delivered.length, 0, '15 次还不该触发')
  handler({ id: 's1' }, thought(16))
  await Promise.resolve()
  assert.equal(delivered.length, 1, '第 16 次触发一次')
  assert.equal(seenActivity[0], '想一想\n说一句', '思考与正文都进匹配窗口')
})

test('工具结果也算二类触发源', () => {
  const text = activityTextOf({ type: 'tool/result', data: { text: '命令输出' } })
  assert.equal(text, '命令输出')
})
