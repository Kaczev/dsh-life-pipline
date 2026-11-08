import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/index.js'
import { isMemorySession } from 'dsh-lpipe-memory/scope'
import { saveConfig } from '../../dsh-lpipe-memory/src/config.mjs'

// Isolated process-local home: no live memory or scope configuration is changed.
const home = mkdtempSync(join(tmpdir(), 'starmap-history-progress-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'life-pipline'))
writeFileSync(join(home, 'life-pipline', 'config.json'), JSON.stringify({ mainSessionId: 'main' }))

 test('全库历史进度不随主会话作用域切换缩成一轮，缓存也不污染', () => {
  const rows = new Map([
    ['main', [{ seq: 0, turn: 8, at: 1000 }]],
    ['archive', [{ seq: 1, turn: 3, at: 2000 }, { seq: 2, turn: 5, at: 3000 }, { seq: 3, turn: 5, at: 3000 }]],
  ])
  const sessions = () => [...rows].map(([sessionId, items]) => ({ sessionId, firstSeq: items[0].seq, lastSeq: items.at(-1).seq }))
  const api = apply({ logger: { info() {}, warn() {} }, inject() {}, effect() {} }, {
    root: join(home, 'starmap'), noWarm: true,
    reader: { sessions, rows: id => rows.get(id), state: { version: 2 } },
  })
  assert.equal(isMemorySession('archive'), false, '默认仍不允许对历史会话新增处理')
  let value = api.queries.progress()
  assert.equal(value.turns, 3, '按实际轮次，不按轮号，也不只数当前主会话')
  assert.equal(value.grey, 3)
  assert.deepEqual(value.sessions.map(s => [s.sessionId, s.turns]), [['main', 1], ['archive', 2]])
  saveConfig({ allSessions: true })
  assert.equal(api.queries.progress().turns, 3)
  saveConfig({ allSessions: false })
  rows.get('archive').push({ seq: 4, turn: 9, at: 4000 })
  value = api.queries.progress()
  assert.equal(value.turns, 4, '关闭全会话后依然刷新历史统计')
  assert.equal(isMemorySession('archive'), false, '只修统计，不扩大处理权限')
})
