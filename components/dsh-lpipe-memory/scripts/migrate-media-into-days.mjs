// 一次性迁移：把散在全局 media/ 里的图片搬进它们各自那一天（以及那个会话）的媒体包。
//
//   node scripts/migrate-media-into-days.mjs [--root <记忆根目录>] [--dry]
//
// 搬完先逐张读回来核对字节数，全部对得上才把 media/ 改名成 media.migrated-<时间>，
// 留着让人自己看一眼再删。中途任何一张找不到原文件，就只报告、不改名。
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { appendMedia, readMedia } from '../src/mediapack.mjs'
import { memoryRoot } from '../src/paths.mjs'
import { MemoryReader } from '../src/reader.mjs'

function findGlobal(root, sha256) {
  const dir = join(root, 'media', sha256.slice(0, 2), sha256.slice(2, 4))
  if (!existsSync(dir)) return null
  const name = readdirSync(dir).find((item) => item.startsWith(sha256))
  return name ? join(dir, name) : null
}

export function migrateMediaIntoDays({ root = memoryRoot(), dry = false, log = () => {} } = {}) {
  const reader = new MemoryReader({ root })
  const batches = new Map()
  const missing = []
  let referenced = 0

  for (const { sessionId, firstSeq, lastSeq } of reader.sessions()) {
    for (let seq = firstSeq; seq <= lastSeq; seq += 1) {
      let row
      try {
        row = reader.read(seq)
      } catch {
        continue
      }
      if (!Array.isArray(row?.media) || row.media.length === 0) continue
      const day = reader.dayOf(seq)
      if (!day) continue
      const key = `${sessionId}|${day}`
      const batch = batches.get(key) ?? { sessionId, day, items: [] }
      for (const item of row.media) {
        if (typeof item?.sha256 !== 'string') continue
        referenced += 1
        const file = findGlobal(root, item.sha256)
        if (!file) {
          missing.push({ sha256: item.sha256, session: sessionId, day })
          continue
        }
        batch.items.push({
          sha256: item.sha256,
          ext: file.split('.').pop(),
          mediaType: item.mediaType,
          bytes: readFileSync(file),
          name: item.name,
        })
      }
      batches.set(key, batch)
    }
  }

  let written = 0
  let bytes = 0
  for (const { sessionId, day, items } of batches.values()) {
    if (items.length === 0) continue
    if (dry) {
      written += items.length
      bytes += items.reduce((sum, item) => sum + item.bytes.length, 0)
      continue
    }
    const result = appendMedia(root, sessionId, day, items)
    written += result.added
    bytes += items.reduce((sum, item) => sum + item.bytes.length, 0)
    log(`[迁移] ${sessionId}/${day}：${result.added} 张`)
  }

  // 读回来核对：字节数对不上就不许改名。
  let broken = []
  if (!dry) {
    for (const { sessionId, day, items } of batches.values()) {
      for (const item of items) {
        const back = readMedia(root, sessionId, day, item.sha256)
        if (!back || back.length !== item.bytes.length) broken.push({ sha256: item.sha256, session: sessionId, day })
      }
    }
  }

  let renamedTo = null
  const mediaDir = join(root, 'media')
  if (!dry && broken.length === 0 && missing.length === 0 && existsSync(mediaDir)) {
    renamedTo = `${mediaDir}.migrated-${new Date().toISOString().replace(/[:.]/g, '-')}`
    renameSync(mediaDir, renamedTo)
  }

  return { referenced, written, bytes, days: batches.size, missing, broken, renamedTo }
}

const isDirect = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isDirect) {
  const args = process.argv.slice(2)
  const rootIndex = args.indexOf('--root')
  const root = rootIndex >= 0 ? args[rootIndex + 1] : memoryRoot()
  const dry = args.includes('--dry')
  const result = migrateMediaIntoDays({ root, dry, log: (message) => console.log(message) })
  console.log(
    `${dry ? '[演练] ' : ''}引用 ${result.referenced} 张，写入 ${result.written} 张，${(result.bytes / 1048576).toFixed(2)} MB，涉及 ${result.days} 个「会话·天」`,
  )
  if (result.missing.length) console.log(`找不到原文件 ${result.missing.length} 张（这些留在 media/ 里，没有改名）`)
  if (result.broken.length) console.log(`读回对不上 ${result.broken.length} 张（没有改名，请检查）`)
  if (result.renamedTo) console.log(`media/ 已改名：${result.renamedTo}`)
}
