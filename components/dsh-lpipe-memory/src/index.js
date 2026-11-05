// 宿主半边：订阅 session/event，把白名单事件逐条追加进记忆。
import { readSessionTitle } from 'dsh-life-pipline/session-title'

import { project } from './project.mjs'
import { MemoryReader } from './reader.mjs'
import { MemoryWriter } from './writer.mjs'

export const name = 'dsh-lpipe-memory'

export const inject = []

/** 攒行多久落一次盘。崩溃最多丢这么久的内容，已有行不受影响。 */
export const FLUSH_MS = 5000

export function apply(ctx, options = {}) {
  const writer = options.writer ?? new MemoryWriter()
  let timer = null

  const flush = () => {
    try {
      writer.flush()
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-lpipe-memory] 落盘失败：${error?.message ?? error}`)
    }
  }

  ctx.effect(() => {
    timer = setInterval(flush, FLUSH_MS)
    timer?.unref?.()
    return () => {
      if (timer) clearInterval(timer)
      writer.close()
    }
  }, 'dsh-lpipe-memory: flush timer')

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      try {
        const projected = project(event)
        if (!projected) return
        writer.append({
          sessionId: session?.id ?? '',
          eventSeq: event?.seq,
          at: event?.time,
          kind: projected.kind,
          turn: projected.turn,
          step: projected.step,
          payload: projected.payload,
        })
        if (projected.kind === 'user/message' && event?.seq === 0) {
          const title = readSessionTitle?.(sessionsCtx.sessions, session?.id)
          if (title?.title) writer.setTitle(session?.id, title.title)
        }
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-lpipe-memory] 写入失败：${error?.message ?? error}`)
      }
    })
  })

  // 读取端先挂出来，给工具与后续的星图直接调。
  const reader = new MemoryReader()
  return { writer, reader }
}
