// 词表：从原文里长出「词」来，而不是预先准备一份词表。
//
// 判定一个 2–4 字的连续片段是不是词，要同时过五关：
//   1. 出现次数够（count >= 3）
//   2. 出现的轮数够（df >= 2）——只出现一次的不算星
//   3. 不是通用词（df <= 30% 的轮）
//   4. 内部凝固：拆成两半之后，每一半几乎总和另一半一起出现
//   5. 边界自由：左右邻字分布够散（熵 >= 0.8 bit），否则它只是更长片段的中间一截
// 最后再做一次最长词优先，把「记忆管」这类被更长词吃掉的碎片删掉。

/** 虚词与高频功能字：不能出现在词的两端。 */
export const STOP_CHARS = new Set(
  '的了是在和就也都又而却并非常个我你他她它们这那有没不要会能可以但所以如果因为然后把被让给对于从到与及吗呢吧啊哦嗯呀着过很最更还再只才已经都还其'.split(
    '',
  ),
)

const MIN_COUNT = 3
const MIN_TURNS = 3
const MAX_DF_RATIO = 0.3
const MIN_DEPENDENCE = 0.3
const MIN_ENTROPY = 1.1
const MIN_LEN = 2
const MAX_LEN = 4

/** 连续的中文片段；标点、英文、数字、代码都在这里断开。 */
export function* cjkRuns(text) {
  const pattern = /[\u3400-\u4dbf\u4e00-\u9fff]+/g
  for (const match of String(text ?? '').matchAll(pattern)) {
    yield match[0]
  }
}

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by)

function entropy(counts) {
  let total = 0
  for (const value of counts.values()) total += value
  if (total <= 0) return 0
  let bits = 0
  for (const value of counts.values()) {
    const p = value / total
    bits -= p * Math.log2(p)
  }
  return bits
}

/**
 * 从「每轮一段文字」里长出词表。
 * @param {{ turns: string[], version?: number, now?: number }} input
 */
export function buildLexicon({ turns, version = 1, now = Date.now() }) {
  const texts = turns.map((text) => String(text ?? ''))
  const totalTurns = texts.length
  /** 片段 -> 出现次数 */
  const count = new Map()
  /** 片段 -> 出现在多少轮里 */
  const df = new Map()
  /** 单字 -> 出现次数（算凝固度要用） */
  const uni = new Map()

  for (const text of texts) {
    const seen = new Set()
    for (const run of cjkRuns(text)) {
      for (let i = 0; i < run.length; i += 1) {
        bump(uni, run[i])
        for (let len = MIN_LEN; len <= MAX_LEN; len += 1) {
          if (i + len > run.length) break
          const gram = run.slice(i, i + len)
          bump(count, gram)
          seen.add(gram)
        }
      }
    }
    for (const gram of seen) bump(df, gram)
  }

  // 先按便宜的条件筛一遍，只给活下来的候选算边界熵。
  const maxDf = Math.max(MIN_TURNS, Math.floor(totalTurns * MAX_DF_RATIO))
  const candidates = []
  for (const [gram, times] of count) {
    if (times < MIN_COUNT) continue
    const appears = df.get(gram) ?? 0
    if (appears < MIN_TURNS || appears > maxDf) continue
    if (STOP_CHARS.has(gram[0]) || STOP_CHARS.has(gram[gram.length - 1])) continue
    if (String(uni.get(gram[0]) ?? 0) === '0') continue
    const dependence = bestDependence(gram, count, uni)
    if (dependence < MIN_DEPENDENCE) continue
    candidates.push({ name: gram, count: times, df: appears, dependence })
  }
  if (candidates.length === 0) {
    return { version, builtAt: now, turns: totalTurns, words: [] }
  }

  // 第二遍：只为候选记录左右邻居，算边界熵。
  const wanted = new Map()
  for (const candidate of candidates) {
    const bucket = wanted.get(candidate.name.length) ?? new Set()
    bucket.add(candidate.name)
    wanted.set(candidate.name.length, bucket)
  }
  const left = new Map()
  const right = new Map()
  for (const text of texts) {
    for (const run of cjkRuns(text)) {
      for (let i = 0; i < run.length; i += 1) {
        for (let len = MAX_LEN; len >= MIN_LEN; len -= 1) {
          if (i + len > run.length) continue
          const gram = run.slice(i, i + len)
          if (!wanted.get(len)?.has(gram)) continue
          const l = i > 0 ? run[i - 1] : '^'
          const r = i + len < run.length ? run[i + len] : '$'
          bump(left.get(gram) ?? left.set(gram, new Map()).get(gram), l)
          bump(right.get(gram) ?? right.set(gram, new Map()).get(gram), r)
        }
      }
    }
  }

  const words = []
  for (const candidate of candidates) {
    const leftEntropy = entropy(left.get(candidate.name) ?? new Map())
    const rightEntropy = entropy(right.get(candidate.name) ?? new Map())
    if (leftEntropy < MIN_ENTROPY || rightEntropy < MIN_ENTROPY) continue
    words.push({ ...candidate, leftEntropy, rightEntropy })
  }

  // 最长词优先：更长的词如果几乎总跟着短词一起出现，短词只是它的一截。
  const byName = new Map(words.map((word) => [word.name, word]))
  const dropped = new Set()
  for (const word of words) {
    if (word.name.length <= MIN_LEN) continue
    for (let start = 0; start + MIN_LEN <= word.name.length; start += 1) {
      for (let len = MIN_LEN; start + len <= word.name.length; len += 1) {
        if (len === word.name.length) continue
        const part = word.name.slice(start, start + len)
        const shorter = byName.get(part)
        if (!shorter) continue
        if (word.count >= shorter.count * 0.7) dropped.add(part)
      }
    }
  }

  const kept = words
    .filter((word) => !dropped.has(word.name))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(({ name, count: times, df: appears }) => ({ name, count: times, df: appears }))

  return { version, builtAt: now, turns: totalTurns, words: kept }
}

