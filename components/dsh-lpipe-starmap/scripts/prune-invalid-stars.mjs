// 复用备份、并发变更检查及引用清理；仅处理非模糊星，不触发抽取。
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { starWorthy } from '../src/build.mjs'
import { starmapRoot } from '../src/paths.mjs'
import { pruneSingleLetters } from './prune-single-letters.mjs'

export function pruneInvalidStars(root, { apply = false } = {}) {
  return pruneSingleLetters(root, { apply, backupLabel: 'invalid-stars', reject: (name, star) => star.kind !== 'fuzzy' && !starWorthy(name) })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(pruneInvalidStars(starmapRoot(), { apply: process.argv.includes('--apply') }), null, 2))
}
