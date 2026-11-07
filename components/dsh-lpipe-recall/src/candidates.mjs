const textOf = (row) => {
  if (typeof row?.text === 'string') return row.text
  if (row?.kind === 'tool/call') return String(row?.arguments ?? '')
  return ''
}

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
  minStars = 2,
  minStrength = 1,
  minExact = 1,
  fuzzyBudget = 2,
  limit = 5,
}) {
  const buckets = new Map()
  for (const [id, hit] of flicker) {
    for (const entry of repo.byStar.get(id) ?? []) {
      if (excluded.has(entry.key)) continue
      let bucket = buckets.get(entry.key)
      if (!bucket) {
        bucket = { key: entry.key, stars: [], strength: 0, exact: 0, exactScore: 0, fuzzy: [], seen: new Set(), lines: new Map() }
        buckets.set(entry.key, bucket)
      }
      if (bucket.seen.has(id)) continue
      bucket.seen.add(id)
      bucket.stars.push(id)
      if (hit.kind === 'fuzzy') {
        bucket.fuzzy.push(hit.score)
      } else {
        bucket.exact += 1
        bucket.exactScore += hit.score
      }
      bucket.lines.set(id, entry.seq)
    }
  }

  const out = []
  for (const bucket of buckets.values()) {
    if (bucket.stars.length < minStars) continue
    // 模糊星的总和封顶 `fuzzyBudget`（默认 2），单颗封顶 1；片段里模糊星超过一颗时
    // 每颗的上限是 `fuzzyBudget / n`——「感觉」再多，也不该顶掉「说到了」。
    const cap = bucket.fuzzy.length > 1 ? fuzzyBudget / bucket.fuzzy.length : 1
    bucket.strength = bucket.exactScore
    for (const score of bucket.fuzzy) bucket.strength += Math.min(score, cap)
    if (bucket.strength < minStrength) continue
    // 光靠数字对上不叫「想起来了」：数字太容易撞，必须有真正的概念连上。
    if (bucket.exact < minExact) continue
    const record = repo.turns.get(bucket.key) ?? null
    out.push({
      key: bucket.key,
      stars: bucket.stars,
      exact: bucket.exact,
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
  // 排序：先看有几颗**准确**星（真的说到了几个共同概念），再比亮度，最后比时间。
  out.sort((a, b) => b.exact - a.exact || b.strength - a.strength || (b.at ?? 0) - (a.at ?? 0))
  return out.slice(0, Math.max(1, limit))
}
