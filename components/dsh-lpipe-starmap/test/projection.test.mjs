import test from 'node:test'
import assert from 'node:assert/strict'
import { planTurn, textsOf } from '../src/build.mjs'
import { turnSource, SYSTEM_PROMPT } from '../src/llm.mjs'
import { manualWakeText } from '../../dsh-lpipe-wake/src/engine.mjs'

const body = '我喜欢蓝莓，晚上8点测得 648.5。'
const text = '2026-11-10 09:37\n(Owner)[QQ · 群 987654321 · 小林 · 123456789] ' + body + '\n〔正文未完；用 chat_history 续读〕'
const start = text.indexOf(body)
const chat = { kind: 'user/message', seq: 1, text, source: { kind: 'dsh-lpipe-chat', recallOrigins: [{ start, end: start + body.length, senderName: '小林' }] } }

test('聊天来源仍送模型并允许昵称配对，模糊星与 clock 只取正文', () => {
  const turn = { rows: [chat] }
  assert.equal(textsOf(chat)[0], text)
  assert.match(turnSource(turn, textsOf), /123456789/)
  const result = planTurn(turn, [['小林', '蓝莓']])
  assert.deepEqual([...result.names.values()].filter(n => ['小林', '蓝莓'].includes(n)), ['小林', '蓝莓'])
  const fuzzy = [...result.fuzzy.values()]
  assert.ok(fuzzy.some(s => s.name === '20:00'))
  assert.ok(fuzzy.some(s => s.value === 648.5))
  assert.ok(!fuzzy.some(s => [987654321, 123456789, 2026].includes(s.value)))
  assert.ok(!fuzzy.some(s => s.name === '09:37'))
  assert.ok(result.lines.some(line => line.clock === 1200))
  assert.ok(!result.lines.some(line => line.clock === 580))
  assert.match(SYSTEM_PROMPT, /sender nickname may be an accurate star/)
  assert.match(SYSTEM_PROMPT, /group IDs/)
  assert.doesNotMatch(SYSTEM_PROMPT, /group name|群名/i)
})

test('自然唤醒无抽星文本，主动唤醒只抽安排理由', () => {
  const planned = { kind: 'user/message', seq: 2, text: '（主动醒来）我给自己定的时间是 09:37。\n我留给这一刻的话：买蓝莓，晚上8点出发。', source: { kind: 'dsh-lpipe-wake', wake: 'planned' } }
  assert.deepEqual(textsOf(planned), ['买蓝莓，晚上8点出发。'])
  assert.deepEqual(textsOf({ ...planned, source: { ...planned.source, wake: 'natural' } }), [])
  const plan = planTurn({ rows: [planned] }, [])
  assert.ok([...plan.names.values()].includes('20:00'))
  assert.ok(![...plan.names.values()].includes('09:37'))
  const produced = { ...planned, text: manualWakeText({ now: Date.now(), at: Date.now(), reason: '买蓝莓。\n晚上8点出发。' }) }
  assert.deepEqual(textsOf(produced), ['买蓝莓。\n晚上8点出发。'])
})
