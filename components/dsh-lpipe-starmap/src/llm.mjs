// 抽星交给模型：它只回答「这一轮里哪两个概念是一起出现的」，
// 落到哪一句、连多粗，全部由我们算——这样边权永远是确定性的。

/** 一轮的原文喂给模型：太长就截断，够看出概念就行。 */
export const MAX_INPUT = 12000
/** 一轮最多认多少对：宁可少，不要凑数。 */
export const MAX_PAIRS = 60

export const SYSTEM_PROMPT = [
  '你是知识图谱的抽星器。用户给你一轮对话的原文，你只回答一件事：',
  '这一轮里哪些概念是一起出现过的，把它们配成对。',
  '',
  '什么算概念：人、物、项目、模块、文件、工具、技术、方法、问题、事件、专有名词、有名字的状态或指标。',
  '什么不算：虚词、代词、形容词、量词、整句、纯数字、时间点、寒暄与语气词。',
  '',
  '规则：',
  '1. 名字必须原样摘自原文，一个字都不要改；不要翻译、不要缩写、不要换同义词。',
  '2. 只要成对的：每一对是 [概念甲, 概念乙]，两项都在原文里出现过。',
  '3. 同一对不要重复；顺序无所谓。',
  '4. 最多 ' + MAX_PAIRS + ' 对。宁可只给三对，也不要拿废话凑数。',
  '5. 只输出 JSON 数组，不要解释、不要代码块、不要多余的字。',
  '',
  '输出示例：[["记忆管线", "星图管线"], ["Kas", "鲸鲸"]]',
].join('\n')

/** 把一轮的行拼成「谁说了什么」，喂给模型。 */
export function turnSource(turn, textsOf) {
  const parts = []
  for (const row of turn.rows ?? []) {
    for (const text of textsOf(row)) {
      const speaker = row?.kind === 'user/message' ? '用户' : row?.kind === 'assistant/message' ? '助手' : '工具'
      parts.push(`[${speaker}] ${text}`)
    }
  }
  const joined = parts.join('\n\n')
  return joined.length > MAX_INPUT ? `${joined.slice(0, MAX_INPUT)}\n…（后略）` : joined
}

/** 模型回的东西可能包着代码块、可能带废话：只把第一个 JSON 数组抠出来。 */
export function parsePairs(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const cleaned = text.replace(/^\uFEFF/, '').trim()
  const attempts = []
  attempts.push(cleaned)
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) attempts.push(fenced[1])
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start >= 0 && end > start) attempts.push(cleaned.slice(start, end + 1))
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      // 换下一种抠法
    }
  }
  return null
}

