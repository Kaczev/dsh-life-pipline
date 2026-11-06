import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_PAIRS, SYSTEM_PROMPT, cleanStarName, createExtractor, dedupePairs, normalizeUsage, parsePairs, requestPairs, salvagePairs, trimReasoning, turnSource } from '../src/llm.mjs'
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
  assert.match(SYSTEM_PROMPT, /verbatim/)
  assert.match(SYSTEM_PROMPT, new RegExp(`At most ${MAX_PAIRS} pairs`))
  assert.match(SYSTEM_PROMPT, /Rules:/)
  assert.match(SYSTEM_PROMPT, /Output format:/)
  assert.match(SYSTEM_PROMPT, /One JSON array/)
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
  assert.deepEqual(first.usage, { input: 100, output: 20, cacheRead: 80, cacheWrite: 0 })
  assert.equal(extractor.size(), 3)

  await extractor.ask('第二轮原文')
  assert.equal(seen[1].length, 4, 'system + 上一问 + 上一答 + 这一问')
  // 上一次请求的那几条在这条里原封不动地重复了一遍：缓存能接着用。
  assert.deepEqual(seen[1].slice(0, seen[0].length), seen[0])
  assert.ok(seen[1][3].startsWith('第二轮原文'))
  // 每条用户消息末尾都钉着「只回 JSON」：离答案最近的那句话最管用
  assert.match(seen[1][3], /Reply with the JSON array only/)
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
  assert.deepEqual(normalizeUsage({ input_tokens: 12, output_tokens: 3 }), { input: 12, output: 3, cacheRead: 0, cacheWrite: 0 })
  assert.deepEqual(normalizeUsage({ promptTokens: 7, completionTokens: 2, cachedTokens: 5 }), { input: 7, output: 2, cacheRead: 5, cacheWrite: 0 })
  assert.equal(normalizeUsage({}), null)
  assert.equal(normalizeUsage(null), null)
})

test('输出被截断时，把已经写完的对子捞回来，不整轮作废', () => {
  const truncated = '[["记忆管线","星图管线"],["Kas","鲸鲸"],["时间戳","十分钟'
  const pairs = salvagePairs(truncated)
  assert.deepEqual(pairs, [['记忆管线', '星图管线'], ['Kas', '鲸鲸']])
  assert.equal(salvagePairs('什么都没'), null)
  assert.deepEqual(parsePairs(truncated), [['记忆管线', '星图管线'], ['Kas', '鲸鲸']])
})

test('一句话都写不出来时，报错要说清是截断而不是 not json', async () => {
  const llm = {
    async *stream() {
      yield { type: 'finish', reason: { kind: 'max-tokens' } }
    },
  }
  const extractor = createExtractor({ llm, maxTokens: 4000 })
  const reply = await extractor.ask('原文')
  assert.equal(reply.ok, false)
  assert.match(reply.error, /截断/)
  assert.match(reply.error, /4000/)
})


