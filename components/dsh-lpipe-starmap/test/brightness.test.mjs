import assert from 'node:assert/strict'
import test from 'node:test'
import { baseBrightness, starProfile, commonStars, rarityWeights } from '../src/brightness.mjs'
import { exactMatch, matchStars } from '../src/match.mjs'

const stars = [
  { id: 'a', name: '记忆管线', kind: 'exact' },
  { id: 'c', name: '时间', kind: 'exact' },
  { id: 'f', name: '20:44', kind: 'fuzzy', form: 'time', value: 1244 },
]
const repo = () => ({ stars: new Map(stars.map(s => [s.id, s])),
  turns: new Map(Array.from({ length: 100 }, (_, i) => [i, {}])),
  byStar: new Map([['a', [{ key: 1 }, { key: 1 }]], ['c', Array.from({ length: 6 }, (_, key) => ({ key }))], ['f', [{ key: 2 }]]]) })

test('星固有属性聚合基础值、长度和全库稀有度，不含输入匹配', () => {
  const store = repo(), before = JSON.stringify([...store.stars])
  const { common, rarity, brightness } = starProfile(store)
  assert.equal(brightness.get('a'), 1.2 * rarity.get('a'))
  assert.equal(brightness.get('c'), 0.2 * rarity.get('c'))
  assert.equal(brightness.get('f'), rarity.get('f'))
  assert.equal(baseBrightness(stars[0]), 1.2)
  assert.equal(baseBrightness(stars[2]), 1)
  assert.equal(JSON.stringify([...store.stars]), before)
  assert.ok(common.has('c'))
  assert.equal(rarity.get('a'), 1 + Math.log(101 / 2) / Math.log(101))
  assert.deepEqual(starProfile(store).brightness, brightness)
  store.byStar.set('a', Array.from({ length: 10 }, (_, key) => ({ key })))
  assert.ok(starProfile(store).brightness.get('a') < brightness.get('a'), '索引变化后重算，不固化旧亮度')
})

test('通用分类保持超过5%与至少10片段边界', () => {
  const store = repo()
  store.byStar.set('c', Array.from({ length: 5 }, (_, key) => ({ key })))
  assert.ok(!commonStars(store).has('c'))
  store.turns = new Map([[1, {}]])
  assert.equal(commonStars(store).size, 0)
})

test('星图匹配默认无环境权重；属性快照与旧参数路径的结果一致', () => {
  const store = repo(), profile = starProfile(store)
  const text = '时间 记忆管线 20:46'
  const plain = matchStars({ text, stars, ...profile })
  assert.equal(plain.get('a').score, profile.brightness.get('a'))
  assert.equal(plain.get('c').kind, 'common')
  assert.ok(plain.get('f').score < profile.brightness.get('f'))
  assert.ok(exactMatch('回忆匹配的规则', '回忆匹配窗口').similarity < 0.5)
  assert.deepEqual(plain, matchStars({ text, stars, common: commonStars(store), rarity: rarityWeights(store) }))
  assert.deepEqual(matchStars({ text, stars, ...profile, weight: () => { throw Error('环境不得进入星图') } }), plain)
})

test('准确星基础亮度不受位置影响，最后位置可来自较弱的后续匹配', () => {
  const stars = [{ id: 'a', name: '回忆匹配窗口', kind: 'exact' }]
  const full = matchStars({ text: '回忆匹配窗口', stars }).get('a')
  const text = '回忆匹配窗口' + '。'.repeat(20) + '回忆匹配'
  const hit = matchStars({ text, stars }).get('a')
  assert.equal(hit.score, full.score)
  assert.equal(hit.at, 26)
  assert.equal(matchStars({ text: '。'.repeat(20) + '回忆匹配窗口', stars }).get('a').score, full.score)
})

test('重复时间和数值保持基础亮度，最后不达阈值的命中不覆盖位置', () => {
  for (const star of [
    { id: 'f', name: '20:44', kind: 'fuzzy', form: 'time', value: 1244 },
    { id: 'f', name: '648.5', kind: 'fuzzy', form: 'number', value: 648.5 },
  ]) {
    const text = `${star.name} 然后 ${star.name} 最后 ${star.form === 'time' ? '23:50' : '9000'}`
    const hit = matchStars({ text, stars: [star] }).get('f')
    assert.equal(hit.score, matchStars({ text: star.name, stars: [star] }).get('f').score)
    assert.equal(hit.at, text.lastIndexOf(star.name))
  }
})

test('模糊星以最强匹配计算基础亮度，位置独立取最后有效匹配', () => {
  const stars = [{ id: 'f', name: '20:44', kind: 'fuzzy', form: 'time', value: 1244 }]
  const full = matchStars({ text: '20:44', stars }).get('f')
  const text = '20:44 然后 20:46 最后 23:50'
  const hit = matchStars({ text, stars }).get('f')
  assert.equal(hit.score, full.score)
  assert.equal(hit.at, text.indexOf('20:46'))
})
