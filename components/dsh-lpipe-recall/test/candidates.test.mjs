import assert from 'node:assert/strict'
import test from 'node:test'
import { candidatesOf, coolTurns, turnKeyOf } from '../src/candidates.mjs'

const repoOf = ({ turns, byStar, stars }) => ({
  turns: new Map(turns.map((record) => [turnKeyOf(record.session, record.turn), record])),
  byStar: new Map(Object.entries(byStar)),
  stars: new Map(stars.map((entry) => [entry.id, entry])),
})

const flickerMap = (entries) => new Map(entries.map(([id, score, kind = 'exact']) => [id, { id, name: id, kind, score, at: 0 }]))

test('冷却窗口：从会话末尾往前数够 1M 字，里面的轮次不再当候选', () => {
  const rows = [
    { seq: 0, turn: 1, session: 's', kind: 'assistant/message', text: 'a'.repeat(600) },
    { seq: 1, turn: 2, session: 's', kind: 'assistant/message', text: 'b'.repeat(600) },
    { seq: 2, turn: 3, session: 's', kind: 'assistant/message', text: 'c'.repeat(600) },
  ]
  const cool = coolTurns({ rows, coolChars: 900 })
  assert.equal(cool.has(turnKeyOf('s', 3)), true)
  assert.equal(cool.has(turnKeyOf('s', 2)), true)
  assert.equal(cool.has(turnKeyOf('s', 1)), false)
})

test('准入：至少两颗闪烁星、强度够、且必须有真正的概念连上', () => {
  const repo = repoOf({
    turns: [
      { session: 's', turn: 1, at: 100, from: 0, to: 3, lines: [] },
      { session: 's', turn: 2, at: 200, from: 4, to: 7, lines: [] },
    ],
    byStar: { s_a: [{ key: 's#1', index: 0, seq: 1 }], s_b: [{ key: 's#1', index: 0, seq: 1 }], s_c: [{ key: 's#2', index: 0, seq: 5 }] },
    stars: [
      { id: 's_a', name: '记忆管线' },
      { id: 's_b', name: '星图' },
      { id: 's_c', name: '时间' },
    ],
  })

  const enough = candidatesOf({ repo, flicker: flickerMap([['s_a', 1.5], ['s_b', 1.2]]) })
  assert.equal(enough.length, 1)
  assert.equal(enough[0].turn, 1)
  assert.equal(enough[0].stars.length, 2)

  const single = candidatesOf({ repo, flicker: flickerMap([['s_a', 1.5]]) })
  assert.equal(single.length, 0, '一颗星不算回忆')

  const fuzzyOnly = candidatesOf({ repo, flicker: flickerMap([['s_c', 1.0, 'fuzzy'], ['s_a', 0.1, 'fuzzy']]), minStars: 1 })
  assert.equal(fuzzyOnly.length, 0, '光靠数字不上台')
})

test('排除冷却片段，按强度排序，同一颗星只算一次', () => {
  const repo = repoOf({
    turns: [
      { session: 's', turn: 1, at: 100, from: 0, to: 1, lines: [] },
      { session: 's', turn: 2, at: 200, from: 2, to: 3, lines: [] },
    ],
    byStar: {
      s_a: [{ key: 's#1', index: 0, seq: 0 }, { key: 's#1', index: 1, seq: 1 }],
      s_b: [{ key: 's#1', index: 1, seq: 1 }],
      s_c: [{ key: 's#2', index: 0, seq: 2 }],
      s_d: [{ key: 's#2', index: 1, seq: 3 }],
    },
    stars: ['s_a', 's_b', 's_c', 's_d'].map((id) => ({ id, name: id })),
  })
  const flicker = flickerMap([['s_a', 0.8], ['s_b', 0.6], ['s_c', 2], ['s_d', 1.9]])
  const all = candidatesOf({ repo, flicker, limit: 5 })
  assert.equal(all.length, 2)
  assert.equal(all[0].key, 's#2')
  assert.equal(all[0].strength, 3.9)
  assert.equal(all[1].strength, 1.4, '同一颗星在两句里出现也只加一次')

  const withoutHot = candidatesOf({ repo, flicker, excluded: new Set(['s#2']), limit: 5 })
  assert.deepEqual(withoutHot.map((entry) => entry.key), ['s#1'])
})
