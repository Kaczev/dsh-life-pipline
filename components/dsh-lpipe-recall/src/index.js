import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { MemoryReader } from 'dsh-lpipe-memory/reader'
import { openRepo } from 'dsh-lpipe-starmap/store'
import { candidatesOf, coolTurns } from './candidates.mjs'
import { loadConfig } from './config.mjs'
import { flickerStars } from './match.mjs'
import { memoryRoot, recallRoot, starmapRoot } from './paths.mjs'
import { isSpokenRow, renderRecall } from './render.mjs'

export const name = 'dsh-lpipe-recall'

/** 能开启一轮、值得回忆的来源。自然唤醒不在其中（见规划文档 §3）。 */
export const TRIGGER_KINDS = new Set(['user', 'dsh-lpipe-chat', 'dsh-lpipe-wake'])

/**
 * 触发源：这一轮是谁在说话、说了什么。
 *
 * 回忆只对触发源的内容反应——不是把会话末尾几十万字全拿去撞星。自然唤醒不触发，
 * 因为醒来时的动作本来就是「自己想想」，不该再由回忆牵着走。
 */
export function triggerOf(rows) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row?.kind !== 'user/message') continue
    const kind = row?.source?.kind
    if (!TRIGGER_KINDS.has(kind)) continue
    if (kind === 'dsh-lpipe-wake' && String(row?.source?.summary ?? '').includes('自主')) {
      return { row, skip: 'natural-wake' }
    }
    return { row, skip: null }
  }
  return null
}

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
/**
 * 事件闸门：什么样的消息才值得回忆。
 *
 * 单独抽出来是为了能测——真正的组装与投递都被换成参数，这里只管「该不该、投什么」。
 */
/**
 * 拿去点亮星星的文本：32K 之内的**所有触发源**，不只是最新那一条。
 *
 * 一行一行往前收：只认来源在白名单里、又不是自然唤醒的 `user/message`，
 * 收够 `matchChars` 就停；最后把当前这条（记忆层还没写进去的）接在末尾。
 */
/**
 * 唤醒分两种：自然醒来不该触发回忆，主动安排的要。
 *
 * 只看 `source.wake`（唤醒管线写的 'planned' / 'natural'），不看 summary：
 * 那是给人看的文案，改一个字不该改变行为。老记忆里没有这个字段，按「主动」
 * 处理——宁可多回忆一次，也不因为缺字段把主动唤醒的回忆吞掉。
 */
/**
 * 取一条事件的正文。
 *
 * `user/message` 的正文在 `data.content` 的分片里（`[{ type: 'text', text }]`），
 * 不在 `data.text` 上——以前按 `data.text` 取，结果永远是空串，整条管线静默不动。
 */
