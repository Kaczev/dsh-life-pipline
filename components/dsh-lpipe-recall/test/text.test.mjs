import assert from 'node:assert/strict'
import test from 'node:test'
import { recallRows, recallTexts } from '../src/text.mjs'
import { activityTextOf } from '../src/index.js'
import { fragmentSentences } from '../src/render.mjs'
import { fragmentSentencesOf, openRange } from '../src/open.mjs'
import { lexicalCorpus } from '../src/environment.mjs'
import { sentencesOf } from 'dsh-lpipe-starmap/build'

const rows = [
  { kind: 'tool/call', name: 'read_file', arguments: '{"text":"普通工具参数"}' },
  { kind: 'tool/result', text: '普通工具结果。' },
  { kind: 'tool/call', name: 'chat_send', arguments: JSON.stringify({ text: '发给你的正文。' }) },
  { kind: 'tool/result', text: '发送状态。' },
  { kind: 'tool/call', name: 'recall_open', arguments: '{}' },
  { kind: 'tool/result', text: '回忆输出。' },
].map((row, index) => ({ ...row, seq: index + 1, turn: 1, at: 1 }))

test('普通工具只保留原始记忆，抽星和响应只接收 chat_send 正文', () => {
  const before = JSON.stringify(rows)
  assert.deepEqual(recallRows(rows).map(row => row.text), ['', '', '发给你的正文。', '', '', ''])
  assert.deepEqual(recallTexts({ kind: 'tool/result', text: 'a'.repeat(600) }), [])
  assert.deepEqual(recallTexts({ kind: 'tool/result', text: 'a'.repeat(601) }), [])
  assert.equal(activityTextOf({ type: 'tool/call', data: rows[0] }), '')
  assert.equal(activityTextOf({ type: 'tool/call', data: { name: 'chat_send', arguments: { text: '对象参数正文' } } }), '对象参数正文')
  assert.equal(activityTextOf({ type: 'tool/result', data: { message: { content: [{ type: 'text', text: '结果' }] } } }, 'chat_send'), '')
  assert.deepEqual(sentencesOf({ rows }).map(sentence => sentence.text), ['发给你的正文。'])
  assert.equal(JSON.stringify(rows), before)
})

test('模糊选句、深读、BM25统一排除普通工具并保留发送正文', () => {
  const reader = { rows: () => rows }
  const candidate = { session: 's', turn: 1, stars: [], timeStrength: 1 }
  const excerpt = fragmentSentences({ reader, candidate, flicker: new Map(), limit: 200 })
  const original = fragmentSentencesOf(reader, 's', 1)
  assert.deepEqual(excerpt.lines.map(line => line.id), original.map(line => line.id))
  assert.deepEqual(original.map(line => line.text), ['发给你的正文。'])
  const deep = openRange({ reader, session: 's', from: { turn: 1, sentence: 1 }, count: 200 })
  assert.match(deep.text, /发给你的正文/)
  assert.doesNotMatch(deep.text, /普通工具|发送状态。|回忆输出/)
  const data = lexicalCorpus({ reader, repo: { turns: new Map([['s#1', candidate]]) } })
  assert.equal(data.documents.get('s#1').tf.has('工具'), false)
  assert.equal(data.documents.get('s#1').tf.has('正文'), true)
})
