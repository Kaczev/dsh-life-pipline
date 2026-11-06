import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_PAIRS, SYSTEM_PROMPT, cleanStarName, dedupePairs, parsePairs, requestPairs, turnSource } from '../src/llm.mjs'
import { textsOf } from '../src/build.mjs'

test('解析模型回复：纯数组、代码块、夹着废话都能抠出来', () => {
  assert.deepEqual(parsePairs('[["记忆管线","星图"]]'), [['记忆管线', '星图']])
  assert.deepEqual(parsePairs('```json\n[["a","b"]]\n```'), [['a', 'b']])
  assert.deepEqual(parsePairs('好的，结果如下：[["记忆管线","唤醒管线"]] 希望有用'), [['记忆管线', '唤醒管线']])
  assert.equal(parsePairs('我不太确定'), null)
  assert.equal(parsePairs(''), null)
})

test('对子归一：去引号、去自己配自己、同一对只留一份', () => {
  assert.equal(cleanStarName('「记忆管线」'), '记忆管线')
  assert.equal(cleanStarName(' `dsh-lpipe-memory` '), 'dsh-lpipe-memory')
  assert.equal(cleanStarName('星图。'), '星图')
  assert.deepEqual(
    dedupePairs([['记忆管线', '星图'], ['星图', '记忆管线'], ['星图', '星图'], ['', 'x'], 'not-a-pair']),
    [['记忆管线', '星图']],
  )
})

test('提示词只要成对的概念，并给出上限', () => {
  assert.match(SYSTEM_PROMPT, /原样摘自原文/)
  assert.match(SYSTEM_PROMPT, new RegExp(`最多 ${MAX_PAIRS} 对`))
  assert.match(SYSTEM_PROMPT, /只输出 JSON 数组/)
})

test('一轮的原文带上说话的人；注入的上下文不算', () => {
  const turn = {
    rows: [
      { kind: 'user/message', text: '记忆管线先落盘。' },
      { kind: 'user/message', source: { kind: 'runtime-context' }, text: '这是注入的短期上下文' },
      { kind: 'assistant/message', text: '好的。' },
    ],
  }
  const source = turnSource(turn, textsOf)
  assert.match(source, /\[用户\] 记忆管线先落盘。/)
  assert.match(source, /\[助手\] 好的。/)
  assert.equal(source.includes('注入的短期上下文'), false)
})

test('模型调用：流里的文本拼起来再解析；失败不抛', async () => {
  const llm = {
    async *stream() {
      yield { type: 'text-delta', text: '[["记忆管线",' }
      yield { type: 'text-delta', text: ' "星图"]]' }
    },
  }
  const ok = await requestPairs({ llm, source: '记忆管线与星图' })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.pairs, [['记忆管线', '星图']])

  const broken = {
    async *stream() {
      yield { type: 'finish', reason: { kind: 'error' } }
    },
  }
  const failed = await requestPairs({ llm: broken, source: 'x' })
  assert.equal(failed.ok, false)

  assert.equal((await requestPairs({ llm: null, source: 'x' })).ok, false)
  const empty = await requestPairs({ llm, source: '' })
  assert.equal(empty.ok, true)
  assert.deepEqual(empty.pairs, [])
})
