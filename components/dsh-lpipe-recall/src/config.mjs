import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { configFile, recallRoot } from './paths.mjs'

/**
 * M1 的旋钮。数字都按「字符」算，不按轮：
 * - 真文窗口 = 这一轮的输入源本身（最多 `inputChars` 字）；背景窗口 = 输入源之外
 *   最近的 `backgroundChars`（16K）流水。真文星权重 3，背景星按位置 0..2；
 * - `coolChars` 是回忆冷却窗口（1M），从会话末尾往前数，落在里面的片段一律不选；
 * - `fragments` 每轮最多摆几个片段；
 * - `minStrength` 是片段的准入强度：候选只由真文准确星建立，所以不再有「至少几颗」。
 */
export const DEFAULT_CONFIG = {
  enabled: true,
  fragments: 2,
  backgroundChars: 16000,
  inputChars: 32000,
  coolChars: 1000000,
  minStrength: 1,
  sentencesPerFragment: 4,
  // 二类触发源（我的思考、中途回复、工具结果）每攒够这么多次才评估一次回忆。
}

const clamp = (value, low, high, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(high, Math.max(low, Math.round(number)))
}

export function normalizeConfig(raw = {}) {
  const merged = { ...DEFAULT_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) }
  return {
    enabled: merged.enabled !== false,
    fragments: clamp(merged.fragments, 1, 5, DEFAULT_CONFIG.fragments),
    backgroundChars: clamp(merged.backgroundChars, 8000, 96000, DEFAULT_CONFIG.backgroundChars),
    foregroundChars: clamp(merged.foregroundChars, 2000, 32000, DEFAULT_CONFIG.foregroundChars),
    coolChars: clamp(merged.coolChars, 32000, 4000000, DEFAULT_CONFIG.coolChars),
    minStars: clamp(merged.minStars, 1, 6, DEFAULT_CONFIG.minStars),
    minStrength: Math.max(0, Number(merged.minStrength) || DEFAULT_CONFIG.minStrength),
    sentencesPerFragment: clamp(merged.sentencesPerFragment, 1, 12, DEFAULT_CONFIG.sentencesPerFragment),
  }
}

export function loadConfig(root = recallRoot()) {
  try {
    const text = readFileSync(configFile(root), 'utf8')
    return normalizeConfig(JSON.parse(text))
  } catch {
    return normalizeConfig({})
  }
}

export function saveConfig(root, patch = {}) {
  const next = normalizeConfig({ ...loadConfig(root), ...patch })
  const file = configFile(root)
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
  return next
}
