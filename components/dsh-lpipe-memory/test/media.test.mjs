import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { captureMedia, sniff } from '../src/media.mjs'
import { mediaFile } from '../src/paths.mjs'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')
const JPG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex')

function scratch() {
  return mkdtempSync(join(tmpdir(), 'life-media-'))
}

function fakeAttachments(map, { imageOnly = false } = {}) {
  return {
    imageHostPath(ref) {
      if (imageOnly && ref.kind !== 'image') throw new Error('not an image')
      if (!map[ref.attachmentId]) throw new Error('unknown attachment')
      return map[ref.attachmentId]
    },
    fileHostPath(ref) {
      if (!map[ref.attachmentId]) throw new Error('unknown attachment')
      return map[ref.attachmentId]
    },
  }
}

test('image bytes land under media/ and the part carries sha256 instead of the ref', () => {
  const root = scratch()
  const file = join(root, 'src.png')
  writeFileSync(file, PNG)
  const attachments = fakeAttachments({ a1: file })
  const { parts, media } = captureMedia({
    attachments,
    root,
    parts: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: 'a1', mediaType: 'image/png' } }],
  })

  assert.equal(parts[0].type, 'text')
  assert.equal(parts[1].sha256, media[0].sha256)
  assert.equal(parts[1].mediaType, 'image/png')
  assert.equal(parts[1].bytes, PNG.length)
  assert.equal(media.length, 1)
  const stored = mediaFile(root, media[0].sha256, 'png')
  assert.ok(existsSync(stored))
  assert.deepEqual(readFileSync(stored), PNG)
  // 字节不进日志
  assert.equal(JSON.stringify(media[0]).includes('iVBOR'), false)
})

test('the same image twice is stored once', () => {
  const root = scratch()
  const file = join(root, 'a.png')
  writeFileSync(file, PNG)
  const attachments = fakeAttachments({ a1: file })

  captureMedia({ attachments, root, parts: [{ type: 'image', attachment: { attachmentId: 'a1' } }] })
  captureMedia({ attachments, root, parts: [{ type: 'image', attachment: { attachmentId: 'a1' } }] })

  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name)
      if (entry.isDirectory()) walk(next)
      else found.push(next)
    }
  }
  walk(join(root, 'media'))
  assert.equal(found.length, 1)
})

test('a file attachment is stored too, keeping its name', () => {
  const root = scratch()
  const file = join(root, 'note.txt')
  writeFileSync(file, '记忆在这里\n')
  const attachments = fakeAttachments({ f1: file })
  const { media } = captureMedia({
    attachments,
    root,
    parts: [{ type: 'file', attachment: { attachmentId: 'f1', name: 'note.txt' } }],
  })
  assert.equal(media.length, 1)
  assert.equal(media[0].name, 'note.txt')
  assert.ok(existsSync(mediaFile(root, media[0].sha256, 'bin')))
})

test('an unreadable attachment is noted, never fatal', () => {
  const root = scratch()
  const notes = []
  const { parts, media } = captureMedia({
    attachments: fakeAttachments({}),
    root,
    parts: [{ type: 'image', attachment: { attachmentId: 'missing' } }],
    log: (message) => notes.push(message),
  })
  assert.equal(media.length, 0)
  assert.ok(parts[0].mediaError)
  assert.equal(notes.length, 1)
})

test('no attachments service at all leaves the part alone and says why', () => {
  const root = scratch()
  const { parts, media } = captureMedia({
    attachments: null,
    root,
    parts: [{ type: 'image', attachment: { attachmentId: 'a1' } }],
    log: () => {},
  })
  assert.equal(media.length, 0)
  assert.equal(parts[0].mediaError, '宿主没给这个附件的落盘路径')
})

test('format is decided by magic bytes, not by the declared type', () => {
  assert.equal(sniff(JPG).mediaType, 'image/jpeg')
  assert.equal(sniff(PNG).ext, 'png')
  assert.equal(sniff(Buffer.from('hello world, not an image')).mediaType, 'application/octet-stream')
})
