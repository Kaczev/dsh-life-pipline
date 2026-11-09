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
  assert.equal(imagesOfRows([{ kind: 'user/message', parts: [{ ...part, type: 'file' }] }]).length, 1)
  assert.equal(imagesOfRows([{ parts: [{ ...part, mediaType: 'application/pdf' }] }]).length, 0)
  assert.equal(imagesOfRows([{ parts: [{ type: 'image', mediaError: 'missing' }] }]).length, 0)
  const opened = openRange({ reader, session: 'repo', from: { turn: 5, sentence: 1 }, count: 1 })
  assert.match(opened.text, new RegExp(id))
  assert.match(opened.text, /〔图片 1 张〕/); assert.doesNotMatch(opened.text, /记忆行/)
  const imageOnly = openRange({ reader, session: 'repo', from: { turn: 6, sentence: 1 } })
  assert.match(imageOnly.text, /共 0 句/)
  assert.match(imageOnly.text, new RegExp(id))
})

test('深读列全图片，模糊回忆最多九张并提示续查', () => {
  const many = { rows: () => [{ ...rows[0], parts: Array.from({ length: 30 }, (_, i) => ({ ...part, sha256: i.toString(16).padStart(64, '0') })) }] }
  const first = openRange({ reader: many, session: 'repo', from: { turn: 5, sentence: 1 } })
  assert.match(first.text, /〔图片 30 张〕/)
  assert.equal((first.text.match(/（[a-f0-9]{64}）/g) ?? []).length, 30); assert.doesNotMatch(first.text, /imagesOffset=/)
  const second = openRange({ reader: many, session: 'repo', from: { turn: 5, sentence: 1 }, imagesOffset: 24 })
  assert.equal((second.text.match(/（[a-f0-9]{64}）/g) ?? []).length, 6)
  const text = renderRecall({ candidates: [{ session: 'repo', turn: 5, excerpt: { images: [{id}], imageCount: 1, total: 1, lines: [{ id: 1, text: '看图。' }] } }], reader, config: {}, flicker: new Map() })
  assert.match(text, /〔图片 1 张〕/)
  assert.match(text, new RegExp(id))
  const fuzzy = renderRecall({ candidates: [{session:'repo',turn:5,at:new Date(2026,10,9,4,43).getTime()}], reader:many, config:{sentencesPerFragment:2}, flicker:new Map([['image',{name:'图片',kind:'exact',score:1}]]) })
  assert.match(fuzzy, /\| 11-09 04:43 \| 本片段/)
  assert.match(fuzzy, /〔图片 30 张〕/)
  assert.equal((fuzzy.match(/（[a-f0-9]{64}）/g) ?? []).length, 9)
  assert.match(fuzzy, /……（用 recall_open 读取本片段的完整图片清单）/)
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


test('图片引用统一置于所属片段头，不穿插消息正文', () => {
  const secondId = 'b'.repeat(64)
  const thirdId = 'c'.repeat(64)
  const records = [
    { seq: 10, turn: 5, kind: 'user/message', text: '第一条。第二句。', parts: [part] },
    { seq: 11, turn: 5, kind: 'assistant/message', text: '助手答复。', parts: [] },
    { seq: 12, turn: 5, kind: 'user/message', text: '稍后的说明。', parts: [{ ...part, sha256: secondId }] },
    { seq: 13, turn: 5, kind: 'tool/result', text: '工具输出不能显示。', parts: [{ ...part, sha256: thirdId }] },
    { seq: 14, turn: 6, kind: 'user/message', text: '下一片段。', parts: [part] },
  ]
  const r = { rows: () => records }
  const text = openRange({ reader: r, session: 'repo', from: { turn: 5, sentence: 1 }, count: 1 }).text
  assert.ok(text.indexOf(id) < text.indexOf('第一条。'))
  assert.ok(text.indexOf(id) < text.indexOf(secondId))
  assert.ok(text.indexOf(secondId) < text.indexOf('第一条。'))
  assert.doesNotMatch(text, /记忆行|本次未读取/)
  assert.doesNotMatch(text, /稍后的说明|工具输出不能显示/)
  assert.doesNotMatch(text, /记忆行 13|工具结果/)
  const across = openRange({ reader: r, session: 'repo', from: { turn: 5, sentence: 4 }, to: { turn: 6, sentence: 1 } }).text
  assert.doesNotMatch(across, new RegExp(thirdId))
  assert.ok(across.indexOf('lpipe_recall_id[repo:6]') < across.lastIndexOf('（' + id + '）'))
  assert.throws(() => openRange({ reader: { rows: () => [rows[1]] }, session: 'repo', from: { turn: 6, sentence: 1 }, count: 0 }), /count/)
})
