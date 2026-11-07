// 一轮 → 句子 → 星线。
//
// 抽星只问模型一次（它回答「哪两个概念一起出现过」），落到哪一句、连多粗，
// 全在这里算：同一句 1（句内星多时按 1/(k-1) 分摊）、相邻句 0.5、都对不上的
// 整轮记 0.5。这样权重永远是确定性的，模型换了也不会飘。
import { clockOf } from './extract.mjs'
import { fuzzyStarsIn, starMeta } from './fuzzy.mjs'
import { cleanStarName, findInSentences } from './llm.mjs'
import { splitSentences } from './segment.mjs'
import { starIdOf } from './store.mjs'

/**
 * 抽星规则的版本号。改了提示词、分句、成星判定就加一：
 * 名字是算出来的索引，旧规则建的星表没有修补价值，整库重抽最省事。
 */
// 4：抽星从「词表 + 规则」整个换成模型答对子；换规则时旧星表必须整库作废。
export const RULES_VERSION = 12

const SYMBOL_ONLY = /^[^\p{L}\p{N}]+$/u
const CJK_MAX = 10

/**
 * 模型偶尔会把整句、公式、量词短语原样搬出来。这些当「星」没有意义：
 * 下一次几乎不可能以完全相同的字面再出现，等于给星图塞了一批一次性噪音。
 */
