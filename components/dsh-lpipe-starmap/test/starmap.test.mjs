import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { RULES_VERSION, buildTurn } from '../src/build.mjs'
import { matcherOf } from '../src/lexicon.mjs'
import { createQueries } from '../src/query.mjs'
import { loadLexicon, openRepo, saveLexicon, starIdOf } from '../src/store.mjs'
import { dayOf, sourceFile, starsFile, stateFile } from '../src/paths.mjs'

const matcher = matcherOf({
  words: [
    { name: '记忆管线', count: 40, df: 4 },
    { name: '唤醒管线', count: 20, df: 3 },
    { name: '星图', count: 12, df: 2 },
  ],
})

/** 已经点亮的星：多数测试只验读写机制，先把星种进去，不必真的提两次。 */
function seed(repo, names) {
  for (const name of names) repo.ensureStar(name, 1, '2026-11-06T00:00:00.000Z')
}

function makeTurn({ turn, at, rows }) {
  return { turn, at, from: rows[0].seq, to: rows[rows.length - 1].seq, rows }
}

test('一轮落进星图：星表、星源、水位三样都写', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  seed(repo, ['记忆管线', '唤醒管线', 'wake_set'])
  const at = Date.parse('2026-11-06T12:00:00+08:00')
  const rows = [
    { seq: 0, turn: 1, at, kind: 'user/message', text: '记忆管线和唤醒管线一起工作。' },
    { seq: 1, turn: 1, at, kind: 'assistant/message', text: '好的。' },
    { seq: 2, turn: 1, at, kind: 'tool/call', name: 'wake_set' },
  ]
  buildTurn({ repo, turn: makeTurn({ turn: 1, at, rows }), sessionId: 'sess-a', lex: 1, matcher })

  const stars = readFileSync(starsFile(root), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const names = stars.map((star) => star.name)
  assert.ok(names.includes('记忆管线'))
  assert.ok(names.includes('唤醒管线'))
  assert.ok(names.includes('wake_set'))
  assert.equal(stars.find((star) => star.name === '记忆管线').id, starIdOf('记忆管线'))

  const file = sourceFile(root, 'sess-a', dayOf(at))
  assert.ok(existsSync(file))
  const record = JSON.parse(readFileSync(file, 'utf8').trim())
  assert.equal(record.turn, 1)
  assert.equal(record.from, 0)
  assert.equal(record.to, 2)
  assert.ok(record.lines.length >= 2, '一句话一行，工具调用自己一行')
  assert.equal(record.lines.find((line) => line.seq === 2).stars.length, 1)

  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'))
  assert.deepEqual(state.built['sess-a'], { turn: 1, to: 2 })
})

test('同句相连得重，相邻句相连得轻', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  seed(repo, ['记忆管线', '唤醒管线', '星图'])
  const at = Date.parse('2026-11-06T12:10:00+08:00')
  const rows = [
    { seq: 0, turn: 2, at, kind: 'user/message', text: '记忆管线和唤醒管线是一对。' },
    { seq: 1, turn: 2, at, kind: 'assistant/message', text: '记忆管线先落盘。然后星图再抽星。' },
  ]
  buildTurn({ repo, turn: makeTurn({ turn: 2, at, rows }), sessionId: 'sess-b', lex: 1, matcher })
  const queries = createQueries({
    repo,
    memoryStatus: () => ({ turns: 3, sessions: [], lastBuiltAt: at, lastTurn: 2 }),
  })

  const links = queries.links('记忆管线')
  const same = links.links.find((entry) => entry.star.name === '唤醒管线')
  const near = links.links.find((entry) => entry.star.name === '星图')
  assert.ok(same, '同句的星应当相连')
  assert.equal(same.weight, 1)
  assert.ok(near, '相邻句的星应当以弱边相连')
  assert.equal(near.weight, 0.5)

  const progress = queries.progress()
  assert.equal(progress.built, 1)
  assert.equal(progress.grey, 2)
})

test('查询：星星出现在哪些轮、某一轮有哪几颗星', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  seed(repo, ['记忆管线'])
  const at = Date.parse('2026-11-06T12:20:00+08:00')
  for (const turn of [3, 4]) {
    const rows = [{ seq: turn, turn, at: at + turn, kind: 'user/message', text: '记忆管线又出现了。' }]
    buildTurn({ repo, turn: makeTurn({ turn, at: at + turn, rows }), sessionId: 'sess-c', lex: 1, matcher })
  }
  const queries = createQueries({ repo, memoryStatus: () => ({ turns: 4, sessions: [], lastBuiltAt: at, lastTurn: 4 }) })
  const star = queries.star('记忆管线')
  assert.equal(star.total, 2)
  assert.deepEqual(star.turns.map((entry) => entry.turn), [4, 3])

  const turn = queries.turn({ session: 'sess-c', turn: 3 })
  assert.equal(turn.turn, 3)
  assert.equal(turn.stars.length, 1)
  assert.equal(turn.stars[0].name, '记忆管线')
})

test('重启后从磁盘恢复：水位、星表、星源都还在', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const at = Date.parse('2026-11-06T12:30:00+08:00')
  const rows = [{ seq: 0, turn: 5, at, kind: 'user/message', text: '星图从磁盘回来。' }]
  const writer = openRepo({ root })
  seed(writer, ['星图'])
  buildTurn({ repo: writer, turn: makeTurn({ turn: 5, at, rows }), sessionId: 'sess-d', lex: 2, matcher })

  const repo = openRepo({ root })
  assert.deepEqual(repo.state.built['sess-d'], { turn: 5, to: 0 })
  assert.ok(repo.stars.size > 0)
  assert.ok(repo.turns.has('sess-d#5'))
  assert.equal(repo.state.lex, 2)

  saveLexicon(root, { version: 2, builtAt: at, turns: 1, words: [{ name: '星图', count: 3, df: 1 }] })
  assert.equal(loadLexicon(root).version, 2)
})

