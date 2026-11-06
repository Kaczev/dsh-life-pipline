// 冷日打包：过完的那一天整天重打成一条 zstd 流，等级高，能看见整天的上下文。
// 正在写的那一天不动——追加只压新的一段，代价低；整条流一重写就要重来看不见的甜头。
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { constants as C, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

import { dayOf } from './day.mjs'
import { decompressFrame } from './frames.mjs'
import { dayFile, daysDir, framesFile, idxFile, sessionsDir } from './paths.mjs'

/** 冷日的压缩等级：只有落盘那一刻付一次，读的时候照样只解一条流。 */
export const COLD_LEVEL = 19

function readLines(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
}

function writeAtomic(file, bytes) {
  const tmp = `${file}.pack-${process.pid}`
  writeFileSync(tmp, bytes)
  renameSync(tmp, file)
}

/** 这一天是不是已经打成一条流了。 */
export function isPacked(root, sessionId, day, level = COLD_LEVEL) {
  if (!existsSync(dayFile(root, sessionId, day))) return false
  const frames = readLines(framesFile(root, sessionId, day)).map((line) => JSON.parse(line))
  return frames.length === 1 && frames[0]?.lvl === level
}

/**
 * 把一天的多帧重打成一条流：解开每一帧、拼回整天、整段压到一条。
 * 偏移表里的 `o` 原本是「帧内偏移」，这里换算成「整天偏移」，`f` 一律归 0。
 */
export function packDay(root, sessionId, day, { level = COLD_LEVEL } = {}) {
  const data = dayFile(root, sessionId, day)
  if (!existsSync(data)) return { day, skipped: 'missing' }
  const frames = readLines(framesFile(root, sessionId, day)).map((line) => JSON.parse(line))
  if (frames.length === 0) return { day, skipped: 'no-frames' }
  if (frames.length === 1 && frames[0].lvl === level) return { day, skipped: 'packed' }

  const before = statSync(data).size
  const bytes = readFileSync(data)
  const plains = frames.map((frame) => decompressFrame(bytes.subarray(frame.at, frame.at + frame.len)))
  const whole = plains.join('')
  const packed = zstdCompressSync(Buffer.from(whole, 'utf8'), {
    params: { [C.ZSTD_c_compressionLevel]: level },
  })
  // 写完先自己解一遍：解出来必须和原文一字不差，才允许替换。
  if (zstdDecompressSync(packed).toString('utf8') !== whole) throw new Error(`打包校验失败：${sessionId}/${day}`)

  const offsets = []
  let cursor = 0
  for (const plain of plains) {
    offsets.push(cursor)
    cursor += Buffer.byteLength(plain)
  }
  const index = readLines(idxFile(root, sessionId, day)).map((line) => {
    const entry = JSON.parse(line)
    return JSON.stringify({ ...entry, f: 0, o: (offsets[entry.f] ?? 0) + entry.o })
  })

  writeAtomic(data, packed)
  writeAtomic(
    framesFile(root, sessionId, day),
    Buffer.from(JSON.stringify({ n: 0, at: 0, len: packed.length, lvl: level }) + '\n', 'utf8'),
  )
  writeAtomic(idxFile(root, sessionId, day), Buffer.from(index.join('\n') + '\n', 'utf8'))
  return { day, session: sessionId, before, after: packed.length }
}

/** 把「今天以外」的日子全部打包一遍；已经打过的直接跳过。 */
export function packColdDays(root, { level = COLD_LEVEL, today = dayOf(Date.now()), log } = {}) {
  const sessions = existsSync(sessionsDir(root)) ? readdirSync(sessionsDir(root)) : []
  const days = []
  for (const sessionId of sessions) {
    const dir = daysDir(root, sessionId)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl.zst')) continue
      const day = name.replace('.jsonl.zst', '')
      if (day === today) continue
      try {
        const result = packDay(root, sessionId, day, { level })
        if (!result.skipped) days.push(result)
      } catch (error) {
        log?.(`[dsh-lpipe-memory] 冷日打包失败 ${sessionId}/${day}：${error?.message ?? error}`)
      }
    }
  }
  const before = days.reduce((sum, item) => sum + item.before, 0)
  const after = days.reduce((sum, item) => sum + item.after, 0)
  return { packed: days.length, before, after }
}
