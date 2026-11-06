// 星图的设置：用哪个提供者、哪个模型、思考强度多高。
// 存成 ~/.dsh/life-starmap/config.json，改完下一轮抽星就按新的走。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { starmapRoot } from './paths.mjs'

export const DEFAULT_CONFIG = {
  provider: '',
  model: '',
  reasoningEffort: '',
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
  return { provider: config.provider, model: config.model }
}

/**
 * 三个都填了才抽星：供应商、模型、思考强度。
 * 任何一个留空就完全不抽——宁可不点亮，也不拿猜的星污染这张图。
 */
export function canExtract(config = {}) {
  return Boolean(clean(config.provider) && clean(config.model) && clean(config.reasoningEffort))
}

