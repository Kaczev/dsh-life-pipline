import assert from 'node:assert/strict'
import test from 'node:test'

import { clockOf, normalizeName } from '../src/extract.mjs'

test('名字只留一种写法：全角转半角、去首尾标点、路径只留两段', () => {
  assert.equal(normalizeName('「记忆管线」'), '记忆管线')
  assert.equal(normalizeName('  DSH-Lpipe-Starmap  '), 'DSH-Lpipe-Starmap')
  assert.equal(normalizeName('C:/Users/Kaczev/Documents/GitHub/dsh-life-pipline/x.mjs'), 'dsh-life-pipline/x.mjs')
  assert.equal(normalizeName('　星图。'), '星图')
})

test('时刻是模糊的：按十分钟取整', () => {
  assert.equal(clockOf('现在是 16:01'), 960)
  assert.equal(clockOf('下午四点左右'), 960)
  assert.equal(clockOf('晚上 9 点半'), 1290)
  assert.equal(clockOf('十一点'), 660)
  assert.equal(clockOf('没有提到时间'), null)
})
