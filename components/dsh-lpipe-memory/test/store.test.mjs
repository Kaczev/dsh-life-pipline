import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { dayOf } from '../src/day.mjs'
import { compressFrame, decompressFrame } from '../src/frames.mjs'
import { dayFile, framesFile, idxFile, metaFile, sessionDir } from '../src/paths.mjs'
import { MemoryReader } from '../src/reader.mjs'
import { MemoryWriter } from '../src/writer.mjs'

function store() {
  return mkdtempSync(join(tmpdir(), 'life-memory-'))
}

function appendText(writer, { sessionId, eventSeq, at, text, kind = 'user/message' }) {
  return writer.append({ sessionId, eventSeq, at, kind, payload: { text, parts: [{ type: 'text', text }] } })
}

test('the day boundary sits at 4am local time', () => {
  const at = (iso) => new Date(iso).getTime()
  // 本地 03:59 仍属于前一天，04:00 换天
  assert.equal(dayOf(at('2026-11-05T03:59:00+08:00')), '2026-11-04')
  assert.equal(dayOf(at('2026-11-05T04:00:00+08:00')), '2026-11-05')
  assert.equal(dayOf(at('2026-11-05T23:30:00+08:00')), '2026-11-05')
})

test('rows are written per conversation, sequenced globally, and read back verbatim', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = new Date('2026-11-05T12:00:00+08:00').getTime()

  appendText(writer, { sessionId: 'session-a', eventSeq: 0, at, text: '第一句' })
  appendText(writer, { sessionId: 'session-a', eventSeq: 1, at: at + 1000, text: '第二句' })
  appendText(writer, { sessionId: 'session-b', eventSeq: 0, at: at + 2000, text: '另一个会话' })
  writer.close()

  const reader = new MemoryReader({ root })
  assert.equal(reader.sessionOf(0), 'session-a')
  assert.equal(reader.sessionOf(2), 'session-b')
  assert.equal(reader.read(0).text, '第一句')
  assert.equal(reader.read(1).text, '第二句')
  assert.equal(reader.read(2).text, '另一个会话')
  assert.equal(reader.read(9), null)

  // 两个会话各一个目录，都落在同一天
  assert.equal(reader.daysOf('session-a').length, 1)
  assert.deepEqual(reader.daysOf('session-a'), reader.daysOf('session-b'))
  assert.notEqual(sessionDir(root, 'session-a'), sessionDir(root, 'session-b'))

  // meta 是目录，行数对得上
  const meta = JSON.parse(readFileSync(metaFile(root, 'session-a'), 'utf8'))
  assert.equal(meta.rows, 2)
  assert.equal(meta.days[0].rows, 2)

  // 链完整
  assert.deepEqual(reader.verify(), [])
})

test('a repeated event never lands twice', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = Date.now()
  appendText(writer, { sessionId: 'session-a', eventSeq: 7, at, text: '一次' })
  assert.equal(appendText(writer, { sessionId: 'session-a', eventSeq: 7, at, text: '重复' }), null)
  appendText(writer, { sessionId: 'session-a', eventSeq: 8, at, text: '两次' })
  writer.close()

  const reader = new MemoryReader({ root })
  assert.equal(reader.timeline({}).length, 2)
  assert.equal(reader.read(1).text, '两次')
})

test('a big day is split into frames and still reads by seq', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = new Date('2026-11-05T12:00:00+08:00').getTime()
  const body = 'x'.repeat(1000)
  for (let i = 0; i < 40; i += 1) appendText(writer, { sessionId: 'session-a', eventSeq: i, at: at + i, text: `${i}:${body}` })
  writer.close()

  const frames = readFileSync(framesFile(root, 'session-a', '2026-11-05'), 'utf8').trim().split('\n')
  assert.ok(frames.length > 1, 'should span several frames')

  const reader = new MemoryReader({ root })
  for (const i of [0, 17, 39]) assert.equal(reader.read(i).text, `${i}:${body}`)
  assert.deepEqual(reader.verify(), [])
})

test('search finds text across conversations and respects the session filter', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = new Date('2026-11-05T12:00:00+08:00').getTime()
  appendText(writer, { sessionId: 'session-a', eventSeq: 0, at, text: '今天做星图' })
  appendText(writer, { sessionId: 'session-b', eventSeq: 0, at: at + 1000, text: '星图以后再说' })
  writer.close()

  const reader = new MemoryReader({ root })
  assert.equal(reader.search({ text: '星图' }).length, 2)
  const only = reader.search({ text: '星图', session: 'session-b' })
  assert.equal(only.length, 1)
  assert.equal(only[0].session, 'session-b')
  assert.ok(only[0].snippet.includes('星图'))
})

test('verify notices a row that was edited after the fact', () => {
  const root = store()
  const writer = new MemoryWriter({ root })
  const at = new Date('2026-11-05T12:00:00+08:00').getTime()
  appendText(writer, { sessionId: 'session-a', eventSeq: 0, at, text: '原话' })
  appendText(writer, { sessionId: 'session-a', eventSeq: 1, at: at + 1, text: '第二句' })
  writer.close()

  // 直接把第一行改掉，再按新材料重写帧与偏移表（链不会跟着变）
  const reader = new MemoryReader({ root })
  const rows = [reader.read(0), reader.read(1)]
  rows[0].text = '改过的话'
  const text = rows.map((row) => JSON.stringify(row)).join('\n')
  const packed = compressFrame(text)
  writeFileSync(dayFile(root, 'session-a', '2026-11-05'), packed)
  writeFileSync(framesFile(root, 'session-a', '2026-11-05'), JSON.stringify({ n: 0, at: 0, len: packed.length }) + '\n')
  const idx = rows.map((row, i) => ({ s: row.seq, f: 0, o: i === 0 ? 0 : Buffer.byteLength(JSON.stringify(rows[0])) + 1, l: Buffer.byteLength(JSON.stringify(row)) }))
  writeFileSync(idxFile(root, 'session-a', '2026-11-05'), idx.map((entry) => JSON.stringify(entry)).join('\n') + '\n')

  const tampered = new MemoryReader({ root })
  const problems = tampered.verify()
  assert.ok(problems.length > 0, 'the chain must notice')
  assert.equal(problems[0].seq, 0)
})

test('a frame decodes on its own', () => {
  const text = '一行\n两行\n'
  assert.equal(decompressFrame(compressFrame(text)), text)
})

test('an empty store reads as empty instead of throwing', () => {
  const root = store()
  const reader = new MemoryReader({ root })
  assert.equal(reader.read(0), null)
  assert.deepEqual(reader.timeline({}), [])
  assert.deepEqual(reader.search({ text: 'x' }), [])
  assert.deepEqual(reader.verify(), [])
  mkdirSync(join(root, 'sessions'), { recursive: true })
})
