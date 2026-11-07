import { isSpokenRow, pieces } from './render.mjs'

/** 一段最多读多少句、多少字。双保险，免得模型一口气把整轮日志拖进来。 */
export const MAX_SENTENCES = 40
export const MAX_CHARS = 8000

const ID_PATTERN = /lpipe_recall_id\[\s*([^\]\s]+?)\s*:\s*(\d+)\s*(?::\s*(\d+)\s*)?\]/

/**
 * 认一个回忆 id。
 *
 * 允许两种写法：片段级 `lpipe_recall_id[仓库:片段]` 与句子级
 * `lpipe_recall_id[仓库:片段:句子]`。外面多包了话（「第 2 段｜…」「〔12〕…」）
 * 也没关系——只要里面有一个合法 id 就够。
 */
export function parseRecallId(raw) {
  if (typeof raw !== 'string') return null
  const match = ID_PATTERN.exec(raw)
  if (!match) return null
  return {
    session: match[1],
    turn: Number(match[2]),
    sentence: match[3] ? Number(match[3]) : null,
  }
}

/** 一个片段里的所有句子，按整段切句、编号从 1 起（和模糊回忆里 `〔12〕` 的序号同一套）。 */
export function fragmentSentencesOf(reader, session, turn) {
  const rows = reader.rows(session).filter((row) => row.turn === turn && isSpokenRow(row))
  const out = []
  for (const row of rows) {
    const text = typeof row.text === 'string' ? row.text : ''
    if (!text) continue
    for (const sentence of pieces(text)) out.push({ id: out.length + 1, text: sentence, at: row.at ?? null })
  }
  return out
}

export const recallIdOf = (session, turn, sentence = null) =>
  sentence === null ? `lpipe_recall_id[${session}:${turn}]` : `lpipe_recall_id[${session}:${turn}:${sentence}]`

/**
 * 打开一段记忆的原文。
 *
 * `from` / `to` 都是句子 id；只给 `from` 时从它往后读 `count` 句。首句与尾句各带一个
 * 完整的 id——模型要接着往下读，复制尾句那个 id 当 `from` 就行。
 */
export function openRange({ reader, session, turn, from = 1, to = null, count = 6, maxChars = MAX_CHARS }) {
  const lines = fragmentSentencesOf(reader, session, turn)
  if (lines.length === 0) return null
  const total = lines.length
  const start = Math.min(Math.max(1, Number(from) || 1), total)
  const span = Math.max(1, Math.min(Number(count) || 6, MAX_SENTENCES))
  const wantEnd = to === null ? start + span - 1 : Math.max(start, Number(to) || start)
  const end = Math.min(wantEnd, total, start + MAX_SENTENCES - 1)

  const picked = []
  let chars = 0
  let truncated = false
  for (let index = start; index <= end; index += 1) {
    const line = lines[index - 1]
    const cost = line.text.length + 12
    if (chars + cost > maxChars) {
      truncated = true
      break
    }
    picked.push(line)
    chars += cost
  }
  if (picked.length === 0) {
    // 单句就超过上限：截断这一句本身，至少给点东西。
    const line = lines[start - 1]
    picked.push({ ...line, text: `${line.text.slice(0, maxChars - 40)}…（已截断）` })
    truncated = true
  }

  const first = picked[0]
  const last = picked[picked.length - 1]
  const body = picked.map((line) => {
    const head = `${recallIdOf(session, turn, line.id)} ` 
    if (line.id === first.id || line.id === last.id) return `${head}${line.text}`
    return `〔${line.id}〕${line.text}`
  })

  const left = total - picked[picked.length - 1].id
  const notes = [`${recallIdOf(session, turn)} 第 ${first.id}–${picked[picked.length - 1].id} 句，本片段共 ${total} 句`]
  if (truncated) notes.push(`（已截断：这次只到第 ${picked[picked.length - 1].id} 句）`)
  if (left > 0 && !truncated) notes.push(`（后面还有 ${left} 句，把尾句那个 id 当 from 可以接着读）`)

  const text = `${notes.join('，')}\n${body.join('\n')}`
  return {
    session,
    turn,
    start: first.id,
    end: picked[picked.length - 1].id,
    total,
    left: Math.max(0, left),
    truncated,
    text,
  }
}
