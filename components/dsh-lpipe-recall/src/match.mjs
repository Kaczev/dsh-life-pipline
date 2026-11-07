import { fuzzyScore, fuzzyStarsIn } from 'dsh-lpipe-starmap/fuzzy'
import { foldText } from 'dsh-lpipe-starmap/llm'

/** 三种星的基础亮度：准确星 1、模糊星按相似度（上限在片段里再压）、通用星 0.2。 */
export const EXACT_SOURCE = 1
export const FUZZY_SOURCE = 1
export const COMMON_SOURCE = 0.2
/** 模糊星低于这个相似度就不算「闪了一下」。 */
export const FUZZY_FLOOR = 0.5
/**
 * 数字比时间松得多：`1520` 和 `3003` 这种数字在技术对话里到处都是，按「感觉」算
 * 它们几乎总能配上，于是整段记忆都被点亮。数字要更像一点才算数。
 */
export const NUMBER_FLOOR = 0.8

/** 长度只给准确星加权，最多翻倍；计 Unicode 字符而不是 UTF-16 单元。 */
export function lengthWeight(name) {
  return 1 + Math.min(1, Math.max(0, [...foldText(name)].length - 2) / 10)
}

/** 按不同片段频率算稀有度，范围 1..2；没有语料统计时不猜。 */
export function rarityWeights(repo) {
  const total = repo.turns.size
  const weights = new Map()
  if (!total) return weights
  for (const [id, entries] of repo.byStar) {
    const count = new Set(entries.map((entry) => entry.key)).size
    weights.set(id, 1 + Math.log((total + 1) / (Math.min(total, count) + 1)) / Math.log(total + 1))
  }
  return weights
}

/**
 * 准确星可以局部点亮，但至少连续覆盖 65%，且至少三个汉字或五个 ASCII 字符。
 * 局部证据平方衰减并减半，不能凭一小段拿走长名称的完整权重。
 * 不做语义猜测，也不对数字/单字或超长名称展开近似搜索。
 */
export function exactMatch(source, name) {
  return matchFolded(foldText(source), foldText(name))
}

function matchFolded(folded, needle) {
  if (!needle) return null
  const at = folded.lastIndexOf(needle)
  if (at >= 0) return { similarity: 1, at }
  const chars = [...needle]
  if (chars.length < 4 || chars.length > 64 || !/\p{L}/u.test(needle)) return null
  const minimum = Math.max(/[\u3400-\u9fff]/u.test(needle) ? 3 : 5, Math.ceil(chars.length * 0.65))
  for (let size = chars.length - 1; size >= minimum; size -= 1) {
    let last = -1
    for (let start = 0; start + size <= chars.length; start += 1) {
      const part = chars.slice(start, start + size).join('')
      if (!/\p{L}/u.test(part)) continue
      last = Math.max(last, folded.lastIndexOf(part))
    }
    if (last >= 0) return { similarity: 0.5 * (size / chars.length) ** 2, at: last }
  }
  return null
}

/** 真文星优先占有来源；剩余背景星共享与真文等量的全局亮度预算。 */
export function balanceFlicker(ahead, behind) {
  const foregroundSum = [...ahead.values()].reduce((sum, hit) => sum + hit.score, 0)
  const background = [...behind].filter(([id]) => !ahead.has(id))
  const backgroundSum = background.reduce((sum, [, hit]) => sum + hit.score, 0)
  const factor = backgroundSum > 0 ? foregroundSum / backgroundSum : 0
  const flicker = new Map(ahead)
  if (factor > 0) for (const [id, hit] of background) {
    flicker.set(id, { ...hit, score: hit.score * factor })
  }
  return { flicker, foregroundSum, backgroundSum, factor }
}

/** 星对象的折叠名缓存：星表是只读快照，同一颗星的折叠结果不会变。 */
const foldedCache = new WeakMap()

/** 真文窗口（这一轮的输入源）里的星：上下文权重固定 3。 */
export const FOREGROUND_WEIGHT = 3
/** 背景窗口（输入源之外最近的 16K）里的星：0 到 2，越新越大。 */
export const BACKGROUND_WEIGHT = 2

/** 真文星不看位置：整条输入源就是「此刻」。 */
export function foregroundWeight() {
  return FOREGROUND_WEIGHT
}

