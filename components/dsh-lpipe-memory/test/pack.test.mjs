import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { isPacked, packColdDays, packDay } from '../src/pack.mjs'
import { dayFile, framesFile, idxFile } from '../src/paths.mjs'
import { MemoryReader } from '../src/reader.mjs'
import { MemoryWriter } from '../src/writer.mjs'

function store() {
  return mkdtempSync(join(tmpdir(), 'life-memory-pack-'))
}

const DAY = '2026-11-05'
const at = new Date('2026-11-05T12:00:00+08:00').getTime()

function fill(root) {
  const writer = new MemoryWriter({ root })
  const body = '把这一天的每一帧都撑开，让它落到好几个帧里。'.repeat(20)
  for (let i = 0; i < 40; i += 1) {
    writer.append({ sessionId: 'session-a', eventSeq: i, at: at + i * 1000, kind: 'user/message', payload: { text: `${i}|${body}` } })
  }
  writer.close()
}

test('a cold day is repacked into one stream and still reads by seq', () => {
  const root = store()
  fill(root)
  const framesBefore = readFileSync(framesFile(root, 'session-a', DAY), 'utf8').trim().split('\n').length
  assert.ok(framesBefore > 1, '这一天本来该跨帧')

  const before = statSync(dayFile(root, 'session-a', DAY)).size
  const result = packDay(root, 'session-a', DAY)
  const after = statSync(dayFile(root, 'session-a', DAY)).size
  assert.equal(result.skipped, undefined)
  assert.equal(after, result.after)
  assert.ok(after < before, `打包应该更小：${before} -> ${after}`)
  assert.ok(isPacked(root, 'session-a', DAY))

  // 一条流：帧表只剩一行，偏移表全部归到第 0 帧、偏移换成整天偏移
  const frames = readFileSync(framesFile(root, 'session-a', DAY), 'utf8').trim().split('\n')
  assert.equal(frames.length, 1)
  const idx = readFileSync(idxFile(root, 'session-a', DAY), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(idx.length, 40)
  assert.ok(idx.every((entry) => entry.f === 0))
  assert.equal(idx[0].o, 0)

  const reader = new MemoryReader({ root })
  for (const i of [0, 17, 39]) assert.ok(reader.read(i).text.startsWith(`${i}|`))
  assert.deepEqual(reader.verify(), [])
})

test('packing twice is a no-op', () => {
  const root = store()
  fill(root)
  packDay(root, 'session-a', DAY)
  const size = statSync(dayFile(root, 'session-a', DAY)).size
  assert.equal(packDay(root, 'session-a', DAY).skipped, 'packed')
  assert.equal(statSync(dayFile(root, 'session-a', DAY)).size, size)
})

test('the running day is left alone', () => {
  const root = store()
  fill(root)
  const result = packColdDays(root, { today: DAY })
  assert.equal(result.packed, 0)

  const other = packColdDays(root, { today: '2026-11-06' })
  assert.equal(other.packed, 1)
  assert.ok(other.after < other.before)
})

test('a packed day can still be read after the writer appends a newer day', () => {
  const root = store()
  fill(root)
  packDay(root, 'session-a', DAY)
  const writer = new MemoryWriter({ root })
  writer.append({ sessionId: 'session-a', eventSeq: 100, at: at + 86400000 * 2, kind: 'user/message', payload: { text: '后来的话' } })
  writer.close()

  const reader = new MemoryReader({ root })
  assert.ok(reader.read(39).text.startsWith('39|'))
  assert.equal(reader.read(40).text, '后来的话')
  assert.deepEqual(reader.verify(), [])
})
