import { fuzzyScore, fuzzyStarsIn } from './fuzzy.mjs'
import { foldText } from './llm.mjs'
import { baseBrightness, FUZZY_FLOOR, NUMBER_FLOOR } from './brightness.mjs'

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

/** 星对象的折叠名缓存：星表是只读快照，同一颗星的折叠结果不会变。 */
const foldedCache = new WeakMap()

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
export function matchStars({ text, stars, common = new Set(), rarity = new Map(), offset = 0, total = null, weight = null, brightness = null }) {
  const source = String(text ?? '')
  const folded = foldText(source)
  const span = total ?? folded.length
  // 调用方可提供环境权重；星图自身默认不施加环境影响。
  const weigh = typeof weight === 'function' ? weight : () => 1
  const intrinsic = star => brightness?.get(star.id) ?? baseBrightness(star, { common, rarity })
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
    keep({ ...star, kind: isCommon ? 'common' : 'exact' }, intrinsic(star) * match.similarity * weigh(offset + match.at, span), match.at)
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
        keep(star, intrinsic(star) * similarity * weigh(offset + (hit.at ?? 0), span), hit.at ?? 0)
      }
    }
  }

  return out
}
