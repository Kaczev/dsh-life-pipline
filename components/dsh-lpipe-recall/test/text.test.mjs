import assert from 'node:assert/strict'
import test from 'node:test'
import { recallRows, recallTexts } from '../src/text.mjs'
import { activityTextOf } from '../src/index.js'
import { fragmentSentences, pieces } from '../src/render.mjs'
import { fragmentSentencesOf, openRange } from '../src/open.mjs'
import { lexicalCorpus } from '../src/environment.mjs'
import { sentencesOf } from 'dsh-lpipe-starmap/build'

const rows = [
  { kind: 'tool/call', callId: 'a', name: 'read_file', arguments: '{"secret":"不展示参数"}' },
  { kind: 'tool/result', callId: 'a', text: '工具短结果。' },
  { kind: 'tool/result', callId: 'a', text: '长'.repeat(601) },
  { kind: 'tool/call', callId: 'b', name: 'chat_send', arguments: JSON.stringify({ text: '发给你的正文。' }) },
  { kind: 'tool/result', callId: 'b', text: '发送正文'.repeat(200) },
  { kind: 'tool/call', callId: 'c', name: 'recall_open', arguments: '{}' },
  { kind: 'tool/result', callId: 'c', text: '排除回忆输出。' },
  { kind: 'tool/call', callId: 'd', name: 'inspect_state', arguments: '{}' },
  { kind: 'tool/result', callId: 'd', text: '{"status":"短JSON也展示"}' },
].map((row, index) => ({ ...row, seq: index + 1, turn: 1, at: 1 }))

test('工具文本与抽星取材对齐：名称、600边界、发送正文、管线排除、调用关联', () => {
  const projected = recallRows(rows, { reasoning: true }).map(row => row.text)
  assert.equal(projected[0], 'read_file')
  assert.equal(projected[1], '工具短结果。')
  assert.equal(projected[2], '')
  assert.equal(projected[3], '发给你的正文。')
  assert.equal(projected[4], '发送正文'.repeat(200))
  assert.equal(projected[5], '')
  assert.equal(projected[6], '')
  assert.equal(recallTexts({ kind: 'tool/result', text: 'a'.repeat(600) })[0].length, 600)
  assert.deepEqual(recallTexts({ kind: 'tool/result', text: 'a'.repeat(601) }), [])
  assert.equal(activityTextOf({ type: 'tool/call', data: { name: 'chat_send', arguments: { text: '对象参数正文' } } }), '对象参数正文')
  assert.equal(activityTextOf({ type: 'tool/call', data: rows[0] }), 'read_file')
  assert.equal(activityTextOf({ type: 'tool/result', data: { message: { content: [{ type: 'text', text: '真实事件结果' }] } } }, 'read_file'), '真实事件结果')
  assert.equal(activityTextOf({ type: 'tool/result', data: { message: { content: [{ type: 'text', text: '回忆输出' }] } } }, 'recall_open'), '')
  const indexed = sentencesOf({ rows }).map(sentence => sentence.text).join('\n')
  assert.ok(indexed.includes(projected[0]) && indexed.includes(projected[1]) && indexed.includes(projected[3]))
  const interleaved = recallRows([rows[0], rows[5], rows[1], rows[6]])
  assert.equal(interleaved[2].text, '工具短结果。')
  assert.equal(interleaved[3].text, '')
})

test('工具短文本统一进入词面、模糊选句与深读，工具名不被代码过滤，句坐标一致', () => {
  const reader = { rows: () => rows }
  const candidate = { session: 's', turn: 1, stars: [], timeStrength: 1 }
  const excerpt = fragmentSentences({ reader, candidate, flicker: new Map(), limit: 200 })
  const original = fragmentSentencesOf(reader, 's', 1)
  assert.deepEqual(excerpt.lines.map(line => line.id), original.map(line => line.id))
  assert.equal(original[0].text, 'read_file')
  const text = original.map(line => line.text).join('\n')
  assert.match(text, /工具短结果/)
  assert.match(text, /发给你的正文/)
  assert.match(text, /短JSON也展示/)
  assert.doesNotMatch(text, /不展示参数|长{601}|排除回忆输出/)
  const deep = openRange({ reader, session: 's', from: { turn: 1, sentence: 1 }, count: 200 })
  assert.match(deep.text, /工具调用/)
  assert.match(deep.text, /read_file/)
  assert.match(deep.text, /工具结果/)
  assert.match(deep.text, /发给你的正文/)
  const data = lexicalCorpus({ reader, repo: { turns: new Map([['s#1', candidate]]) } })
  assert.equal(data.documents.get('s#1').tf.has('短结'), true)
  assert.equal(data.documents.get('s#1').tf.has('正文'), true)
})
