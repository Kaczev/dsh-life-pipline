import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMON_SHARE, commonStars, recentText } from '../src/index.js'

test('近窗原文：从末尾往前收够字数，顺序照旧', () => {
  const rows = [
    { seq: 0, text: '第一段' },
    { seq: 1, text: '' },
    { seq: 2, text: '第二段' },
    { seq: 3, text: '第三段' },
  ]
  assert.equal(recentText(rows, 100), '第一段\n第二段\n第三段')
  assert.equal(recentText(rows, 6), '第二段\n第三段', '收够字数就停，不多收')
  assert.equal(recentText([], 100), '')
})

test('通用星：出现在超过三成片段里的星只值 0.2', () => {
  const turns = Array.from({ length: 10 }, (_, index) => ({ session: 's', turn: index + 1, lines: [] }))
  const repo = {
    turns: new Map(turns.map((record) => [`s#${record.turn}`, record])),
    byStar: new Map([
      ['s_wide', [{ key: 's#1' }, { key: 's#2' }, { key: 's#3' }, { key: 's#4' }]],
      ['s_mid', [{ key: 's#1' }, { key: 's#2' }]],
      ['s_narrow', [{ key: 's#1' }]],
    ]),
  }
  const common = commonStars(repo)
  assert.equal(COMMON_SHARE, 0.3)
  assert.equal(common.has('s_wide'), true)
  assert.equal(common.has('s_mid'), false)
  assert.equal(common.has('s_narrow'), false)
})

test('片段太少的时候不判通用星，免得把全都算成通用', () => {
  const repo = {
    turns: new Map([['s#1', { session: 's', turn: 1 }]]),
    byStar: new Map([['s_a', [{ key: 's#1' }]]]),
  }
  assert.equal(commonStars(repo).size, 0)
})
