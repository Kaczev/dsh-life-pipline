// media 转存：把图片/附件的字节搬进「它所属的那一天」的媒体包，行里只留坐标。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { dayOf } from './day.mjs'
import { appendMedia } from './mediapack.mjs'

const MAGIC = [
  { ext: 'png', mediaType: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'jpg', mediaType: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mediaType: 'image/gif', test: (b) => b.slice(0, 4).toString('latin1') === 'GIF8' },
  {
    ext: 'webp',
    mediaType: 'image/webp',
    test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  },
]

/** 认格式只看魔数，不信声明。认不出就当二进制存。 */
export function sniff(bytes) {
  for (const entry of MAGIC) {
    if (bytes.length >= 12 && entry.test(bytes)) return { ext: entry.ext, mediaType: entry.mediaType }
  }
  return { ext: 'bin', mediaType: 'application/octet-stream' }
}

function hostPathOf(attachments, ref) {
  if (typeof ref !== 'object' || ref === null) return undefined
  if (typeof ref.attachmentId === 'string' && ref.attachmentId.length === 0) return undefined
  if (typeof attachments?.imageHostPath === 'function') {
    try {
      const path = attachments.imageHostPath(ref)
      if (path) return path
    } catch {
      // 不是图片引用，接着试文件
    }
  }
  if (typeof attachments?.fileHostPath === 'function') {
    try {
      return attachments.fileHostPath(ref) ?? undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * 把内容块里的附件字节搬进当天那一个媒体包。
 * 返回新的 parts（含 sha256）与这一行要记的 media 清单；字节本身绝不进日志。
 */
export function captureMedia({ attachments, parts, root, log, sessionId, at }) {
  if (!Array.isArray(parts) || parts.length === 0) return { parts, media: [] }
  const media = []
  const items = []
  const next = []
  for (const part of parts) {
    const ref = part?.attachment
    if ((part?.type !== 'image' && part?.type !== 'file') || !ref) {
      next.push(part)
      continue
    }
    try {
      const path = hostPathOf(attachments, ref)
      if (!path) throw new Error('宿主没给这个附件的落盘路径')
      const bytes = readFileSync(path)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const declared = typeof ref.mediaType === 'string' ? ref.mediaType : ''
      const sniffed = sniff(bytes)
      // 声明的类型只在它比魔数更具体时才算数：文件附件常带 application/octet-stream。
      const trusted = declared !== '' && declared !== 'application/octet-stream'
      const mediaType = trusted ? declared : sniffed.mediaType
      const ext = trusted ? declared.split('/')[1]?.replace('jpeg', 'jpg') || sniffed.ext : sniffed.ext
      items.push({ sha256, ext, mediaType, bytes, name: ref.name ?? undefined })
      const record = { sha256, mediaType, bytes: bytes.length, name: ref.name ?? undefined }
      media.push(record)
      next.push({ ...part, sha256, mediaType, bytes: bytes.length })
    } catch (error) {
      const reason = String(error?.message ?? error).split('\n')[0]
      log?.(`[dsh-lpipe-memory] 附件没转存：${reason}`)
      next.push({ ...part, mediaError: reason })
    }
  }
  if (items.length > 0) {
    if (!sessionId) {
      log?.('[dsh-lpipe-memory] 附件没转存：不知道属于哪个会话')
    } else {
      try {
        appendMedia(root, sessionId, dayOf(Number.isFinite(at) ? at : Date.now()), items)
      } catch (error) {
        const reason = String(error?.message ?? error).split('\n')[0]
        log?.(`[dsh-lpipe-memory] 媒体包写入失败：${reason}`)
      }
    }
  }
  return { parts: next, media }
}
