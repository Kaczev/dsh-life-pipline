// 宿主半边：订阅 session/event，把白名单事件逐条追加进记忆。
import { readSessionTitle } from 'dsh-life-pipline/session-title'

import { captureMedia } from './media.mjs'
import { migrateIfNeeded } from './compact.mjs'
import { packColdDays } from './pack.mjs'
import { memoryRoot } from './paths.mjs'
import { project } from './project.mjs'
import { MemoryReader } from './reader.mjs'
import { createMemoryRpcHandler, registerMemoryRpc } from './rpc.mjs'
import { createStatsCache } from './stats.mjs'
import { MemoryWriter } from './writer.mjs'

export const name = 'dsh-lpipe-memory'

export const inject = []

/**
 * 一轮结束才落盘：一轮之内的行先攒在内存里，收到 turn/end 才一次性写进去。
 * 盘上不会出现半截的轮次；没说完的轮次宁可不存，也不存一半。
 */
const TURN_END = 'turn/end'

export function apply(ctx, options = {}) {
  const root = options.root ?? memoryRoot()
  // 宿主没给 logger 时别把失败吞掉：迁移、落盘出了问题要能看见。
  const warn = (message) => {
    if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
    else console.warn(message)
  }
  // 旧格式（行里重复存 parts）在开写之前先重建，哈希链整条重算；失败就继续用旧格式。
  if (!options.writer) migrateIfNeeded({ root, log: warn })
  const writer = options.writer ?? new MemoryWriter({ root })
  const reader = new MemoryReader({ root })
  const stats = createStatsCache({ reader, root })
  let attachments = null
  /** sessionId -> 这一轮已经攒下的行 */
  const buffered = new Map()

  /** 把某个会话正在攒的轮次落盘；没有就什么也不做。 */
  const commit = (sessionId, turn = null) => {
    const rows = buffered.get(sessionId)
    buffered.delete(sessionId)
    if (!rows || rows.length === 0) return 0
    // user/message 事件本身不带轮号：用 turn/end 递过来的那个补上，
    // 否则这一行在星图里会被当成「没有轮次」整条跳过。
    const known = Number.isInteger(turn)
      ? turn
      : (rows.find((row) => Number.isInteger(row.turn))?.turn ?? null)
    const filled = known === null
      ? rows
      : rows.map((row) => (Number.isInteger(row.turn) ? row : { ...row, turn: known }))
    try {
      for (const row of filled) writer.append(row)
      writer.flush()
      refresh()
      return rows.length
    } catch (error) {
      warn(`[dsh-lpipe-memory] 落盘失败：${error?.message ?? error}`)
      return 0
    }
  }

  // 落盘之后游标变了：读端与统计都得重新读一遍，页面才会看见这一轮。
  const refresh = () => {
    try {
      reader.reload()
    } catch (error) {
      warn(`[dsh-lpipe-memory] 重读失败：${error?.message ?? error}`)
    }
    stats.invalidate()
  }

  ctx.effect(
    () => () => {
      // 卸载时还没说完的轮次不落盘，只把已落盘的部分收尾。
      buffered.clear()
      writer.close()
    },
    'dsh-lpipe-memory: close on teardown',
  )

  ctx.inject(['connection'], (connectionCtx) => {
    try {
      registerMemoryRpc(
        connectionCtx,
        createMemoryRpcHandler({ stats: (query) => stats.get(query) }),
      )
    } catch (error) {
      warn(`[dsh-lpipe-memory] RPC 注册失败：${error?.message ?? error}`)
    }
  })

  ctx.inject(['attachments'], (attachmentCtx) => {
    attachments = attachmentCtx.attachments ?? null
  })

  // 冷日打包：启动后补做一次，之后每 6 小时一次；只碰「今天以外」的日子，打过的直接跳过。
  if (options.pack !== false) {
    // 必须写成 ctx.logger.info()：Cordis 的 logger 是可调用对象，方法取出来再调用会丢 this。
    // 日志本身再出错也不能往外抛——宿主会把插件的异常当成致命加载失败。
    const note = (message) => {
      try {
        if (typeof ctx.logger?.info === 'function') ctx.logger.info(message)
        else if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
      } catch {
        // 日志写不进去就算了，打包已经完成
      }
    }
    const sweep = () => {
      try {
        const result = packColdDays(root, { log: warn })
        if (result.packed > 0) {
          stats.invalidate()
          note(`[dsh-lpipe-memory] 冷日打包 ${result.packed} 天：${result.before} → ${result.after} 字节`)
        }
      } catch (error) {
        warn(`[dsh-lpipe-memory] 冷日打包失败：${error?.message ?? error}`)
      }
    }
    const first = setTimeout(sweep, Number.isFinite(options.packDelay) ? options.packDelay : 5000)
    const repeat = setInterval(sweep, 6 * 60 * 60 * 1000)
    first.unref?.()
    repeat.unref?.()
    ctx.effect(
      () => () => {
        clearTimeout(first)
        clearInterval(repeat)
      },
      'dsh-lpipe-memory: settle cold days',
    )
  }

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      const sessionId = session?.id ?? ''
      try {
        // 轮次结束本身不入档，但它是这一轮完成的信号。
        if (event?.type === TURN_END) {
          commit(sessionId, event?.data?.turn ?? event?.turn ?? null)
          return
        }
        const projected = project(event)
        if (!projected) return
        let payload = projected.payload
        if (Array.isArray(payload?.parts) && payload.parts.some((part) => part?.attachment)) {
          const captured = captureMedia({ attachments, parts: payload.parts, root, log: warn, sessionId, at: event?.time })
          payload = { ...payload, parts: captured.parts, media: captured.media }
        }
        const rows = buffered.get(sessionId) ?? []
        // 新一轮开始了：上一轮若没收到 turn/end，先把它收掉，别两轮混在一起。
        if (
          projected.kind === 'user/message' &&
          rows.length > 0 &&
          projected.turn !== null &&
          rows[0].turn !== null &&
          projected.turn !== rows[0].turn
        ) {
          commit(sessionId, projected.turn)
        }
        const target = buffered.get(sessionId) ?? []
        target.push({
          sessionId,
          eventSeq: event?.seq,
          at: event?.time,
          kind: projected.kind,
          turn: projected.turn,
          step: projected.step,
          payload,
        })
        buffered.set(sessionId, target)
        if (projected.kind === 'user/message' && event?.seq === 0) {
          const title = readSessionTitle?.(sessionsCtx.sessions, sessionId)
          if (title?.title) writer.setTitle(sessionId, title.title)
        }
      } catch (error) {
        warn(`[dsh-lpipe-memory] 写入失败：${error?.message ?? error}`)
      }
    })
  })

  return { writer, reader, stats }
}
