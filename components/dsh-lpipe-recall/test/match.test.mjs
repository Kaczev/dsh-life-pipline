import assert from 'node:assert/strict'
import test from 'node:test'
import { flickerStars, isTooShort, positionWeight } from '../src/match.mjs'

const star = (id, name, extra = {}) => ({ id, name, kind: 'exact', form: null, value: null, ...extra })

test('位置权重：最旧 1.0、最新 2.0，越靠后越算数', () => {
  assert.equal(positionWeight(0, 100), 1)
  assert.equal(positionWeight(100, 100), 2)
  assert.equal(positionWeight(50, 100), 1.5)
  assert.equal(positionWeight(0, 0), 1)
  assert.equal(positionWeight(200, 100), 2)
})

test('只留最强的一次点亮：同一个词出现十遍，也只记一个分数', () => {
  const stars = [star('s_a', '记忆管线')]
  const hit = flickerStars({ text: '记忆管线记忆管线', stars })
  assert.equal(hit.size, 1)
  assert.equal(hit.get('s_a').score, positionWeight(4, 8), '分数是「最后出现的位置」，不是次数之和')
  assert.ok(hit.get('s_a').score <= 2)
})

test('通用星只值 0.2：单靠它们凑不出一次回忆', () => {
  const stars = [star('s_common', '时间'), star('s_rare', '记忆管线')]
  const common = new Set(['s_common'])
  const hit = flickerStars({ text: '时间 时间 时间 记忆管线', stars, common })
  assert.ok(hit.get('s_common').score <= 0.4, '通用星最多 0.2 × 2')
  assert.ok(hit.get('s_common').score >= 0.2)
  assert.ok(hit.get('s_rare').score > hit.get('s_common').score)
})

test('单个拉丁字母、纯符号不成星：它们在任何英文里都能找到', () => {
  assert.equal(isTooShort('a'), true)
  assert.equal(isTooShort('E'), true)
  assert.equal(isTooShort('×'), true)
  assert.equal(isTooShort('地'), false)
  assert.equal(isTooShort('AI'), false)
  const stars = [star('s_a', 'a'), star('s_e', 'E')]
  assert.equal(flickerStars({ text: 'a test for E', stars }).size, 0)
})

test('排版差异不影响点亮：加粗、空格、大小写都算同一个名字', () => {
  const stars = [star('s_c', 'C接正电源'), star('s_n', '节点A')]
  const hit = flickerStars({ text: '所以集电极 C 接**正电源**，节点 A 也接这里。', stars })
  assert.ok(hit.has('s_c'))
  assert.ok(hit.has('s_n'))
})

test('模糊星靠感觉点亮：20:46 会想起 20:44，648 会想起 648.5', () => {
  const stars = [
    { id: 's_time', name: '20:44', kind: 'fuzzy', form: 'time', value: 1244 },
    { id: 's_num', name: '648.5', kind: 'fuzzy', form: 'number', value: 648.5 },
  ]
  const close = flickerStars({ text: '现在是 20:46，读数 648。', stars })
  assert.ok(close.has('s_time'))
  assert.ok(close.has('s_num'))
  // 模糊星再像也只有 0.3 的基础亮度：它是「感觉」，不是「说到了」。
  assert.ok(close.get('s_time').score <= 0.6)
  assert.ok(close.get('s_num').score > 0.3 * 0.8)
  const far = flickerStars({ text: '现在是 23:50，读数 12。', stars })
  assert.equal(far.size, 0)
})

test('两位整数不参与感觉：19 / 23 / 37 在技术对话里到处都是', () => {
  const stars = [{ id: 's_19', name: '19', kind: 'fuzzy', form: 'number', value: 19 }]
  assert.equal(flickerStars({ text: '一共 19 个', stars }).size, 0)
})
