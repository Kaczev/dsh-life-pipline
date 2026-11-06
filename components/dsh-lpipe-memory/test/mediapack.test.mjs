import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { appendMedia, mediaIndex, mediaPackBytes, readMedia } from '../src/mediapack.mjs'
import { MemoryReader } from '../src/reader.mjs'
import { MemoryWriter } from '../src/writer.mjs'

const AT = new Date('2026-11-05T12:00:00+08:00').getTime()
const DAY = '2026-11-05'

function scratch() {
  return mkdtempSync(join(tmpdir(), 'life-mediapack-'))
}

const png = (n) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(n, n % 250)])

test('images appended to a day come back byte for byte', () => {
  const root = scratch()
  const first = { sha256: 'a'.repeat(64), ext: 'png', mediaType: 'image/png', bytes: png(600) }
  const second = { sha256: 'b'.repeat(64), ext: 'png', mediaType: 'image/png', bytes: png(900), name: 'b.png' }

  assert.equal(appendMedia(root, 'session-a', DAY, [first]).added, 1)
  assert.equal(appendMedia(root, 'session-a', DAY, [second]).added, 1)

  assert.deepEqual(readMedia(root, 'session-a', DAY, first.sha256), first.bytes)
  assert.deepEqual(readMedia(root, 'session-a', DAY, second.sha256), second.bytes)
  assert.equal(readMedia(root, 'session-a', DAY, 'c'.repeat(64)), null)
  assert.equal(mediaIndex(root, 'session-a', DAY).size, 2)
  assert.ok(mediaPackBytes(root, 'session-a', DAY) > 0)
})

test('the same image within a day is stored once', () => {
  const root = scratch()
  const image = { sha256: 'd'.repeat(64), ext: 'png', mediaType: 'image/png', bytes: png(400) }
  assert.equal(appendMedia(root, 'session-a', DAY, [image]).added, 1)
  assert.equal(appendMedia(root, 'session-a', DAY, [image]).added, 0)
  assert.equal(mediaIndex(root, 'session-a', DAY).size, 1)

  // 同一批发进来两次也只落一份
  const twin = { sha256: 'e'.repeat(64), ext: 'png', mediaType: 'image/png', bytes: png(300) }
  assert.equal(appendMedia(root, 'session-a', DAY, [twin, twin]).added, 1)
})

test('a row and its image stay together through the writer and the reader', () => {
  const root = scratch()
  const image = { sha256: 'f'.repeat(64), ext: 'png', mediaType: 'image/png', bytes: png(512) }
  appendMedia(root, 'session-a', DAY, [image])

  const writer = new MemoryWriter({ root })
  writer.append({
    sessionId: 'session-a',
    eventSeq: 0,
    at: AT,
    kind: 'user/message',
    payload: { text: '看图', media: [{ sha256: image.sha256, mediaType: 'image/png', bytes: image.bytes.length }] },
  })
  writer.close()

  const reader = new MemoryReader({ root })
  assert.equal(reader.dayOf(0), DAY)
  assert.deepEqual(reader.media(0, image.sha256), image.bytes)
  assert.equal(reader.media(0, '0'.repeat(64)), null)
  assert.equal(reader.media(99, image.sha256), null)
})

test('two sessions on the same day do not share a pack', () => {
  const root = scratch()
  const image = { sha256: '1'.repeat(64), ext: 'png', mediaType: 'image/png', bytes: png(256) }
  appendMedia(root, 'session-a', DAY, [image])
  assert.equal(readMedia(root, 'session-b', DAY, image.sha256), null)
  assert.equal(mediaIndex(root, 'session-b', DAY).size, 0)
})
