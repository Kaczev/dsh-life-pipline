const textOf = (row) => {
  if (typeof row?.text === 'string') return row.text
  if (row?.kind === 'tool/call') return String(row?.arguments ?? '')
  return ''
}

import { COMMON_SOURCE } from './match.mjs'

export const turnKeyOf = (sessionId, turn) => `${sessionId}#${turn}`

/**
 * 回忆冷却窗口：从会话末尾往前数 `coolChars` 个字符，落在里面的轮次一律不当候选。
 *
 * 为什么用字符而不是轮：压缩插件会改写请求体、但不会改会话本身，所以「会话末尾
 * 累计多少字符」就是「模型现在还看得见多少」的诚实近似。1M 之外的东西，才需要
 * 我们去摆到它面前。
 */
export function coolTurns({ rows, coolChars }) {
  const cool = new Set()
  let size = 0
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (size >= coolChars) break
    const row = rows[index]
    const turn = Number(row?.turn)
    if (Number.isInteger(turn) && row?.session) cool.add(turnKeyOf(row.session, turn))
    size += textOf(row).length
  }
  return cool
}

/**
 * 候选片段：把闪烁星映射回它出现过的那些轮。
 *
 * 准入两条同时满足——至少 `minStars` 颗不同的闪烁星，且这些星的强度加起来 ≥
 * `minStrength`。同一颗星在一个片段里出现十次也只算一次：片段强度衡量的是
 * 「这段记忆和眼前这段话有多少种联系」，不是「重复了多少遍」。
 */
export function candidatesOf({
  repo,
  flicker,
  excluded = new Set(),
  minStars = 1,
  minStrength = 1,
  minForeground = 1,
  fuzzyBudget = 2,
  common = new Set(),
  commonBudget = 0.4,
  foreground = new Set(),
  current = new Set(),
  limit = 5,
}) {
  const buckets = new Map()
  // 第一遍：只有「真文窗口里的准确星」能建候选。模糊星、通用星、背景星都只配加权，
  // 它们不许自己撑出一段回忆——这一步同时也取代了原来的「必须有一颗真文星」准入。
  for (const [id, hit] of flicker) {
    if (!foreground.has(id)) continue
    if ((hit.kind ?? 'exact') !== 'exact' || common.has(id)) continue
    for (const entry of repo.byStar.get(id) ?? []) {
      if (excluded.has(entry.key)) continue
      let bucket = buckets.get(entry.key)
      if (!bucket) {
        bucket = { key: entry.key, stars: [], strength: 0, exact: 0, exactScore: 0, foreground: 0, foregroundScore: 0, current: 0, currentWeight: 0, fuzzy: [], common: [], seen: new Set(), lines: new Map() }
        buckets.set(entry.key, bucket)
      }
      if (bucket.seen.has(id)) continue
      bucket.seen.add(id)
      bucket.stars.push(id)
      bucket.exact += 1
      bucket.foreground += 1
      bucket.foregroundScore += hit.score
      // 当前这一句自己点亮的星：最像「你正在问的东西」。
      if (current.has(id)) bucket.current += 1
      bucket.lines.set(id, entry.seq)
    }
  }

  // 第二遍：背景窗口里的准确星只给已经存在的候选加权，不自己建候选。
  // 模糊星与通用星也在这时补分（它们从来不许建候选）。
  for (const [id, hit] of flicker) {
    // 真文里的准确星在第一遍已经算过了；其余（背景准确星、模糊星、通用星）到这里补分。
    const isExact = (hit.kind ?? 'exact') === 'exact'
    if (isExact && foreground.has(id)) continue
    for (const entry of repo.byStar.get(id) ?? []) {
      const bucket = buckets.get(entry.key)
      if (!bucket || bucket.seen.has(id)) continue
      bucket.seen.add(id)
      bucket.stars.push(id)
      if (hit.kind === 'fuzzy') bucket.fuzzy.push(hit.score)
      else if (common.has(id)) bucket.common.push(hit.score)
      else {
        bucket.exact += 1
        bucket.exactScore += hit.score
      }
      bucket.lines.set(id, entry.seq)
    }
  }

  const out = []
  for (const bucket of buckets.values()) {
    // 桶是由真文准确星建起来的，「至少几颗」不再需要单独判。
    // 模糊星的总和封顶 `fuzzyBudget`（默认 2），单颗封顶 1；片段里模糊星超过一颗时
    // 每颗的上限是 `fuzzyBudget / n`——「感觉」再多，也不该顶掉「说到了」。
    const cap = bucket.fuzzy.length > 1 ? fuzzyBudget / bucket.fuzzy.length : 1
    // 真文窗口里的星是「你现在真的在说的事」，全额算；背景里的只算半价。
    bucket.strength = bucket.foregroundScore + bucket.exactScore * 0.5
    for (const score of bucket.fuzzy) bucket.strength += Math.min(score, cap)
    // 通用星的总和也封顶：默认 0.4，等于两颗通用星的份量。
    const commonCap = bucket.common.length > 1 ? commonBudget / bucket.common.length : COMMON_SOURCE
    for (const score of bucket.common) bucket.strength += Math.min(score, commonCap)
    if (bucket.strength < minStrength) continue
    const record = repo.turns.get(bucket.key) ?? null
    out.push({
      key: bucket.key,
      stars: bucket.stars,
      exact: bucket.exact,
      foreground: bucket.foreground,
      current: bucket.current,
      currentWeight: bucket.currentWeight,
      strength: bucket.strength,
      fuzzy: bucket.fuzzy.length,
      lines: bucket.lines,
      session: record?.session ?? bucket.key.slice(0, bucket.key.lastIndexOf('#')),
      turn: record?.turn ?? null,
      at: record?.at ?? null,
      from: record?.from ?? null,
      to: record?.to ?? null,
    })
  }
  // 排序：先看「当前这一句」对上了几颗（你此刻问的是什么），再看真文窗口，
  // 再比亮度，最后比时间。不这么排，话题热度会盖过问题本身。
  out.sort(
    (a, b) =>
      b.current - a.current ||
      b.currentWeight - a.currentWeight ||
      b.foreground - a.foreground ||
      b.strength - a.strength ||
      (b.at ?? 0) - (a.at ?? 0),
  )
  return out.slice(0, Math.max(1, limit))
}
