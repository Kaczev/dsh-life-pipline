// 星图在磁盘上的位置。记忆层只读；星图自己一个目录，删掉能重建。
import { homedir } from 'node:os'
import { join } from 'node:path'

export function starmapRoot(env = process.env) {
  return env.DSH_LIFE_STARMAP_ROOT || join(homedir(), '.dsh', 'life-starmap')
}

export const stateFile = (root) => join(root, 'state.json')
export const starsFile = (root) => join(root, 'stars.jsonl')
export const lexiconDir = (root) => join(root, 'lexicon')
export const lexiconFile = (root, version) => join(root, 'lexicon', `${version}.json`)
export const sourcesDir = (root) => join(root, 'sources')
export const sessionSourcesDir = (root, sessionId) => join(root, 'sources', sessionId)
export const sourceFile = (root, sessionId, day) => join(root, 'sources', sessionId, `${day}.jsonl`)

const DAY_OFFSET_MS = 4 * 60 * 60 * 1000

/**
 * 一天从凌晨 4 点算起，与记忆层同一个口径：`at` 减四小时后取本地日期。
 * 星源按天分卷只是为了避免单文件过大，实际内容连续。
 */
export function dayOf(at) {
  const date = new Date((Number.isFinite(at) ? at : Date.now()) - DAY_OFFSET_MS)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