/** 名字去掉包裹的引号、首尾空白与句末标点：模型常把「星图」连引号一起抄回来。 */
export function cleanStarName(value) {
  let name = typeof value === 'string' ? value.trim() : ''
  name = name.replace(/^[「『“"'`《【\[]+/, '').replace(/[」』”"'`》】\]]+$/, '')
  name = name.replace(/[\s。、，,；;：:]+$/, '').trim()
  return name
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase()

/** 把模型给的对子归一：去掉空项、同一对只留一份、自己配自己的丢掉。 */
export function dedupePairs(pairs) {
  const out = []
  const seen = new Set()
  for (const entry of pairs) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const a = cleanStarName(entry[0])
    const b = cleanStarName(entry[1])
    if (!a || !b) continue
    if (same(a, b)) continue
    const key = [a, b].map((name) => name.toLowerCase()).sort().join('\u0000')
    if (seen.has(key)) continue
    seen.add(key)
    out.push([a, b])
  }
  return out
}

/**
 * 一条长对话复用到底：第一句用户消息固定是这条指令，之后每轮原文接在后面。
 * 前缀一直不变，模型侧的缓存才有机会命中；太长就从头再来一条。
 */
export const INSTRUCTION = [
  '接下来我会一轮一轮地把对话原文发给你，每条消息只处理它自己：',
  '只回答那条消息里的概念对，不要回顾前面的轮次，也不要重复之前的答案。',
  '输出格式照旧，只给 JSON 数组。',
].join('\n')

/** 一条对话攒到多长就换新的：再长下去，省下的钱抵不上多读的上下文。 */
export const MAX_HISTORY_CHARS = 24000

const MESSAGE_SOURCE = { kind: 'plugin:dsh-lpipe-starmap', plugin: 'dsh-lpipe-starmap' }

const messageOf = (role, text) => ({ role, content: [{ type: 'text', text }], source: MESSAGE_SOURCE })

/** 用量的字段名各家不一样，统一成 { input, output, cacheRead }。 */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const pick = (...keys) => {
    for (const key of keys) {
      const value = Number(usage[key])
      if (Number.isFinite(value)) return value
    }
    return 0
  }
  const input = pick('inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens')
  const output = pick('outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens')
  const cacheRead = pick('cacheReadTokens', 'cache_read_tokens', 'cachedTokens', 'cached_tokens')
  if (!input && !output && !cacheRead) return null
  return { input, output, cacheRead }
}

/**
 * 一条可复用的抽取对话。`ask(source)` 只追加一问一答，失败会把这一问撤回去，
 * 保证下次重试的前缀与失败前一模一样（缓存能接着用）。
 */
export function createExtractor({ llm, route = {}, maxTokens = 1500, maxHistoryChars = MAX_HISTORY_CHARS } = {}) {
  const fresh = () => [
    messageOf('system', SYSTEM_PROMPT),
    messageOf('user', INSTRUCTION),
    messageOf('assistant', '明白，请发第一轮原文。'),
  ]
  let messages = fresh()
  let chars = messages.reduce((sum, entry) => sum + entry.content[0].text.length, 0)

  const reset = () => {
    messages = fresh()
    chars = messages.reduce((sum, entry) => sum + entry.content[0].text.length, 0)
  }

  async function ask(source) {
    if (typeof llm?.stream !== 'function') return { ok: false, error: 'llm unavailable' }
    if (!source || !source.trim()) return { ok: true, pairs: [], raw: '', usage: null }
    messages.push(messageOf('user', source))
    let raw = ''
    let usage = null
    try {
      for await (const chunk of llm.stream({ ...route, maxTokens, messages })) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text
        if (chunk?.type === 'usage') usage = normalizeUsage(chunk.usage ?? chunk)
        if (chunk?.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) {
          messages.pop()
          return { ok: false, error: `stream ${chunk.reason.kind}`, raw, usage }
        }
      }
    } catch (error) {
      messages.pop()
      return { ok: false, error: String(error?.message ?? error), raw, usage }
    }
    const parsed = parsePairs(raw)
    if (!parsed) {
      messages.pop()
      return { ok: false, error: 'not json', raw, usage }
    }
    messages.push(messageOf('assistant', raw))
    chars += source.length + raw.length
    if (chars > maxHistoryChars) reset()
    return { ok: true, pairs: dedupePairs(parsed), raw, usage }
  }

  return { ask, reset, size: () => messages.length, chars: () => chars }
}

export async function requestPairs({ llm, route = {}, source, maxTokens = 1500, signal }) {
  if (typeof llm?.stream !== 'function') return { ok: false, error: 'llm unavailable' }
  if (!source || !source.trim()) return { ok: true, pairs: [], raw: '' }
  const messages = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }], source: { kind: 'plugin:dsh-lpipe-starmap', plugin: 'dsh-lpipe-starmap' } },
    { role: 'user', content: [{ type: 'text', text: source }], source: { kind: 'plugin:dsh-lpipe-starmap', plugin: 'dsh-lpipe-starmap' } },
  ]
  const options = { ...route, maxTokens, messages }
  if (signal) options.signal = signal
  let raw = ''
  try {
    for await (const chunk of llm.stream(options)) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text
      if (chunk?.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) {
        return { ok: false, error: `stream ${chunk.reason.kind}`, raw }
      }
    }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), raw }
  }
  const parsed = parsePairs(raw)
  if (!parsed) return { ok: false, error: 'not json', raw }
  return { ok: true, pairs: dedupePairs(parsed), raw }
}

/** 比对用的写法：全角转半角、英文小写、空白归一。只用来找位置，不改显示名。 */
export function foldText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** 模型给的名字在原文里出现的位置（句子下标），找不到就是空数组。 */
export function findInSentences(sentences, name) {
  const needle = foldText(name)
  if (!needle) return []
  const out = []
  for (const [index, sentence] of sentences.entries()) {
    if (foldText(sentence.text).includes(needle)) out.push(index)
  }
  return out
}