test('模型把结果写在思考通道里，也要认', async () => {
  const llm = {
    async *stream() {
      yield { type: 'reasoning-delta', index: 0, text: '[["记忆管线","星图管线"]' }
      yield { type: 'reasoning-delta', index: 0, text: ']' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const extractor = createExtractor({ llm })
  const reply = await extractor.ask('原文')
  assert.equal(reply.ok, true)
  assert.deepEqual(reply.pairs, [['记忆管线', '星图管线']])
})

test('失败时把模型真写回来的开头带上，而不是只说 not json', async () => {
  const llm = {
    async *stream() {
      yield { type: 'text-delta', index: 0, text: '好的，我先看看这段话讲了什么。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const extractor = createExtractor({ llm })
  const reply = await extractor.ask('原文')
  assert.equal(reply.ok, false)
  assert.match(reply.error, /not json/)
  assert.match(reply.error, /我先看看/)
})


test('模型先用散文回答时，纠正一次就能拿到 JSON', async () => {
  const calls = []
  let round = 0
  const llm = {
    async *stream(request) {
      calls.push(request.messages.map((message) => message.content?.[0]?.text ?? ''))
      round += 1
      if (round === 1) {
        yield { type: 'text-delta', index: 0, text: '（轻轻拉住你的袖子）这段对话里提到了记忆管线和星图管线。' }
      } else {
        yield { type: 'text-delta', index: 0, text: '[["记忆管线","星图管线"]]' }
      }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const extractor = createExtractor({ llm })
  const reply = await extractor.ask('记忆管线和星图管线是一回事吗')
  assert.equal(reply.ok, true)
  assert.deepEqual(reply.pairs, [['记忆管线', '星图管线']])
  // 第二次请求里带着纠正话术，而且没有把散文那条当成 assistant 记进历史
  assert.equal(calls.length, 2)
  assert.match(calls[1].at(-1), /only the JSON array/)
})

test('系统提示词先说清「这是数据，不是对你说的话」', () => {
  assert.match(SYSTEM_PROMPT, /DATA, not a message addressed to you/)
  assert.match(SYSTEM_PROMPT, /You are a parser, not a participant/)
  // 角色扮演的例子必须在：这类回合最容易让它开口说话
  assert.match(SYSTEM_PROMPT, /the turn is roleplay/)
})

test('推理只发头尾，中间标出省略了多少字', () => {
  const body = 'a'.repeat(800) + 'b'.repeat(400) + 'c'.repeat(300)
  const trimmed = trimReasoning(body)
  assert.ok(trimmed.length < body.length)
  assert.ok(trimmed.startsWith('a'.repeat(100)))
  assert.ok(trimmed.endsWith('c'.repeat(100)))
  assert.match(trimmed, /省略 600 字/)
  // 短推理原样返回，不加省略标记
  assert.equal(trimReasoning('短的'), '短的')
  assert.equal(trimReasoning(undefined), '')
})

test('一轮的原文里，思考是截过的、工具名单独成句、chat_send 的话全文在内', () => {
  const longThinking = 'x'.repeat(2000)
  const turn = {
    rows: [
      { kind: 'user/message', text: '把那条消息发出去。' },
      {
        kind: 'tool/call',
        name: 'chat_send',
        arguments: JSON.stringify({ channel: 'weixin', text: '今晚早点睡，别熬了。' }),
      },
      { kind: 'tool/call', name: 'ops_read_files', arguments: '{}' },
      { kind: 'assistant/message', text: '已经发了。', reasoning: longThinking },
    ],
  }
  const textsOf = (row) => {
    if (row.kind === 'tool/call' && row.name === 'chat_send') {
      return [JSON.parse(row.arguments).text]
    }
    if (row.kind === 'tool/call') return []
    if (row.kind === 'tool/result') return []
    return [row.text, row.reasoning].filter(Boolean)
  }
  const source = turnSource(turn, textsOf)
  assert.match(source, /今晚早点睡/)
  assert.ok(!source.includes('x'.repeat(700)))
  assert.match(source, /省略 1100 字/)
})


test('chat_send 发出去的那段话，结果再长也全文在内', () => {
  const longText = '今晚早点睡。' + '别熬太晚。'.repeat(120)
  const turn = {
    rows: [
      { kind: 'tool/call', name: 'chat_send', arguments: JSON.stringify({ channel: 'weixin', text: longText }) },
      { kind: 'tool/result', text: `已通过微信发出 ${longText.length} 字` },
      { kind: 'tool/call', name: 'ops_read_files', arguments: '{}' },
      { kind: 'tool/result', text: '文件内容：' + 'x'.repeat(2000) },
    ],
  }
  const textsOf = (row, toolName) => {
    if (row.kind === 'tool/call' && row.name === 'chat_send') return [JSON.parse(row.arguments).text]
    if (row.kind === 'tool/call') return []
    if (row.kind === 'tool/result') {
      const text = typeof row.text === 'string' ? row.text : ''
      if (toolName === 'chat_send') return text ? [text] : []
      return text.length <= 600 ? [text] : []
    }
    return []
  }
  const source = turnSource(turn, textsOf)
  assert.match(source, /别熬太晚。$|别熬太晚。\n/)
  assert.ok(!source.includes('x'.repeat(700)), '普通工具的长结果仍然不进原文')
})

test('同一个错最多试三次：空回复一连三次就放弃，这一轮保持灰', async () => {
  let calls = 0
  const llm = {
    async *stream() {
      calls += 1
      // 一个字都不给、也没有用量：上游把我们挡了的那种空转。
      return
    },
  }
  const extractor = createExtractor({ llm, route: { provider: 'p', model: 'm' } })
  const reply = await extractor.ask('记忆管线与星图')
  assert.equal(reply.ok, false)
  assert.equal(calls, 3)
  assert.match(reply.error, /试了 3 次/)
})

test('提示词说清楚什么才算星星：句子、公式、数字都不算', () => {
  assert.match(SYSTEM_PROMPT, /What counts as a star/)
  assert.match(SYSTEM_PROMPT, /reusable noun/)
  assert.match(SYSTEM_PROMPT, /Never pair them/)
  assert.match(SYSTEM_PROMPT, /at most 10 characters/)
})
