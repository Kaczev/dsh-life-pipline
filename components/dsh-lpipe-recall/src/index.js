import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
    if (kind === 'dsh-lpipe-wake' && isNaturalWake(row?.source)) {
      return { row, skip: 'natural-wake' }
    }
    return { row, skip: null }
  }
  return null
}

/** 通用星判据：出现在超过三成的片段里。 */
export const COMMON_SHARE = 0.05

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

/**
 * 把匹配窗口切成两段：真文窗口（最近 `foregroundChars`）与背景窗口（更早的
 * `backgroundChars`）。真文窗口是「你现在真的在说的事」，背景窗口只是上下文。
 */
/** 会话现在的「字符钟」：回忆账本用它判断一段记忆是不是还在冷却期内。 */
export function charsOf(rows) {
  let size = 0
  for (const row of rows ?? []) {
    if (typeof row?.text === 'string') size += row.text.length
    else if (row?.kind === 'tool/call') size += String(row?.arguments ?? '').length
  }
  return size
}

/**
 * 账本过滤：已经摆到过模型面前的片段，只要还在冷却窗口里就不再重复摆。
 *
 * 没有这一步，每一轮都会把同一段旧记忆重新注入一遍——用户看到的就是
 * 「怎么老是这两段」。
 */
export function pickFresh(candidates, ledger, now, coolChars) {
  return (candidates ?? []).filter((entry) => {
    const at = ledger?.get?.(entry.key)
    return !(Number.isFinite(at) && now - at < coolChars)
  })
}

export function splitWindows(text, { backgroundChars, foregroundChars }) {
  if (!text) return { background: '', foreground: '' }
  if (text.length <= foregroundChars) return { background: '', foreground: text }
  const foreground = text.slice(-foregroundChars)
  const background = text.slice(0, text.length - foregroundChars).slice(-backgroundChars)
  return { background, foreground }
}

export function windowsOf(rows, current, { backgroundChars, foregroundChars }) {
  const text = matchTextOf(rows, current, backgroundChars + foregroundChars)
  if (text.length <= foregroundChars) return { background: '', foreground: text }
  const foreground = text.slice(-foregroundChars)
  const background = text.slice(0, text.length - foregroundChars).slice(-backgroundChars)
  return { background, foreground }
}

/**
 * 二类触发源（我的思考、中途回复、工具结果）的正文。
 *
 * 这些活动不会自己开一轮，但会让「刚才在说什么」往前挪——所以它们既进匹配窗口，
 * 也按冷却计数，攒够 `secondEvery` 次才评估一次回忆。
 */
