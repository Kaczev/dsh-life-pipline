// 一轮 → 句子 → 星线。
//
// 抽星只问模型一次（它回答「哪两个概念一起出现过」），落到哪一句、连多粗，
// 全在这里算：同一句 1（句内星多时按 1/(k-1) 分摊）、相邻句 0.5、都对不上的
// 整轮记 0.5。这样权重永远是确定性的，模型换了也不会飘。
import { clockOf } from './extract.mjs'
import { cleanStarName, findInSentences } from './llm.mjs'
import { splitSentences } from './segment.mjs'
import { starIdOf } from './store.mjs'

/**
 * 抽星规则的版本号。改了提示词、分句、成星判定就加一：
 * 名字是算出来的索引，旧规则建的星表没有修补价值，整库重抽最省事。
 */
export const RULES_VERSION = 2

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

export function textsOf(row) {
  // 运行期注入的上下文（短期上下文、记忆库快照）不是「说过的话」，不抽星。
  if (row?.kind === 'user/message' && row?.source?.kind === 'runtime-context') return []
  if (row?.kind === 'tool/result') {
    const text = typeof row.text === 'string' ? row.text.trim() : ''
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
  for (const [rowIndex, row] of (turn.rows ?? []).entries()) {
    if (row?.kind === 'tool/call' && row?.name) {
      out.push({ seq: row.seq, row: rowIndex, text: String(row.name) })
      continue
    }
    for (const text of textsOf(row)) {
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
export function planTurn(turn, pairs) {
  const sentences = sentencesOf(turn)
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
    if (ids.length === 0) continue
    const clock = clockOf(sentence.text)
    lines.push(clock === null ? { seq: sentence.seq, row: sentence.row, stars: ids } : { seq: sentence.seq, row: sentence.row, stars: ids, clock })
  }

  return { lines, names, pairs: accepted, rejects }
}

/** 一轮落进星图：补星表、写星源、抬水位。 */
export function buildTurn({ repo, turn, sessionId, pairs }) {
  const plan = planTurn(turn, pairs)
  const born = new Date(turn.at ?? Date.now()).toISOString()
  for (const [id, name] of plan.names) {
    if (!repo.stars.has(id)) repo.ensureStar(name, 0, born)
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
