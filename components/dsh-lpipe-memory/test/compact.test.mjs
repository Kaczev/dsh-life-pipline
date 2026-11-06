import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { compact, hasDuplicateParts, migrateIfNeeded, needsMigration } from '../src/compact.mjs'
import { project } from '../src/project.mjs'
import { MemoryReader } from '../src/reader.mjs'
import { MemoryWriter } from '../src/writer.mjs'

function store() {
  return mkdtempSync(join(tmpdir(), 'life-memory-compact-'))
}

/** 造一个旧格式的库：行里同时存 text 与 parts 副本。 */
function legacyStore({ rows = 5 } = {}) {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = new Date('2026-11-05T12:00:00+08:00').getTime()
  for (let i = 0; i < rows; i += 1) {
    const text = `第 ${i} 句`
    writer.append({
      sessionId: 'session-a',
      eventSeq: i,
      at: at + i,
      kind: 'assistant/message',
      payload: { text, reasoning: `想法 ${i}`, parts: [{ type: 'text', text }, { type: 'reasoning', text: `想法 ${i}` }] },
    })
  }
  writer.close()
  // 旧库的游标是 version 1：迁移只看这一个数字。
  const stateFile = join(root, 'state.json')
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  state.version = 1
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8')
  return root
}

test('a text part is not copied into the payload', () => {
  const projected = project({
    type: 'assistant/message',
    data: { message: { content: [{ type: 'reasoning', text: '想' }, { type: 'text', text: '说' }] } },
  })
  assert.equal(projected.payload.text, '说')
  assert.equal(projected.payload.reasoning, '想')
  assert.equal(projected.payload.parts, undefined, 'text and reasoning must not be copied')
})

test('injected runtime context is not stored at all', () => {
  const injected = project({
    type: 'user/message',
    data: { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Current runtime context.' }] },
  })
  assert.equal(injected, null, '注入的运行期上下文不该进记忆层')

  const time = project({
    type: 'user/message',
    data: { source: { kind: 'time-context' }, content: [{ type: 'text', text: 'Time sampled while preparing turn 1.' }] },
  })
  assert.ok(time, '时间戳仍然存')

  const said = project({
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: '真的说了一句' }] },
  })
  assert.equal(said.payload.text, '真的说了一句')
})

test('a part that carries something the text cannot (an attachment) is kept', () => {
  const attachment = { type: 'image', attachment: { attachmentId: 'a1' } }
  const projected = project({ type: 'user/message', data: { content: [{ type: 'text', text: '看图' }, attachment] } })
  assert.deepEqual(projected.payload.parts, [attachment])
})

test('compacting an old store drops the copies and re-chains the rows', () => {
  const root = legacyStore({ rows: 6 })
  const before = new MemoryReader({ root })
  assert.equal(hasDuplicateParts(before.read(0)), true, 'the fixture is the old format')
  const rowsBefore = [0, 1, 2, 3, 4, 5].map((seq) => before.read(seq))
  assert.ok(needsMigration(root))

  const result = compact({ root, now: () => new Date('2026-11-05T20:00:00+08:00').getTime() })
  assert.equal(result.rows, 6)
  assert.ok(existsSync(result.backup), 'the old store is kept as a backup')
  assert.equal(needsMigration(root), false, 'the rebuilt store is current')

  const after = new MemoryReader({ root })
  assert.deepEqual(after.verify(), [], 'the rebuilt chain is clean')
  for (const seq of [0, 1, 2, 3, 4, 5]) {
    const row = after.read(seq)
    assert.equal(row.seq, seq, 'seq stays put')
    assert.equal(row.text, rowsBefore[seq].text)
    assert.equal(row.reasoning, rowsBefore[seq].reasoning)
    assert.equal(row.parts, undefined, 'no duplicate parts remain')
  }
})

test('compacting keeps the event cursor, so a live session may keep appending', () => {
  const root = legacyStore({ rows: 2 })
  const reader = new MemoryReader({ root })
  assert.equal(reader.sessions().length, 1)

  compact({ root })
  const writer = new MemoryWriter({ root })
  assert.equal(writer.lastEventSeq('session-a'), 1, 'the cursor survived the rebuild')
  assert.equal(writer.append({ sessionId: 'session-a', eventSeq: 1, at: Date.now(), kind: 'user/message', payload: { text: '重复' } }), null)
  assert.ok(writer.append({ sessionId: 'session-a', eventSeq: 2, at: Date.now(), kind: 'user/message', payload: { text: '新的' } }))
  writer.close()
})

test('compacting fills in the turn number that old rows were missing', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = new Date('2026-11-05T12:00:00+08:00').getTime()
  // 第一行是没有轮号的 user/message（旧版就是这样写进来的），后面是同一轮的助手行。
  writer.append({ sessionId: 'session-a', at, kind: 'user/message', turn: null, payload: { text: '\u4f60\u597d' } })
  writer.append({ sessionId: 'session-a', at: at + 1, kind: 'assistant/message', turn: 42, payload: { text: '\u5728' } })
  writer.close()

  const stateFile = join(root, 'state.json')
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  state.version = 2
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8')
  assert.ok(needsMigration(root))

  compact({ root })
  const reader = new MemoryReader({ root })
  assert.equal(reader.read(0).turn, 42, 'the empty turn is taken from the row that follows it')
  assert.equal(reader.read(1).turn, 42)
  assert.deepEqual(reader.verify(), [])
})

test('a fresh store is already current, so nothing is migrated', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  writer.append({ sessionId: 'session-a', eventSeq: 0, at: Date.now(), kind: 'user/message', payload: { text: '一句话' } })
  writer.close()
  assert.equal(needsMigration(root), false)
  assert.equal(migrateIfNeeded({ root }), null)
})
