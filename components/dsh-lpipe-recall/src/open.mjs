import { isSpokenRow, pieces } from './render.mjs'

export const MAX_SENTENCES = 40
export const MAX_CHARS = 8000

export function parseRecallId(raw) {
  if (typeof raw !== 'string') return null
  const hit = /lpipe_recall_id\[([^\]\s:]+):(\d+)(?::(\d+))?\]/.exec(raw)
  if (!hit) return null
  const turn = Number(hit[2])
  const sentence = hit[3] ? Number(hit[3]) : null
  if (!Number.isSafeInteger(turn) || turn < 1 || (sentence !== null && (!Number.isSafeInteger(sentence) || sentence < 1))) return null
  return { session: hit[1], turn, sentence }
}

export function parsePosition(raw) {
  if (typeof raw !== 'string') return null
  const hit = /^(\d+):(\d+)$/.exec(raw.trim())
  if (!hit) return null
  const [turn, sentence] = hit.slice(1).map(Number)
  return [turn, sentence].every((n) => Number.isSafeInteger(n) && n > 0) ? { turn, sentence } : null
}

export const recallIdOf = (session, turn, sentence = null) =>
  sentence === null ? `lpipe_recall_id[${session}:${turn}]` : `lpipe_recall_id[${session}:${turn}:${sentence}]`

function fragmentsOf(rows) {
  const fragments = new Map()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.turn) || row.turn < 1) continue
    if (!fragments.has(row.turn)) fragments.set(row.turn, [])
    if (!isSpokenRow(row)) continue
    const lines = fragments.get(row.turn)
    for (const text of pieces(row.text ?? '')) lines.push({ turn: row.turn, id: lines.length + 1, text, at: row.at ?? null })
  }
  return fragments
}

export function fragmentSentencesOf(reader, session, turn) {
  return fragmentsOf(reader.rows(session)).get(turn) ?? []
}

/** 起止坐标包含端点；跨片段按轮号排列。分页只给下一句坐标，不重复尾句。 */
export function openRange({ reader, session, from, to = null, count = 6, maxChars = MAX_CHARS }) {
  const fragments = fragmentsOf(reader.rows(session))
  const turns = [...fragments.keys()].sort((a, b) => a - b)
  const valid = (pos) => pos && fragments.get(pos.turn)?.[pos.sentence - 1]
  if (!valid(from)) throw new Error('from points to a missing fragment or sentence')
  if (to && !valid(to)) throw new Error('to points to a missing fragment or sentence')
  const compare = (a, b) => a.turn - b.turn || a.sentence - b.sentence
  if (to && compare(to, from) < 0) throw new Error('to must not precede from')
  if (!Number.isInteger(count) || count < 1 || count > MAX_SENTENCES) throw new Error('count must be an integer from 1 to 40')
  const all = turns.flatMap((turn) => fragments.get(turn)).filter((line) => compare({ turn: line.turn, sentence: line.id }, from) >= 0)
  const wanted = to ? all.filter((line) => compare({ turn: line.turn, sentence: line.id }, to) <= 0) : all.slice(0, count)
  const picked = []
  const format = (lines, clipped = false) => {
    const last = lines.at(-1)
    const truncated = clipped || lines.length < wanted.length
    const next = clipped ? last : all[lines.length]
    const headers = [...new Set(lines.map((line) => line.turn))].map((turn) => `${recallIdOf(session, turn)} 本片段共 ${fragments.get(turn).length} 句`)
    const body = lines.map((line, index) => `${index === 0 || index === lines.length - 1 ? recallIdOf(session, line.turn, line.id) : `〔${line.turn}:${line.id}〕`} ${line.text}`)
    const note = clipped ? `…（已截断：单句过长，${last.turn}:${last.id} 未完整返回）` : truncated ? '…（已截断：达到本次读取上限）' : ''
    const continuation = next && !clipped ? `下一页 from=${next.turn}:${next.id}` : ''
    return [`〔回忆 · 原文〕本仓库共 ${turns.length} 个片段`, ...headers, ...body, note, continuation].filter(Boolean).join('\n')
  }
  for (const line of wanted.slice(0, MAX_SENTENCES)) {
    if (format([...picked, line]).length > maxChars) break
    picked.push(line)
  }
  let clipped = false
  if (!picked.length) {
    clipped = true
    const line = { ...wanted[0], text: '' }
    const overhead = format([line], true).length
    if (overhead >= maxChars) throw new Error('memory identifiers exceed output character limit')
    line.text = wanted[0].text.slice(0, maxChars - overhead)
    picked.push(line)
  }
  const first = picked[0]
  const last = picked.at(-1)
  return {
    text: format(picked, clipped), start: `${first.turn}:${first.id}`, end: `${last.turn}:${last.id}`,
    truncated: clipped || picked.length < wanted.length,
    turns: [...new Set(picked.map((line) => line.turn))],
  }
}
