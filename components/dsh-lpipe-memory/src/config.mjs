import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { memoryRoot } from './paths.mjs'

export const configFile = (root = memoryRoot()) => join(root, 'config.json')
export function loadConfig(root = memoryRoot()) {
  try {
    const raw = JSON.parse(readFileSync(configFile(root), 'utf8'))
    return { allSessions: raw?.allSessions === true }
  } catch { return { allSessions: false } }
}
/** Patch only this component's field; corrupt existing data is never silently replaced. */
export function saveConfig(patch, root = memoryRoot()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      typeof patch.allSessions !== 'boolean' || Object.keys(patch).some(key => key !== 'allSessions')) {
    throw new TypeError('allSessions 必须是布尔值，且不能包含其他配置字段。')
  }
  let raw = {}
  try { raw = JSON.parse(readFileSync(configFile(root), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('记忆配置必须是对象。')
  mkdirSync(root, { recursive: true })
  const temp = `${configFile(root)}.${randomUUID()}.tmp`
  writeFileSync(temp, `${JSON.stringify({ ...raw, allSessions: patch.allSessions }, null, 2)}\n`, 'utf8')
  renameSync(temp, configFile(root))
  return loadConfig(root)
}
