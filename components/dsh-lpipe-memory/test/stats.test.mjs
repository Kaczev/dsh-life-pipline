// 统计：每一轮新增多少、累计到多少，以及磁盘占用。
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { MemoryReader } from '../src/reader.mjs'
import { computeStats, createStatsCache } from '../src/stats.mjs'
import { MemoryWriter } from '../src/writer.mjs'

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-memory-stats-'))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function seed(writer, sessionId, turns, offset = 0) {
  let eventSeq = offset
  for (const turn of turns) {
    for (const kind of ['user/message', 'assistant/message']) {
      writer.append({
        sessionId,
        eventSeq,
        at: turn.at,
        kind,
        turn: turn.turn,
        step: 0,
        payload: { text: `${sessionId} ${turn.turn} ${kind} ${'x'.repeat(turn.size ?? 200)}` },
      })
      eventSeq += 1
    }
  }
  writer.flush()
}

test('stats count every row once and accumulate per turn', () => {
  const { root, cleanup } = tempRoot()
  try {
    const writer = new MemoryWriter({ root })
    seed(writer, 'session-a', [{ turn: 0, at: Date.UTC(2026, 10, 5, 1) }, { turn: 1, at: Date.UTC(2026, 10, 5, 2) }])
    seed(writer, 'session-b', [{ turn: 0, at: Date.UTC(2026, 10, 5, 3) }])
    writer.close()

    const reader = new MemoryReader({ root })
    const stats = computeStats(reader, { turns: 30, root })

    assert.equal(stats.rows, 6)
    assert.equal(stats.sessions, 2)
    assert.equal(stats.turns.length, 3, 'one entry per session turn')
    assert.ok(stats.total > 0)
    assert.ok(stats.disk > 0, 'day files exist')
    // 累计值必须单调不减，并且最后一轮等于总量。
    for (let i = 1; i < stats.turns.length; i += 1) {
      assert.ok(stats.turns[i].total >= stats.turns[i - 1].total)
    }
    assert.equal(stats.turns.at(-1).total, stats.total)
    assert.ok(stats.turns.every((turn) => turn.added > 0))
  } finally {
    cleanup()
  }
})

test('the disk series lands exactly on the reported disk total', () => {
  const { root, cleanup } = tempRoot()
  try {
    const writer = new MemoryWriter({ root })
    seed(writer, 'session-a', [
      { turn: 0, at: Date.UTC(2026, 10, 5, 1) },
      { turn: 1, at: Date.UTC(2026, 10, 5, 2) },
      { turn: 2, at: Date.UTC(2026, 10, 5, 3), size: 4000 },
    ])
    writer.close()

    const stats = computeStats(new MemoryReader({ root }), { turns: 30, root })
    assert.equal(stats.turns.length, 3)
    // 落盘也要单调不减，且末点就是卡片上那个「落盘」数。
    for (let i = 1; i < stats.turns.length; i += 1) {
      assert.ok(stats.turns[i].diskTotal >= stats.turns[i - 1].diskTotal, 'disk total is monotonic')
    }
    assert.equal(stats.turns.at(-1).diskTotal, stats.disk)
    assert.ok(stats.turns.every((turn) => turn.diskAdded > 0), 'every turn adds some disk bytes')
    // 落盘一定比原文小：zstd 压得动，帧表与索引只有几百字节。
    assert.ok(stats.turns.at(-1).diskTotal < stats.turns.at(-1).total)
  } finally {
    cleanup()
  }
})

test('the window keeps only the newest turns', () => {
  const { root, cleanup } = tempRoot()
  try {
    const writer = new MemoryWriter({ root })
    seed(writer, 'session-a', [
      { turn: 0, at: Date.UTC(2026, 10, 5, 1) },
      { turn: 1, at: Date.UTC(2026, 10, 5, 2) },
      { turn: 2, at: Date.UTC(2026, 10, 5, 3) },
    ])
    writer.close()
    const stats = computeStats(new MemoryReader({ root }), { turns: 2, root })
    assert.equal(stats.turns.length, 2)
    assert.deepEqual(stats.turns.map((turn) => turn.turn), [1, 2])
  } finally {
    cleanup()
  }
})

test('the cache follows the store instead of the clock', () => {
  const { root, cleanup } = tempRoot()
  try {
    const writer = new MemoryWriter({ root })
    seed(writer, 'session-a', [{ turn: 0, at: Date.UTC(2026, 10, 5, 1) }])
    const reader = new MemoryReader({ root })
    const cache = createStatsCache({ reader, root })
    const first = cache.get({ turns: 30 })
    assert.equal(first.rows, 2)

    // 同一个库：缓存命中，数字不变。
    assert.equal(cache.get({ turns: 30 }).rows, 2)

    seed(writer, 'session-a', [{ turn: 1, at: Date.UTC(2026, 10, 5, 2) }], 10)
    writer.close()
    // 没 reload 之前，读端还看不到新行。
    assert.equal(cache.get({ turns: 30 }).rows, 2)
    reader.reload()
    assert.equal(cache.get({ turns: 30 }).rows, 4)
  } finally {
    cleanup()
  }
})
