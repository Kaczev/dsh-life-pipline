// 记忆大小的统计：按轮累计「原文」与「落盘」两条曲线，供设置页画图用。
//
// 原文 = 每行 JSON 的字节 + 它第一次带来的 media 字节，未压缩。
// 落盘 = 同样这些行在磁盘上真实占的字节：帧的压缩长度按行字节摊到每一行，
//        再加上这一天的索引表、帧表，以及 media。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { mediaPackBytes } from './mediapack.mjs'
import { daysDir, framesFile, idxFile, memoryRoot, sessionsDir } from './paths.mjs'

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

function fileBytes(file) {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

function readLines(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
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
    bytes += directoryBytes(join(daysDir(root, sessionId)))
  }
  bytes += directoryBytes(join(root, 'media'))
  return bytes
}

/**
 * 一天的分卷里，每一行摊到多少磁盘字节。
 *
 * 帧是压缩单位，一行自己压出来多少没法量；所以按行 JSON 长度把帧的压缩长度分下去——
 * 同一帧里长的行分得多。这天的 `.idx` 与 `.frames` 也按同样比例摊进每一行，
 * 否则曲线末尾会比真实磁盘少掉几万个字节。
 */
function dayShares(root, sessionId, day) {
  const shares = new Map()
  const idx = readLines(idxFile(root, sessionId, day))
    .map((line) => JSON.parse(line))
    .filter((item) => Number.isFinite(item?.s))
  if (idx.length === 0) return shares

  const frames = new Map()
  let metaBytes = fileBytes(idxFile(root, sessionId, day)) + mediaPackBytes(root, sessionId, day)
  for (const line of readLines(framesFile(root, sessionId, day))) {
    const item = JSON.parse(line)
    if (Number.isFinite(item?.n) && Number.isFinite(item?.len)) frames.set(item.n, item.len)
    metaBytes += Buffer.byteLength(line) + 1
  }

  const byFrame = new Map()
  for (const item of idx) {
    const list = byFrame.get(item.f) ?? []
    list.push(item)
    byFrame.set(item.f, list)
  }
  const totalWeight = idx.reduce((sum, item) => sum + (Number(item.l) || 1), 0) || 1

  for (const [frameNo, rows] of byFrame) {
    const weight = rows.reduce((sum, item) => sum + (Number(item.l) || 1), 0) || 1
    const packed = frames.get(frameNo) ?? 0
    for (const item of rows) {
      const l = Number(item.l) || 1
      const compressed = (packed * l) / weight
      const meta = (metaBytes * l) / totalWeight
      shares.set(item.s, compressed + meta)
    }
  }
  return shares
}

/**
 * 全库的「一行摊到多少磁盘字节」。
 *
 * 不按行上的 `day` 去找文件——那个字段是写入时按 `at − 4h` 算的，跨零点时会和
 * 它实际躺在哪个天文件里对不上，查错了文件就摊到 0，缺口最后全堆到最后一轮上。
 * 所以直接扫盘：把每个会话每一天的 `.idx` / `.frames` 读一遍，按 seq 建表。
 */
function diskShares(root) {
  const shares = new Map()
  let sessions = []
  try {
    sessions = readdirSync(sessionsDir(root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return shares
  }
  for (const sessionId of sessions) {
    let days = []
    try {
      days = readdirSync(daysDir(root, sessionId))
        .filter((name) => name.endsWith('.jsonl.zst'))
        .map((name) => name.slice(0, -'.jsonl.zst'.length))
    } catch {
      continue
    }
    for (const day of days) {
      for (const [seq, bytes] of dayShares(root, sessionId, day)) shares.set(seq, bytes)
    }
  }
  return shares
}

/**
 * 逐轮汇总：每一轮新增多少字节、累计到多少。原文与落盘两条线同起点、同刻度。
 * 一轮的原文按这一轮写下的行（JSON 字节）加它新带来的 media 字节算；
 * 落盘按同样的行在磁盘上的摊分字节算。
 */
export function computeStats(reader, { turns = 30, root = memoryRoot() } = {}) {
  const state = reader?.state ?? {}
  const lastSeq = Number.isFinite(state.seq) ? state.seq : -1
  const groups = new Map()
  const seenMedia = new Set()
  const shares = diskShares(root)
  let total = 0
  let diskTotal = 0
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

    const diskRow = shares.get(row.seq) ?? 0
    diskTotal += diskRow

    let mediaBytes = 0
    for (const item of row.media ?? []) {
      const sha = item?.sha256
      if (!sha || seenMedia.has(sha)) continue
      seenMedia.add(sha)
      mediaBytes += Number(item.bytes) || 0
    }
    total += mediaBytes

    const key = `${row.session}|${row.turn}`
    const entry = groups.get(key) ?? {
      session: row.session, turn: row.turn, at: row.at, added: 0, total: 0, diskAdded: 0, diskTotal: 0,
    }
    entry.added += bytes + mediaBytes
    entry.diskAdded += diskRow + mediaBytes
    entry.at = Math.max(entry.at ?? 0, row.at ?? 0)
    groups.set(key, entry)
  }

  const series = [...groups.values()]
  let runningTotal = 0
  let runningDisk = 0
  for (const entry of series) {
    runningTotal += entry.added
    runningDisk += entry.diskAdded
    entry.total = runningTotal
    entry.diskTotal = runningDisk
  }

  // state.json、meta.json、没有行引用到的 media 这些零头没落到任何一行上。
  // 按各轮已有的磁盘增量等比摊开，而不是一股脑塞进最后一轮——否则界面上会看到
  // 「最近一轮 +434 KB」这种假暴涨，而那一轮其实只写了几 KB。
  const actual = diskUsage(root)
  const gap = actual - runningDisk
  if (gap > 0 && runningDisk > 0) {
    const scale = 1 + gap / runningDisk
    for (const entry of series) entry.diskAdded *= scale
    runningDisk = 0
    for (const entry of series) {
      runningDisk += entry.diskAdded
      entry.diskTotal = runningDisk
    }
  }

  return {
    total,
    disk: actual,
    rows,
    sessions: Object.keys(state.sessions ?? {}).length,
    generatedAt: Date.now(),
    turns: series.slice(-Math.max(1, turns)),
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
