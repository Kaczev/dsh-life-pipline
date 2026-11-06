// 把一轮的行变成「每句有哪几颗星」，再写进星表与星源。
import { clockOf, extractStars, normalizeName } from './extract.mjs'
import { splitSentences } from './segment.mjs'
import { starIdOf } from './store.mjs'

/** 按 turn 分组；行本来就按 seq 递增，所以组内顺序天然是对的。 */
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

function textsOf(row) {
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

/**
 * 抽星但不写盘：一轮 → { lines, names }。
 * `lines[].stars` 是星 id；`names` 是 id → 名字，写星表时要用。
 */
export function planTurn(turn, matcher) {
  const lines = []
  const names = new Map()
  const add = (seq, rowIndex, names_, clock = null) => {
    const ids = []
    for (const name of names_) {
      const id = starIdOf(name)
      names.set(id, name)
      ids.push(id)
    }
    if (ids.length === 0) return
    // 时刻不单独成星，只作为这句的模糊时间标签（16:01 → 16:00）。
    lines.push(clock === null ? { seq, row: rowIndex, stars: ids } : { seq, row: rowIndex, stars: ids, clock })
  }
  for (const [rowIndex, row] of turn.rows.entries()) {
    if (row?.kind === 'tool/call' && row?.name) {
      const name = normalizeName(row.name)
      if (name) add(row.seq, rowIndex, [name])
      continue
    }
    for (const text of textsOf(row)) {
      for (const sentence of splitSentences(text)) {
        add(row.seq, rowIndex, extractStars(sentence, matcher), clockOf(sentence))
      }
    }
  }
  return { lines, names }
}

/** 一轮落进星图：补星表、写星源、抬水位。 */
export function buildTurn({ repo, turn, sessionId, lex, matcher }) {
  const plan = planTurn(turn, matcher)
  const born = new Date(turn.at ?? Date.now()).toISOString()
  for (const [id, name] of plan.names) {
    if (!repo.stars.has(id)) repo.ensureStar(name, lex, born)
  }
  const record = {
    turn: turn.turn,
    session: sessionId,
    at: turn.at,
    lex,
    from: turn.from,
    to: turn.to,
    lines: plan.lines,
  }
  repo.recordTurn(record)
  repo.raiseWatermark(sessionId, turn.turn, turn.to, lex)
  return record
}
