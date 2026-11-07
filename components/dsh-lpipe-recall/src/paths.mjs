import { homedir } from 'node:os'
import { join } from 'node:path'

/** 回忆管线自己的目录：只有一份 config.json。 */
export function recallRoot(env = process.env) {
  const custom = env.DSH_LIFE_RECALL_ROOT
  return custom && custom.trim() ? custom : join(homedir(), '.dsh', 'life-recall')
}

/** 原文层。回忆只读它，不写。 */
export function memoryRoot(env = process.env) {
  const custom = env.DSH_LIFE_MEMORY_ROOT
  return custom && custom.trim() ? custom : join(homedir(), '.dsh', 'life-memory')
}

/** 星图层。回忆只读它，不写。 */
export function starmapRoot(env = process.env) {
  const custom = env.DSH_LIFE_STARMAP_ROOT
  return custom && custom.trim() ? custom : join(homedir(), '.dsh', 'life-starmap')
}

export const configFile = (root) => join(root, 'config.json')
