import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pruneSingleLetters } from '../scripts/prune-single-letters.mjs'
import { starWorthy, RULES_VERSION, planTurn } from '../src/build.mjs'

test('单拉丁字母及排版变体不成星，中文、双字母与字母数字不受影响', () => {
  for (const name of ['a', 'K', '_A', '**Ｂ**', 'é']) assert.equal(starWorthy(name), false, name)
  for (const name of ['AB', 'Ksa', 'A0', '在']) assert.equal(starWorthy(name), true, name)
  assert.equal(RULES_VERSION, 12, '不触发清库重抽')
  const turn = { rows: [{ seq: 1, kind: 'user/message', text: 'K 与 Ksa 和记忆管线。' }] }
  const plan = planTurn(turn, [['K', 'Ksa'], ['Ksa', '记忆管线']])
  assert.ok(![...plan.names.values()].includes('K'))
  assert.ok([...plan.names.values()].includes('Ksa'))
})

test('旧库定向清理：备份可还原、保留轮次水位和有效星、重复执行无变化', t => {
  const root = mkdtempSync(join(tmpdir(), '星库 prune test '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'sources', 'archive'), { recursive: true })
  const stars = [{ id: 'a', name: '_A' }, { id: 'ksa', name: 'Ksa' }, { id: 'ab', name: 'AB' }]
  const source = { session: 'archive', turn: 1, at: 1, from: 2, to: 3, lines: [{ seq: 2, stars: ['a', 'ksa'] }], pairs: [['a', 'ksa'], ['ksa', 'ab']] }
  writeFileSync(join(root, 'stars.jsonl'), stars.map(JSON.stringify).join('\n') + '\n')
  const file = join(root, 'sources', 'archive', 'day.jsonl')
  writeFileSync(file, JSON.stringify(source) + '\n')
  writeFileSync(join(root, 'state.json'), '{"rules":12,"built":{"archive":{"turn":1,"to":3}}}')
  const before = readFileSync(file)
  assert.equal(pruneSingleLetters(root).changedFiles, 2)
  assert.deepEqual(readFileSync(file), before)
  const result = pruneSingleLetters(root, { apply: true })
  assert.deepEqual(readFileSync(join(result.backup, 'sources', 'archive', 'day.jsonl')), before)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(after.lines[0].stars, ['ksa'])
  assert.deepEqual(after.pairs, [['ksa', 'ab']])
  assert.equal(after.turn, source.turn)
  assert.equal(readFileSync(join(root, 'state.json'), 'utf8'), '{"rules":12,"built":{"archive":{"turn":1,"to":3}}}')
  assert.equal(pruneSingleLetters(root, { apply: true }).changedFiles, 0)
})

test('损坏的源文件拒绝清理，不先改星表', t => {
  const root = mkdtempSync(join(tmpdir(), 'prune corrupt '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'sources'), { recursive: true })
  writeFileSync(join(root, 'stars.jsonl'), '{"id":"a","name":"a"}\n')
  writeFileSync(join(root, 'sources', 'bad.jsonl'), '{bad\n')
  assert.throws(() => pruneSingleLetters(root, { apply: true }))
  assert.equal(readFileSync(join(root, 'stars.jsonl'), 'utf8'), '{"id":"a","name":"a"}\n')
})
