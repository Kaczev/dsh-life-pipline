import assert from 'node:assert/strict'
import test from 'node:test'
import { clockOf, looksLikeCode, renderRecall, sentenceScore, shortSession, stripCodeBlocks } from '../src/render.mjs'

const flicker = new Map([
  ['s_a', { id: 's_a', name: '记忆管线', kind: 'exact', score: 1.8, at: 0 }],
  ['s_b', { id: 's_b', name: '20:44', kind: 'fuzzy', form: 'time', value: 20 * 60 + 44, score: 1.6, at: 0 }],
])

const readerOf = (rowsBySession) => ({
  rows: (sessionId) => rowsBySession[sessionId] ?? [],
})

const config = { sentencesPerFragment: 2 }

test('句子打分：准确星与时间都能点亮，但只有时间不算', () => {
  assert.ok(sentenceScore('记忆管线正在落盘', flicker).score > 1)
  assert.equal(sentenceScore('记忆管线正在落盘', flicker).exact, 1)
  const timeOnly = sentenceScore('20:46 吃的雪糕', flicker)
  assert.ok(timeOnly.score > 0)
  assert.equal(timeOnly.exact, 0, '只有时间撞上的句子不进回忆')
  assert.equal(sentenceScore('今天天气不错', flicker).score, 0)
})

test('模糊回忆照抄原句、用省略号连接，并带上是哪一段', () => {
  const reader = readerOf({
    'session-aadf6fa4-1234': [
      {
        seq: 5,
        turn: 7,
        kind: 'assistant/message',
        at: Date.UTC(2026, 8, 16, 8, 24),
        text: '记忆管线开工。今天天气不错。20:44 的雪糕真好吃。',
      },
      { seq: 6, turn: 7, kind: 'assistant/message', at: Date.UTC(2026, 8, 16, 8, 26), text: '星图管线和它一起跑。' },
      { seq: 7, turn: 7, kind: 'tool/result', at: Date.UTC(2026, 8, 16, 8, 27), text: '记忆管线工具输出的日志不该进回忆。' },
    ],
  })
  const block = renderRecall({
    candidates: [
      { key: 'session-aadf6fa4-1234#7', session: 'session-aadf6fa4-1234', turn: 7, from: 5, to: 7, at: Date.UTC(2026, 8, 16, 8, 24), stars: ['s_a', 's_b'], strength: 3.4 },
    ],
    flicker,
    reader,
    config,
  })
  assert.match(block, /〔回忆 · 模糊〕/)
  assert.match(block, /第 1 段/)
  assert.match(block, /lpipe_recall_id\[session-aadf6fa4-1234:7\]/, '片段 id 是固定格式')
  assert.match(block, /〔1〕记忆管线开工。/, '每一句前面挂句子 id，recall_open 才指得准')
  assert.match(block, /……/)
  assert.ok(block.includes('记忆管线开工'))
  assert.ok(!block.includes('今天天气不错'), '没点亮星的句子不该出现')
  assert.ok(!block.includes('星图管线和它一起跑'), '这一句没有闪烁星')
  assert.ok(!block.includes('工具输出'), '普通工具结果不参与选句')
})

test('没有候选、或者候选一句都挑不出来，就什么都不注入', () => {
  assert.equal(renderRecall({ candidates: [], flicker, reader: readerOf({}), config }), '')
  const block = renderRecall({
    candidates: [{ key: 's#1', session: 's', turn: 1, at: 0, stars: ['s_a'], strength: 1 }],
    flicker,
    reader: readerOf({ s: [{ seq: 1, turn: 1, kind: 'assistant/message', at: 0, text: '完全无关的一句话。' }] }),
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


test('代码块与代码行不进回忆：会念出来的只有话', () => {
  assert.equal(stripCodeBlocks('前\n```js\nconst a = 1\n```\n后').includes('const a'), false)
  assert.equal(looksLikeCode('{ "form": "time", "value": "20:46" }'), true)
  assert.equal(looksLikeCode('记忆管线正在落盘，这一句是话。'), false)

  const reader = readerOf({
    s: [
      {
        seq: 1,
        turn: 2,
        kind: 'assistant/message',
        at: 0,
        text: '记忆管线开工。\n```js\n记忆管线 = 1\n```\n就这样。',
      },
    ],
  })
  const block = renderRecall({
    candidates: [{ key: 's#2', session: 's', turn: 2, at: 0, stars: ['s_a'], strength: 1.5 }],
    flicker,
    reader,
    config: { sentencesPerFragment: 4 },
  })
  assert.ok(block.includes('记忆管线开工'))
  assert.ok(!block.includes('记忆管线 = 1'))
})


test('展示的句子要能看出「为什么是这段」：命中星星所在的句子优先摆出来', () => {
  // 一句话里星星多的句子分数更高，但真正重要的是「让读者看见命中星」。
  // 这里第二句只有一颗星，却是唯一包含「日志」的句子，必须被选中。
  const reader = {
    rows: () => [
      {
        turn: 7,
        at: 1790000000000,
        kind: 'assistant/message',
        source: { kind: 'assistant' },
        text: 'Hermes 是支持自托管的开源工具，坏了通常不是什么绝症。我陪你顺着日志一条条排查，把之前的配置和记忆恢复回来。',
      },
    ],
  }
  const flicker = new Map([
    ['s_a', { id: 's_a', name: 'Hermes', kind: 'exact', score: 1.9 }],
    ['s_b', { id: 's_b', name: '开源工具', kind: 'exact', score: 1.8 }],
    ['s_c', { id: 's_c', name: '日志', kind: 'exact', score: 1.0 }],
  ])
  const text = renderRecall({
    candidates: [{ session: 's', turn: 7, at: 1790000000000, stars: ['s_a', 's_b', 's_c'] }],
    flicker,
    reader,
    config: { sentencesPerFragment: 2 },
  })
  assert.match(text, /顺着日志一条条排查/)
})

test('选最亮四句而非覆盖最多星，并保持原句序号顺序', () => {
  const flicker = new Map([['a',{id:'a',name:'亮星',kind:'exact',score:5}],['b',{id:'b',name:'弱星',kind:'exact',score:1}]])
  const text=renderRecall({candidates:[{session:'s',turn:1,stars:['a','b'],at:0}],flicker,
    reader:readerOf({s:[{turn:1,kind:'user/message',text:'亮星甲。亮星乙。弱星丙。亮星丁。亮星戊。'}]}),config:{sentencesPerFragment:4}})
  assert.ok(!text.includes('弱星丙'))
  assert.match(text,/〔1〕亮星甲。……〔2〕亮星乙。……〔4〕亮星丁。……〔5〕亮星戊。/)
})
