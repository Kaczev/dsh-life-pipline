// 读取：按 seq 只解一帧；时间线跨会话合并；搜索走全扫（冷路径，调用方应放到 worker）。
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs'

import { GENESIS, checkRow } from './chain.mjs'
import { decompressFrame } from './frames.mjs'
import { dayFile, daysDir, framesFile, idxFile, memoryRoot, stateFile } from './paths.mjs'

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

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

export class MemoryReader {
  constructor({ root = memoryRoot(), cacheFrames = 512 } = {}) {
    this.root = root
    this.cacheLimit = cacheFrames
    this.frameCache = new Map()
    this.idxCache = new Map()
    this.rowCache = new Map()
    this.dayCache = new Map()
    this.state = readJson(stateFile(root), { version: 1, seq: -1, hash: GENESIS, sessions: {} })
  }

  reload() {
    this.state = readJson(stateFile(this.root), this.state)
    this.frameCache.clear()
    this.idxCache.clear()
    this.rowCache.clear()
    this.dayCache.clear()
    return this
  }

  get size() {
    return Object.keys(this.state.sessions ?? {}).length
  }

  /** 哪个会话拥有这个 seq。 */
  sessionOf(seq) {
    for (const [sessionId, info] of Object.entries(this.state.sessions ?? {})) {
      if (seq >= info.firstSeq && seq <= info.lastSeq) return sessionId
    }
    return null
  }

  sessions() {
    return Object.entries(this.state.sessions ?? {})
      .map(([sessionId, info]) => ({ sessionId, firstSeq: info.firstSeq, lastSeq: info.lastSeq, rows: info.rows, lastAt: info.lastAt }))
      .sort((a, b) => a.firstSeq - b.firstSeq)
  }

  daysOf(sessionId) {
    if (this.dayCache.has(sessionId)) return this.dayCache.get(sessionId)
    const dir = daysDir(this.root, sessionId)
    const days = existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith('.jsonl.zst'))
          .map((name) => name.replace('.jsonl.zst', ''))
          .sort()
      : []
    this.dayCache.set(sessionId, days)
    return days
  }

  /** 取一行原文。命中帧缓存时零解压。 */
  read(seq) {
    if (!Number.isInteger(seq)) throw new TypeError('read 需要整数 seq')
    const sessionId = this.sessionOf(seq)
    if (!sessionId) return null
    const day = this.daysOf(sessionId).find((name) => this.#index(sessionId, name).has(seq))
    if (!day) return null
    const entry = this.#index(sessionId, day).get(seq)
    const text = this.#frameText(sessionId, day, entry.f)
    return JSON.parse(Buffer.from(text, 'utf8').subarray(entry.o, entry.o + entry.l).toString('utf8'))
  }

  /** 按时间回放；给了 session 就只回放那一个对话。 */
  timeline({ from = 0, to = Number.MAX_SAFE_INTEGER, limit = 50, session = null } = {}) {
    const out = []
    for (const { sessionId } of this.sessions()) {
      if (session && sessionId !== session) continue
      for (const row of this.#rows(sessionId)) {
        if (row.at < from || row.at > to) continue
        out.push({
          seq: row.seq,
          at: row.at,
          day: row.day,
          session: sessionId,
          kind: row.kind,
          turn: row.turn,
          step: row.step,
          text: (row.text ?? row.arguments ?? '').slice(0, 160),
        })
      }
    }
    out.sort((a, b) => a.seq - b.seq)
    return out.slice(0, limit)
  }

  /** 子串搜索。冷路径：调用方应放进 worker，别卡住宿主。 */
  search({ text, session = null, limit = 50 } = {}) {
    if (!text) return []
    const hits = []
    for (const { sessionId } of this.sessions()) {
      if (session && sessionId !== session) continue
      for (const row of this.#rows(sessionId)) {
        const haystack = [row.text, row.arguments, row.reasoning, row.message].filter(Boolean).join('\n')
        const at = haystack.indexOf(text)
        if (at < 0) continue
        hits.push({
          seq: row.seq,
          at: row.at,
          day: row.day,
          session: sessionId,
          kind: row.kind,
          snippet: haystack.slice(Math.max(0, at - 40), at + text.length + 40),
        })
        if (hits.length >= limit) return hits
      }
    }
    return hits
  }

  /** 沿哈希链校验。返回问题清单，空数组即完好。 */
  verify({ from = 0, to = Number.MAX_SAFE_INTEGER } = {}) {
    const rows = []
    for (const { sessionId } of this.sessions()) rows.push(...this.#rows(sessionId))
    rows.sort((a, b) => a.seq - b.seq)
    const problems = []
    let prev = GENESIS
    let expectSeq = rows.length ? rows[0].seq : 0
    for (const row of rows) {
      if (row.seq !== expectSeq) problems.push({ seq: row.seq, reason: `seq 不连续：期望 ${expectSeq}` })
      expectSeq = row.seq + 1
      const reason = checkRow(row, prev)
      if (reason && row.seq >= from && row.seq <= to) problems.push({ seq: row.seq, reason })
      prev = row.hash
    }
    return problems
  }

  // ---- 内部 ----

  #index(sessionId, day) {
    const key = `${sessionId}|${day}`
    if (this.idxCache.has(key)) return this.idxCache.get(key)
    const index = new Map()
    for (const line of readLines(idxFile(this.root, sessionId, day))) {
      const entry = JSON.parse(line)
      index.set(entry.s, entry)
    }
    this.idxCache.set(key, index)
    return index
  }

  #frameText(sessionId, day, frameNo) {
    const key = `${sessionId}|${day}|${frameNo}`
    if (this.frameCache.has(key)) {
      const text = this.frameCache.get(key)
      this.frameCache.delete(key)
      this.frameCache.set(key, text)
      return text
    }
    const meta = readLines(framesFile(this.root, sessionId, day))
      .map((line) => JSON.parse(line))
      .find((item) => item.n === frameNo)
    if (!meta) throw new Error(`帧 ${frameNo} 不在索引里：${sessionId}/${day}`)
    const text = decompressFrame(readRange(dayFile(this.root, sessionId, day), meta.at, meta.len))
    this.frameCache.set(key, text)
    if (this.frameCache.size > this.cacheLimit) this.frameCache.delete(this.frameCache.keys().next().value)
    return text
  }

  #rows(sessionId) {
    if (this.rowCache.has(sessionId)) return this.rowCache.get(sessionId)
    const rows = []
    for (const day of this.daysOf(sessionId)) {
      const file = dayFile(this.root, sessionId, day)
      for (const frame of readLines(framesFile(this.root, sessionId, day)).map((line) => JSON.parse(line))) {
        for (const line of decompressFrame(readRange(file, frame.at, frame.len)).split('\n')) {
          if (line) rows.push(JSON.parse(line))
        }
      }
    }
    rows.sort((a, b) => a.seq - b.seq)
    this.rowCache.set(sessionId, rows)
    return rows
  }
}
