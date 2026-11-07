import { statSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryReader } from 'dsh-lpipe-memory/reader'
import { openRepo } from 'dsh-lpipe-starmap/store'
import { candidatesOf, coolTurns } from './candidates.mjs'
import { loadConfig } from './config.mjs'
import { flickerStars } from './match.mjs'
import { memoryRoot, recallRoot, starmapRoot } from './paths.mjs'
import { isSpokenRow, renderRecall } from './render.mjs'

export const name = 'dsh-lpipe-recall'

/** 通用星判据：出现在超过三成的片段里。 */
export const COMMON_SHARE = 0.3

export function commonStars(repo) {
  const total = repo.turns.size
  const common = new Set()
  if (total < 10) return common
  for (const [id, lines] of repo.byStar) {
    const fragments = new Set(lines.map((entry) => entry.key))
    if (fragments.size / total > COMMON_SHARE) common.add(id)
  }
  return common
}

const STARS_FILE = 'stars.jsonl'

/**
 * 近窗原文：从会话末尾往前收 `matchChars` 个字符，按原顺序拼回去。
 *
 * 只收「说过的话」——和抽星时读到的是同一部分。工具输出、日志、注入的上下文
 * 那时候就没参与算星，匹配时也不该拿它们来点亮星星。
 */
export function recentText(rows, matchChars) {
  const chunks = []
  let size = 0
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (size >= matchChars) break
    if (!isSpokenRow(rows[index])) continue
    const text = typeof rows[index]?.text === 'string' ? rows[index].text : ''
    if (!text) continue
    chunks.push(text)
    size += text.length
  }
  chunks.reverse()
  return chunks.join('\n')
}

/**
 * 回忆管线（M1）：只看被动注入这一条路。
 *
 * 每轮组装请求时，拿近窗原文去点亮星星，把亮起来的那几段旧记忆摆进上下文。
 * 不调模型、不写任何东西——星表与记忆都是只读的，算错了最多是这次没想起来。
 */
export function apply(ctx, options = {}) {
  const recallDir = options.root || recallRoot()
  const memoryDir = options.memoryRoot || memoryRoot()
  const starmapDir = options.starmapRoot || starmapRoot()

  const reader = new MemoryReader({ root: memoryDir })
  let repo = null
  let repoStamp = 0
  const rowCache = new Map()
  const textCache = new Map()

  const config = () => loadConfig(recallDir)

  const repoNow = () => {
    let stamp = 0
    try {
      stamp = statSync(join(starmapDir, STARS_FILE)).mtimeMs
    } catch {
      stamp = 0
    }
    if (!repo || stamp !== repoStamp) {
      repo = openRepo({ root: starmapDir })
      repoStamp = stamp
    }
    return repo
  }

  const rowsNow = (sessionId) => {
    const info = reader.sessions().find((entry) => entry.sessionId === sessionId)
    const lastSeq = info?.lastSeq ?? -1
    const cached = rowCache.get(sessionId)
    if (cached && cached.lastSeq === lastSeq) return cached.rows
    reader.reload()
    const rows = reader.rows(sessionId)
    rowCache.set(sessionId, { lastSeq, rows })
    return rows
  }

  const compose = (promptCtx) => {
    const settings = config()
    if (!settings.enabled) return ''
    const sessionId = promptCtx?.agent?.session?.id ?? promptCtx?.session?.id ?? null
    if (!sessionId) return ''
    let rows = []
    try {
      rows = rowsNow(sessionId)
    } catch {
      return ''
    }
    if (rows.length === 0) return ''
    const text = recentText(rows, settings.matchChars)
    if (!text.trim()) return ''

    const store = repoNow()
    if (!store || store.stars.size === 0) return ''
    // 通用星：在超过 30% 的片段里都出现的星，几乎不构成「这两段记忆有关」的证据，
    // 来源分数只值 0.2（用户定的口径）。
    const common = commonStars(store)
    const flicker = flickerStars({ text, stars: [...store.stars.values()], common })
    if (flicker.size === 0) return ''

    const excluded = coolTurns({ rows, coolChars: settings.coolChars })
    const candidates = candidatesOf({
      repo: store,
      flicker,
      excluded,
      minStars: settings.minStars,
      minStrength: settings.minStrength,
      limit: settings.fragments,
    })
    if (candidates.length === 0) return ''

    const key = `${sessionId}|${rows.length}|${repoStamp}|${JSON.stringify(settings)}`
    const cached = textCache.get(key)
    if (cached !== undefined) return cached
    const block = renderRecall({ candidates, flicker, reader, config: settings })
    if (textCache.size > 32) textCache.clear()
    textCache.set(key, block)
    return block
  }

  const disposers = []
  ctx.inject(['systemPrompt'], (promptCtx) => {
    if (typeof promptCtx.systemPrompt?.context !== 'function') return
    disposers.push(
      promptCtx.systemPrompt.context({
        name: 'dsh-lpipe-recall',
        order: 95,
        text: (inner) => compose(inner ?? promptCtx),
      }),
    )
  })

  return () => {
    for (const dispose of disposers) {
      try {
        dispose?.()
      } catch {
        /* 卸下的时候不要因为一个注销失败把宿主带崩 */
      }
    }
  }
}
