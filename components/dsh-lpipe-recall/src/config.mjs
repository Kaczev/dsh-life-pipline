import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { configFile, recallRoot } from './paths.mjs'

/**
 * M1 的旋钮。数字都按「字符」算，不按轮：
 * - `matchChars` 是回忆匹配窗口（32K），只用来看哪些星星在眼前这段话里闪；
 * - `coolChars` 是回忆冷却窗口（1M），从会话末尾往前数，落在里面的片段一律不选；
 * - `fragments` 每轮最多摆几个片段；
 * - `minStars` / `minStrength` 是片段的准入门槛：至少两颗闪烁星、强度至少 1。
 */
export const DEFAULT_CONFIG = {
  enabled: true,
  fragments: 2,
  matchChars: 32000,
  coolChars: 1000000,
  minStars: 2,
  minStrength: 1,
  sentencesPerFragment: 4,
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
    matchChars: clamp(merged.matchChars, 4000, 200000, DEFAULT_CONFIG.matchChars),
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
