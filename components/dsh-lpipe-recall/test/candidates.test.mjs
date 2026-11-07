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

test('准入：至少一颗真文闪烁星、强度够', () => {
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

  const ahead = new Set(['s_a', 's_b'])
  const enough = candidatesOf({ repo, flicker: flickerMap([['s_a', 1.5], ['s_b', 1.2]]), foreground: ahead })
  assert.equal(enough.length, 1)
  assert.equal(enough[0].turn, 1)
  assert.equal(enough[0].stars.length, 2)

  const single = candidatesOf({ repo, flicker: flickerMap([['s_a', 1.5]]), foreground: ahead })
  assert.equal(single.length, 1, '现在一颗真文准确星就算回忆（用户 m15771 改的口径）')

  const fuzzyOnly = candidatesOf({
    repo,
    flicker: flickerMap([['s_c', 1.0, 'fuzzy'], ['s_a', 0.1, 'fuzzy']]),
    minStars: 1,
    foreground: new Set(['s_a']),
  })
  assert.equal(fuzzyOnly.length, 0, '光靠数字不上台')
})

test('模糊星在一个片段里的总和封顶 2，单颗封顶 1，n > 1 时每颗封顶 2/n', () => {
  const repo = repoOf({
    turns: [{ session: 's', turn: 1, at: 100, from: 0, to: 3, lines: [] }],
    byStar: {
      s_exact: [{ key: 's#1', index: 0, seq: 0 }],
      s_f1: [{ key: 's#1', index: 0, seq: 0 }],
      s_f2: [{ key: 's#1', index: 0, seq: 0 }],
      s_f3: [{ key: 's#1', index: 0, seq: 0 }],
    },
    stars: ['s_exact', 's_f1', 's_f2', 's_f3'].map((id) => ({ id, name: id })),
  })

  const one = candidatesOf({
    repo,
    flicker: flickerMap([['s_exact', 1.2], ['s_f1', 1.9, 'fuzzy']]),
    foreground: new Set(['s_exact', 's_f1']),
  })
  assert.equal(one[0].strength, 1.2 + 1, '只有一颗模糊星时，它最多算 1')
  // 反过来：一颗真文准确星、强度够，现在就算候选（不再要求两颗）。
  const single = candidatesOf({
    repo,
    flicker: flickerMap([['s_exact', 1.2]]),
    foreground: new Set(['s_exact']),
    minStars: 1,
  })
  assert.equal(single.length, 1, '一颗真文准确星也算候选')

  const three = candidatesOf({
    repo,
    flicker: flickerMap([['s_exact', 1.2], ['s_f1', 1.9, 'fuzzy'], ['s_f2', 1.8, 'fuzzy'], ['s_f3', 1.7, 'fuzzy']]),
    foreground: new Set(['s_exact', 's_f1', 's_f2', 's_f3']),
  })
  assert.equal(three[0].fuzzy, 3)
  assert.ok(Math.abs(three[0].strength - (1.2 + 3 * (2 / 3))) < 1e-9, '三颗时每颗最多 2/3，总和 2')
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
  const all = candidatesOf({ repo, flicker, limit: 5, foreground: new Set(['s_a', 's_b', 's_c', 's_d']) })
  assert.equal(all.length, 2)
  assert.equal(all[0].key, 's#2')
  assert.equal(all[0].strength, 3.9)
  assert.equal(all[1].strength, 1.4, '同一颗星在两句里出现也只加一次')

  const withoutHot = candidatesOf({
    repo,
    flicker,
    excluded: new Set(['s#2']),
    limit: 5,
    foreground: new Set(['s_a', 's_b', 's_c', 's_d']),
  })
  assert.deepEqual(withoutHot.map((entry) => entry.key), ['s#1'])
})


test('只在背景窗口里亮起来的星，凑不出一次回忆', () => {
  const repo = repoOf({
    turns: [{ session: 's', turn: 1, at: 100, from: 0, to: 3, lines: [] }],
    byStar: { s_a: [{ key: 's#1', index: 0, seq: 0 }], s_b: [{ key: 's#1', index: 0, seq: 1 }] },
    stars: [
      { id: 's_a', name: '记忆管线' },
      { id: 's_b', name: '星图' },
    ],
  })
  const flicker = flickerMap([['s_a', 1.2], ['s_b', 1.1]])
  assert.equal(candidatesOf({ repo, flicker, foreground: new Set() }).length, 0, '没有真文星就是不认')
  assert.equal(candidatesOf({ repo, flicker, foreground: new Set(['s_a']) }).length, 1)
})
