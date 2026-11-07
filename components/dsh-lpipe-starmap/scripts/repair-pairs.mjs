// 修一次事故：重放脚本把「模型给的对子」当成名字重算，但星源里存的其实是星 id，
// 结果把重放过的轮次写成了只剩新捞回来那几对（旧对子被丢掉了）。
//
// 星源文件是一轮一行、后写的为准，所以旧记录还在文件里。这个脚本按会话+轮号把同一轮的所有
// 历史记录取出来、把 pairs 还原成名字（id → 星表里的名字）取并集，再重建一次这一轮。
//
// 用法：node components/dsh-lpipe-starmap/scripts/repair-pairs.mjs [--apply]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { buildTurn, groupTurns } from '../src/build.mjs'
import { starmapRoot, sourcesDir } from '../src/paths.mjs'
import { openRepo, turnKey } from '../src/store.mjs'

const apply = process.argv.includes('--apply')
const root = process.env.DSH_LIFE_STARMAP_ROOT || starmapRoot()
const profile = process.env.DSH_PROFILE_DIR || 'C:/Users/Kaczev/.dsh/profiles/desktop'
const require = createRequire(pathToFileURL(join(profile, 'package.json')).href)
const { MemoryReader } = require('dsh-lpipe-memory/reader')

const repo = openRepo({ root })
const nameOf = (id) => repo.stars.get(id)?.name ?? null

const groups = new Map()
const base = sourcesDir(root)
if (existsSync(base)) {
  for (const sessionId of readdirSync(base)) {
    const dir = join(base, sessionId)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue
      for (const line of readFileSync(join(dir, name), 'utf8').trim().split('\n').filter(Boolean)) {
        const record = JSON.parse(line)
        if (!Number.isInteger(record.turn)) continue
        const key = turnKey(sessionId, record.turn)
        if (!groups.has(key)) groups.set(key, { sessionId, turn: record.turn, records: [] })
        groups.get(key).records.push(record)
      }
    }
  }
}

const reader = new MemoryReader({ root: process.env.DSH_LIFE_MEMORY_ROOT || 'C:/Users/Kaczev/.dsh/life-memory' })
const turnsOf = new Map()
const turnOf = (sessionId, turnNumber) => {
  if (!turnsOf.has(sessionId)) {
    const grouped = new Map()
    for (const turn of groupTurns(reader.rows(sessionId))) grouped.set(turn.turn, turn)
    turnsOf.set(sessionId, grouped)
  }
  return turnsOf.get(sessionId)?.get(turnNumber) ?? null
}

let fixed = 0
for (const group of groups.values()) {
  if (group.records.length < 2) continue
  const last = group.records.at(-1)
  const names = new Set()
  const pairNames = []
  for (const record of group.records) {
    for (const pair of record.pairs ?? []) {
      if (!Array.isArray(pair) || pair.length !== 2) continue
      const a = nameOf(pair[0]) ?? pair[0]
      const b = nameOf(pair[1]) ?? pair[1]
      const key = [a, b].sort().join('\u0000')
      if (names.has(key)) continue
      names.add(key)
      pairNames.push([a, b])
    }
  }
  if (pairNames.length <= (last.pairs?.length ?? 0)) continue
  const turn = turnOf(group.sessionId, group.turn)
  if (!turn) continue
  fixed += 1
  console.log(`第 ${group.turn} 轮：${last.pairs?.length ?? 0} 对 → ${pairNames.length} 对（合并 ${group.records.length} 份记录）`)
  if (apply) buildTurn({ repo, turn, sessionId: group.sessionId, pairs: pairNames })
}

console.log(`\n${fixed} 轮需要修。${apply ? '已写盘。' : '只报告，加 --apply 才写。'}`)
