import assert from 'node:assert/strict'
import test from 'node:test'
import { timeCoefficient, lexicalTerms, bm25, lexicalCorpus, excerptSimilarity, selectFragments, rankFragments } from '../src/environment.mjs'
import { renderRecall } from '../src/render.mjs'

test('生产排序入口冻结摘录并供渲染复用，不重新读原文', () => {
  const repo = { turns: new Map([1, 2, 3].map((turn) => [`s#${turn}`, { session: 's', turn }])) }
  let reads = 0
  const reader = { rows: () => { reads++; return [1, 2, 3].map((turn) => ({ turn, kind: 'user/message', text: `朋友的第${turn}次聚会。` })) } }
  const entries = [1, 2, 3].map((turn) => ({ ...candidate(`s#${turn}`, 10 - turn), session: 's', turn, stars: ['friend'] }))
  const flicker = new Map([['friend', { name: '朋友', score: 3, kind: 'exact' }]])
  const config = { fragments: 2, recentDays: 30, sentencesPerFragment: 1 }
  const selected = rankFragments({ candidates: entries, query: '朋友聚会', repo, reader, flicker, config, now })
  assert.equal(selected.length, 2)
  assert.equal(reads, 1)
  const text = renderRecall({ candidates: selected, flicker, reader: { rows: () => { throw Error('must use frozen excerpt') } }, config })
  assert.equal((text.match(/展示 1 句/g) ?? []).length, 2)
})

const DAY = 86400000
const now = 100 * DAY
const candidate = (key, strength, text = key) => ({ key, strength, foreground: 1, at: now, text })
const corpus = { documents: new Map(), idf: () => 1, averageLength: 1 }
const prepareExcerpt = (entry) => ({ total: 1, lines: [{ id: 1, text: entry.text }] })

test('时间系数从2连续衰减到1，期限可配置，未来与缺失时间安全', () => {
  assert.equal(timeCoefficient(now, now), 2)
  assert.equal(timeCoefficient(now - 15 * DAY, now), 1.0625)
  assert.equal(timeCoefficient(now - 30 * DAY, now), 1)
  assert.equal(timeCoefficient(now - 60 * DAY, now), 1)
  assert.equal(timeCoefficient(now - 15 * DAY, now, 15), 1)
  assert.equal(timeCoefficient(now + DAY, now), 2)
  assert.equal(timeCoefficient(null, now), 1)
  assert.ok(Math.abs(timeCoefficient(now - 29.999 * DAY, now) - 1) < 1e-12)
})

test('全库BM25使用原文、长度归一化和去重查询词，纳入短工具结果但排除注入', () => {
  const repo = { turns: new Map([['s#1', { session: 's', turn: 1 }], ['s#2', { session: 's', turn: 2 }]]) }
  let reads = 0
  const reader = { rows: () => { reads++; return [
    { turn: 1, kind: 'user/message', text: '朋友不对劲。' },
    { turn: 2, kind: 'assistant/message', text: '朋友开心。开心。开心。开心。' },
    { turn: 1, kind: 'tool/result', text: '工具短文' },
    { turn: 1, kind: 'user/message', source: { kind: 'dsh-lpipe-recall' }, text: '不能入库' },
  ] } }
  const data = lexicalCorpus({ repo, reader })
  assert.equal(reads, 1)
  assert.equal(data.count, 2)
  const q = lexicalTerms('朋友不对劲')
  assert.ok(bm25(data.documents.get('s#1'), q, data) > bm25(data.documents.get('s#2'), q, data))
  assert.equal(bm25(data.documents.get('s#1'), [...q, ...q], data), bm25(data.documents.get('s#1'), q, data))
  assert.equal(data.documents.get('s#1').tf.has('不能'), false)
  assert.equal(data.documents.get('s#1').tf.has('短文'), true)
})

test('词面系数按完整候选池归一化，无命中退回1，候选与配置不被改写', () => {
  const entries = [candidate('a', 10), candidate('b', 9)]
  const data = { ...corpus, documents: new Map([['a', { tf: new Map([['hello', 1]]), length: 1 }], ['b', { tf: new Map(), length: 1 }]]) }
  const selected = selectFragments({ candidates: entries, query: 'hello', corpus: data, now, limit: 1, prepareExcerpt })
  assert.equal(selected[0].lexicalFactor, 2)
  assert.equal(selected[0].timeFactor, 2)
  assert.equal(selected[0].unmaskedStrength, 40)
  assert.equal(entries[0].lexicalFactor, undefined)
  const none = selectFragments({ candidates: entries, query: 'absent', corpus: data, now, limit: 2, prepareExcerpt })
  assert.ok(none.every((entry) => entry.lexicalFactor === 1))
})

test('前缀掩盖累加全部前排摘录，互补候选可以越过原始前四', () => {
  const entries = [candidate('a', 10, 'repeat'), candidate('b', 9, 'repeat'), candidate('c', 8, 'repeat'), candidate('d', 7, 'repeat'), candidate('e', 6, 'unique')]
  const selected = selectFragments({ candidates: entries, query: '', corpus, now, limit: 4, prepareExcerpt })
  assert.deepEqual(selected.map((entry) => entry.key), ['a', 'e', 'b', 'c'])
  assert.equal(selected[2].maskFactor, 1 / 2)
  assert.equal(selected[3].maskFactor, 1 / 3)
  assert.equal(excerptSimilarity(new Set(), new Set(), () => 1), 0)
  assert.equal(excerptSimilarity(new Set(['x']), new Set(['x']), () => 1), 1)
})

test('披露数量来自设置，选满即停止，不准备后续排名的掩盖轮次', () => {
  const entries = Array.from({ length: 6 }, (_, i) => candidate(String(i), 10 - i, 'same'))
  for (const limit of [1, 2, 3, 4, 5]) {
    let comparisons = 0
    const data = { ...corpus, idf: () => { comparisons++; return 1 } }
    const selected = selectFragments({ candidates: entries, query: '', corpus: data, now, limit, prepareExcerpt })
    assert.equal(selected.length, limit)
    assert.equal(comparisons, Array.from({ length: limit - 1 }, (_, i) => entries.length - i - 1).reduce((a, b) => a + b, 0))
  }
})

test('中英混排保持汉字二元组，候选输入顺序不影响并列裁决', () => {
  assert.deepEqual(lexicalTerms('Ksa朋友ABC开心'), ['ksa', '朋友', 'abc', '开心'])
  const entries = [candidate('b', 10, 'one'), candidate('a', 10, 'two')]
  const choose = (values) => selectFragments({ candidates: values, query: '', corpus, now, limit: 2, prepareExcerpt }).map((entry) => entry.key)
  assert.deepEqual(choose(entries), ['a', 'b'])
  assert.deepEqual(choose([...entries].reverse()), ['a', 'b'])
})

test('不可展示片段不占名额、不掩盖，实际摘录冻结', () => {
  const entries = [candidate('empty', 100), candidate('b', 9), candidate('c', 8)]
  const calls = new Map()
  const selected = selectFragments({ candidates: entries, query: '', corpus, now, limit: 2, prepareExcerpt: (entry) => {
    calls.set(entry.key, (calls.get(entry.key) ?? 0) + 1)
    return entry.key === 'empty' ? { total: 0, lines: [] } : prepareExcerpt(entry)
  } })
  assert.deepEqual(selected.map((entry) => entry.key), ['b', 'c'])
  assert.ok([...calls.values()].every((n) => n === 1))
})
