// 星图的设置：用哪个提供者、哪个模型、思考强度多高。
// 存成 ~/.dsh/life-starmap/config.json，改完下一轮抽星就按新的走。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { starmapRoot } from './paths.mjs'

export const DEFAULT_MAX_TOKENS = 4000
export const MIN_MAX_TOKENS = 200
export const MAX_MAX_TOKENS = 32000

const clampTokens = (value, fallback = DEFAULT_MAX_TOKENS) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.round(number)))
}

export const DEFAULT_CONFIG = {
  provider: '',
  model: '',
  reasoningEffort: '',
  // 有些模型压根没有思考强度可选（dsh 不报 reasoning 元数据），
  // 那种模型允许强度留空——「留空就不抽星」只针对有强度可选、却故意不选的模型。
  effortFree: false,
  // 这一轮问模型最多能写多少 token（含思考）。思考型模型写正文之前先思考，
  // 额度太小会把半截 JSON 截回来，所以默认给 4000，并且允许自己填。
  maxTokens: DEFAULT_MAX_TOKENS,
  concurrency: 3,
}

export const configFile = (root = starmapRoot()) => join(root, 'config.json')

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

export function loadConfig(root = starmapRoot()) {
  try {
    const parsed = JSON.parse(readFileSync(configFile(root), 'utf8'))
    const concurrency = Number(parsed?.concurrency)
    return {
      provider: clean(parsed?.provider),
      model: clean(parsed?.model),
      reasoningEffort: clean(parsed?.reasoningEffort),
      effortFree: parsed?.effortFree === true,
      maxTokens: clampTokens(parsed?.maxTokens),
      concurrency: Number.isFinite(concurrency) ? Math.min(8, Math.max(1, Math.round(concurrency))) : DEFAULT_CONFIG.concurrency,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(root = starmapRoot(), patch = {}) {
  const next = { ...loadConfig(root) }
  if (patch.provider !== undefined) next.provider = clean(patch.provider)
  if (patch.model !== undefined) next.model = clean(patch.model)
  if (patch.reasoningEffort !== undefined) next.reasoningEffort = clean(patch.reasoningEffort)
  if (patch.effortFree !== undefined) next.effortFree = patch.effortFree === true
  if (patch.maxTokens !== undefined) next.maxTokens = clampTokens(patch.maxTokens, next.maxTokens)
  if (patch.concurrency !== undefined) {
    const value = Number(patch.concurrency)
    if (Number.isFinite(value)) next.concurrency = Math.min(8, Math.max(1, Math.round(value)))
  }
  const file = configFile(root)
  mkdirSync(dirname(file), { recursive: true })
  const staging = `${file}.${process.pid}.tmp`
  writeFileSync(staging, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(staging, file)
  return next
}

/** 传给 llm.stream 的路由：两个都填了才算指定，否则交给宿主的默认模型。 */
export function routeOf(config = {}) {
  if (!config.provider || !config.model) return {}
  const route = { provider: config.provider, model: config.model }
  // 强度留空就整条不传：宿主会按模型自己的默认值走，也不会把不支持的强度送上去。
  if (clean(config.reasoningEffort)) route.reasoningEffort = clean(config.reasoningEffort)
  return route
}

/**
 * 供应商和模型必须选；思考强度只在「这个模型确实提供强度」时才必须选。
 * 模型没提供强度（dsh 报不出 reasoning 元数据）时，强度留空是正常状态，不是漏填。
 */
export function canExtract(config = {}) {
  if (!clean(config.provider) || !clean(config.model)) return false
  if (config.effortFree === true) return true
  return Boolean(clean(config.reasoningEffort))
}

