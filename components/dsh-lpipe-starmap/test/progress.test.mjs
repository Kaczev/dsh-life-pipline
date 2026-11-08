import assert from 'node:assert/strict'
import test from 'node:test'
import { createQueries } from '../src/query.mjs'

function fixture() {
  const stars = [
    { id: 'exact', kind: 'exact' },
    { id: 'frequent', kind: 'exact' },
    { id: 'common', kind: 'common' },
    { id: 'clock', kind: 'fuzzy', form: 'time' },
    { id: 'number', kind: 'fuzzy', form: 'number' },
  ]
  return {
    stars: new Map(stars.map(star => [star.id, star])),
    turns: new Map(Array.from({ length: 20 }, (_, i) => [i, { session: 's', turn: i, at: i < 2 ? 1000 : i === 2 ? 0 : null }])),
    byStar: new Map([
      ['exact', [{ key: 0 }, { key: 0 }]],
      ['frequent', [{ key: 0 }, { key: 1 }]],
      ['clock', Array.from({ length: 20 }, (_, key) => ({ key }))],
    ]),
  }
}
const progressOf = repo => createQueries({ repo, memoryStatus: () => ({ turns: repo.turns.size }) }).progress()

test('总星数为文星加时星，四类互斥；同刻不同片段各有时星', () => {
  const repo = fixture()
  const before = JSON.stringify([...repo.stars])
  const value = progressOf(repo)
  assert.deepEqual([value.exact, value.fuzzy, value.common, value.time], [1, 2, 2, 3])
  assert.equal(value.text, 5)
  assert.equal(value.stars, 8)
  assert.equal(value.stars, value.exact + value.fuzzy + value.common + value.time)
  assert.equal(JSON.stringify([...repo.stars]), before, '统计不写回分类')
  repo.byStar.set('frequent', [{ key: 0 }])
  assert.equal(progressOf(repo).common, 1, '片段频率变动后按当前规则重算')
})

test('空库与无效片段时间不虚增星数', () => {
  const repo = { stars: new Map(), turns: new Map(), byStar: new Map() }
  assert.equal(progressOf(repo).stars, 0)
  repo.turns.set(1, { at: undefined })
  repo.turns.set(2, { at: NaN })
  repo.turns.set(3, { at: 'invalid' })
  assert.equal(progressOf(repo).time, 0)
})
