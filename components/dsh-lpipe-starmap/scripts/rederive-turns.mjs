// 按当前规则把整库的每一轮重新推一遍（不调模型）。
//
// 星源里存着模型给的对子（星 id），重新推一轮只需要：把 id 还原成名字 → 交给 buildTurn 重新分句、
// 重新判成星、重新算模糊星。确定性的东西都可以这样重算，唯一不能重算的是「模型当时说了哪几对」。
//
// 用法：
//   node components/dsh-lpipe-starmap/scripts/rederive-turns.mjs            # 只报告
//   node components/dsh-lpipe-starmap/scripts/rederive-turns.mjs --apply    # 写盘
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { RULES_VERSION, buildTurn, groupTurns } from '../src/build.mjs'
import { starmapRoot } from '../src/paths.mjs'
import { openRepo } from '../src/store.mjs'

const apply = process.argv.includes('--apply')
const root = process.env.DSH_LIFE_STARMAP_ROOT || starmapRoot()
const profile = process.env.DSH_PROFILE_DIR || 'C:/Users/Kaczev/.dsh/profiles/desktop'
const require = createRequire(pathToFileURL(join(profile, 'package.json')).href)
const { MemoryReader } = require('dsh-lpipe-memory/reader')

const repo = openRepo({ root })
const before = { stars: repo.stars.size, fuzzy: [...repo.stars.values()].filter((s) => s.kind === 'fuzzy').length, turns: repo.turns.size }

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

const work = [...repo.turns.values()].map((record) => ({
  sessionId: record.session ?? record.sessionId,
  turn: record.turn,
  pairs: (record.pairs ?? []).map((pair) => [
    repo.stars.get(pair[0])?.name ?? pair[0],
    repo.stars.get(pair[1])?.name ?? pair[1],
  ]),
}))

let rebuilt = 0
let missing = 0
for (const item of work) {
  const turn = turnOf(item.sessionId, item.turn)
  if (!turn) {
    missing += 1
    continue
  }
  rebuilt += 1
  if (apply) buildTurn({ repo, turn, sessionId: item.sessionId, pairs: item.pairs })
}

const after = { stars: repo.stars.size, fuzzy: [...repo.stars.values()].filter((s) => s.kind === 'fuzzy').length, turns: repo.turns.size }
console.log(`规则版本 ${RULES_VERSION}`)
console.log(`星：${before.stars} → ${after.stars}（其中模糊星 ${before.fuzzy} → ${after.fuzzy}）`)
console.log(`星源轮数：${before.turns} → ${after.turns}；重推 ${rebuilt} 轮，原文缺失 ${missing} 轮`)
if (apply) {
  repo.setRules(RULES_VERSION)
  console.log(`已写盘，并把 state.json 的 rules 记成 ${RULES_VERSION}。`)
} else {
  console.log('只报告，加 --apply 才写。')
}
