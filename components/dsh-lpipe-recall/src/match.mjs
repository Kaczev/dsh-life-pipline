import { matchStars } from 'dsh-lpipe-starmap/match'

// 兼容既有纯函数调用者；实现与属性计算均归星图所有。
export { lengthWeight, rarityWeights, EXACT_SOURCE, FUZZY_SOURCE, COMMON_SOURCE, FUZZY_FLOOR, NUMBER_FLOOR } from 'dsh-lpipe-starmap/brightness'
export { exactMatch } from 'dsh-lpipe-starmap/match'

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
 * 兼容默认调用：最旧 1.0、最新 2.0，曲线为 `1 + 位置⁴`；生产组装显式传入真文／背景权重。
 */
export function positionWeight(at, length) {
  if (!(length > 0)) return 1
  const ratio = Math.max(0, Math.min(1, at / length))
  // 前平后陡：x^4 在 0.7 之前几乎贴着 1，最后那一段才迅速爬向 2。
  return 1 + ratio ** 4
}

/** 回忆只提供环境权重，星的基础亮度与匹配由星图计算。 */
export function flickerStars(options) {
  return matchStars({ ...options, weight: typeof options.weight === 'function' ? options.weight : positionWeight })
}