export function textOfEvent(data) {
  if (typeof data?.text === 'string' && data.text.trim()) return data.text
  const content = data?.message?.content ?? data?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

export function isNaturalWake(source) {
  if (source?.kind !== 'dsh-lpipe-wake') return false
  return source.wake === 'natural'
}

export function matchTextOf(rows, current, matchChars) {
  const chunks = []
  let size = 0
  for (let index = rows.length - 1; index >= 0 && size < matchChars; index -= 1) {
    const row = rows[index]
    if (row?.kind !== 'user/message') continue
    const kind = row?.source?.kind
    if (!TRIGGER_KINDS.has(kind)) continue
    if (isNaturalWake(row?.source)) continue
    const text = typeof row?.text === 'string' ? row.text : ''
    if (!text.trim()) continue
    chunks.push(text)
    size += text.length
  }
  chunks.reverse()
  chunks.push(current)
  const joined = chunks.join('\n')
  return joined.length > matchChars ? joined.slice(-matchChars) : joined
}

export function createTriggerHandler({ compose, deliver, warn = () => {}, note = () => {} }) {
  const seen = new Set()
  return (session, event) => {
    if (!event || event.type !== 'user/message') return
    const source = event?.data?.source ?? {}
    if (!TRIGGER_KINDS.has(source.kind)) return
    // 自然唤醒不触发回忆：醒来的那一下本来就是自己想想。
    if (isNaturalWake(source)) return
    const sessionId = session?.id ?? ''
    if (!sessionId) return
    const key = `${sessionId}#${event.seq ?? event.id ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 200) seen.clear()
    const text = textOfEvent(event?.data)
    if (!text.trim()) {
      note({ session: sessionId, skip: 'empty-text' })
      return
    }
    let block = ''
    try {
      block = compose(sessionId, text, (diag) => note({ session: sessionId, ...diag, delivered: false }))
    } catch (error) {
      warn(`[dsh-lpipe-recall] 组装回忆失败：${error?.message ?? error}`)
      note({ session: sessionId, error: String(error?.message ?? error) })
      return
    }
    if (!block) return
    // 能同步投就同步投：这个回调是在用户消息落盘时触发的，越早塞进去，
    // 越可能在第一次模型请求装配之前被看见。
    try {
      const sent = deliver(sessionId, block)
      if (sent && typeof sent.then === 'function') {
        sent
          .then((ok) => note({ session: sessionId, delivered: Boolean(ok), chars: block.length }))
          .catch((error) => warn(`[dsh-lpipe-recall] 注入回忆失败：${error?.message ?? error}`))
      } else {
        note({ session: sessionId, delivered: Boolean(sent), chars: block.length })
      }
    } catch (error) {
      warn(`[dsh-lpipe-recall] 注入回忆失败：${error?.message ?? error}`)
    }
  }
}

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

  let sessionController = null

  /**
   * 每次触发都记一行：点亮了几颗、几段候选、投了没有。没有这一行的话，
   * 「没想起什么」和「根本没跑」在界面上长得一模一样。
   */
  const noteRun = (entry) => {
    try {
      mkdirSync(recallDir, { recursive: true })
      writeFileSync(join(recallDir, 'recall.jsonl'), `${JSON.stringify({ at: Date.now(), ...entry })}\n`, { flag: 'a' })
    } catch {
      /* 记不下来就算了，不影响回忆本身 */
    }
  }

  /**
   * 日志只能成员调用（Cordis 的 logger 是可调用对象，拆出方法会丢 this），
   * 而且失败不许往外抛：插件写日志把宿主弄崩过两次。
   */
  const warn = (message) => {
    try {
      if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
      else if (typeof ctx.logger?.info === 'function') ctx.logger.info(message)
    } catch {
      /* 日志失败就算了，不能让回忆把一轮弄坏 */
    }
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

  const compose = (sessionId, raw, report = () => {}) => {
    const settings = config()
    if (!settings.enabled) {
      report({ skip: 'disabled' })
      return ''
    }
    if (!sessionId) return ''
    let rows = []
    try {
      rows = rowsNow(sessionId)
    } catch {
      return ''
    }

    // 32K 窗口里所有触发源一起点亮，不只是最新那一条。
    const text = matchTextOf(rows, raw, settings.matchChars)
    if (!text.trim()) return ''

    const store = repoNow()
    if (!store || store.stars.size === 0) {
      report({ skip: 'no-store', stars: store?.stars?.size ?? 0 })
      return ''
    }
    // 通用星：在超过 30% 的片段里都出现的星，几乎不构成「这两段记忆有关」的证据，
    // 来源分数只值 0.2（用户定的口径）。
    const common = commonStars(store)
    const dfOf = (id) => (store.byStar.get(id) ?? []).length
    const flicker = flickerStars({ text, stars: [...store.stars.values()], common, df: dfOf, total: store.turns.size })
    if (flicker.size === 0) {
      report({ skip: 'no-flicker', chars: text.length, stars: store.stars.size, rows: rows.length })
      return ''
    }

    const excluded = coolTurns({ rows, coolChars: settings.coolChars })
    const candidates = candidatesOf({
      repo: store,
      flicker,
      excluded,
      minStars: settings.minStars,
      minStrength: settings.minStrength,
      limit: settings.fragments,
    })
    if (candidates.length === 0) {
      report({ skip: 'no-candidates', flicker: flicker.size, excluded: excluded.size, rows: rows.length })
      return ''
    }

    const key = `${sessionId}|${rows.length}|${repoStamp}|${JSON.stringify(settings)}`
    const cached = textCache.get(key)
    if (cached !== undefined) return cached
    const block = renderRecall({ candidates, flicker, reader, config: settings })
    if (textCache.size > 32) textCache.clear()
    textCache.set(key, block)
    return block
  }

  /**
   * 投递一条「回忆」消息。
   *
   * 不走 systemPrompt.context：那会把内容并进宿主的 runtime context 块里，和
   * 时间戳混在一起、看不出是哪来的。这里和 dsh-lpipe-chat 的入站通知一样，
   * 注入一条 source.kind = 'dsh-lpipe-recall' 的用户消息——它是独立的一块，
   * 来源写在消息上；记忆层与星图都会把这类来源整体丢掉，不会自我消化。
   */
  /** 记住解析过的 agent：events 是同步送进来的，缓存之后这一轮就能在第一次请求装配前塞进去。 */
  const agentCache = new Map()

  const injectNow = (agent, text) => {
    if (!agent || typeof agent.inject !== 'function') return false
    agent.inject({
      id: randomUUID(),
      role: 'user',
      content: [Object.freeze({ type: 'text', text })],
      source: Object.freeze({ kind: 'dsh-lpipe-recall', form: 'notice', summary: '回忆 · 模糊' }),
    })
    return true
  }

  const deliver = async (sessionId, text) => {
    const known = agentCache.get(sessionId)
    if (known && injectNow(known, text)) return true
    if (!sessionController || typeof sessionController.resolveAgent !== 'function') return false
    const result = await sessionController.resolveAgent(sessionId)
    const agent = result?.agent
    if (!agent || typeof agent.inject !== 'function') return false
    agentCache.set(sessionId, agent)
    return injectNow(agent, text)
  }

  const onEvent = createTriggerHandler({ compose, deliver, warn, note: noteRun })

  ctx.inject(['sessionController'], (serviceCtx) => {
    sessionController = serviceCtx.sessionController ?? null
  })

  // 装上就留个记号：没有这一行 = 插件根本没被宿主加载（和「加载了但没回忆」是两回事）。
  noteRun({ event: 'loaded', root: recallDir })

  let seenEvents = 0

  try {
    ctx.inject(['sessions'], (sessionsCtx) => {
      noteRun({ event: 'subscribed' })
      sessionsCtx.on('session/event', (session, event) => {
        // 前 40 条用户消息都记一笔：确认订阅到底有没有把事件送到这里。
        if (event?.type === 'user/message' && seenEvents < 40) {
          seenEvents += 1
          noteRun({ event: 'seen', seq: event?.seq ?? null, source: event?.data?.source?.kind ?? null })
        }
        try {
        onEvent(session, event)
        } catch (error) {
          warn(`[dsh-lpipe-recall] 事件处理失败：${error?.message ?? error}`)
          noteRun({ event: 'handler-error', error: String(error?.message ?? error) })
        }
      })
    })
  } catch (error) {
    warn(`[dsh-lpipe-recall] 订阅 session/event 失败：${error?.message ?? error}`)
    noteRun({ event: 'subscribe-failed', error: String(error?.message ?? error) })
  }
}
