// 只读查询：哪颗星在哪些轮出现过、这一轮有哪几颗星、它和谁相连。
// 边不落盘，查询时从星源现聚合：全库 96 万条边物化要 185 MB，现算一次 0.04–0.8 ms。
import { normalizeName } from './extract.mjs'

const round = (value) => Math.round(value * 1000) / 1000

export function createQueries({ repo, memoryStatus }) {
  const find = (key) => {
    if (!key) return null
    const direct = repo.stars.get(key)
    if (direct) return direct
    return repo.byName.get(normalizeName(String(key))) ?? null
  }

  /** 这颗星出现在哪些轮。 */
  function star(key, { limit = 80 } = {}) {
    const found = find(key)
    if (!found) return null
    const refs = repo.byStar.get(found.id) ?? []
    const byTurn = new Map()
    for (const ref of refs) {
      const record = repo.turns.get(ref.key)
      if (!record) continue
      const entry = byTurn.get(ref.key) ?? { session: record.session, turn: record.turn, at: record.at, lines: 0 }
      entry.lines += 1
      byTurn.set(ref.key, entry)
    }
    const turns = [...byTurn.values()].sort((a, b) => b.turn - a.turn).slice(0, limit)
    return { star: found, turns, total: byTurn.size, lines: refs.length }
  }

  /** 这一轮有哪几颗星。key 可以是 "session#turn" 或 { session, turn }。 */
  function turn(key) {
    const record = typeof key === 'string' ? repo.turns.get(key) : repo.turns.get(`${key?.session}#${key?.turn}`)
    if (!record) return null
    const seen = new Set()
    const stars = []
    for (const line of record.lines) {
      for (const id of line.stars ?? []) {
        if (seen.has(id)) continue
        seen.add(id)
        stars.push(repo.stars.get(id) ?? { id, name: id })
      }
    }
    return { turn: record.turn, session: record.session, at: record.at, from: record.from, to: record.to, lex: record.lex, stars, lines: record.lines.length }
  }

  /** 和这颗星相连的星：同句 1、相邻句 0.5，按权重求和。 */
  function links(key, { min = 0, limit = 24 } = {}) {
    const found = find(key)
    if (!found) return null
    const weights = new Map()
    const touch = (otherId, weight, seq, at) => {
      const entry = weights.get(otherId) ?? { id: otherId, weight: 0, evidence: [], firstAt: at, lastAt: at }
      entry.weight += weight
      if (entry.evidence.length < 24 && !entry.evidence.includes(seq)) entry.evidence.push(seq)
      if (at < entry.firstAt) entry.firstAt = at
      if (at > entry.lastAt) entry.lastAt = at
      weights.set(otherId, entry)
    }

    for (const ref of repo.byStar.get(found.id) ?? []) {
      const record = repo.turns.get(ref.key)
      if (!record) continue
      const line = record.lines[ref.index]
      if (!line) continue
      const stars = line.stars ?? []
      const weight = stars.length > 8 ? 1 / (stars.length - 1) : 1
      for (const other of stars) {
        if (other !== found.id) touch(other, weight, line.seq, record.at)
      }
      for (const index of [ref.index - 1, ref.index + 1]) {
        const neighbour = record.lines[index]
        if (!neighbour || neighbour.row !== line.row) continue
        for (const other of neighbour.stars ?? []) {
          if (other !== found.id) touch(other, 0.5, neighbour.seq, record.at)
        }
      }
    }

    const list = [...weights.values()]
      .filter((entry) => entry.weight >= min)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 24)))
      .map((entry) => ({
        star: repo.stars.get(entry.id) ?? { id: entry.id, name: entry.id },
        weight: round(entry.weight),
        evidence: entry.evidence,
        firstAt: entry.firstAt,
        lastAt: entry.lastAt,
      }))
    return { star: found, links: list, total: weights.size }
  }

  /** 灰与亮：记忆里有多少轮、星图亮了多少轮。 */
  function progress() {
    const status = memoryStatus()
    const built = Object.keys(repo.state?.built ?? {}).length > 0 ? repo.turns.size : 0
    return {
      stars: repo.stars.size,
      lex: repo.state?.lex ?? 0,
      built,
      turns: status.turns,
      grey: Math.max(0, status.turns - built),
      sessions: status.sessions,
      lastBuiltAt: status.lastBuiltAt,
      lastTurn: status.lastTurn,
    }
  }

  return { star, turn, links, progress }
}
