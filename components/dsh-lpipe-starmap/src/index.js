// 宿主半边：记忆落盘之后，把新的一轮接过来抽星，然后把这一轮从灰变亮。
import { MemoryReader } from 'dsh-lpipe-memory/reader'
import { memoryRoot } from 'dsh-lpipe-memory/paths'

import { buildTurn, groupTurns } from './build.mjs'
import { buildLexicon, matcherOf } from './lexicon.mjs'
import { starmapRoot } from './paths.mjs'
import { createQueries } from './query.mjs'
import { createStarmapRpcHandler, registerStarmapRpc } from './rpc.mjs'
import { loadLexicon, openRepo, saveLexicon, turnKey } from './store.mjs'

export const name = 'dsh-lpipe-starmap'

export const inject = []

const TURN_END = 'turn/end'
/** 灰记忆攒到这么多轮就重长一版词表；否则用冻住的那一版。 */
const REBUILD_AFTER = 200

export function apply(ctx, options = {}) {
  const root = options.root ?? starmapRoot()
  const memory = options.reader ?? new MemoryReader({ root: options.memoryRoot ?? memoryRoot() })
  const repo = openRepo({ root })
  const warn = (message) => ctx.logger?.warn?.(message)
  const info = (message) => (ctx.logger?.info ?? ctx.logger?.warn)?.(message)

  let lexicon = loadLexicon(root)
  let matcher = matcherOf(lexicon)
  /** sessionId -> 记忆里这个会话最大的轮号（启动或构建时更新，设置页读它算灰） */
  const maxTurn = new Map()
  const emptyMatcher = { buckets: new Map(), longest: 0 }

  const sessions = () => {
    try {
      return memory.sessions()
    } catch (error) {
      warn(`[dsh-lpipe-starmap] 读不到记忆：${error?.message ?? error}`)
      return []
    }
  }

  const rowsOf = (sessionId) => {
    const info_ = sessions().find((entry) => entry.sessionId === sessionId)
    if (!info_) return []
    const rows = []
    for (let seq = info_.firstSeq; seq <= info_.lastSeq; seq += 1) {
      const row = memory.read(seq)
      if (row) rows.push(row)
    }
    return rows
  }

  /** 把某一轮的原文拼起来，长词表用。 */
  const textsByTurn = () => {
    const turns = []
    for (const session of sessions()) {
      const rows = rowsOf(session.sessionId)
      for (const turn of groupTurns(rows)) {
        const parts = []
        for (const row of turn.rows) {
          if (typeof row?.text === 'string') parts.push(row.text)
          if (typeof row?.reasoning === 'string') parts.push(row.reasoning)
        }
        if (parts.length > 0) turns.push(parts.join('\n'))
      }
    }
    return turns
  }

  const ensureLexicon = ({ force = false } = {}) => {
    const texts = textsByTurn()
    const total = texts.length
    const grey = Math.max(0, total - repo.turns.size)
    if (lexicon && !force && grey < REBUILD_AFTER) return lexicon
    if (total === 0) return lexicon
    const started = Date.now()
    const next = buildLexicon({ turns: texts, version: (lexicon?.version ?? 0) + 1 })
    saveLexicon(root, next)
    lexicon = next
    matcher = matcherOf(next)
    info(`[dsh-lpipe-starmap] 词表第 ${next.version} 版：${next.words.length} 个词，${total} 轮，${Date.now() - started} ms`)
    return next
  }

  /** 把某个会话里还没亮的轮次接过来。 */
  const buildSession = (sessionId) => {
    const rows = rowsOf(sessionId)
    if (rows.length === 0) return 0
    const turns = groupTurns(rows)
    const last = turns[turns.length - 1]
    if (last) maxTurn.set(sessionId, last.turn)
    let built = 0
    for (const turn of turns) {
      if (repo.turns.has(turnKey(sessionId, turn.turn))) continue
      buildTurn({ repo, turn, sessionId, lex: lexicon?.version ?? 0, matcher: matcher ?? emptyMatcher })
      built += 1
    }
    return built
  }

  const buildAll = () => {
    let built = 0
    for (const session of sessions()) built += buildSession(session.sessionId)
    return built
  }

  /** 记忆里有多少轮、星图亮了多少轮。 */
  const status = () => {
    const list = []
    let turns = 0
    let lastBuiltAt = null
    let lastTurn = null
    for (const session of sessions()) {
      let max = maxTurn.get(session.sessionId)
      if (!Number.isInteger(max)) {
        const lastRow = memory.read(session.lastSeq)
        max = Number.isInteger(lastRow?.turn) ? lastRow.turn : 0
        maxTurn.set(session.sessionId, max)
      }
      const builtInfo = repo.state?.built?.[session.sessionId] ?? null
      const builtTurns = builtInfo?.turn ?? 0
      turns += max
      if (Number.isInteger(builtTurns)) {
        list.push({ sessionId: session.sessionId, turns: max, built: Math.min(builtTurns, max), grey: Math.max(0, max - builtTurns), to: builtInfo?.to ?? null })
      }
    }
    for (const record of repo.turns.values()) {
      if (lastBuiltAt === null || (record.at ?? 0) > lastBuiltAt) {
        lastBuiltAt = record.at ?? null
        lastTurn = record.turn
      }
    }
    return { turns, sessions: list, lastBuiltAt, lastTurn }
  }

  const queries = createQueries({ repo, memoryStatus: status })

  const run = (label, work) => {
    try {
      return work()
    } catch (error) {
      warn(`[dsh-lpipe-starmap] ${label}失败：${error?.message ?? error}`)
      return null
    }
  }

  // 启动后补做：先把词表长出来，再把所有灰记忆一轮一轮点亮。
  const warmDelay = Number.isFinite(options.warmDelay) ? options.warmDelay : 4000
  const warm = setTimeout(() => {
    run('启动构建', () => {
      memory.reload()
      ensureLexicon()
      const built = buildAll()
      if (built > 0) info(`[dsh-lpipe-starmap] 点亮 ${built} 轮，累计 ${repo.turns.size} 轮、${repo.stars.size} 颗星`)
    })
  }, warmDelay)
  warm.unref?.()

  ctx.effect(
    () => () => {
      clearTimeout(warm)
    },
    'dsh-lpipe-starmap: stop warm-up',
  )

  ctx.inject(['connection'], (connectionCtx) => {
    try {
      registerStarmapRpc(connectionCtx, createStarmapRpcHandler({ queries }))
    } catch (error) {
      warn(`[dsh-lpipe-starmap] RPC 注册失败：${error?.message ?? error}`)
    }
  })

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      if (event?.type !== TURN_END) return
      const sessionId = session?.id ?? ''
      if (!sessionId) return
      // 记忆层也在 turn/end 落盘：等它写完再读，否则会读到上一轮的磁盘状态。
      const delay = Number.isFinite(options.turnDelay) ? options.turnDelay : 1500
      const timer = setTimeout(() => {
        run('构建这一轮', () => {
          memory.reload()
          buildSession(sessionId)
        })
      }, delay)
      timer.unref?.()
    })
  })

  return { repo, queries, buildAll, ensureLexicon }
}
