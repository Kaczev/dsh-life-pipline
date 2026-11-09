import { displayRows, displayPieces } from './text.mjs'
import { imagesOfRows, imageReferences } from './images.mjs'
import { pieces, sentenceBody, clockOf } from './render.mjs'

export const MAX_SENTENCES = 200
export const MAX_CHARS = 24000
export const DEFAULT_COUNT = 20

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
  for (const [rowIndex, row] of displayRows(rows).entries()) {
    if (!Number.isSafeInteger(row.turn) || row.turn < 1) continue
    if (!fragments.has(row.turn)) fragments.set(row.turn, [])
    const lines = fragments.get(row.turn)
    for (const piece of displayPieces(row, pieces)) lines.push({ turn: row.turn, id: lines.length + 1, ...piece, at: row.at ?? null, rowIndex })
  }
  return fragments
}

export function fragmentSentencesOf(reader, session, turn) {
  return fragmentsOf(reader.rows(session)).get(turn) ?? []
}

/** 起止坐标包含端点；跨片段按轮号排列。分页只给下一句坐标，不重复尾句。 */
export function openRange({ reader, session, from, to = null, count = DEFAULT_COUNT, maxChars = MAX_CHARS, imagesOffset = 0 }) {
  const rows = reader.rows(session)
  const fragments = fragmentsOf(rows)
  if (!Number.isSafeInteger(imagesOffset) || imagesOffset < 0) throw new Error('imagesOffset must be a non-negative integer')
  const groupedBody = (lines, turnList) => {
    const allImages = turnList.flatMap(turn => imagesOfRows(rows.filter(row => row.turn === turn)))
    const selectedImages = allImages.slice(imagesOffset)
    const body = []
    for (const turn of turnList) {
      body.push('')
      const at = rows.find(row => row.turn === turn && row.at != null)?.at
      body.push(recallIdOf(session, turn) + ' | ' + ((at == null ? '' : clockOf(at)) || '时间未记录') + ' | 本片段共 ' + fragments.get(turn).length + ' 句')
      const fragmentImages = selectedImages.filter(image => image.turn === turn)
      if (fragmentImages.length) body.push(imageReferences(fragmentImages))
      body.push(...sentenceBody(lines.filter(line => line.turn === turn)))
    }
    if (imagesOffset + selectedImages.length < allImages.length) body.push('更多图片：imagesOffset=' + (imagesOffset + selectedImages.length))
    return body
  }
  if (from?.sentence === 1 && fragments.get(from.turn)?.length === 0 && imagesOfRows(rows.filter(row => row.turn === from.turn)).length && !to) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_SENTENCES) throw new Error('count must be an integer from 1 to 200')
    const text = groupedBody([], [from.turn]).join('\n')
    if (text.length > maxChars) throw new Error('image references exceed output character limit')
    return { text, start: from.turn + ':1', end: from.turn + ':1', turns: [from.turn], truncated: false }
  }
  const turns = [...fragments.keys()].sort((a, b) => a - b)
  const valid = (pos) => pos && fragments.get(pos.turn)?.[pos.sentence - 1]
  if (!valid(from)) throw new Error('from points to a missing fragment or sentence')
  if (to && !valid(to)) throw new Error('to points to a missing fragment or sentence')
  const compare = (a, b) => a.turn - b.turn || a.sentence - b.sentence
  if (to && compare(to, from) < 0) throw new Error('to must not precede from')
  if (!Number.isInteger(count) || count < 1 || count > MAX_SENTENCES) throw new Error('count must be an integer from 1 to 200')
  const all = turns.flatMap((turn) => fragments.get(turn)).filter((line) => compare({ turn: line.turn, sentence: line.id }, from) >= 0)
  const wanted = to ? all.filter((line) => compare({ turn: line.turn, sentence: line.id }, to) <= 0) : all.slice(0, count)
  const picked = []
  const format = (lines, clipped = false) => {
    const last = lines.at(-1)
    const truncated = clipped || lines.length < wanted.length
    const next = clipped ? last : all[lines.length]
    const body = groupedBody(lines, [...new Set(lines.map(line => line.turn))])
    const note = clipped ? `…（已截断：单句过长，${last.turn}:${last.id} 未完整返回）` : truncated ? '…（已截断：达到本次读取上限）' : ''
    const continuation = next && !clipped ? `\n下一页 from=${next.turn}:${next.id}` : ''
    return [`〔回忆 · 原文〕本仓库共 ${turns.length} 个片段`, body.join('\n'), note, continuation].filter(Boolean).join('\n')
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
