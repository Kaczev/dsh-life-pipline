import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_PAIRS, SYSTEM_PROMPT, cleanStarName, createExtractor, dedupePairs, normalizeUsage, parsePairs, requestPairs, turnSource } from '../src/llm.mjs'
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

test('一条对话复用到底：前缀不变，只追加一问一答', async () => {
  const seen = []
  const llm = {
    async *stream(options) {
      seen.push(options.messages.map((entry) => entry.content[0].text))
      yield { type: 'text-delta', text: '[["记忆管线","星图"]]' }
      yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 80 } }
    },
  }
  const extractor = createExtractor({ llm })
  // 开局只有一条 system：指令并进系统提示词，后面严格 user → assistant 交替。
  assert.equal(extractor.size(), 1)

  const first = await extractor.ask('第一轮原文')
  assert.equal(first.ok, true)
  assert.deepEqual(first.usage, { input: 100, output: 20, cacheRead: 80 })
  assert.equal(extractor.size(), 3)

  await extractor.ask('第二轮原文')
  assert.equal(seen[1].length, 4, 'system + 上一问 + 上一答 + 这一问')
  // 上一次请求的那几条在这条里原封不动地重复了一遍：缓存能接着用。
  assert.deepEqual(seen[1].slice(0, seen[0].length), seen[0])
  assert.equal(seen[1][3], '第二轮原文')
})

test('调用失败把这一问撤回：下次重试的前缀和之前一样', async () => {
  let calls = 0
  const llm = {
    async *stream() {
      calls += 1
      if (calls === 1) {
        yield { type: 'finish', reason: { kind: 'error' } }
        return
      }
      yield { type: 'text-delta', text: '[["a","b"]]' }
    },
  }
  const extractor = createExtractor({ llm })
  const failed = await extractor.ask('第一轮')
  assert.equal(failed.ok, false)
  assert.equal(extractor.size(), 1, '失败的那一问要撤回')
  const ok = await extractor.ask('第一轮')
  assert.equal(ok.ok, true)
  assert.equal(extractor.size(), 3)
})

test('对话太长就换新的一条', async () => {
  const llm = {
    async *stream() {
      yield { type: 'text-delta', text: '[["a","b"]]' }
    },
  }
  const extractor = createExtractor({ llm, maxHistoryChars: 20 })
  await extractor.ask('x'.repeat(50))
  assert.equal(extractor.size(), 1, '超过上限后回到只有系统提示词的一条')
})

test('用量字段各家叫法不同，统一成 input / output / cacheRead', () => {
  assert.deepEqual(normalizeUsage({ input_tokens: 12, output_tokens: 3 }), { input: 12, output: 3, cacheRead: 0 })
  assert.deepEqual(normalizeUsage({ promptTokens: 7, completionTokens: 2, cachedTokens: 5 }), { input: 7, output: 2, cacheRead: 5 })
  assert.equal(normalizeUsage({}), null)
  assert.equal(normalizeUsage(null), null)
})