/** 背景星的权重：`2 × 位置⁴`，最旧处趋近 0、最新处到 2。 */
export function backgroundWeight(at, length) {
  if (!(length > 0)) return 0
  const ratio = Math.max(0, Math.min(1, at / length))
  return BACKGROUND_WEIGHT * ratio ** 4
}

/**
 * 位置权重：眼前这段话里越靠后的内容越算数。
 * 最旧的 1.0、最新的 2.0——这是用户定死的口径（`1 + 位置`），不要改成别的曲线。
 */
export function positionWeight(at, length) {
  if (!(length > 0)) return 1
  const ratio = Math.max(0, Math.min(1, at / length))
  // 前平后陡：x^4 在 0.7 之前几乎贴着 1，最后那一段才迅速爬向 2。
  return 1 + ratio ** 4
}

/**
 * 找出这段话里「闪起来的星」。
 *
 * 一颗星只留最强的一次点亮：同一个词在一句话里出现十遍，也不会让这段记忆显得
 * 重要十倍——亮度衡量的是「这段记忆多该被想起来」，不是词频。
 *
 * @param {object} input
 * @param {string} input.text 眼前这段话（近窗里的原文）
 * @param {Array<object>} input.stars 星表（每颗有 id/name/kind/form/value）
 * @param {Set<string>} [input.common] 通用星的 id 集合，来源分数会被压到 0.2
 * @returns {Map<string, {id: string, name: string, kind: string, score: number, at: number}>}
 */
export function flickerStars({ text, stars, common = new Set(), rarity = new Map(), offset = 0, total = null, weight = null }) {
  const source = String(text ?? '')
  const folded = foldText(source)
  // 背景窗口与真文窗口各自是一次调用，位置要放在整窗（32K）里算：
  // 同样一句话，出现在真文窗口里就比出现在背景窗口里更「近」。
  const span = total ?? folded.length
  // 两个窗口的权重口径不一样：真文星恒为 3，背景星按 2 × 位置⁴ 从 0 爬到 2。
  const weigh = typeof weight === 'function' ? weight : (at, totalChars) => positionWeight(at, totalChars)
  const out = new Map()

  const keep = (star, score, at) => {
    if (!(score > 0)) return
    const previous = out.get(star.id)
    if (previous && previous.score >= score) return
    out.set(star.id, {
      id: star.id,
      name: star.name,
      kind: star.kind ?? 'exact',
      // form/value 要带上：句子打分时还要拿它算模糊星的感觉。
      form: star.form ?? null,
      value: Number.isFinite(star.value) ? star.value : null,
      score,
      at,
    })
  }

  for (const star of stars ?? []) {
    if (!['exact', 'common'].includes(star.kind ?? 'exact')) continue
    let needle = foldedCache.get(star)
    if (needle === undefined) {
      needle = foldText(star.name)
      foldedCache.set(star, needle)
    }
    if (!needle) continue
    const match = matchFolded(folded, needle)
    if (!match) continue
    const isCommon = common.has(star.id) || star.kind === 'common'
    const base = isCommon ? COMMON_SOURCE : EXACT_SOURCE
    const length = isCommon ? 1 : lengthWeight(star.name)
    keep({ ...star, kind: isCommon ? 'common' : 'exact' }, base * length * (rarity.get(star.id) ?? 1) * match.similarity * weigh(offset + match.at, span), match.at)
  }

  const fuzzy = (stars ?? []).filter(
    (star) =>
      star.kind === 'fuzzy' &&
      star.form &&
      Number.isFinite(star.value) &&
      // 两位整数（`19`、`23`、`37`）在任何一段技术对话里都能撞上，不配当「感觉」。
      !(star.form === 'number' && Number.isInteger(star.value) && Math.abs(star.value) < 100),
  )
  if (fuzzy.length > 0) {
    for (const hit of fuzzyStarsIn(source)) {
      for (const star of fuzzy) {
        if (star.form !== hit.form) continue
        const similarity = fuzzyScore(hit, star)
        if (similarity < (star.form === 'number' ? NUMBER_FLOOR : FUZZY_FLOOR)) continue
        // 这里只算「像多少」；一颗星能加多少，还要看这个片段里一共有几颗模糊星
        // （片段内的上限在 candidates.mjs 里按 2/n 压）。
        keep(star, FUZZY_SOURCE * (rarity.get(star.id) ?? 1) * similarity * weigh(offset + (hit.at ?? 0), span), hit.at ?? 0)
      }
    }
  }

  return out
}
