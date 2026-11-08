import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { imagesOfRows } from '../src/images.mjs'
import { createRecallTools } from '../src/tools.mjs'
import { openRange } from '../src/open.mjs'
import { renderRecall } from '../src/render.mjs'
const data = Buffer.from('test image bytes')
const id = createHash('sha256').update(data).digest('hex')
const part = { type: 'image', sha256: id, mediaType: 'image/png', bytes: data.length }
const rows = [{ seq: 8, turn: 5, kind: 'user/message', text: '看这张图片。', parts: [part, part] }, { seq: 9, turn: 6, kind: 'user/message', text: '', parts: [part] }]
const reader = { rows: repo => repo === 'repo' ? rows : [], media: (seq, hash) => seq === 8 && hash === id ? data : null }

test('图片引用稳定、片段内去重，只发现图片，不读取媒体', () => {
  assert.equal(imagesOfRows(rows).length, 1)
  assert.equal(imagesOfRows([{ parts: [{ ...part, type: 'file' }] }]).length, 1)
  assert.equal(imagesOfRows([{ parts: [{ ...part, mediaType: 'application/pdf' }] }]).length, 0)
  assert.equal(imagesOfRows([{ parts: [{ type: 'image', mediaError: 'missing' }] }]).length, 0)
  const opened = openRange({ reader, session: 'repo', from: { turn: 5, sentence: 1 }, count: 1 })
  assert.match(opened.text, new RegExp(id))
  assert.match(opened.text, /记忆行 8/)
  const imageOnly = openRange({ reader, session: 'repo', from: { turn: 6, sentence: 1 } })
  assert.match(imageOnly.text, /共 0 句/)
  assert.match(imageOnly.text, new RegExp(id))
})

test('清单按24张分页，模糊回忆仅提示数量', () => {
  const many = { rows: () => [{ ...rows[0], parts: Array.from({ length: 30 }, (_, i) => ({ ...part, sha256: i.toString(16).padStart(64, '0') })) }] }
  const first = openRange({ reader: many, session: 'repo', from: { turn: 5, sentence: 1 } })
  assert.match(first.text, /共 30 张/)
  assert.match(first.text, /imagesOffset=24/)
  const second = openRange({ reader: many, session: 'repo', from: { turn: 5, sentence: 1 }, imagesOffset: 24 })
  assert.equal((second.text.match(/记忆行/g) ?? []).length, 6)
  const text = renderRecall({ candidates: [{ session: 'repo', turn: 5, excerpt: { imageCount: 1, total: 1, lines: [{ id: 1, text: '看图。' }] } }], reader, config: {}, flicker: new Map() })
  assert.match(text, /含 1 张图片/)
  assert.doesNotMatch(text, new RegExp(id))
})

test('按需返回一张持久图片引用，验证所属片段、缺失和校验错误', async () => {
  const saved = []
  const attachment = { attachmentId: 'stored', mediaType: 'image/png', bytes: 10, width: 1, height: 1 }
  const tool = createRecallTools({ reader, attachments: { saveImage: async input => { saved.push(input); return attachment } } }).find(t => t.name === 'recall_image')
  const args = { repo: 'repo', fragment: 5, image: id }
  const value = await tool.execute(args)
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0].data, data)
  assert.deepEqual(tool.output.render(args, value)[1], { type: 'image', attachment })
  await assert.rejects(() => tool.execute({ ...args, fragment: 7 }), /belong/)
  await assert.rejects(() => tool.execute({ ...args, fragment: 6 }), /missing/)
  await assert.rejects(() => tool.execute({ ...args, image: '../bad' }), /SHA-256/)
  assert.equal(saved.length, 1)
  const corrupt = createRecallTools({ reader: { ...reader, media: () => Buffer.from('wrong') }, attachments: { saveImage: () => { throw Error('not reached') } } }).find(t => t.name === 'recall_image')
  await assert.rejects(() => corrupt.execute(args), /checksum/)
})
