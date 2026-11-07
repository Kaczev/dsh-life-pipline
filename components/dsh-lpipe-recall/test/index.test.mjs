import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMON_SHARE, commonStars, createTriggerHandler, isNaturalWake, matchTextOf, recentText, textOfEvent, triggerOf } from '../src/index.js'

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
  const turns = Array.from({ length: 10 }, (_, index) => ({ session: 's', turn: index + 1, lines: [] }))
  const repo = {
    turns: new Map(turns.map((record) => [`s#${record.turn}`, record])),
    byStar: new Map([
      ['s_wide', Array.from({ length: 6 }, (_, index) => ({ key: `s#${index + 1}` }))],
      ['s_mid', Array.from({ length: 2 }, (_, index) => ({ key: `s#${index + 1}` }))],
      ['s_narrow', Array.from({ length: 1 }, (_, index) => ({ key: `s#${index + 1}` }))],
    ]),
  }
  const common = commonStars(repo)
  assert.equal(COMMON_SHARE, 0.05)
  assert.equal(common.has('s_wide'), true)
  assert.equal(common.has('s_mid'), false)
  assert.equal(common.has('s_narrow'), false)
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
