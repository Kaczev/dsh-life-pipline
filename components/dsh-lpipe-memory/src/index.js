// 宿主半边：订阅 session/event，把白名单事件逐条追加进记忆。
import { readSessionTitle } from 'dsh-life-pipline/session-title'

import { captureMedia } from './media.mjs'
import { memoryRoot } from './paths.mjs'
import { project } from './project.mjs'
import { MemoryReader } from './reader.mjs'
import { MemoryWriter } from './writer.mjs'

export const name = 'dsh-lpipe-memory'

export const inject = []

/**
 * 一轮结束就落一次盘：这是主要时机。
 * 保险业务：万一某轮没有 turn/end（比如崩溃后重建），也不能一直攒着。
 */
export const FLUSH_MS = 60_000

/** 一轮结束的事件。 */
const TURN_END = 'turn/end'

export function apply(ctx, options = {}) {
  const root = options.root ?? memoryRoot()
  const writer = options.writer ?? new MemoryWriter({ root })
  const reader = new MemoryReader({ root })
  let attachments = null
  let timer = null
  const warn = (message) => ctx.logger?.warn?.(message)

  const flush = () => {
    try {
      writer.flush()
    } catch (error) {
      warn(`[dsh-lpipe-memory] 落盘失败：${error?.message ?? error}`)
    }
  }

  ctx.effect(() => {
    timer = setInterval(flush, FLUSH_MS)
    timer?.unref?.()
    return () => {
      if (timer) clearInterval(timer)
      writer.close()
    }
  }, 'dsh-lpipe-memory: turn-end flush')

  ctx.inject(['attachments'], (attachmentCtx) => {
    attachments = attachmentCtx.attachments ?? null
  })

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      try {
        // 轮次结束本身不入档，但它是落盘的信号：这一轮的行到此为止。
        if (event?.type === TURN_END) {
          flush()
          return
        }
        const projected = project(event)
        if (!projected) return
        let payload = projected.payload
        if (Array.isArray(payload?.parts) && payload.parts.some((part) => part?.attachment)) {
          const captured = captureMedia({ attachments, parts: payload.parts, root, log: warn })
          payload = { ...payload, parts: captured.parts, media: captured.media }
        }
        writer.append({
          sessionId: session?.id ?? '',
          eventSeq: event?.seq,
          at: event?.time,
          kind: projected.kind,
          turn: projected.turn,
          step: projected.step,
          payload,
        })
        if (projected.kind === 'user/message' && event?.seq === 0) {
          const title = readSessionTitle?.(sessionsCtx.sessions, session?.id)
          if (title?.title) writer.setTitle(session?.id, title.title)
        }
      } catch (error) {
        warn(`[dsh-lpipe-memory] 写入失败：${error?.message ?? error}`)
      }
    })
  })

  return { writer, reader }
}
