import { foldText } from './llm.mjs'

/** 三种星的基础亮度：准确星 1、模糊星 0.3、通用星 0.2。 */
export const EXACT_SOURCE = 1
export const FUZZY_SOURCE = 0.3
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

/** 通用星判据：出现在超过 5% 的片段里。 */
export const COMMON_SHARE = 0.05

export function commonStars(repo) {
  const total = repo.turns.size
  const common = new Set()
  if (total < 10) return common
  for (const [id, lines] of repo.byStar) {
    const fragments = new Set(lines.map((entry) => entry.key))
    if (fragments.size / total > COMMON_SHARE) common.add(id)
  }
  return common
}

/** 当前索引快照的星属性，不读取匹配窗口，也不写入星表。 */
export function starProfile(repo) {
  const common = commonStars(repo)
  const rarity = rarityWeights(repo)
  const brightness = new Map([...repo.stars.values()].map(star => [star.id, baseBrightness(star, { common, rarity })]))
  return { common, rarity, brightness }
}

/** 基础值 × 长度 × 稀有度；模糊匹配相似度不属于星自身属性。 */
export function baseBrightness(star, { common = new Set(), rarity = new Map() } = {}) {
  const isCommon = star.kind !== 'fuzzy' && (common.has(star.id) || star.kind === 'common')
  const base = isCommon ? COMMON_SOURCE : star.kind === 'fuzzy' ? FUZZY_SOURCE : EXACT_SOURCE
  const length = isCommon || star.kind === 'fuzzy' ? 1 : lengthWeight(star.name)
  return base * length * (rarity.get(star.id) ?? 1)
}
