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
  fragments: 4,
  backgroundChars: 16000,
  inputChars: 32000,
  coolChars: 1000000,
  minStrength: 0,
  sentencesPerFragment: 2,
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
    inputChars: clamp(merged.inputChars, 2000, 32000, DEFAULT_CONFIG.inputChars),
    coolChars: clamp(merged.coolChars, 32000, 4000000, DEFAULT_CONFIG.coolChars),
    minStars: clamp(merged.minStars, 1, 6, DEFAULT_CONFIG.minStars),
    minStrength: Math.max(0, Number(merged.minStrength) || 0),
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

/**
 * 设置页只开放这五项。范围与默认值必须和 `normalizeConfig` 保持一致：
 * 面板负责挡住手滑，宿主这里再挡一次，坏值永远不落盘。
 */
export const PANEL_FIELDS = Object.freeze([
  { key: 'fragments', label: '每轮片段', min: 1, max: 5, fallback: DEFAULT_CONFIG.fragments },
  { key: 'sentencesPerFragment', label: '每段句数', min: 1, max: 12, fallback: DEFAULT_CONFIG.sentencesPerFragment },
  { key: 'inputChars', label: '真文上限', min: 2000, max: 32000, fallback: DEFAULT_CONFIG.inputChars },
  { key: 'backgroundChars', label: '背景窗口', min: 8000, max: 96000, fallback: DEFAULT_CONFIG.backgroundChars },
  { key: 'coolChars', label: '冷却窗口', min: 32000, max: 4000000, fallback: DEFAULT_CONFIG.coolChars },
])

export class RecallConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RecallConfigError'
    this.code = 'recall/bad-request'
  }
}

/** 只把设置页需要的五项交给客户端，别把别的旋钮带出去。 */
export function panelConfigOf(config = {}) {
  const normalized = normalizeConfig(config)
  return Object.fromEntries(PANEL_FIELDS.map((field) => [field.key, normalized[field.key]]))
}

/**
 * 设置页保存走这条路，而不是 `saveConfig`：后者会把配置重新归一化成固定键，
 * 顺手丢掉 `secondEvery` 之类它不认识的字段。这里只换这五项，其余原样保留。
 */
export function savePanelConfig(root, patch = {}) {
  const raw = readRawConfig(root)
  const next = { ...raw }
  for (const field of PANEL_FIELDS) {
    if (!Object.hasOwn(patch, field.key)) continue
    const value = patch[field.key]
    if (!Number.isInteger(value)) {
      throw new RecallConfigError(`${field.label}必须是整数。`)
    }
    if (value < field.min || value > field.max) {
      throw new RecallConfigError(`${field.label}需在 ${field.min}–${field.max} 之间。`)
    }
    next[field.key] = value
  }
  const file = configFile(root)
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
  return panelConfigOf(next)
}

/** 原始配置对象：读不懂就当空文件，至少别让设置页打不开。 */
export function readRawConfig(root = recallRoot()) {
  try {
    const parsed = JSON.parse(readFileSync(configFile(root), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
