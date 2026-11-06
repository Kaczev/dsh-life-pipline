// 星图的磁盘层：星表（星星本身）、星源（每轮每句有哪几颗星）、水位（亮到哪里）。
// 不存星链：边是星源的视图，读取时现聚合，省掉一份 96 万行的缓存。
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  dayOf,
  lexiconDir,
  lexiconFile,
  sessionSourcesDir,
  sourceFile,
  sourcesDir,
  starsFile,
  stateFile,
  starmapRoot,
} from './paths.mjs'

export function starIdOf(name) {
  return `s_${createHash('sha256').update(`zh|${name}`, 'utf8').digest('hex').slice(0, 16)}`
}

/** 轮的键：同一个轮号可能在多个会话里存在。 */
export const turnKey = (sessionId, turn) => `${sessionId}#${turn}`

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function readJsonl(file) {
  if (!existsSync(file)) return []
  const out = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed))
    } catch {
      // 断在一行中间（进程被杀）：这一行作废，后面的重建时补上。
    }
  }
  return out
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const staging = `${file}.${process.pid}.tmp`
  writeFileSync(staging, text, 'utf8')
  renameSync(staging, file)
}

export function loadLexicon(root = starmapRoot()) {
  const dir = lexiconDir(root)
  if (!existsSync(dir)) return null
  const versions = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => Number(name.replace('.json', '')))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => b - a)
  for (const version of versions) {
    const parsed = readJson(lexiconFile(root, version), null)
    if (parsed?.words) return parsed
  }
  return null
}

export function saveLexicon(root, lexicon) {
  writeAtomic(lexiconFile(root, lexicon.version), `${JSON.stringify(lexicon)}\n`)
  return lexicon
}

/** 打开星图：把星表、星源读进内存，之后一轮一轮往上写。 */
export function openRepo({ root = starmapRoot() } = {}) {
  mkdirSync(root, { recursive: true })
  const state = readJson(stateFile(root), { version: 1, lex: 0, built: {} })
  if (!state.built) state.built = {}
  if (!Number.isInteger(state.lex)) state.lex = 0

  /** id -> { id, name, lex, born } */
  const stars = new Map()
  const byName = new Map()

  /** "session#turn" -> { session, turn, at, from, to, lines: [{ seq, row, stars }] } */
  const turns = new Map()
  /** id -> [{ key, seq, row }] */
  const byStar = new Map()

  function indexRecord(record) {
    const key = turnKey(record.session, record.turn)
    const kept = { ...record, lines: Array.isArray(record.lines) ? record.lines : [] }
    const previous = turns.get(key)
    if (previous) {
      // 同一轮被写了两遍（进程被杀后重算）：后面那份为准，先把旧的倒排摘掉。
      for (const line of previous.lines) for (const id of line.stars ?? []) unindex(id, key)
    }
    turns.set(key, kept)
    for (const [index, line] of kept.lines.entries()) {
      for (const id of line.stars ?? []) {
        const list = byStar.get(id) ?? []
        list.push({ key, index, seq: line.seq })
        byStar.set(id, list)
      }
    }
    return kept
  }

  function unindex(id, key) {
    const list = byStar.get(id)
    if (!list) return
    const kept = list.filter((entry) => entry.key !== key)
    if (kept.length > 0) byStar.set(id, kept)
    else byStar.delete(id)
  }

  /** 从磁盘重读一遍。宿主里另一个进程（或上一次会话）写过，重新点亮前要跟上。 */
  function reload() {
    const next = readJson(stateFile(root), { version: 1, lex: 0, built: {} })
    state.built = next.built ?? {}
    state.lex = Number.isInteger(next.lex) ? next.lex : 0
    if (Number.isInteger(next.version)) state.version = next.version

    stars.clear()
    byName.clear()
    for (const star of readJsonl(starsFile(root))) {
      if (star?.id && star?.name) stars.set(star.id, star)
    }
    for (const star of stars.values()) byName.set(star.name, star)

    turns.clear()
    byStar.clear()
    const sources = sourcesDir(root)
    if (existsSync(sources)) {
      for (const sessionId of readdirSync(sources)) {
        const dir = join(sources, sessionId)
        if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
        for (const name of readdirSync(dir)) {
          if (!name.endsWith('.jsonl')) continue
          for (const record of readJsonl(join(dir, name))) {
            if (!record || !Number.isInteger(record.turn)) continue
            indexRecord(record)
          }
        }
      }
    }
    return state
  }

  reload()

  function ensureStar(name, lex, born) {
    const existing = byName.get(name)
    if (existing) return existing
    const star = { id: starIdOf(name), name, lex, born }
    stars.set(star.id, star)
    byName.set(name, star)
    appendFileSync(starsFile(root), `${JSON.stringify(star)}\n`, 'utf8')
    return star
  }

  function recordTurn(record) {
    const file = sourceFile(root, record.session, dayOf(record.at))
    mkdirSync(sessionSourcesDir(root, record.session), { recursive: true })
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
    indexRecord(record)
    return record
  }

  function raiseWatermark(sessionId, turn, to, lex) {
    state.built[sessionId] = { turn, to }
    if (Number.isInteger(lex)) state.lex = Math.max(state.lex, lex)
    writeAtomic(stateFile(root), `${JSON.stringify(state)}\n`)
  }

  function removeTurn(sessionId, turn) {
    turns.delete(turnKey(sessionId, turn))
  }

  function lastBuilt(sessionId) {
    return state.built[sessionId] ?? null
  }

  return {
    root,
    state,
    stars,
    turns,
    byStar,
    byName,
    ensureStar,
    recordTurn,
    raiseWatermark,
    removeTurn,
    lastBuilt,
    reload,
  }
}
