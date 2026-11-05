// 宿主半边：订阅 session/event，把白名单事件逐条追加进记忆。
import { readSessionTitle } from 'dsh-life-pipline/session-title'

import { captureMedia } from './media.mjs'
import { migrateIfNeeded } from './compact.mjs'
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
  const warn = (message) => ctx.logger?.warn?.(message)
  // 旧格式（行里重复存 parts）在开写之前先重建，哈希链整条重算；失败就继续用旧格式。
  if (!options.writer) migrateIfNeeded({ root, log: warn })
  const writer = options.writer ?? new MemoryWriter({ root })
  const reader = new MemoryReader({ root })
  const stats = createStatsCache({ reader, root })
  let attachments = null
  /** sessionId -> 这一轮已经攒下的行 */
  const buffered = new Map()

  /** 把某个会话正在攒的轮次落盘；没有就什么也不做。 */
  const commit = (sessionId) => {
    const rows = buffered.get(sessionId)
    buffered.delete(sessionId)
    if (!rows || rows.length === 0) return 0
    try {
      for (const row of rows) writer.append(row)
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

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      const sessionId = session?.id ?? ''
      try {
        // 轮次结束本身不入档，但它是这一轮完成的信号。
        if (event?.type === TURN_END) {
          commit(sessionId)
          return
        }
        const projected = project(event)
        if (!projected) return
        let payload = projected.payload
        if (Array.isArray(payload?.parts) && payload.parts.some((part) => part?.attachment)) {
          const captured = captureMedia({ attachments, parts: payload.parts, root, log: warn })
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
          commit(sessionId)
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
