// 写入：一条事件一行，追加进当天的帧文件；同时维护偏移表、meta 与全局游标。
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { GENESIS, seal } from './chain.mjs'
import { dayOf } from './day.mjs'
import { compressFrame, FRAME_BYTES } from './frames.mjs'
import { dayFile, framesFile, idxFile, memoryRoot, metaFile, sessionDir, stateFile } from './paths.mjs'

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

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/** 一天的写入端：攒够一帧就压缩追加，行偏移顺手记进 .idx。 */
class DaySink {
  constructor(root, sessionId, day) {
    this.file = dayFile(root, sessionId, day)
    this.framesPath = framesFile(root, sessionId, day)
    this.idxPath = idxFile(root, sessionId, day)
    mkdirSync(dirname(this.file), { recursive: true })
    this.position = existsSync(this.file) ? statSync(this.file).size : 0
    const lastFrame = readLines(this.framesPath).pop()
    this.frameNo = lastFrame ? JSON.parse(lastFrame).n + 1 : 0
    this.pending = []
    this.pendingRows = []
    this.pendingBytes = 0
  }

  push(seq, line) {
    const offset = this.pendingBytes
    this.pending.push(line + '\n')
    this.pendingRows.push({ s: seq, f: this.frameNo, o: offset, l: Buffer.byteLength(line) })
    this.pendingBytes += Buffer.byteLength(line) + 1
    if (this.pendingBytes >= FRAME_BYTES) this.flush()
  }

  flush() {
    if (this.pending.length === 0) return
    const packed = compressFrame(this.pending.join(''))
    appendFileSync(this.file, packed)
    appendFileSync(this.framesPath, JSON.stringify({ n: this.frameNo, at: this.position, len: packed.length }) + '\n')
    appendFileSync(this.idxPath, this.pendingRows.map((entry) => JSON.stringify(entry)).join('\n') + '\n')
    this.position += packed.length
    this.frameNo += 1
    this.pending = []
    this.pendingRows = []
    this.pendingBytes = 0
  }
}

export class MemoryWriter {
  constructor({ root = memoryRoot(), now = () => Date.now() } = {}) {
    this.root = root
    this.now = now
    this.sinks = new Map()
    this.meta = new Map()
    this.state = readJson(stateFile(root), { version: 2, seq: -1, hash: GENESIS, day: null, sessions: {} })
  }

  /** 该会话已经写到的事件序号，用来做幂等去重。 */
  lastEventSeq(sessionId) {
    return this.state.sessions[sessionId]?.lastEventSeq ?? -1
  }

  /**
   * 写入一条投影好的记录。
   * `eventSeq` 是会话内的事件序号：同一条重复投递会被直接跳过，返回 null。
   */
  append({ sessionId, eventSeq, at, kind, turn = null, step = null, payload = {} }) {
    if (!sessionId) throw new TypeError('append 需要 sessionId')
    if (Number.isFinite(eventSeq) && eventSeq <= this.lastEventSeq(sessionId)) return null
    const when = Number.isFinite(at) ? at : this.now()
    const day = dayOf(when)
    const key = `${sessionId}|${day}`
    if (!this.sinks.has(key)) this.sinks.set(key, new DaySink(this.root, sessionId, day))

    const seq = this.state.seq + 1
    const row = seal({ seq, day, at: when, session: sessionId, turn, step, kind, ...payload }, this.state.hash)
    this.sinks.get(key).push(seq, JSON.stringify(row))

    const session = this.state.sessions[sessionId] ?? { firstSeq: seq, lastSeq: seq, rows: 0, lastAt: when }
    session.firstSeq = Math.min(session.firstSeq ?? seq, seq)
    session.lastSeq = seq
    session.rows = (session.rows ?? 0) + 1
    session.lastAt = when
    if (Number.isFinite(eventSeq)) session.lastEventSeq = eventSeq
    this.state.sessions[sessionId] = session
    this.state.seq = seq
    this.state.hash = row.hash
    this.state.day = day
    this.#noteDay(sessionId, day, when)
    return row
  }

  #noteDay(sessionId, day, at) {
    const meta = this.meta.get(sessionId) ?? readJson(metaFile(this.root, sessionId), null) ?? {
      id: sessionId,
      title: '',
      startedAt: at,
      lastAt: at,
      rows: 0,
      days: [],
    }
    const entry = meta.days.find((item) => item.day === day)
    if (entry) entry.rows += 1
    else meta.days.push({ day, rows: 1 })
    meta.rows += 1
    meta.startedAt = Math.min(meta.startedAt ?? at, at)
    meta.lastAt = Math.max(meta.lastAt ?? at, at)
    this.meta.set(sessionId, meta)
  }

  /** 会话标题由宿主另外告知，写进 meta.json 当目录用。 */
  setTitle(sessionId, title) {
    if (!sessionId || !title) return
    const meta = this.meta.get(sessionId) ?? readJson(metaFile(this.root, sessionId), null)
    if (!meta) return
    meta.title = String(title)
    this.meta.set(sessionId, meta)
  }

  /** 把攒着的行压成帧，并落 state / meta。 */
  flush() {
    for (const sink of this.sinks.values()) sink.flush()
    writeJson(stateFile(this.root), this.state)
    for (const [sessionId, meta] of this.meta) {
      mkdirSync(sessionDir(this.root, sessionId), { recursive: true })
      writeJson(metaFile(this.root, sessionId), meta)
    }
  }

  close() {
    this.flush()
    this.sinks.clear()
  }

  snapshot() {
    return { seq: this.state.seq, hash: this.state.hash, day: this.state.day, sessions: { ...this.state.sessions } }
  }
}
