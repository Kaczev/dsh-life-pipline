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

/** 仅准确真文星建立候选，其余星只加分；片段内每颗星仅计一次。 */
export function candidatesOf({
  repo,
  flicker,
  excluded = new Set(),
  minStrength = 0,
  common = new Set(),
  foreground = new Set(),
  current = new Set(),
  limit = 2,
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
    if (isExact && foreground.has(id) && !common.has(id)) continue
    for (const entry of repo.byStar.get(id) ?? []) {
      const bucket = buckets.get(entry.key)
      if (!bucket || bucket.seen.has(id)) continue
      bucket.seen.add(id)
      bucket.stars.push(id)
      if (hit.kind === 'fuzzy') bucket.fuzzy.push(hit.score)
      else if (hit.kind === 'common' || common.has(id)) bucket.common.push(hit.score)
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
    // 单星亮度已包含所有系数，片段只求和，不再二次压分。
    bucket.strength = bucket.foregroundScore + bucket.exactScore
    for (const score of bucket.fuzzy) bucket.strength += score
    for (const score of bucket.common) bucket.strength += score
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
  if (limit === Infinity) return out
  // 总亮度优先；同分才比较准确真文星数量和时间。
  out.sort(
    (a, b) =>
      b.strength - a.strength ||
      b.foreground - a.foreground ||
      (b.at ?? 0) - (a.at ?? 0),
  )
  return out.slice(0, Math.max(1, limit))
}
