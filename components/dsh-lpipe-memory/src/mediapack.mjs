// 媒体包：图片不再散在全局 media/ 里，跟着它所属的那一天走。
//
// 一天一个包：`days/<day>.media.zst`，追加式帧。一帧 = 一行表头 + 若干张图的原始字节，
// 表头记下每张图在自己这一帧明文里的偏移与长度，`days/<day>.media.idx` 再记下
// 「这一帧在包里从哪开始、多长」，于是取一张图只解那一帧、只切一段。
//
// 图片本身已经是压缩格式，用等级 1 —— 再往上压不动，白白费时间。
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { constants as C, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

import { mediaIdxFile, mediaPackFile } from './paths.mjs'

export const MEDIA_LEVEL = 1

function readLines(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
}

function readRange(file, position, length) {
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.allocUnsafe(length)
    readSync(fd, buffer, 0, length, position)
    return buffer
  } finally {
    closeSync(fd)
  }
}

/** 这一天的媒体索引：sha256 → (帧位置, 帧长, 帧内偏移, 字节数)。 */
export function mediaIndex(root, sessionId, day) {
  const index = new Map()
  for (const line of readLines(mediaIdxFile(root, sessionId, day))) {
    try {
      const item = JSON.parse(line)
      if (typeof item?.s === 'string') index.set(item.s, item)
    } catch {
      // 坏行跳过：最坏结果是那张图要重新转存一次
    }
  }
  return index
}

/** 把一批图追加进这一天的媒体包；已经在这一天里的直接跳过。 */
export function appendMedia(root, sessionId, day, items, { level = MEDIA_LEVEL } = {}) {
  const pack = mediaPackFile(root, sessionId, day)
  const known = mediaIndex(root, sessionId, day)
  const fresh = []
  const seen = new Set()
  for (const item of items) {
    const sha = item?.sha256
    if (typeof sha !== 'string' || !Buffer.isBuffer(item?.bytes)) continue
    if (known.has(sha) || seen.has(sha)) continue
    seen.add(sha)
    fresh.push(item)
  }
  if (fresh.length === 0) return { added: 0, skipped: items.length }

  const header = []
  let cursor = 0
  for (const item of fresh) {
    header.push({ s: item.sha256, o: cursor, l: item.bytes.length })
    cursor += item.bytes.length
  }
  const head = Buffer.from(JSON.stringify(header) + '\n', 'utf8')
  const payload = Buffer.concat([head, ...fresh.map((item) => item.bytes)])
  const packed = zstdCompressSync(payload, { params: { [C.ZSTD_c_compressionLevel]: level } })

  mkdirSync(dirname(pack), { recursive: true })
  const at = existsSync(pack) ? statSync(pack).size : 0
  appendFileSync(pack, packed)
  const lines = fresh.map((item, i) => JSON.stringify({
    s: item.sha256,
    a: at,
    z: packed.length,
    o: head.length + header[i].o,
    l: item.bytes.length,
    e: item.ext ?? 'bin',
    t: item.mediaType ?? 'application/octet-stream',
    n: item.name ?? undefined,
  }))
  appendFileSync(mediaIdxFile(root, sessionId, day), lines.join('\n') + '\n')
  return { added: fresh.length, skipped: items.length - fresh.length }
}

/** 取一张图的字节；这一天里没有就返回 null。 */
export function readMedia(root, sessionId, day, sha256) {
  const entry = mediaIndex(root, sessionId, day).get(sha256)
  if (!entry) return null
  const whole = readRange(mediaPackFile(root, sessionId, day), entry.a, entry.z)
  const payload = zstdDecompressSync(whole)
  return payload.subarray(entry.o, entry.o + entry.l)
}

/** 这一天的媒体包在磁盘上占多少（包 + 索引）。 */
export function mediaPackBytes(root, sessionId, day) {
  let total = 0
  for (const file of [mediaPackFile(root, sessionId, day), mediaIdxFile(root, sessionId, day)]) {
    try {
      total += statSync(file).size
    } catch {
      // 没有媒体就是 0
    }
  }
  return total
}
