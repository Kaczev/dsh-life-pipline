// 重放 rejects.jsonl：把「当时因为匹配规则太严而丢掉的对子」捞回来，不调模型。
//
// 模型是 temperature=0，输入没变、答案就没变；变的只是我们怎么判断「这个名字在不在原文里」。
// 所以这次重放只做两件事：用新的匹配口径把 rejects 里那条对子重新判一遍，
// 能判过的就并进这一轮已有的 pairs，再把这一轮照原样重建（星表 / 星源 / 水位都走 buildTurn）。
//
// 用法：
//   node components/dsh-lpipe-starmap/scripts/replay-rejects.mjs            # 只报告
//   node components/dsh-lpipe-starmap/scripts/replay-rejects.mjs --apply    # 写盘
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { buildTurn, groupTurns, sentencesOf, textsOf } from '../src/build.mjs'
import { findInSentences, foldText } from '../src/llm.mjs'
import { starmapRoot } from '../src/paths.mjs'
import { openRepo } from '../src/store.mjs'

const apply = process.argv.includes('--apply')
const root = process.env.DSH_LIFE_STARMAP_ROOT || starmapRoot()
const rejectsFile = join(root, 'rejects.jsonl')

const profile = process.env.DSH_PROFILE_DIR || 'C:/Users/Kaczev/.dsh/profiles/desktop'
const require = createRequire(pathToFileURL(join(profile, 'package.json')).href)
const { MemoryReader } = require('dsh-lpipe-memory/reader')

const pairKey = (a, b) => [foldText(a), foldText(b)].sort().join('\u0000')

const reader = new MemoryReader({ root: process.env.DSH_LIFE_MEMORY_ROOT || 'C:/Users/Kaczev/.dsh/life-memory' })

if (!existsSync(rejectsFile)) {
  console.log('没有 rejects.jsonl，没什么可重放的。')
  process.exit(0)
}

const entries = readFileSync(rejectsFile, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const wanted = new Map()
for (const entry of entries) {
  if (entry.why !== 'one-missing' && entry.why !== 'both-missing') continue
  if (!Array.isArray(entry.pair) || entry.pair.length !== 2) continue
  if (!Number.isInteger(entry.turn)) continue
  const key = `${entry.session}#${entry.turn}`
  if (!wanted.has(key)) wanted.set(key, { session: entry.session, turn: entry.turn, pairs: [] })
  wanted.get(key).pairs.push(entry.pair)
}

const turnsOf = new Map()
const sentencesFor = (sessionId, turnNumber) => {
  if (!turnsOf.has(sessionId)) {
    const rows = reader.rows(sessionId)
    const grouped = new Map()
    for (const turn of groupTurns(rows)) grouped.set(turn.turn, turn)
    turnsOf.set(sessionId, grouped)
  }
  const turn = turnsOf.get(sessionId)?.get(turnNumber)
  if (!turn) return []
  return sentencesOf(turn, textsOf)
}

const repo = openRepo({ root })
let rescued = 0
let touchedTurns = 0
const report = []

for (const item of wanted.values()) {
  const sentences = sentencesFor(item.session, item.turn)
  if (sentences.length === 0) {
    report.push(`跳过 第 ${item.turn} 轮：原文没读到`)
    continue
  }
  const existing = repo.turns.get(`${item.session}#${item.turn}`)
  // 星源里存的是星 id，不是名字：先还原成名字，否则重建时这些对子会因为「找不到这个名字」被丢掉。
  const nameOf = (id) => repo.stars.get(id)?.name ?? id
  const currentPairs = Array.isArray(existing?.pairs)
    ? existing.pairs.map((pair) => [nameOf(pair[0]), nameOf(pair[1])])
    : []
  const known = new Set(currentPairs.map(([a, b]) => pairKey(a, b)))
  const keep = []
  for (const [nameA, nameB] of item.pairs) {
    if (known.has(pairKey(nameA, nameB))) continue
    const foundA = findInSentences(sentences, nameA).length > 0
    const foundB = findInSentences(sentences, nameB).length > 0
    if (!foundA || !foundB) continue
    known.add(pairKey(nameA, nameB))
    keep.push([nameA, nameB])
  }
  if (keep.length === 0) continue
  rescued += keep.length
  touchedTurns += 1
  report.push(`第 ${item.turn} 轮：捞回 ${keep.length} 对 → ${keep.map(([a, b]) => `${a} × ${b}`).join('，')}`)
  if (!apply) continue

  // 重建这一轮：旧的对子 + 刚捞回来的对子。buildTurn 只做确定性的事（查名字、写星表与星源）。
  const merged = [...currentPairs, ...keep].filter((pair) => Array.isArray(pair) && pair.length === 2)
  buildTurn({ repo, turn: turnsFor(item.session, item.turn), sessionId: item.session, pairs: merged })
}

function turnsFor(sessionId, turnNumber) {
  return turnsOf.get(sessionId)?.get(turnNumber) ?? null
}

console.log(report.join('\n') || '（没有能按新口径救回来的对子）')
console.log(`\n共 ${wanted.size} 轮受影响：${touchedTurns} 轮有新对子，合计 ${rescued} 对。`)
console.log(apply ? '已写盘（星表 / 星源 / 水位都更新了）。' : '只报告，没写盘。加 --apply 才写。')
