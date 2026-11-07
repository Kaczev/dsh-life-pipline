import { fuzzyScore, fuzzyStarsIn } from 'dsh-lpipe-starmap/fuzzy'
import { foldText } from 'dsh-lpipe-starmap/llm'
import { splitSentences } from 'dsh-lpipe-starmap/segment'

const MAX_SENTENCE_CHARS = 240

/** 只有「真的说过的话」值得回忆：工具输出、日志、注入的上下文都不算。 */
const SPOKEN_KINDS = new Set(['user/message', 'assistant/message'])
const SKIP_SOURCES = new Set([
  'runtime-context',
  'time-context',
  'dsh-lpipe-recall',
  'dsh-lpipe-assoc',
  'dsh-lpipe-imagine',
])

export function isSpokenRow(row) {
  if (!SPOKEN_KINDS.has(row?.kind)) return false
  return !SKIP_SOURCES.has(row?.source?.kind)
}

/** 代码块整段不念：回忆里出现一行 `{ "form": "time" }` 只会让人出戏。 */
export const stripCodeBlocks = (text) =>
  String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')

/** 符号比字还多的一行多半是代码或表格，不是话。 */
export function looksLikeCode(sentence) {
  const value = String(sentence ?? '')
  const symbols = (value.match(/[{}[\]()<>|\\/=+*_^$#@~`"':;,]/g) ?? []).length
  return value.length > 0 && symbols / value.length > 0.16
}

const pieces = (text) => {
  const out = []
  for (const piece of splitSentences(stripCodeBlocks(text))) {
    const value = typeof piece === 'string' ? piece : piece?.text
    const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (trimmed && !looksLikeCode(trimmed)) out.push(trimmed)
  }
  return out
}

export const shortSession = (sessionId) => {
  const text = String(sessionId ?? '')
  const tail = text.slice(text.lastIndexOf('-') + 1)
  return (tail || text).slice(-8)
}

export function clockOf(at) {
  const when = new Date(Number(at))
  if (!Number.isFinite(when.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`
}

/**
 * 一句话里落了几颗闪烁星（准确星看名字、模糊星看感觉）。
 * 返回 `exact`：没有准确星的句子不进回忆——只有时间/数字撞上的句子，多半是日志。
 */
export function sentenceScore(text, flicker) {
  const folded = foldText(text)
  let score = 0
  let exact = 0
  for (const hit of flicker.values()) {
    if (hit.kind === 'fuzzy') {
      if (fuzzyStarsIn(text).some((candidate) => fuzzyScore(candidate, hit) >= 0.5)) score += hit.score
      continue
    }
    const needle = foldText(hit.name)
    if (needle && folded.includes(needle)) {
      score += hit.score
      exact += 1
    }
  }
  return { score, exact }
}

function fragmentSentences({ reader, candidate, flicker, limit }) {
  const rows = reader.rows(candidate.session).filter((row) => row.turn === candidate.turn && isSpokenRow(row))
  // 句子 id = 句在这一片段里的序号（1 起）。它只是片段内的坐标，跨片段没有意义——
  // 模型要深挖时报的是「仓库 + 片段 + 句子」三个 id，缺一个都定位不到。
  const all = []
  for (const row of rows) {
    const text = typeof row.text === 'string' ? row.text : ''
    if (!text) continue
    for (const sentence of pieces(text)) {
      const { score, exact } = sentenceScore(sentence, flicker)
      all.push({ id: all.length + 1, score, exact, at: row.at ?? candidate.at, text: sentence })
    }
  }
  const scored = all.filter((entry) => entry.score > 0 && entry.exact > 0)
  if (scored.length === 0) return { total: all.length, lines: [] }
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, limit)
  top.sort((a, b) => a.id - b.id)
  return {
    total: all.length,
    lines: top.map((entry) => ({
      id: entry.id,
      text: entry.text.length > MAX_SENTENCE_CHARS ? `${entry.text.slice(0, MAX_SENTENCE_CHARS)}…` : entry.text,
    })),
  }
}

/**
 * 把选中的片段摆成一段「模糊回忆」。
 *
 * 刻意不写成摘要、不写成结论：原句照抄、句子之间用 `……` 连，坏掉的地方就让它
 * 坏着——模型看到的是「想起了一点，又不太确定」，而不是「有人替它总结过」。
 */
export function renderRecall({ candidates, flicker, reader, config, footer = '' }) {
  if (!Array.isArray(candidates) || candidates.length === 0) return ''
  const blocks = []
  for (const [index, candidate] of candidates.entries()) {
    const { total, lines } = fragmentSentences({
      reader,
      candidate,
      flicker,
      limit: config.sentencesPerFragment,
    })
    if (lines.length === 0) continue
    const when = clockOf(candidate.at)
    // 三个 id：仓库（会话 id 全写）、片段（轮号）、句子（片段内序号）。句子的序号挂在
    // 每一句前面——摆出来的几句经常是不连续的，只在头上写一个区间反而指不准。
    const head = `第 ${index + 1} 段｜仓库 ${candidate.session} · 片段 ${candidate.turn}${when ? ` · ${when}` : ''}（共 ${total} 句，这里摆出 ${lines.length} 句）`
    blocks.push(`${head}\n……${lines.map((line) => `〔${line.id}〕${line.text}`).join('……')}……`)
  }
  if (blocks.length === 0) return ''
  const opening = '〔回忆 · 模糊〕下面几段来自更早的记忆，不是这次对话里说过的话。也许相关，也许只是像。'
  const tail = footer ? `\n${footer}` : ''
  return `${opening}\n\n${blocks.join('\n\n')}${tail}`
}