export function activityTextOf(event) {
  const data = event?.data
  if (!data) return ''
  if (event.type === 'assistant/message') {
    const parts = data?.message?.content
    if (!Array.isArray(parts)) return typeof data.text === 'string' ? data.text : ''
    return parts
      .filter((part) => part && (part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
  }
  if (event.type === 'tool/result') {
    if (typeof data.text === 'string') return data.text
    const parts = data?.content
    if (Array.isArray(parts)) return parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n')
    return ''
  }
  return ''
}

export function createTriggerHandler({
  compose,
  deliver,
  warn = () => {},
  note = () => {},
  activity = () => {},
  secondEvery = 16,
}) {
  const seen = new Set()
  const secondCount = new Map()

  const evaluate = (sessionId, text) => {
    let block = ''
    try {
      block = compose(sessionId, text, (diag) => note({ session: sessionId, ...diag, delivered: false }))
    } catch (error) {
      warn(`[dsh-lpipe-recall] 组装回忆失败：${error?.message ?? error}`)
      note({ session: sessionId, error: String(error?.message ?? error) })
      return
    }
    if (!block) return
    // 能同步投就同步投：这个回调是在消息落盘时触发的，越早塞进去，
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

  return (session, event) => {
    const sessionId = session?.id ?? ''
    if (!sessionId || !event) return
    const key = `${sessionId}#${event.seq ?? event.id ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 400) seen.clear()

    // 二类触发源：我的思考、中途回复、工具结果。攒够 `secondEvery` 次才评估一次，
    // 免得每一步都往对话里塞回忆。
    if (event.type === 'assistant/message' || event.type === 'tool/result') {
      const text = activityTextOf(event)
      if (!text.trim()) return
      activity(sessionId, text)
      const every = typeof secondEvery === 'function' ? Number(secondEvery()) || 16 : secondEvery
      const count = (secondCount.get(sessionId) ?? 0) + 1
      if (count < Math.max(1, every)) {
        secondCount.set(sessionId, count)
        return
      }
      secondCount.set(sessionId, 0)
      evaluate(sessionId, '')
      return
    }

    if (event.type !== 'user/message') return
    const source = event?.data?.source ?? {}
    if (!TRIGGER_KINDS.has(source.kind)) return
    // 自然唤醒不触发回忆：醒来的那一下本来就是自己想想。
    if (isNaturalWake(source)) return
    const text = textOfEvent(event?.data)
    if (!text.trim()) {
      note({ session: sessionId, skip: 'empty-text' })
      return
    }
    // 一类触发源：出现就触发，没有冷却。
    activity(sessionId, text)
    evaluate(sessionId, text)
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

  const recalledFile = join(recallDir, 'recalled.jsonl')
  let recalled = null

  const loadRecalled = () => {
    if (recalled) return recalled
    recalled = new Map()
    try {
      for (const line of readFileSync(recalledFile, 'utf8').split('\n')) {
        if (!line.trim()) continue
        const entry = JSON.parse(line)
        for (const key of entry.keys ?? []) recalled.set(key, Number(entry.chars) || 0)
      }
    } catch {
      /* 还没有账本 */
    }
    return recalled
  }

  const rememberRecalled = (sessionId, keys, chars) => {
    if (keys.length === 0) return
    try {
      mkdirSync(recallDir, { recursive: true })
      appendFileSync(recalledFile, `${JSON.stringify({ at: Date.now(), session: sessionId, chars, keys })}\n`)
      for (const key of keys) recalled.set(key, chars)
    } catch {
      /* 记不下来就多回忆一次，不算错 */
    }
  }

  /** 最近的「说话流水」：你说的话、我的思考与回复、工具结果。匹配窗口就切它。 */
  const HISTORY_CHARS = 64000
  const buffers = new Map()

  const bufferOf = (sessionId) => {
    if (buffers.has(sessionId)) return buffers.get(sessionId)
    let text = ''
    try {
      for (const row of rowsNow(sessionId)) {
        if (!isSpokenRow(row) && row?.kind !== 'tool/result') continue
        if (typeof row?.text === 'string') text += `${row.text}\n`
      }
    } catch {
      /* 读不到就从空开始 */
    }
    const seeded = text.length > HISTORY_CHARS ? text.slice(-HISTORY_CHARS) : text
    buffers.set(sessionId, seeded)
    return seeded
  }

  const appendActivity = (sessionId, text) => {
    const next = `${bufferOf(sessionId)}\n${text}`
    buffers.set(sessionId, next.length > HISTORY_CHARS ? next.slice(-HISTORY_CHARS) : next)
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

    // 匹配窗口切的是「最近的说话流水」：你说的话、我的思考与回复、工具结果。
    const text = bufferOf(sessionId)
    if (!text.trim()) return ''
    // 32K 窗口里所有触发源一起点亮；最近 8K（真文窗口）与更早 24K（背景窗口）
    // 分开算，位置权重放在整窗里，所以真文窗口里的星天然更「近」。
    const { background, foreground } = splitWindows(text, settings)
    if (!(background + foreground).trim()) return ''

    const store = repoNow()
    if (!store || store.stars.size === 0) {
      report({ skip: 'no-store', stars: store?.stars?.size ?? 0 })
      return ''
    }
    // 通用星：在超过 30% 的片段里都出现的星，几乎不构成「这两段记忆有关」的证据，
    // 来源分数只值 0.2（用户定的口径）。
    const common = commonStars(store)
    const stars = [...store.stars.values()]
    const span = background.length + foreground.length
    const behind = flickerStars({ text: background, stars, common, offset: 0, total: span })
    const ahead = flickerStars({ text: foreground, stars, common, offset: background.length, total: span })
    // 真文窗口里亮起来的准确星：候选必须至少沾上一颗，否则只是「背景里像」。
    // 当前这一句单独点一遍：排序要看「你此刻问的是什么」，而不是整段窗口的热度。
    // 「当前这一句」：一类触发源就是这条消息本身；二类触发源没有单句可指，退回真文窗口末尾。
    const questionText = raw && raw.trim() ? raw.slice(-settings.foregroundChars) : foreground
    const question = flickerStars({ text: questionText, stars, common, offset: 0, total: Math.max(1, questionText.length) })
    const currentExact = new Set([...question.entries()].filter(([, hit]) => (hit.kind ?? 'exact') === 'exact').map(([id]) => id))
    // 真文星 = 真文窗口里亮的 + 这一句里亮的。后者可能还没进记忆（这一轮刚说的话），
    // 不算进来就会出现「问的是电磁场，却拿窗口里那些管线词去找回忆」。
    const foregroundExact = new Set([
      ...[...ahead.entries()].filter(([, hit]) => (hit.kind ?? 'exact') === 'exact').map(([id]) => id),
      ...currentExact,
    ])
    const flicker = new Map(behind)
    for (const [id, hit] of ahead) {
      const previous = flicker.get(id)
      if (!previous || previous.score < hit.score) flicker.set(id, hit)
    }
    for (const [id, hit] of question) {
      const previous = flicker.get(id)
      if (!previous || previous.score < hit.score) flicker.set(id, hit)
    }
    if (flicker.size === 0) {
      report({ skip: 'no-flicker', chars: span, stars: stars.length, rows: rows.length })
      return ''
    }

    const excluded = coolTurns({ rows, coolChars: settings.coolChars })
    const candidates = candidatesOf({
      repo: store,
      flicker,
      excluded,
      minStrength: settings.minStrength,
      common,
      foreground: foregroundExact,
      current: currentExact,
      limit: settings.fragments,
    })
    if (candidates.length === 0) {
      report({
        skip: 'no-candidates',
        flicker: flicker.size,
        foreground: foregroundExact.size,
        excluded: excluded.size,
        rows: rows.length,
      })
      return ''
    }

    const now = charsOf(rows)
    const fresh = pickFresh(candidates, loadRecalled(), now, settings.coolChars)
    if (fresh.length === 0) {
      report({ skip: 'all-recalled', flicker: flicker.size, candidates: candidates.length })
      return ''
    }

    const key = `${sessionId}|${rows.length}|${repoStamp}|${JSON.stringify(settings)}`
    const cached = textCache.get(key)
    if (cached !== undefined) return cached
    const block = renderRecall({ candidates: fresh, flicker, reader, config: settings })
    if (block) rememberRecalled(sessionId, fresh.map((entry) => entry.key), now)
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

  const onEvent = createTriggerHandler({
    compose,
    deliver,
    warn,
    note: noteRun,
    activity: appendActivity,
    secondEvery: () => config().secondEvery,
  })

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
