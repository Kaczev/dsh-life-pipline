import test from 'node:test'
import assert from 'node:assert/strict'
import { recallRows, displayRows } from '../src/text.mjs'
import { textOfEvent, triggerFromMessages, recentText } from '../src/index.js'

const body = '我喜欢蓝莓。\n[QQ · 用户自己写的标记] 12345'
const text = '09:37\n(Owner)[微信 · 小林 · wx_123] ' + body + '\n〔用 chat_history 续读〕'
const source = { kind: 'dsh-lpipe-chat', recallOrigins: [{ start: text.indexOf(body), end: text.indexOf(body) + body.length, channel: 'weixin', senderName: '小林', senderId: 'wx_123' }] }
const row = { kind: 'user/message', text, source }

test('聊天实时触发、历史背景统一纯正文，展示仍使用原始坐标', () => {
  const before = JSON.stringify(row)
  const content = [{ type: 'text', text }]
  assert.equal(textOfEvent({ source, content }), body)
  assert.equal(triggerFromMessages([{ role: 'user', source, content }]).text, body)
  assert.equal(recallRows([row])[0].text, body)
  assert.equal(recentText([row], 32000), body)
  assert.equal(displayRows([row])[0].segments[0].text, body)
  assert.equal(JSON.stringify(row), before)
})

test('普通用户原文不删标记；主动唤醒只取理由，自然唤醒不匹配', () => {
  assert.equal(textOfEvent({ source: { kind: 'user' }, text }), text)
  const planned = { text: '（主动醒来）我给自己定的时间是 09:37。\n我留给这一刻的话：买蓝莓。', source: { kind: 'dsh-lpipe-wake', wake: 'planned' } }
  assert.equal(textOfEvent(planned), '买蓝莓。')
  assert.equal(recallRows([{ ...planned, kind: 'user/message' }])[0].text, '买蓝莓。')
  assert.equal(textOfEvent({ ...planned, source: { ...planned.source, wake: 'natural' } }), '')
  assert.equal(textOfEvent({ source: { kind: 'dsh-lpipe-wake', wake: 'planned' }, text: '（主动醒来）我给自己定的时间是 09:37。' }), '')
  assert.deepEqual(triggerFromMessages([
    { role: 'user', source: { kind: 'user' }, content: '旧的问题' },
    { role: 'user', ...planned, text: '（主动醒来）我给自己定的时间是 09:37。' },
  ]), { skip: 'empty-text' })
})
