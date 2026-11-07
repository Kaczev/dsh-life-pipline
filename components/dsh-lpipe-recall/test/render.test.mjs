import assert from 'node:assert/strict'
import test from 'node:test'
import { clockOf, renderRecall, sentenceScore, shortSession } from '../src/render.mjs'

const flicker = new Map([
  ['s_a', { id: 's_a', name: '记忆管线', kind: 'exact', score: 1.8, at: 0 }],
  ['s_b', { id: 's_b', name: '20:44', kind: 'fuzzy', form: 'time', value: 20 * 60 + 44, score: 1.6, at: 0 }],
])

const readerOf = (rowsBySession) => ({
  rows: (sessionId) => rowsBySession[sessionId] ?? [],
})

const config = { sentencesPerFragment: 2 }

test('句子打分：名字与时间都能点亮，没关系的句子是 0', () => {
  assert.ok(sentenceScore('记忆管线正在落盘', flicker) > 1)
  assert.ok(sentenceScore('20:46 吃的雪糕', flicker) > 1)
  assert.equal(sentenceScore('今天天气不错', flicker), 0)
})

test('模糊回忆照抄原句、用省略号连接，并带上是哪一段', () => {
  const reader = readerOf({
    'session-aadf6fa4-1234': [
      { seq: 5, turn: 7, at: Date.UTC(2026, 8, 16, 8, 24), text: '记忆管线开工。今天天气不错。20:44 的雪糕真好吃。' },
      { seq: 6, turn: 7, at: Date.UTC(2026, 8, 16, 8, 26), text: '星图管线和它一起跑。' },
    ],
  })
  const block = renderRecall({
    candidates: [{ key: 'session-aadf6fa4-1234#7', session: 'session-aadf6fa4-1234', turn: 7, at: Date.UTC(2026, 8, 16, 8, 24), stars: ['s_a', 's_b'], strength: 3.4 }],
    flicker,
    reader,
    config,
  })
  assert.match(block, /〔回忆 · 模糊〕/)
  assert.match(block, /第 1 段/)
  assert.match(block, /第 7 轮/)
  assert.match(block, /……/)
  assert.ok(block.includes('记忆管线开工'))
  assert.ok(!block.includes('今天天气不错'), '没点亮星的句子不该出现')
  assert.ok(!block.includes('星图管线和它一起跑'), '这一句没有闪烁星')
})

test('没有候选、或者候选一句都挑不出来，就什么都不注入', () => {
  assert.equal(renderRecall({ candidates: [], flicker, reader: readerOf({}), config }), '')
  const block = renderRecall({
    candidates: [{ key: 's#1', session: 's', turn: 1, at: 0, stars: ['s_a'], strength: 1 }],
    flicker,
    reader: readerOf({ s: [{ seq: 1, turn: 1, at: 0, text: '完全无关的一句话。' }] }),
    config,
  })
  assert.equal(block, '')
})

test('会话短号与时刻：只露尾巴，时间按本地时钟', () => {
  assert.equal(shortSession('session-aadf6fa4-1234'), '1234')
  assert.equal(shortSession('session-a4153e71-5a85-4d73-aadf-6fa476e126cf'), '76e126cf')
  const at = new Date(2026, 8, 16, 16, 24).getTime()
  assert.equal(clockOf(at), '09-16 16:24')
  assert.equal(clockOf('nonsense'), '')
})
