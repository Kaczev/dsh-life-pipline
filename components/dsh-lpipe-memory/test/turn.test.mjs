import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { apply } from '../src/index.js'
import { saveConfig } from '../src/config.mjs'
import { memoryRoot } from '../src/paths.mjs'
import { MemoryReader } from '../src/reader.mjs'

const scopeHome=mkdtempSync(join(tmpdir(),'memory-scope-'))
process.env.DSH_HOME=scopeHome
mkdirSync(join(scopeHome,'life-pipline'))
writeFileSync(join(scopeHome,'life-pipline','config.json'),JSON.stringify({mainSessionId:'session-test'}))

/** 最小 ctx：effect 立刻执行并留下 dispose，inject 直接把假服务递进去。 */
function makeCtx() {
  const listeners = new Map()
  const sessions = {
    sessions: { get: () => null },
    on(event, handler) {
      listeners.set(event, handler)
    },
  }
  const ctx = {
    logger: { warn() {} },
    disposers: [],
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') this.disposers.push(dispose)
    },
    inject(names, handler) {
      if (names.includes('attachments')) handler({ attachments: null })
      if (names.includes('sessions')) handler(sessions)
    },
  }
  const fire = (event, id = 'session-test') => listeners.get('session/event')?.({ id }, event)
  const dispose = () => {
    for (const fn of ctx.disposers.splice(0)) fn()
  }
  return { ctx, fire, dispose }
}

const dayFiles = (root) => {
  const dir = join(root, 'sessions', 'session-test', 'days')
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.jsonl.zst')) : []
}

test('a turn lands on disk only when it ends', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-turn-'))
  const { ctx, fire } = makeCtx()
  apply(ctx, { root })

  fire({
    type: 'user/message',
    seq: 0,
    time: 1_700_000_000_000,
    data: { content: [{ type: 'text', text: '你好' }], source: { kind: 'user' } },
  })
  fire({
    type: 'assistant/message',
    seq: 1,
    time: 1_700_000_001_000,
    data: { message: { content: [{ type: 'text', text: '在的' }] } },
  })

  // 一轮还没说完，磁盘上不该出现半天半地的内容。
  assert.deepEqual(dayFiles(root), [])

  fire({ type: 'turn/end', seq: 2, time: 1_700_000_002_000, data: {} })

  assert.equal(dayFiles(root).length, 1)
  const reader = new MemoryReader({ root })
  const summary = reader.sessions().find((item) => item.sessionId === 'session-test')
  assert.equal(summary.rows, 2)
  assert.equal(reader.read(0).text, '你好')
  assert.equal(reader.read(1).text, '在的')
  assert.deepEqual(reader.verify({}), [])
})

test('a user message without a turn number still lands on its turn', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-turn-'))
  const { ctx, fire } = makeCtx()
  apply(ctx, { root })

  // 真实的 user/message 事件里没有 data.turn：只有助手那几条带轮号。
  fire({
    type: 'user/message',
    seq: 0,
    time: 1_700_000_000_000,
    data: { content: [{ type: 'text', text: '\u4f60\u597d' }], source: { kind: 'user' } },
  })
  fire({
    type: 'assistant/message',
    seq: 1,
    time: 1_700_000_001_000,
    data: { turn: 7, message: { content: [{ type: 'text', text: '\u5728' }] } },
  })
  fire({ type: 'turn/end', seq: 2, time: 1_700_000_002_000, data: { turn: 7 } })

  const reader = new MemoryReader({ root })
  assert.equal(reader.read(0).turn, 7, 'the turn/end number fills the user row')
  assert.equal(reader.read(1).turn, 7)
})

test('events that are not part of a turn never invent rows', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-turn-'))
  const { ctx, fire } = makeCtx()
  apply(ctx, { root })

  fire({ type: 'session/end-seed', seq: 0, time: 1_700_000_000_000, data: {} })
  fire({ type: 'turn/end', seq: 1, time: 1_700_000_000_100, data: {} })

  assert.deepEqual(dayFiles(root), [])
})

test('a turn interrupted by the next one is closed out instead of mixed in', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-turn-'))
  const { ctx, fire } = makeCtx()
  apply(ctx, { root })

  fire({
    type: 'user/message',
    seq: 0,
    time: 1_700_000_000_000,
    data: { content: [{ type: 'text', text: '第一轮' }], turn: 1 },
  })
  // 第一轮没有 turn/end：下一轮的第一句应当把它收掉，而不是两轮混在一帧。
  fire({
    type: 'user/message',
    seq: 1,
    time: 1_700_000_100_000,
    data: { content: [{ type: 'text', text: '第二轮' }], turn: 2 },
  })

  const reader = new MemoryReader({ root })
  const summary = reader.sessions().find((item) => item.sessionId === 'session-test')
  assert.equal(summary.rows, 1)
  assert.equal(reader.read(0).text, '第一轮')
  // 第二轮还在攒，等它自己的 turn/end。
  assert.deepEqual(dayFiles(root).length, 1)
})

test('non-main events and former-main buffers never land', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-isolation-'))
  const { ctx, fire, dispose } = makeCtx()
  const set = id => writeFileSync(join(scopeHome, 'life-pipline', 'config.json'), JSON.stringify({ mainSessionId: id }))
  const message = seq => ({ type: 'user/message', seq, time: 1_700_000_000_000, data: { content: [{ type: 'text', text: 'private' }] } })
  set('session-test')
  apply(ctx, { root })
  try {
    fire(message(0), 'other')
    fire({ type: 'turn/end', seq: 1, data: {} }, 'other')
    assert.equal(existsSync(join(root, 'sessions', 'other')), false)
    fire(message(2))
    set('other')
    fire({ type: 'turn/end', seq: 3, data: {} })
    assert.deepEqual(dayFiles(root), [])
    fire(message(4), 'other')
    fire({ type: 'turn/end', seq: 5, data: {} }, 'other')
    assert.equal(new MemoryReader({ root }).sessions().find(s => s.sessionId === 'other').rows, 1)
  } finally { dispose(); set('session-test') }
})

test('all-session memory records separate sessions and stops non-main buffers when disabled', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-all-scope-'))
  const { ctx, fire, dispose } = makeCtx()
  apply(ctx, { root, pack: false })
  const message = seq => ({ type: 'user/message', seq, time: 1_700_000_000_000, data: { content: [{ type: 'text', text: 'scope' }] } })
  try {
    saveConfig({ allSessions: true }, memoryRoot())
    for (const id of ['session-test', 'other']) {
      fire(message(0), id)
      fire({ type: 'turn/end', seq: 1, data: { turn: 1 } }, id)
    }
    assert.equal(new MemoryReader({ root }).sessions().length, 2)
    fire(message(2), 'third')
    saveConfig({ allSessions: false }, memoryRoot())
    fire({ type: 'turn/end', seq: 3, data: {} }, 'third')
    assert.equal(existsSync(join(root, 'sessions', 'third')), false)
    assert.equal(new MemoryReader({ root }).sessions().length, 2, 'historical memory remains')
  } finally { saveConfig({ allSessions: false }, memoryRoot()); dispose() }
})

test('teardown never writes a half-finished turn', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-turn-'))
  const { ctx, fire, dispose } = makeCtx()
  apply(ctx, { root })

  fire({
    type: 'user/message',
    seq: 0,
    time: 1_700_000_000_000,
    data: { content: [{ type: 'text', text: '没说完' }] },
  })
  dispose()

  assert.deepEqual(dayFiles(root), [])
})
