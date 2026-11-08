// 只读查询：哪颗星在哪些轮出现过、这一轮有哪几颗星、它和谁相连。
// 边不落盘：星源里记着「这一轮哪些名字被配成对、每句有哪几颗星」，
// 查询时现聚合。同句 1、相邻句 0.5、对不上句子的整轮 0.5。
import { normalizeName } from './extract.mjs'
import { fuzzyScore, fuzzyStarsIn, starMeta } from './fuzzy.mjs'
import { commonStars } from './brightness.mjs'

const round = (value) => Math.round(value * 1000) / 1000

export function createQueries({ repo, memoryStatus, progressState, usageStats, problems = () => [], retrySkipped = null, peek = null }) {
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
    return {
      turn: record.turn,
      session: record.session,
      at: record.at,
      from: record.from,
      to: record.to,
      stars,
      lines: record.lines.length,
      pairs: (record.pairs ?? []).length,
    }
  }

  /** 一轮里某个星出现在哪几句（句子下标）。 */
  const sentenceHits = (record, id) => {
    const out = []
    for (const [index, line] of record.lines.entries()) {
      if ((line.stars ?? []).includes(id)) out.push(index)
    }
    return out
  }

  /** 和这颗星相连的星：同句 1、相邻句 0.5、整轮 0.5，按星线求和。 */
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

    // 按「轮」聚合，不按「行」：同一轮里这颗星出现在多句，只该算一遍。
    const seenTurns = new Set()
    for (const ref of repo.byStar.get(found.id) ?? []) {
      if (seenTurns.has(ref.key)) continue
      seenTurns.add(ref.key)
      const record = repo.turns.get(ref.key)
      if (!record) continue
      const mine = sentenceHits(record, found.id)
      for (const pair of record.pairs ?? []) {
        const [a, b] = pair
        if (a !== found.id && b !== found.id) continue
        const other = a === found.id ? b : a
        // 同一句：这句的星越多，每一对分到的越少，避免「什么都在同一句」时一条边吃掉全部。
        const shared = mine.filter((index) => (record.lines[index]?.stars ?? []).includes(other))
        if (shared.length > 0) {
          for (const index of shared) {
            const line = record.lines[index]
            const size = (line.stars ?? []).length
            touch(other, size > 8 ? 1 / (size - 1) : 1, line.seq, record.at)
          }
          continue
        }
        // 相邻句：同一行里挨着的那一句。
        let adjacent = 0
        for (const index of mine) {
          for (const near of [index - 1, index + 1]) {
            const line = record.lines[near]
            if (!line || line.row !== record.lines[index].row) continue
            if (!(line.stars ?? []).includes(other)) continue
            touch(other, 0.5, line.seq, record.at)
            adjacent += 1
          }
        }
        if (adjacent > 0) continue
        // 对不上任何一句：模型说它们这一轮里一起出现过，记整轮 0.5，证据取这一轮的头。
        touch(other, 0.5, record.from, record.at)
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

  /**
   * 模糊星：按「感觉」找。给一个时间（分钟数或 "20:44"）或一个数字，
   * 返回最近的模糊星与相似度。这是星图对数的感知，不靠字符串匹配。
   */
  function near({ form, value, name, limit = 12, minScore = 0.05 } = {}) {
    let target = null
    if (name) target = starMeta(name)
    else if (form === 'time') {
      const text = typeof value === 'string' ? value : ''
      const clock = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text)
      if (clock) target = { form: 'time', value: Number(clock[1]) * 60 + Number(clock[2]) }
      else if (Number.isFinite(Number(value))) target = { form: 'time', value: Number(value) }
      else if (Number.isFinite(Number(name))) target = { form: 'time', value: Number(name) }
    } else if (form === 'number') {
      const number = Number(value)
      if (Number.isFinite(number)) target = { form: 'number', value: number }
    }
    if (!target || target.value === null || target.value === undefined) return { form: form ?? null, value: null, stars: [] }

    const scored = []
    for (const star of repo.stars.values()) {
      if (star.kind !== 'fuzzy' || star.form !== target.form) continue
      const score = fuzzyScore({ form: target.form, value: star.value }, target)
      if (score < minScore) continue
      scored.push({ star, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, Math.max(1, Math.min(50, Number(limit) || 12)))
    return {
      form: target.form,
      value: target.value,
      stars: top.map((entry) => ({
        star: entry.star,
        score: round(entry.score),
        turns: (repo.byStar.get(entry.star.id) ?? []).length,
      })),
      total: scored.length,
    }
  }

  /** 灰与亮：记忆里有多少轮、星图亮了多少轮。 */
  function progress() {
    const status = memoryStatus()
    const built = Number.isFinite(status.lit) ? status.lit : repo.turns.size
    const extract = progressState
      ? {
        error: progressState.error || '',
        errorAt: progressState.errorAt ?? null,
        running: Boolean(progressState.running),
        stopping: Boolean(progressState.stopping),
        done: progressState.done ?? 0,
        total: progressState.total ?? 0,
        failed: progressState.failed ?? 0,
        lanes: progressState.lanes ?? { active: 0, total: 0 },
        updatedAt: progressState.updatedAt ?? null,
      }
      : { error: '', errorAt: null, running: false, stopping: false, done: 0, total: 0, failed: 0, lanes: { active: 0, total: 0 }, updatedAt: null }
    const commonIds = commonStars(repo)
    let exact = 0, fuzzy = 0, common = 0, time = 0
    for (const star of repo.stars.values()) {
      if (star.kind === 'fuzzy') fuzzy += 1
      else if (star.kind === 'common' || commonIds.has(star.id)) common += 1
      else exact += 1
    }
    // 与 matchTimeStars 一致：每个有有效片段时间的星源记录各有一颗时星。
    // 同一时刻的不同片段不合并；文星中的时钟模糊星仍只算模糊星。
    for (const record of repo.turns.values()) {
      if (record.at != null && Number.isFinite(Number(record.at))) time += 1
    }
    return {
      stars: repo.stars.size + time,
      text: repo.stars.size,
      exact,
      fuzzy,
      common,
      time,
      built,
      turns: status.turns,
      grey: Math.max(0, status.turns - built - (status.skipped ?? 0)),
      skipped: status.skipped ?? 0,
      problems: problems(),
      sessions: status.sessions,
      lastBuiltAt: status.lastBuiltAt,
      lastTurn: status.lastTurn,
      extract,
      usage: typeof usageStats === 'function'
        ? usageStats()
        : { calls: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, calls7d: 0, tokens7d: 0, days: 7 },
    }
  }

  /** 这一轮到底写了什么：只给首尾，够看出「这是人话还是乱码」。 */
  function peekTurn(payload) {
    if (typeof peek !== 'function') return { ok: false, error: 'starmap/unavailable' }
    return peek(String(payload?.session ?? ''), Number(payload?.turn))
  }

  /** 把跳过的那一轮放回队列（下次点「现在抽星」会再试一次）。 */
  function retry(key) {
    if (typeof retrySkipped !== 'function') return { ok: false, reason: 'unavailable' }
    const sessionId = typeof key === 'string' ? key.split('#')[0] : key?.session
    const turnNo = typeof key === 'string' ? Number(key.split('#')[1]) : Number(key?.turn)
    if (!sessionId || !Number.isInteger(turnNo)) return { ok: false, reason: 'bad-key' }
    return { ok: retrySkipped(sessionId, turnNo) === true }
  }

  return { star, turn, links, near, progress, retry, peek: peekTurn }
}
