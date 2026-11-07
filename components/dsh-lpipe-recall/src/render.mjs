import { FUZZY_FLOOR, NUMBER_FLOOR } from './match.mjs'
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

export const pieces = (text) => {
  const out = []
  for (const piece of splitSentences(stripCodeBlocks(text))) {
    const value = typeof piece === 'string' ? piece : piece?.text
    const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (trimmed && !looksLikeCode(trimmed)) out.push(trimmed)
  }
  return out
}

/** 片段 id：`lpipe_recall_id[仓库 id:片段 id]`。格式固定，好认也好喂给工具。 */
export const fragmentId = (sessionId, turn) => `lpipe_recall_id[${sessionId}:${turn}]`

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
 * 候选准入已保证准确真文星；选句只按承载的星的总亮度，不再额外要求准确星。
 */
export function sentenceScore(text, flicker) {
  const folded = foldText(text)
  let score = 0
  let exact = 0
  const ids = []
  for (const hit of flicker.values()) {
    if (hit.kind === 'fuzzy') {
      if (fuzzyStarsIn(text).some((candidate) => candidate.form === hit.form && fuzzyScore(candidate, hit) >= (hit.form === 'number' ? NUMBER_FLOOR : FUZZY_FLOOR))) score += hit.score
      continue
    }
    const needle = foldText(hit.name)
    if (needle && folded.includes(needle)) {
      score += hit.score
      exact += 1
      ids.push(hit.id ?? hit.name)
    }
  }
  return { score, exact, ids }
}

function fragmentSentences({ reader, candidate, flicker, limit }) {
  const rows = reader.rows(candidate.session).filter((row) => row.turn === candidate.turn && isSpokenRow(row))
  // 只拿「这一段自己的命中星」来给句子打分。
  //
  // 用整窗的点亮星会让别的句子莫名其妙地排前面：那些星是照亮了别的片段的，
  // 这段只是恰好字面上撞上，对「为什么想起这一段」没有任何解释力。
  const wanted = new Set(candidate.stars ?? [])
  const local = new Map([...flicker].filter(([id]) => wanted.size === 0 || wanted.has(id)))
  // 句子 id = 句在这一片段里的序号（1 起）。它只是片段内的坐标，跨片段没有意义——
  // 模型要深挖时报的是「仓库 + 片段 + 句子」三个 id，缺一个都定位不到。
  const all = []
  for (const row of rows) {
    const text = typeof row.text === 'string' ? row.text : ''
    if (!text) continue
    for (const sentence of pieces(text)) {
      const { score, exact, ids } = sentenceScore(sentence, local)
      all.push({ id: all.length + 1, score, exact, ids, at: row.at ?? candidate.at, text: sentence })
    }
  }
  const top = all.filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit)
    .sort((a, b) => a.id - b.id)
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
    // 片段 id 是固定格式：`lpipe_recall_id[仓库:片段]`。程序靠它在上下文里认出
    // 「这一段已经摆过了」，模型复制它去喂 recall_open。句子的 id 不在这里给——
    // 模糊回忆本来就只摆几句，位置靠前、靠后的信息足够，精确定位是准确回忆的事。
    const head = `第 ${index + 1} 段｜${fragmentId(candidate.session, candidate.turn)}${when ? `, ${when}` : ''}, 共 ${total} 句，展示 ${lines.length} 句`
    // 每一句前面挂它的句子 id：`recall_open` 要的是「片段 id + 句子 id」，
    // 只给片段，模型没法指定从哪句开始翻。
    blocks.push(`${head}\n……${lines.map((line) => `〔${line.id}〕${line.text}`).join('……')}……`)
  }
  if (blocks.length === 0) return ''
  const opening = '〔回忆 · 模糊〕下面几段来自更早的记忆，不是这次对话里说过的话。也许相关，也许只是像。'
  const tail = footer ? `\n${footer}` : ''
  return `${opening}\n\n${blocks.join('\n\n')}${tail}`
}