test('只出现一次的名字不成星：同轮两次或下一轮再见才点亮', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  const at = Date.parse('2026-11-06T13:00:00+08:00')

  // 第一轮：一次性提到「鲸落幻象」，同一轮里说两遍「记忆管线」。
  const first = [
    { seq: 0, turn: 1, at, kind: 'user/message', text: '「鲸落幻象」。记忆管线先写，记忆管线后写。' },
  ]
  buildTurn({ repo, turn: makeTurn({ turn: 1, at, rows: first }), sessionId: 'sess-g', lex: 1, matcher })
  assert.equal(repo.byName.has('鲸落幻象'), false, '只出现一次的名字不成星')
  assert.equal(repo.byName.has('记忆管线'), true, '同一轮里出现两次就算数')

  // 第二轮：又提到「鲸落幻象」，这次点亮。
  const second = [{ seq: 1, turn: 2, at: at + 1000, kind: 'user/message', text: '「鲸落幻象」又来了。' }]
  buildTurn({ repo, turn: makeTurn({ turn: 2, at: at + 1000, rows: second }), sessionId: 'sess-g', lex: 1, matcher })
  assert.equal(repo.byName.has('鲸落幻象'), true, '第二次出现才点亮')
})

test('starmap.rebuild 走得通，没接上也如实说', async () => {
  const { createStarmapRpcHandler } = await import('../src/rpc.mjs')
  const queries = { progress: () => ({ built: 3, turns: 5, grey: 2 }) }
  const withRebuild = createStarmapRpcHandler({
    queries,
    rebuild: () => ({ built: 5, turns: 5, grey: 0 }),
  })
  const done = await withRebuild('starmap.rebuild', {})
  assert.equal(done.ok, true)
  assert.equal(done.value.built, 5)

  const without = createStarmapRpcHandler({ queries })
  const failed = await without('starmap.rebuild', {})
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'starmap/unavailable')
})

test('水位丢了：星源还在就能自己长回来', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const at = Date.parse('2026-11-06T12:40:00+08:00')
  const rows = [{ seq: 0, turn: 7, at, kind: 'user/message', text: '星图要自己长回水位。' }]
  buildTurn({ repo: openRepo({ root }), turn: makeTurn({ turn: 7, at, rows }), sessionId: 'sess-e', lex: 1, matcher })

  writeFileSync(stateFile(root), `${JSON.stringify({ version: 1, lex: 1, built: {} })}\n`, 'utf8')
  const repo = openRepo({ root })
  assert.deepEqual(repo.state.built['sess-e'], { turn: 7, to: 0 }, '加载时应从星源补回水位')
  assert.deepEqual(JSON.parse(readFileSync(stateFile(root), 'utf8')).built['sess-e'], { turn: 7, to: 0 })
})

test('抬水位不冲掉别的会话', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const repo = openRepo({ root })
  repo.raiseWatermark('sess-new', 3, 9, 1)

  // 另一个进程写进来的会话：本进程内存里没有它，抬水位时必须先合进来。
  writeFileSync(stateFile(root), `${JSON.stringify({ version: 1, lex: 1, built: { 'sess-old': { turn: 40, to: 100 } } })}\n`, 'utf8')
  repo.raiseWatermark('sess-new', 4, 12, 1)

  const state = JSON.parse(readFileSync(stateFile(root), 'utf8'))
  assert.deepEqual(state.built['sess-old'], { turn: 40, to: 100 })
  assert.deepEqual(state.built['sess-new'], { turn: 4, to: 12 })
})

test('重复的星星行，加载时收成一份', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-'))
  const at = Date.parse('2026-11-06T12:50:00+08:00')
  const rows = [{ seq: 0, turn: 8, at, kind: 'user/message', text: '记忆管线里重复的星星要收掉。' }]
  const writer = openRepo({ root })
  seed(writer, ['记忆管线'])
  buildTurn({ repo: writer, turn: makeTurn({ turn: 8, at, rows }), sessionId: 'sess-f', lex: 1, matcher })

  const first = readFileSync(starsFile(root), 'utf8').trim().split('\n')[0]
  appendFileSync(starsFile(root), `${first}\n`, 'utf8')
  assert.equal(readFileSync(starsFile(root), 'utf8').trim().split('\n').length, 2)

  const repo = openRepo({ root })
  const lines = readFileSync(starsFile(root), 'utf8').trim().split('\n')
  assert.equal(lines.length, 1, '重复的那行应当在加载时被收掉')
  assert.equal(repo.stars.size, 1)
})

test('星图记得自己是按哪一版抽星规则建的', () => {
  const root = mkdtempSync(join(tmpdir(), 'starmap-rules-'))
  const repo = openRepo({ root })
  assert.equal(repo.state.rules, undefined, 'a brand new map has no rules version yet')
  assert.equal(repo.setRules(RULES_VERSION), true, 'the first run records it')
  assert.equal(repo.setRules(RULES_VERSION), false, 'recording the same version is a no-op')

  const again = openRepo({ root })
  assert.equal(again.state.rules, RULES_VERSION, 'the version survives a restart')
})