export function starWorthy(name) {
  const text = String(name ?? '').trim()
  if (!text) return false
  if (SYMBOL_ONLY.test(text)) return false
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  if (cjk > CJK_MAX) return false
  // LaTeX 命令（\frac、\lambda）只有短小的才留；带等号或者太长的是整段公式，删。
  // 夹着行内公式的短语（`线电荷密度 \(\lambda\)`）是半句解释，不是概念名。
  if (text.includes('\\(') || text.includes('\\)') || text.includes('$')) return false
  if (/\\[a-zA-Z]+/.test(text) && (text.length > 8 || text.includes('='))) return false
  // 英文整句：五个词以上基本是句子而不是概念。
  const words = text.split(/\s+/).filter(Boolean)
  const latin = words.filter((word) => /^[A-Za-z][A-Za-z'’-]*$/.test(word))
  if (latin.length >= 5 && latin.length === words.length) return false
  // 「4 个节点」「6 条支路」是描述，不是概念。
  if (/\d+\s*[个条只种项次]/.test(text)) return false
  // 「图片1」「图 2」是附件编号，不是概念。
  if (/^图\s*\d+$/.test(text) || /^图\s*片\s*\d+$/.test(text)) return false
  return true
}

export function groupTurns(rows) {
  const map = new Map()
  for (const row of rows) {
    if (!Number.isInteger(row?.turn)) continue
    const list = map.get(row.turn) ?? []
    list.push(row)
    map.set(row.turn, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, list]) => ({
      turn,
      at: list[0]?.at ?? Date.now(),
      from: list[0]?.seq ?? 0,
      to: list[list.length - 1]?.seq ?? 0,
      rows: list,
    }))
}

/** 一行里拿来抽星的文字：正文、思考；工具调用只取工具名，长工具输出不当成「说过的话」。 */
const MAX_TOOL_RESULT = 600

export function textsOf(row, toolName = null) {
  // 运行期注入的上下文（短期上下文、记忆库快照）不是「说过的话」，不抽星。
  if (row?.kind === 'user/message' && row?.source?.kind === 'runtime-context') return []
  // 发给人的那段话就是你我说的话，不是「工具输出」：全文参与抽星。
  if (row?.kind === 'tool/call' && String(row?.name) === 'chat_send') {
    try {
      const args = JSON.parse(row.arguments ?? '{}')
      if (typeof args?.text === 'string' && args.text.trim()) return [args.text]
    } catch { /* 参数不是 JSON 就当没有 */ }
    return []
  }
  if (row?.kind === 'tool/result') {
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    // chat_send 的结果是「发出去的那段话」，跟我说的正文同类，不设上限。
    if (toolName === 'chat_send') return text ? [text] : []
    // 读文件、列目录这类工具的结果是数据，不是句子：整段抽星只会把文件名变成概念。
    return text && text.length <= MAX_TOOL_RESULT ? [text] : []
  }
  const texts = []
  if (typeof row?.text === 'string' && row.text.trim()) texts.push(row.text)
  if (typeof row?.reasoning === 'string' && row.reasoning.trim()) texts.push(row.reasoning)
  return texts
}

/** 这一轮的「句子」：每句带 seq 与行号，供匹配与连边用。工具调用自成一句。 */
export function sentencesOf(turn) {
  const out = []
  // 工具结果是哪一次调用的？记忆行里没有名字，只能顺着前面的 tool/call 认。
  let calledWith = null
  for (const [rowIndex, row] of (turn.rows ?? []).entries()) {
    if (row?.kind === 'tool/call' && row?.name) {
      calledWith = String(row.name)
      out.push({ seq: row.seq, row: rowIndex, text: calledWith })
      // chat_send 的正文要单独成句：它就是我跟人说的话。
      for (const text of textsOf(row)) out.push({ seq: row.seq, row: rowIndex, text })
      continue
    }
    for (const text of textsOf(row, calledWith)) {
      for (const sentence of splitSentences(text)) {
        if (!sentence.trim()) continue
        out.push({ seq: row.seq, row: rowIndex, text: sentence })
      }
    }
  }
  return out
}

/**
 * 把模型给的概念对落到句子上，算出这一轮的星源行。
 * 返回 { lines, names, pairs, rejects }：rejects 要落日志，方便回头分析模型为什么错。
 */
/**
 * 数字密集到记不住的那一段，不产生模糊星：列表、表格、一串数值不是「时间感」。
 * 判的是**句子**而不是整轮——同一轮里别处认真说过的时间，照样该记住。
 * 「又密又多」才算：零星提到几个时间（20:44、648.5 度）是我该记的；
 * 一句里八个以上、还摊不到每 40 字一个，那才是抄了一屏数字。
 */
const FUZZY_DENSE_MIN_COUNT = 8
const FUZZY_MIN_CHARS_PER_STAR = 40

export function planTurn(turn, pairs) {
  const sentences = sentencesOf(turn)
  const spoken = (sentence) => {
    const row = turn.rows?.[sentence.row]
    return row?.kind === 'user/message'
      || row?.kind === 'assistant/message'
      || (row?.kind === 'tool/call' && String(row?.name) === 'chat_send')
  }
  /** 这一句是不是一屏数字：密且多才压制，只有几个数字的句子照常出星。 */
  const numberSoup = (text, count) =>
    count >= FUZZY_DENSE_MIN_COUNT && text.length / count < FUZZY_MIN_CHARS_PER_STAR
  const hits = new Map()
  const hitsOf = (name) => {
    const key = name.toLowerCase()
    let found = hits.get(key)
    if (!found) {
      found = findInSentences(sentences, name)
      hits.set(key, found)
    }
    return found
  }

  const names = new Map()
  const fuzzy = new Map()
  const accepted = []
  const rejects = []
  for (const entry of pairs ?? []) {
    const a = cleanStarName(Array.isArray(entry) ? entry[0] : '')
    const b = cleanStarName(Array.isArray(entry) ? entry[1] : '')
    if (!a || !b) {
      rejects.push({ pair: [a, b], why: 'empty' })
      continue
    }
    if (a.toLowerCase() === b.toLowerCase()) {
      rejects.push({ pair: [a, b], why: 'same' })
      continue
    }
    // 整句、整段公式、量词短语：留着只会白占一颗星，下一次几乎不可能原样再出现。
    if (!starWorthy(a) || !starWorthy(b)) {
      rejects.push({ pair: [a, b], why: 'noisy', noisy: starWorthy(a) ? b : a })
      continue
    }
    const ha = hitsOf(a)
    const hb = hitsOf(b)
    if (ha.length === 0 || hb.length === 0) {
      rejects.push({ pair: [a, b], why: ha.length === 0 && hb.length === 0 ? 'both-missing' : 'one-missing', missing: ha.length === 0 ? a : b })
      continue
    }
    for (const name of [a, b]) names.set(starIdOf(name), name)
    accepted.push([starIdOf(a), starIdOf(b)])
  }

  // 每句里有哪些星：只有被模型配对过的名字才算星，没配对的词不进星源。
  const lines = []
  for (const [index, sentence] of sentences.entries()) {
    const ids = []
    for (const name of names.values()) {
      if (!hitsOf(name).includes(index)) continue
      ids.push(starIdOf(name))
    }
    // 模糊星（时间、数字）是「感觉」，不靠模型配对，也不进星链：这句话里出现就挂在这句上。
    // 只从交流记忆里抽：工具输出里的数字是数据（版本号、行号、耗时），不是我要记得的时间感。
    const conversation = spoken(sentence)
    if (!conversation) {
      if (ids.length === 0) continue
      const clockOnly = clockOf(sentence.text)
      lines.push(clockOnly === null ? { seq: sentence.seq, row: sentence.row, stars: ids } : { seq: sentence.seq, row: sentence.row, stars: ids, clock: clockOnly })
      continue
    }
    const numeric = fuzzyStarsIn(sentence.text)
    if (!numberSoup(sentence.text, numeric.length)) {
      for (const star of numeric) {
        const id = starIdOf(star.name)
        if (!ids.includes(id)) ids.push(id)
        names.set(id, star.name)
        fuzzy.set(id, star)
      }
    }
    if (ids.length === 0) continue
    const clock = clockOf(sentence.text)
    lines.push(clock === null ? { seq: sentence.seq, row: sentence.row, stars: ids } : { seq: sentence.seq, row: sentence.row, stars: ids, clock })
  }

  return { lines, names, fuzzy, pairs: accepted, rejects }
}

/** 一轮落进星图：补星表、写星源、抬水位。 */
export function buildTurn({ repo, turn, sessionId, pairs }) {
  const plan = planTurn(turn, pairs)
  const born = new Date(turn.at ?? Date.now()).toISOString()
  for (const [id, name] of plan.names) {
    if (!repo.stars.has(id)) repo.ensureStar(name, 0, born, plan.fuzzy.get(id) ?? starMeta(name))
  }
  const record = {
    turn: turn.turn,
    session: sessionId,
    at: turn.at,
    from: turn.from,
    to: turn.to,
    lines: plan.lines,
    pairs: plan.pairs,
  }
  repo.recordTurn(record)
  repo.raiseWatermark(sessionId, turn.turn, turn.to, 0)
  return { record, rejects: plan.rejects }
}
