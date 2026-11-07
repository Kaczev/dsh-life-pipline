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

/**
 * 位置权重：眼前这段话里越靠后的内容越算数。
 * 最旧的 1.0、最新的 2.0——这是用户定死的口径（`1 + 位置`），不要改成别的曲线。
 */
/** 长度不足两个拉丁字母、又没有中文的「名字」，多半是符号残留。 */
export function isTooShort(name) {
  const text = String(name ?? '').trim()
  if (!text) return true
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  return latin < 2 && cjk < 1
}

export function positionWeight(at, length) {
  if (!(length > 0)) return 1
  const ratio = Math.max(0, Math.min(1, at / length))
  return 1 + ratio
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
export function flickerStars({ text, stars, common = new Set() }) {
  const source = String(text ?? '')
  const folded = foldText(source)
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
    if ((star.kind ?? 'exact') !== 'exact') continue
    // 单个拉丁字母（`a`、`E`、`Z`）是公式里的下标，不是概念：它们在任何一段英文里
    // 都能「找到」，留着只会让每一段记忆都亮起来。
    if (isTooShort(star.name)) continue
    const needle = foldText(star.name)
    if (!needle) continue
    const last = folded.lastIndexOf(needle)
    if (last < 0) continue
    const base = common.has(star.id) ? COMMON_SOURCE : EXACT_SOURCE
    keep(star, base * positionWeight(last, folded.length), last)
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
        keep(star, FUZZY_SOURCE * similarity * positionWeight(hit.at ?? 0, source.length), hit.at ?? 0)
      }
    }
  }

  return out
}
