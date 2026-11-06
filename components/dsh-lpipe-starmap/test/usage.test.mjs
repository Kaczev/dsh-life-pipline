import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { canExtract } from '../src/config.mjs'
import { noteUsage, usageFile, usageStats } from '../src/usage.mjs'

const tempRoot = () => mkdtempSync(join(tmpdir(), 'lpipe-usage-'))

test('三个设置项都填了才抽星，缺一个就不抽', () => {
  assert.equal(canExtract({ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'low' }), true)
  assert.equal(canExtract({ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: '' }), false)
  assert.equal(canExtract({ provider: '', model: 'deepseek-chat', reasoningEffort: 'low' }), false)
  assert.equal(canExtract({ provider: 'deepseek', model: '', reasoningEffort: 'low' }), false)
  assert.equal(canExtract({ provider: '  ', model: 'm', reasoningEffort: 'low' }), false)
  assert.equal(canExtract({}), false)
})

test('用量记账：调用次数与最近七天的 token 总量', () => {
  const root = tempRoot()
  try {
    const now = Date.parse('2026-11-06T12:00:00.000Z')
    const day = 24 * 60 * 60 * 1000
    noteUsage(root, { at: new Date(now - 1 * day).toISOString(), input: 1000, output: 200, cacheRead: 900 })
    noteUsage(root, { at: new Date(now - 3 * day).toISOString(), input: 500, output: 100, cacheRead: 0 })
    noteUsage(root, { at: new Date(now - 30 * day).toISOString(), input: 4000, output: 900, cacheRead: 0 })

    const stats = usageStats(root, { now })
    assert.equal(stats.calls, 3, '调用次数算全部历史')
    assert.equal(stats.tokens, 2100 + 600 + 4900)
    assert.equal(stats.input, 5500)
    assert.equal(stats.output, 1200)
    assert.equal(stats.cacheRead, 900)
    assert.equal(stats.calls7d, 2, '三十天前那次不算进七天窗口')
    assert.equal(stats.tokens7d, 2100 + 600)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('按天分桶：命中输入、未命中输入、输出各自归位', () => {
  const root = tempRoot()
  try {
    const now = Date.parse('2026-11-06T12:00:00.000Z')
    const day = 24 * 60 * 60 * 1000
    noteUsage(root, { at: new Date(now).toISOString(), input: 1000, output: 200, cacheRead: 700 })
    noteUsage(root, { at: new Date(now - 2 * day).toISOString(), input: 500, output: 100, cacheRead: 0 })
    noteUsage(root, { at: new Date(now - 40 * day).toISOString(), input: 4000, output: 900, cacheRead: 0 })

    const stats = usageStats(root, { now })
    assert.equal(stats.daily.length, 7, '固定七根柱子，缺的那天也要占位')
    const today = stats.daily.at(-1)
    assert.equal(today.input, 1000)
    assert.equal(today.output, 200)
    assert.equal(today.cacheRead, 700)
    assert.equal(today.calls, 1)
    const older = stats.daily.at(-3)
    assert.equal(older.input, 500)
    assert.equal(older.cacheRead, 0)
    assert.equal(stats.daily[0].calls, 0, '四十天前的调用不进窗口')
    assert.equal(stats.daily.reduce((sum, row) => sum + row.calls, 0), 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('没有账本时给零，坏行跳过', () => {
  const root = tempRoot()
  try {
    assert.deepEqual(usageStats(root).calls, 0)
    noteUsage(root, { at: '2026-11-06T00:00:00.000Z', input: 10, output: 5 })
    appendFileSync(usageFile(root), 'not json\n', 'utf8')
    assert.equal(usageStats(root).calls, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
