import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { apply } from '../src/index.js'
import { MemoryReader } from '../src/reader.mjs'

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
    effect(fn) {
      fn()
    },
    inject(names, handler) {
      if (names.includes('attachments')) handler({ attachments: null })
      if (names.includes('sessions')) handler(sessions)
    },
  }
  const fire = (event) => listeners.get('session/event')?.({ id: 'session-test' }, event)
  return { ctx, fire }
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

test('events that are not part of a turn never invent rows', () => {
  const root = mkdtempSync(join(tmpdir(), 'life-turn-'))
  const { ctx, fire } = makeCtx()
  apply(ctx, { root })

  fire({ type: 'session/end-seed', seq: 0, time: 1_700_000_000_000, data: {} })
  fire({ type: 'turn/end', seq: 1, time: 1_700_000_000_100, data: {} })

  assert.deepEqual(dayFiles(root), [])
})
