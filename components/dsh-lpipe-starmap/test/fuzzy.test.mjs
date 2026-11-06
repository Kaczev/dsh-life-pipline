import test from 'node:test'
import assert from 'node:assert/strict'

import { clockName, cnNumber, fuzzyScore, fuzzyStarsIn, numbersIn, starMeta, timeScore } from '../src/fuzzy.mjs'

test('时间折成一天里的第几分钟，写法不同也能对上', () => {
  assert.equal(clockName(1244), '20:44')
  assert.equal(clockName(1440), '00:00')
  assert.equal(cnNumber('二十四'), 24)
  assert.equal(cnNumber('九'), 9)
  assert.equal(cnNumber('两'), 2)

  const times = fuzzyStarsIn('现在是 20:44，晚上 9 点半，下午四点')
  assert.deepEqual(times.map((s) => s.name), ['20:44', '21:30', '16:00'])
  assert.deepEqual(times.map((s) => s.value), [1244, 1290, 960])
})

test('独立数字才算数值：名字的一部分、数量都不是', () => {
  const numbers = numbersIn('648.5 和 图11-47 和 q_1 和 12 个 和 541 和 R_3 和 3r 和 20 分钟')
  assert.deepEqual(numbers.map((s) => s.name), ['648.5', '541'])
})

test('时间与数字的「感觉」：近的得分高，差一个量级就归零', () => {
  assert.ok(timeScore(1244, 1246) > 0.95, '差两分钟几乎满分')
  assert.ok(timeScore(1244, 1244 + 30) < 0.6)
  assert.equal(timeScore(1244, 1244 + 120), 0)

  assert.ok(fuzzyScore({ form: 'number', value: 648.5 }, { form: 'number', value: 648 }) > 0.99)
  assert.ok(fuzzyScore({ form: 'number', value: 648 }, { form: 'number', value: 1000 }) < 0.7)
  assert.equal(fuzzyScore({ form: 'number', value: 10 }, { form: 'number', value: 100 }), 0)
  assert.equal(fuzzyScore({ form: 'time', value: 100 }, { form: 'number', value: 100 }), 0, '形态不同不比')
})

test('星星分类：时间与两位以上的独立数字是模糊星，其余是准确星', () => {
  assert.deepEqual(starMeta('20:44'), { kind: 'fuzzy', form: 'time', value: 1244 })
  assert.deepEqual(starMeta('648.5'), { kind: 'fuzzy', form: 'number', value: 648.5 })
  assert.deepEqual(starMeta('541'), { kind: 'fuzzy', form: 'number', value: 541 })
  assert.equal(starMeta('记忆管线').kind, 'exact')
  assert.equal(starMeta('541 个').kind, 'exact')
  assert.equal(starMeta('18').kind, 'fuzzy')
  assert.equal(starMeta('图11-47').kind, 'exact')
})