/**
 * 凝固度：把这个片段拆成两半，两半互相「离不开」的最小条件概率。
 * 例：「记忆管线」= 记忆 + 管线，300 / 900 = 0.33、300 / 500 = 0.6，取 0.33。
 */
function bestDependence(gram, count, uni) {
  const total = count.get(gram) ?? 0
  if (total === 0) return 0
  let best = 0
  for (let cut = 1; cut < gram.length; cut += 1) {
    const head = gram.slice(0, cut)
    const tail = gram.slice(cut)
    const headCount = head.length === 1 ? (uni.get(head) ?? 0) : (count.get(head) ?? 0)
    const tailCount = tail.length === 1 ? (uni.get(tail) ?? 0) : (count.get(tail) ?? 0)
    if (headCount === 0 || tailCount === 0) continue
    const dependence = Math.min(total / headCount, total / tailCount)
    if (dependence > best) best = dependence
  }
  return best
}

/** 抽取时用的快速查表：按长度分桶，最长优先匹配。 */
export function matcherOf(lexicon) {
  const buckets = new Map()
  let longest = 0
  for (const word of lexicon?.words ?? []) {
    const bucket = buckets.get(word.name.length) ?? new Set()
    bucket.add(word.name)
    buckets.set(word.name.length, bucket)
    if (word.name.length > longest) longest = word.name.length
  }
  return { buckets, longest }
}

/** 在一段中文里做最长匹配，返回命中的词（按出现顺序）。 */
export function matchWords(run, matcher) {
  const hits = []
  let i = 0
  while (i < run.length) {
    let matched = null
    for (let len = matcher.longest; len >= MIN_LEN; len -= 1) {
      if (i + len > run.length) continue
      const candidate = run.slice(i, i + len)
      if (matcher.buckets.get(len)?.has(candidate)) {
        matched = candidate
        break
      }
    }
    if (matched) {
      hits.push(matched)
      i += matched.length
    } else {
      i += 1
    }
  }
  return hits
}
