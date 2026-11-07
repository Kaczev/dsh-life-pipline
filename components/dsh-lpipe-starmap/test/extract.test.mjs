import assert from 'node:assert/strict'
import test from 'node:test'

import { textsOf } from '../src/build.mjs'
import { clockOf, normalizeName } from '../src/extract.mjs'

test('名字只留一种写法：全角转半角、去首尾标点、路径只留两段', () => {
  assert.equal(normalizeName('「记忆管线」'), '记忆管线')
  assert.equal(normalizeName('  DSH-Lpipe-Starmap  '), 'DSH-Lpipe-Starmap')
  assert.equal(normalizeName('C:/Users/Kaczev/Documents/GitHub/dsh-life-pipline/x.mjs'), 'dsh-life-pipline/x.mjs')
  assert.equal(normalizeName('　星图。'), '星图')
})

test('时刻是模糊的：按十分钟取整', () => {
  assert.equal(clockOf('现在是 16:01'), 960)
  assert.equal(clockOf('下午四点左右'), 960)
  assert.equal(clockOf('晚上 9 点半'), 1290)
  assert.equal(clockOf('十一点'), 660)
  assert.equal(clockOf('没有提到时间'), null)
})

test('管线自己的话不进抽星输入：回忆注入、recall_* 工具名与结果都不算', () => {
  const injected = {
    seq: 1,
    toc: 1,
    kind: 'user/message',
    source: { kind: 'dsh-lpipe-recall' },
    text: '〔回忆 · 模糊〕记忆管线 与 星图 在 20:44 一起出现过。',
  }
  assert.deepEqual(textsOf(injected), [])

  const call = { seq: 2, kind: 'tool/call', name: 'recall_open' }
  assert.deepEqual(textsOf(call), [])
  assert.deepEqual(textsOf({ seq: 3, kind: 'tool/result', text: '片段 #128 的原文……' }, 'recall_open'), [])

  // 普通工具名与 chat_send 的正文照旧。
  assert.deepEqual(textsOf({ seq: 4, kind: 'tool/call', name: 'ops_read_files' }).length, 0)
  const chat = { seq: 5, kind: 'tool/call', name: 'chat_send', arguments: JSON.stringify({ text: '今晚 23:30 睡' }) }
  assert.deepEqual(textsOf(chat), ['今晚 23:30 睡'])
})
