// 记忆大小的统计：按轮累计，供设置页画曲线用。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { memoryRoot, sessionsDir } from './paths.mjs'

/** media 目录树加起来有多大（内容寻址，天然去重）。 */
function directoryBytes(dir) {
  let total = 0
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += directoryBytes(full)
    else if (entry.isFile()) {
      try {
        total += statSync(full).size
      } catch {
        // 文件刚被挪走，跳过
      }
    }
  }
  return total
}

/** 磁盘上到底占了多少：每天的分卷 + 帧表 + 偏移表 + media。 */
export function diskUsage(root = memoryRoot()) {
  let bytes = 0
  let sessions = []
  try {
    sessions = readdirSync(sessionsDir(root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return 0
  }
  for (const sessionId of sessions) {
    bytes += directoryBytes(join(sessionsDir(root), sessionId, 'days'))
  }
  bytes += directoryBytes(join(root, 'media'))
  return bytes
}

/**
 * 逐轮汇总：每一轮新增多少字节、累计到多少。
 * 一轮的「大小」按这一轮写下的行（JSON 字节）加它新带来的 media 字节算。
 */
export function computeStats(reader, { turns = 30, root = memoryRoot() } = {}) {
  const state = reader?.state ?? {}
  const lastSeq = Number.isFinite(state.seq) ? state.seq : -1
  const groups = new Map()
  const seenMedia = new Set()
  let total = 0
  let rows = 0

  for (let seq = 0; seq <= lastSeq; seq += 1) {
    let row
    try {
      row = reader.read(seq)
    } catch {
      continue
    }
    if (!row) continue
    const bytes = Buffer.byteLength(JSON.stringify(row)) + 1
    rows += 1
    total += bytes
    for (const item of row.media ?? []) {
      const sha = item?.sha256
      if (!sha || seenMedia.has(sha)) continue
      seenMedia.add(sha)
      total += Number(item.bytes) || 0
    }
    const key = `${row.session}|${row.turn}`
    const entry = groups.get(key) ?? { session: row.session, turn: row.turn, at: row.at, added: 0, total: 0 }
    entry.added += bytes
    entry.at = Math.max(entry.at ?? 0, row.at ?? 0)
    groups.set(key, entry)
  }

  let running = 0
  for (const entry of groups.values()) {
    running += entry.added
    entry.total = running
  }
  const series = [...groups.values()].slice(-Math.max(1, turns))

  return {
    total,
    rows,
    sessions: Object.keys(state.sessions ?? {}).length,
    disk: diskUsage(root),
    generatedAt: Date.now(),
    turns: series,
  }
}

/** 按 state.seq 缓存：库没变就不重算，设置页每几秒问一次也不心疼。 */
export function createStatsCache({ reader, root = memoryRoot() } = {}) {
  let cachedSeq = null
  let cached = null
  return {
    get({ turns = 30 } = {}) {
      const seq = reader?.state?.seq ?? -1
      if (cached && cachedSeq === seq) return { ...cached, turns: cached.turns.slice(-Math.max(1, turns)) }
      cached = computeStats(reader, { turns: 60, root })
      cachedSeq = seq
      return { ...cached, turns: cached.turns.slice(-Math.max(1, turns)) }
    },
    invalidate() {
      cachedSeq = null
      cached = null
    },
  }
}
