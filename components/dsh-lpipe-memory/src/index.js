// 宿主半边：订阅 session/event，把白名单事件逐条追加进记忆。
import { readSessionTitle } from 'dsh-life-pipline/session-title'

import { captureMedia } from './media.mjs'
import { memoryRoot } from './paths.mjs'
import { project } from './project.mjs'
import { MemoryReader } from './reader.mjs'
import { MemoryWriter } from './writer.mjs'

export const name = 'dsh-lpipe-memory'

export const inject = []

/** 攒行多久落一次盘。崩溃最多丢这么久的内容，已有行不受影响。 */
export const FLUSH_MS = 5000

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
  }, 'dsh-lpipe-memory: flush timer')

  ctx.inject(['attachments'], (attachmentCtx) => {
    attachments = attachmentCtx.attachments ?? null
  })

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessionsCtx.on('session/event', (session, event) => {
      try {
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
