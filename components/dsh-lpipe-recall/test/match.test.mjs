import assert from 'node:assert/strict'
import test from 'node:test'
import { balanceFlicker, flickerStars, positionWeight, lengthWeight, rarityWeights, exactMatch } from '../src/match.mjs'

test('背景预算全局归一：保留相对强弱、真文优先、没有真文就没有背景', () => {
  const ahead = new Map([['a', { score: 6 }], ['b', { score: 4 }]])
  const behind = new Map([['a', { score: 100 }], ['c', { score: 30 }], ['d', { score: 10 }]])
  const { flicker, factor, foregroundSum, backgroundSum } = balanceFlicker(ahead, behind)
  assert.equal(factor, 0.25)
  assert.equal(foregroundSum, 10)
  assert.equal(backgroundSum, 40)
  assert.equal(flicker.get('a').score, 6)
  assert.equal(flicker.get('c').score, 7.5)
  assert.equal(flicker.get('d').score, 2.5)
  assert.equal(behind.get('c').score, 30, '不修改原始点亮结果')
  assert.equal(balanceFlicker(new Map(), behind).flicker.size, 0)
  assert.equal(balanceFlicker(ahead, new Map()).factor, 0)
  assert.equal(balanceFlicker(ahead, new Map([['c', { score: 1 }]])).factor, 10, '按指定公式可放大，不私自封顶')
})

const star = (id, name, extra = {}) => ({ id, name, kind: 'exact', form: null, value: null, ...extra })

test('位置权重：最旧 1.0、最新 2.0，前平后陡', () => {
  assert.equal(positionWeight(0, 100), 1)
  assert.equal(positionWeight(100, 100), 2)
  assert.equal(positionWeight(50, 100), 1 + 0.5 ** 4, '半程只比最旧高一丁点')
  assert.equal(positionWeight(90, 100), 1 + 0.9 ** 4, '最后那一小段才迅速爬升')
  assert.equal(positionWeight(0, 0), 1)
  assert.equal(positionWeight(200, 100), 2)
})

test('只留最强的一次点亮：同一个词出现十遍，也只记一个分数', () => {
  const stars = [star('s_a', '记忆管线')]
  const hit = flickerStars({ text: '记忆管线记忆管线', stars })
  assert.equal(hit.size, 1)
  assert.equal(hit.get('s_a').score, lengthWeight('记忆管线') * positionWeight(4, 8), '分数是「最后出现的位置」，不是次数之和')
  assert.ok(hit.get('s_a').score <= 2 * lengthWeight('记忆管线'))
})

test('通用星只值 0.2：单靠它们凑不出一次回忆', () => {
  const stars = [star('s_common', '时间'), star('s_rare', '记忆管线')]
  const common = new Set(['s_common'])
  const hit = flickerStars({ text: '时间 时间 时间 记忆管线', stars, common })
  assert.ok(hit.get('s_common').score <= 0.4, '通用星最多 0.2 × 2')
  assert.ok(hit.get('s_common').score >= 0.2)
  assert.ok(hit.get('s_rare').score > hit.get('s_common').score)
})

test('星是什么由星图说了算：回忆不再自己加一道「太短」的闸', () => {
  // 以前这里会挡掉 `_A0`、`a`、`E` 这种短名字。现在对齐星图：星表里有的就点亮，
  // 星表里没有的（`a` 这种）自然也不会出现，不需要回忆侧再判一遍。
  const stars = [star('s_a0', '_A0'), star('s_v1', 'V1')]
  const hit = flickerStars({ text: '刚 _A0 又发生了，V1 也记一下', stars })
  assert.equal(hit.size, 2)
  assert.ok(hit.get('s_a0').score > 0)
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
  // 模糊星在点亮阶段只算「像多少」，片段内的 2/n 上限在 candidates 里压。
  assert.ok(close.get('s_time').score > 0.9)
  assert.ok(close.get('s_time').score <= 2)
  assert.ok(close.get('s_num').score >= 0.8 * 0.5)
  const far = flickerStars({ text: '现在是 23:50，读数 12。', stars })
  assert.equal(far.size, 0)
})

test('两位整数不参与感觉：19 / 23 / 37 在技术对话里到处都是', () => {
  const stars = [{ id: 's_19', name: '19', kind: 'fuzzy', form: 'number', value: 19 }]
  assert.equal(flickerStars({ text: '一共 19 个', stars }).size, 0)
})

 test('长度封顶、稀有度连续，局部匹配低亮度且不改变准确类别', () => {
  assert.equal(lengthWeight('星图'), 1)
  assert.equal(lengthWeight('超长名称'.repeat(20)), 2)
  assert.ok(lengthWeight('记忆管线') > lengthWeight('记忆'))
  const repo = { turns: new Map(Array.from({length: 10}, (_,i)=>[i,{}])), byStar: new Map([['rare',[{key:1}]],['wide', Array.from({length:8},(_,i)=>({key:i}))]]) }
  const weights = rarityWeights(repo)
  assert.ok(weights.get('rare') > weights.get('wide'))
  assert.ok(weights.get('rare') <= 2)
  assert.equal(exactMatch('记忆', '记忆管线'), null)
  const partial = exactMatch('回忆匹配的规则', '回忆匹配窗口')
  assert.ok(partial.similarity > 0 && partial.similarity < 0.5)
  const stars = [star('a', '回忆匹配窗口')]
  const full = flickerStars({text:'回忆匹配窗口',stars,weight:()=>3})
  const weak = flickerStars({text:'回忆匹配的规则',stars,weight:()=>3})
  assert.equal(weak.get('a').kind, 'exact')
  assert.ok(weak.get('a').score < full.get('a').score)
})
