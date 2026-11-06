import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLexicon, matchWords, matcherOf } from '../src/lexicon.mjs'

/** 造一个「记忆管线」只在一部分轮次里成词、而「模型」到处都有的语料。 */
function corpus() {
  const turns = []
  const heads = ['我把', '今天的', '刚才的', '新的', '旧版']
  const tails = ['整轮落盘修好了', '现在按轮写', '今天又改了一次', '跑得很快', '稳得很']
  for (let i = 0; i < 10; i += 1) {
    turns.push(`${heads[i % heads.length]}记忆管线${tails[i % tails.length]}，第 ${i} 轮。`)
  }
  for (let i = 0; i < 30; i += 1) {
    turns.push(`今天天气不错，我们出去走了一圈，回来喝了杯茶。第 ${i} 轮。`)
  }
  return turns
}

test('反复一起出现的词组会进词表', () => {
  const lexicon = buildLexicon({ turns: corpus(), version: 1 })
  const names = lexicon.words.map((word) => word.name)
  assert.ok(names.includes('记忆管线'), `应当长出自造的术语，实际：${names.slice(0, 20).join('、')}`)
})

test('只出现一次的词不算星', () => {
  const turns = ['这句话里有一个只出现一次的怪词：鲸落幻象。', '另一轮完全没提它。']
  const lexicon = buildLexicon({ turns, version: 1 })
  assert.ok(!lexicon.words.some((word) => word.name === '鲸落幻象'))
})

test('跨话题通用词被 df 挡住', () => {
  const turns = Array.from({ length: 20 }, (_, i) => `模型就是模型，问题就是问题，模型没问题。${i}`)
  const lexicon = buildLexicon({ turns, version: 1 })
  assert.ok(!lexicon.words.some((word) => word.name === '模型'))
})

test('最长匹配优先，不会切成两半', () => {
  const matcher = matcherOf({ words: [{ name: '记忆管线', count: 9, df: 3 }] })
  assert.deepEqual(matchWords('我把记忆管线修好了', matcher), ['记忆管线'])
})
