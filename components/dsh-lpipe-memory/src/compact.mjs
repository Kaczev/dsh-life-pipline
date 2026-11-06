// 迁移：把旧的记忆库重建成「不再重复存 parts」的格式，哈希链整条重算。
// 只在库的 version 落后时跑一次；跑完把旧目录改名留作备份。
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { GENESIS } from './chain.mjs'
import { MemoryReader } from './reader.mjs'
import { metaFile, stateFile } from './paths.mjs'
import { carriedParts } from './project.mjs'
import { MemoryWriter } from './writer.mjs'

/**
 * 2 = 行里不再存 text/reasoning 的副本。
 * 3 = 每条行都带轮号：早先 `user/message` 事件本身不带 turn，那些行是 null，
 *     星图按轮分组时会把它们整条跳过，于是你自己的话从来没有参与抽星。
 */
export const FORMAT_VERSION = 2

const STRUCTURAL = new Set(['seq', 'day', 'at', 'session', 'turn', 'step', 'kind', 'prev', 'hash'])

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/** 这一条旧行还带着重复的 parts 副本吗？ */
export function hasDuplicateParts(row) {
  const parts = row?.parts
  if (!Array.isArray(parts)) return false
  return parts.some((part) => part?.type === 'text' || part?.type === 'reasoning')
}

function payloadOf(row) {
  const payload = {}
  for (const [key, value] of Object.entries(row)) {
    if (STRUCTURAL.has(key)) continue
    payload[key] = value
  }
  if (Array.isArray(payload.parts)) {
    const carried = carriedParts(payload.parts)
    if (carried.length > 0) payload.parts = carried
    else delete payload.parts
  }
  return payload
}

export function needsMigration(root) {
  const state = readJson(stateFile(root), null)
  if (!state) return false
  return (state.version ?? 1) < FORMAT_VERSION
}

/**
 * 整库重建：行照旧、seq 照旧、顺序照旧，只去掉重复的 parts，并重新焊哈希链。
 * 旧目录改名成 `<root>.bak-<时间>`，不删除。
 */
export function compact({ root, log = () => {}, now = () => Date.now() } = {}) {
  const oldState = readJson(stateFile(root), { version: 1, sessions: {} })
  const oldMetas = new Map()
  for (const sessionId of Object.keys(oldState.sessions ?? {})) {
    const meta = readJson(metaFile(root, sessionId), null)
    if (meta) oldMetas.set(sessionId, meta)
  }

  const reader = new MemoryReader({ root }).reload()
  const next = `${root}.next`
  rmSync(next, { recursive: true, force: true })
  const writer = new MemoryWriter({ root: next, now })

  let maxSeq = -1
  for (const session of reader.sessions()) maxSeq = Math.max(maxSeq, session.lastSeq)
  const all = []
  for (let seq = 0; seq <= maxSeq; seq += 1) {
    const row = reader.read(seq)
    if (row) all.push(row)
  }
  // 缺轮号的行向后取最近一个有轮号的行：一是这段行为只追加，
  // 二是「一轮的第一条 user/message」后面紧跟的正是同一轮的行。
  const ahead = new Map()
  const turns = new Array(all.length).fill(null)
  for (let index = all.length - 1; index >= 0; index -= 1) {
    const row = all[index]
    if (Number.isInteger(row.turn)) ahead.set(row.session, row.turn)
    turns[index] = Number.isInteger(row.turn) ? row.turn : (ahead.get(row.session) ?? null)
  }
  let rows = 0
  for (const [index, row] of all.entries()) {
    writer.append({
      sessionId: row.session,
      at: row.at,
      kind: row.kind,
      turn: turns[index],
      step: row.step ?? null,
      payload: payloadOf(row),
    })
    rows += 1
  }
  writer.close()

  // 会话的事件游标与标题不能丢：前者决定幂等，后者是目录。
  const state = readJson(stateFile(next), { version: 1, seq: -1, hash: GENESIS, sessions: {} })
  for (const [sessionId, info] of Object.entries(oldState.sessions ?? {})) {
    const target = state.sessions?.[sessionId]
    if (!target) continue
    if (Number.isFinite(info.lastEventSeq)) target.lastEventSeq = info.lastEventSeq
  }
  state.version = FORMAT_VERSION
  writeJson(stateFile(next), state)
  for (const [sessionId, meta] of oldMetas) {
    const file = metaFile(next, sessionId)
    const nextMeta = readJson(file, null)
    if (!nextMeta) continue
    if (meta.title) nextMeta.title = meta.title
    writeJson(file, nextMeta)
  }

  const mediaDir = join(root, 'media')
  if (existsSync(mediaDir)) cpSync(mediaDir, join(next, 'media'), { recursive: true, force: true })

  const backup = `${root}.bak-${new Date(now()).toISOString().replace(/[:.]/g, '-')}`
  // Windows 上目录里只要有一个文件被别人打开着，改名就会被拒（EPERM/EBUSY）。
  // 启动时星图那边可能正在读记忆，所以这里重试几次，别让整次迁移白做。
  swapWithRetry(root, backup, log)
  log(`[dsh-lpipe-memory] 已重建 ${rows} 行（旧库备份在 ${backup}）`)
  return { rows, backup }
}

/** 把旧目录挪开、新目录就位；被占用时等一会儿再试。 */
function swapWithRetry(root, backup, log, attempts = 8, waitMs = 400) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      renameSync(root, backup)
      renameSync(`${root}.next`, root)
      return true
    } catch (error) {
      const code = error?.code ?? ''
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      // 第一次改名成了、第二次没成：把旧目录放回去，下次再来。
      try {
        if (existsSync(backup) && !existsSync(root)) renameSync(backup, root)
      } catch {}
      if (!transient || attempt === attempts) throw error
      log(`[dsh-lpipe-memory] 迁移第 ${attempt} 次改名被占用（${code}），稍后重试`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs)
    }
  }
  return false
}

/** 启动时按需迁移；失败只报一句，绝不挡住写入。 */
export function migrateIfNeeded({ root, log = () => {} } = {}) {
  if (!existsSync(stateFile(root))) return null
  if (!needsMigration(root)) return null
  try {
    return compact({ root, log })
  } catch (error) {
    log(`[dsh-lpipe-memory] 迁移失败，继续用旧格式：${error?.message ?? error}`)
    return null
  }
}
